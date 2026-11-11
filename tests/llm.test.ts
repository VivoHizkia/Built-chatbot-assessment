import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callLlm, parseJsonObject } from "@/lib/llm";

describe("parseJsonObject", () => {
  it("reads JSON wrapped in code fences or prose", () => {
    const reply = 'Sure!\n```json\n{"a": 1}\n```';
    expect(parseJsonObject<{ a: number }>(reply)).toEqual({ a: 1 });
  });

  it("throws when the reply has no JSON object", () => {
    expect(() => parseJsonObject("I cannot help with that.")).toThrow();
  });
});

describe("callLlm", () => {
  const ok = (content: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  const busy = () => new Response("high demand", { status: 503 });

  // Which model each request was sent to.
  const modelsCalled = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).model);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "main-model");
    vi.stubEnv("LLM_FALLBACK_MODEL", "backup-model");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const run = async () => {
    const pending = callLlm([{ role: "user", content: "hi" }]);
    // Swallow the rejection here so it is only reported through the awaited promise below.
    pending.catch(() => {});
    await vi.runAllTimersAsync();
    return pending;
  };

  it("retries the main model once when it is busy", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(ok("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(run()).resolves.toBe("{}");
    expect(modelsCalled(fetchMock)).toEqual(["main-model", "main-model"]);
  });

  it("moves to the fallback model when the main model stays busy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(busy())
      .mockResolvedValueOnce(busy())
      .mockResolvedValueOnce(ok("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(run()).resolves.toBe("{}");
    expect(modelsCalled(fetchMock)).toEqual(["main-model", "main-model", "backup-model"]);
  });

  it("does not retry an error that will not go away, such as a bad key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("invalid key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(run()).rejects.toThrow("401");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
