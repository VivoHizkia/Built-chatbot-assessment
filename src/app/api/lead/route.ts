import { NextResponse } from "next/server";
import { logEvent } from "@/lib/log";
import { allowRequest, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Loose on purpose: it only needs to catch obvious typos.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LEADS_PER_MINUTE = 3;

function field(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(req: Request) {
  if (!allowRequest(`lead:${clientKey(req)}`, LEADS_PER_MINUTE)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = field(body?.name, 100);
  const email = field(body?.email, 200);
  const question = field(body?.question, 500);

  if (!name || !EMAIL.test(email)) {
    return NextResponse.json(
      { error: "Please enter your name and a valid email." },
      { status: 400 },
    );
  }

  await logEvent({ type: "lead", name, email, question });
  return NextResponse.json({ ok: true });
}
