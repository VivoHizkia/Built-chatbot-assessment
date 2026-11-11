import { describe, expect, it, vi } from "vitest";
import {
  answerQuestion,
  FALLBACK_ERROR,
  FALLBACK_NOT_FOUND,
  type ChatDeps,
} from "@/lib/chat/answer";
import { getIndex, pageCatalog } from "@/lib/retrieval/knowledge";
import type { LlmMessage } from "@/lib/llm";

// The LLM is mocked: these tests check the code-level guardrails around it, not the model.
const ADRENAL_URL =
  "https://www.placidway.com/package/7902/Alternative-Adrenal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC";

const makeDeps = (plan: object, answer: (context: string) => object | Error) => {
  const log = vi.fn(async () => {});
  const llm = vi.fn(async (messages: LlmMessage[]) => {
    const isRewrite = messages[0].content.includes("search queries");
    if (isRewrite) return JSON.stringify(plan);
    const result = answer(messages[1].content);
    if (result instanceof Error) throw result;
    return JSON.stringify(result);
  });
  const deps: ChatDeps = { llm, index: getIndex(), catalog: pageCatalog(), log };
  return { deps, llm, log };
};

const firstAdrenalId = (context: string) =>
  context.match(/\[(p3-c\d+)\][^\n]*\n[^[]*\$30,000/)?.[1] ?? "p3-c4";

describe("answerQuestion", () => {
  it("returns a grounded answer with real source links", async () => {
    const { deps } = makeDeps(
      {
        language: "en",
        intent: "content",
        search_query: "adrenal cancer package in-patient program price",
      },
      (ctx) => ({
        status: "answered",
        answer: "The in-patient program costs $30,000 USD for 3 weeks.",
        source_ids: [firstAdrenalId(ctx)],
      }),
    );
    const res = await answerQuestion(deps, "How much is the in-patient adrenal program?", []);
    expect(res.status).toBe("answered");
    expect(res.sources.map((s) => s.url)).toContain(ADRENAL_URL);
  });

  it("replaces an answer containing an invented price with an honest fallback and logs it", async () => {
    const { deps, log } = makeDeps(
      { language: "en", intent: "content", search_query: "adrenal cancer package price" },
      (ctx) => ({
        status: "answered",
        answer: "It costs $9,999.",
        source_ids: [firstAdrenalId(ctx)],
      }),
    );
    const res = await answerQuestion(deps, "How much is it?", []);
    expect(res.status).toBe("not_found");
    expect(res.answer).toBe(FALLBACK_NOT_FOUND);
    expect(res.offerLeadForm).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ type: "unanswered" }));
  });

  it("drops invented source ids and refuses an 'answered' reply that has no real source", async () => {
    const { deps } = makeDeps(
      { language: "en", intent: "content", search_query: "recovery time" },
      () => ({ status: "answered", answer: "Recovery takes two days.", source_ids: ["p99-c1"] }),
    );
    const res = await answerQuestion(deps, "What about recovery time?", []);
    expect(res.status).toBe("not_found");
    expect(res.sources).toEqual([]);
  });

  it("skips retrieval for out-of-scope questions", async () => {
    const { deps, llm } = makeDeps(
      { language: "en", intent: "out_of_scope", search_query: "weather cancun" },
      (ctx) => ({
        status: "declined",
        answer: ctx.includes("(no relevant passages found)")
          ? "I can only help with PlacidWay treatment information."
          : "leak",
        source_ids: [],
      }),
    );
    const res = await answerQuestion(deps, "What is the weather in Cancun?", []);
    expect(res.status).toBe("declined");
    expect(res.answer).not.toBe("leak");
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it("flags medical questions for the disclaimer and offers a quote link", async () => {
    const { deps } = makeDeps(
      {
        language: "en",
        intent: "medical_advice",
        search_query: "eligibility medical evaluation risks",
      },
      () => ({
        status: "medical",
        answer: "A doctor needs to evaluate your case; please speak with your own doctor.",
        source_ids: [],
      }),
    );
    const res = await answerQuestion(deps, "Is this safe for my diabetes?", []);
    expect(res.status).toBe("medical");
    expect(res.showDisclaimer).toBe(true);
    expect(res.quoteUrl).toBeTruthy();
  });

  it("falls back to the raw question when the rewrite step fails, and degrades gracefully when the answer step fails", async () => {
    const { deps } = makeDeps({}, () => new Error("rate limited"));
    (deps.llm as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => "not json");
    const res = await answerQuestion(deps, "Price of adrenal package?", []);
    expect(res.answer).toBe(FALLBACK_ERROR);
    expect(res.status).toBe("not_found");
  });
});
