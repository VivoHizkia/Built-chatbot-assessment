import { ALLOWED_URLS, DEFAULT_QUOTE_URL } from "@/config/sources";
import { parseJsonObject, type LlmCall } from "@/lib/llm";
import { logEvent } from "@/lib/log";
import type { Bm25Index } from "@/lib/retrieval/bm25";
import {
  ANSWER_STATUSES,
  type AnswerStatus,
  type ChatResponse,
  type ChatTurn,
  type Chunk,
  type SourceRef,
} from "@/lib/types";
import { checkPrices } from "./guardrails";
import { answerPrompt, formatContext, formatHistory, plannerPrompt } from "./prompts";

const MAX_HISTORY_TURNS = 6;
const MAX_TURN_CHARS = 600;
const MAX_PASSAGES = 8;

// These two are fixed strings rather than model output, so they can never contain a made-up fact.
export const FALLBACK_NOT_FOUND =
  "I couldn't find that information on our pages, so I don't want to guess. Please request a free quote and the PlacidWay team will answer you directly.";
export const FALLBACK_ERROR =
  "Sorry, I can't answer right now. Please try again in a moment, or request a free quote and the PlacidWay team will get back to you.";

// Passed in rather than imported so the tests can swap in a fake LLM and logger.
export type ChatDeps = {
  llm: LlmCall;
  index: Bm25Index;
  catalog: string;
  quoteUrl?: string;
  log?: typeof logEvent;
};

type Plan = { language: string; intent: string; searchQuery: string };
type Draft = { status: AnswerStatus; answer: string; sourceIds: string[] };

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const isStatus = (value: unknown): value is AnswerStatus =>
  ANSWER_STATUSES.includes(value as AnswerStatus);

function recentHistory(history: ChatTurn[]): ChatTurn[] {
  return history
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_TURN_CHARS) }));
}

// Step 1. Ask the model for the language, the intent and an English search query.
async function planQuestion(deps: ChatDeps, question: string, history: ChatTurn[]): Promise<Plan> {
  try {
    const raw = await deps.llm([
      { role: "system", content: plannerPrompt(deps.catalog) },
      {
        role: "user",
        content: `CONVERSATION:\n${formatHistory(history)}\n\nLATEST MESSAGE:\n${question}`,
      },
    ]);
    const json = parseJsonObject<Record<string, unknown>>(raw);
    return {
      language: asText(json.language).slice(0, 5) || "en",
      intent: asText(json.intent) || "content",
      searchQuery: asText(json.search_query) || question,
    };
  } catch {
    // The planner is an optimisation. Without it we search with the visitor's own words.
    return { language: "en", intent: "content", searchQuery: question };
  }
}

// Step 2. Search with the rewritten query, plus the original wording in case the rewrite
// dropped a keyword. Off-topic messages skip the search so no passage can leak into the reply.
function findPassages(index: Bm25Index, plan: Plan, question: string): Chunk[] {
  if (plan.intent === "out_of_scope" || plan.intent === "smalltalk") return [];

  const hits = [...index.search(plan.searchQuery, 6), ...index.search(question, 3)];
  const unique = new Map<string, Chunk>();
  for (const { chunk } of hits) {
    if (!unique.has(chunk.id)) unique.set(chunk.id, chunk);
  }
  return [...unique.values()].slice(0, MAX_PASSAGES);
}

// Step 3. Ask the model to answer from the passages. Anything unexpected in its JSON is
// replaced by the safest value.
async function draftAnswer(
  deps: ChatDeps,
  plan: Plan,
  passages: Chunk[],
  history: ChatTurn[],
  question: string,
): Promise<Draft> {
  const raw = await deps.llm([
    { role: "system", content: answerPrompt(plan.language, plan.intent) },
    {
      role: "user",
      content: [
        `CONTEXT:\n${formatContext(passages)}`,
        `CONVERSATION SO FAR:\n${formatHistory(history)}`,
        `VISITOR QUESTION:\n${question}`,
      ].join("\n\n"),
    },
  ]);
  const json = parseJsonObject<Record<string, unknown>>(raw);
  const ids = Array.isArray(json.source_ids) ? json.source_ids : [];

  return {
    status: isStatus(json.status) ? json.status : "not_found",
    answer: asText(json.answer),
    sourceIds: ids.filter((id): id is string => typeof id === "string"),
  };
}

// Source links come from the chunks we retrieved, never from text the model wrote.
function toSources(cited: Chunk[]): SourceRef[] {
  const byUrl = new Map<string, SourceRef>();
  for (const chunk of cited) {
    if (!ALLOWED_URLS.has(chunk.url) || byUrl.has(chunk.url)) continue;
    byUrl.set(chunk.url, { url: chunk.url, title: chunk.pageTitle, section: chunk.section });
  }
  return [...byUrl.values()];
}

function buildResponse(
  deps: ChatDeps,
  status: AnswerStatus,
  answer: string,
  cited: Chunk[],
): ChatResponse {
  const pointsToQuote = status === "not_found" || status === "booking";
  const showsSources = status === "answered" || status === "medical";
  const citesRiskSection = cited.some((c) => /risk|safety|medical consideration/i.test(c.section));

  return {
    status,
    answer,
    sources: showsSources ? toSources(cited) : [],
    quoteUrl: pointsToQuote || status === "medical" ? (deps.quoteUrl ?? DEFAULT_QUOTE_URL) : null,
    offerLeadForm: pointsToQuote,
    showDisclaimer: status === "medical" || citesRiskSection,
  };
}

export async function answerQuestion(
  deps: ChatDeps,
  question: string,
  fullHistory: ChatTurn[],
): Promise<ChatResponse> {
  const log = deps.log ?? logEvent;
  const history = recentHistory(fullHistory);

  const plan = await planQuestion(deps, question, history);
  const passages = findPassages(deps.index, plan, question);

  let draft: Draft;
  try {
    draft = await draftAnswer(deps, plan, passages, history, question);
  } catch (err) {
    await log({ type: "error", message: err instanceof Error ? err.message : String(err) });
    return buildResponse(deps, "not_found", FALLBACK_ERROR, []);
  }

  // Step 4. Checks that do not rely on the model following its instructions.
  const reject = async (reason: string) => {
    await log({ type: "unanswered", question, searchQuery: plan.searchQuery, reason });
    return buildResponse(deps, "not_found", FALLBACK_NOT_FOUND, []);
  };

  // A source id only counts if that passage was actually retrieved for this question.
  const passageById = new Map(passages.map((chunk) => [chunk.id, chunk]));
  const citedIds = new Set(draft.sourceIds.filter((id) => passageById.has(id)));

  const prices = checkPrices(draft.answer, passages, citedIds);
  if (!prices.ok) return reject(`unsupported price ${prices.unsupported.join(", ")}`);
  for (const id of prices.extraSourceIds) citedIds.add(id);

  if (!draft.answer) return reject("empty answer");

  const cited = passages.filter((chunk) => citedIds.has(chunk.id));
  if (draft.status === "answered" && cited.length === 0) return reject("answer without sources");

  // The model itself said the pages do not cover this: keep its wording, log the content gap.
  if (draft.status === "not_found") {
    await log({
      type: "unanswered",
      question,
      searchQuery: plan.searchQuery,
      reason: "not in content",
    });
  }
  return buildResponse(deps, draft.status, draft.answer, cited);
}
