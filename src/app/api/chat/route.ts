import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/chat/answer";
import { callLlm } from "@/lib/llm";
import { allowRequest, clientKey } from "@/lib/rate-limit";
import { getIndex, pageCatalog } from "@/lib/retrieval/knowledge";
import type { ChatTurn } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Two LLM calls, each with a retry and a fallback model, can take a while when the provider is busy.
export const maxDuration = 60;

const MAX_QUESTION_CHARS = 500;

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

function isChatTurn(value: unknown): value is ChatTurn {
  if (typeof value !== "object" || value === null) return false;
  const turn = value as Record<string, unknown>;
  return (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string";
}

export async function POST(req: Request) {
  if (!allowRequest(clientKey(req))) {
    return NextResponse.json(
      { error: "Too many messages. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  let body: { question?: unknown; history?: unknown };
  try {
    body = (await req.json()) ?? {};
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const { question, history } = body;
  if (typeof question !== "string" || !question.trim()) {
    return badRequest("Please type a question.");
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return badRequest(`Please keep questions under ${MAX_QUESTION_CHARS} characters.`);
  }

  // History comes from the browser, so anything that is not a well-formed turn is dropped.
  const turns = Array.isArray(history) ? history.filter(isChatTurn) : [];

  const response = await answerQuestion(
    {
      llm: callLlm,
      index: getIndex(),
      catalog: pageCatalog(),
      quoteUrl: process.env.QUOTE_URL || undefined,
    },
    question.trim(),
    turns,
  );
  return NextResponse.json(response);
}
