// Client for any OpenAI-compatible Chat Completions endpoint (Gemini, Groq, OpenAI, OpenRouter,
// a local Ollama...). Plain fetch, no SDK, so switching provider is only a change of env vars.

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmCall = (messages: LlmMessage[]) => Promise<string>;

export class LlmError extends Error {}

export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1_500;

// "Busy, try again" responses. Free tiers return these fairly often under load.
const BUSY_STATUSES = new Set([429, 500, 503]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Read on every call (not at import time) so a missing key fails the request, not the build.
function readConfig() {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new LlmError("LLM_API_KEY is not set");

  return {
    apiKey,
    baseUrl: (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.LLM_MODEL || DEFAULT_MODEL,
    // Optional second model on the same endpoint, used only when the first one stays busy.
    fallbackModel: process.env.LLM_FALLBACK_MODEL || null,
  };
}

type CompletionResponse = { choices?: { message?: { content?: string } }[] };

type Attempt = { ok: true; content: string } | { ok: false; busy: boolean; error: string };

// One request to one model. Never throws: the caller decides whether to retry.
async function attempt(
  config: { apiKey: string; baseUrl: string },
  model: string,
  messages: LlmMessage[],
): Promise<Attempt> {
  const send = (body: Record<string, unknown>) =>
    fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  // temperature 0: the same question should get the same answer.
  const request = { model, messages, temperature: 0 };

  try {
    let res = await send({ ...request, response_format: { type: "json_object" } });
    // Not every provider supports response_format. The prompts ask for JSON anyway.
    if (res.status === 400) res = await send(request);

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return {
        ok: false,
        busy: BUSY_STATUSES.has(res.status),
        error: `LLM request failed (${res.status}, ${model}): ${detail}`,
      };
    }

    const data = (await res.json()) as CompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content)
      return { ok: false, busy: false, error: `LLM returned an empty response (${model})` };
    return { ok: true, content };
  } catch (err) {
    // Timeouts and dropped connections are worth another try as well.
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, busy: true, error: `LLM request failed (${model}): ${reason}` };
  }
}

// Order of attempts: the main model, the main model again after a short pause, then the
// fallback model if one is configured. Only "busy" failures move on to the next attempt;
// a wrong key or a bad request fails straight away.
export const callLlm: LlmCall = async (messages) => {
  const config = readConfig();
  const models = [config.model, config.model];
  if (config.fallbackModel) models.push(config.fallbackModel);

  let lastError = "";
  for (const [i, model] of models.entries()) {
    if (i > 0) await sleep(RETRY_DELAY_MS);

    const result = await attempt(config, model, messages);
    if (result.ok) return result.content;

    lastError = result.error;
    if (!result.busy) break;
  }
  throw new LlmError(lastError);
};

// Models sometimes wrap their JSON in a ```json fence or put a sentence around it,
// so take whatever sits between the first "{" and the last "}".
export function parseJsonObject<T>(text: string): T {
  const body = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new LlmError("No JSON object in LLM response");
  return JSON.parse(body.slice(start, end + 1)) as T;
}
