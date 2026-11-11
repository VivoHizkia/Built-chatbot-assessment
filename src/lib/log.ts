// Events worth keeping: questions the bot could not answer (content gaps), leads, and errors.
// They are printed as one JSON line each, so they are easy to find in the host logs.
// When EVENTS_WEBHOOK_URL is set they are also POSTed there (Google Apps Script, n8n, Slack...).

export type BotEvent =
  | { type: "unanswered"; question: string; searchQuery: string; reason: string }
  | { type: "lead"; name: string; email: string; question: string }
  | { type: "error"; message: string };

const WEBHOOK_TIMEOUT_MS = 5_000;

export async function logEvent(event: BotEvent): Promise<void> {
  const record = { ...event, at: new Date().toISOString() };
  console.log(JSON.stringify({ botEvent: record }));

  const webhookUrl = process.env.EVENTS_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  } catch (err) {
    // A broken webhook must not break the chat reply.
    console.warn("EVENTS_WEBHOOK_URL failed:", err instanceof Error ? err.message : err);
  }
}
