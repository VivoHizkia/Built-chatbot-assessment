// Sliding-window limiter kept in memory, to stop one visitor from burning the free-tier LLM
// quota. Each serverless instance has its own copy, so it is a speed bump, not a hard limit.

const WINDOW_MS = 60_000;
const MAX_TRACKED_CLIENTS = 5_000;

const requestTimes = new Map<string, number[]>();

export function allowRequest(key: string, limit = 12): boolean {
  const now = Date.now();
  const recent = (requestTimes.get(key) ?? []).filter((time) => now - time < WINDOW_MS);

  const allowed = recent.length < limit;
  if (allowed) recent.push(now);
  requestTimes.set(key, recent);

  // Crude memory cap: forgetting everyone is fine for a demo-sized bot.
  if (requestTimes.size > MAX_TRACKED_CLIENTS) requestTimes.clear();
  return allowed;
}

export function clientKey(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || req.headers.get("x-real-ip") || "local";
}
