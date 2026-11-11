import { normalizeNumber } from "@/lib/retrieval/bm25";
import type { Chunk } from "@/lib/types";

// Three ways a price can show up in an answer:
//   $18,995 / US$ 30,000 / USD 2,600 / €500      currency in front
//   18.995 USD / 3,950 dollars / 500 euros       currency behind
//   18,995                                       no currency, but written with a thousands separator
const CURRENCY_FIRST = /(?:US\$|\$|€|£|USD|EUR|MXN)\s?\d[\d.,]*\d/;
const CURRENCY_LAST =
  /\b\d[\d.,]*\d?\s?(?:USD|US dollars|dollars|dólares|dolares|EUR|euros?|MXN|pesos)\b/;
const THOUSANDS_ONLY = /\b\d{1,3}(?:[.,]\d{3})+\b/;

const MONEY = new RegExp(
  [CURRENCY_FIRST, CURRENCY_LAST, THOUSANDS_ONLY].map((re) => re.source).join("|"),
  "gi",
);

// "$18,995.00" -> "18995", "US$ 30,000" -> "30000", "$4.50" -> "4.50"
function toPlainNumber(amount: string): string {
  const normalized = normalizeNumber(amount.replace(/\s/g, ""));
  const value = normalized.match(/\d+(?:[.,]\d{1,2})?/)?.[0] ?? "";
  return value.replace(/[.,]00?$/, "").replace(",", ".");
}

export function moneyAmounts(text: string): string[] {
  const amounts = (text.match(MONEY) ?? []).map(toPlainNumber).filter(Boolean);
  return [...new Set(amounts)];
}

function numbersIn(text: string): Set<string> {
  const numbers = normalizeNumber(text).match(/\d+(?:\.\d{1,2})?/g) ?? [];
  return new Set(numbers.map((n) => n.replace(/\.00?$/, "")));
}

export type PriceCheck =
  { ok: true; extraSourceIds: string[] } | { ok: false; unsupported: string[] };

// Every price in the answer has to appear in one of the retrieved passages.
//
// If one does not, the whole answer is rejected (`ok: false`) and the caller falls back to
// "I couldn't find that". If a price is found in a passage the model did not cite, that
// passage is returned in `extraSourceIds` so the visitor still gets a link to check it.
//
// Known limit: this compares numbers only. It cannot tell that a correct number was attached
// to the wrong program; that part still depends on the answer prompt.
export function checkPrices(answer: string, retrieved: Chunk[], citedIds: Set<string>): PriceCheck {
  // The section heading counts too: the model sees it, and some prices appear only there,
  // e.g. "Included in the In-Patient Program ($30,000 USD)".
  const passages = retrieved.map((chunk) => ({
    id: chunk.id,
    numbers: numbersIn(`${chunk.section}\n${chunk.text}`),
  }));
  const unsupported: string[] = [];
  const extraSourceIds = new Set<string>();

  for (const amount of moneyAmounts(answer)) {
    const holders = passages.filter((p) => p.numbers.has(amount)).map((p) => p.id);
    if (holders.length === 0) {
      unsupported.push(amount);
    } else if (!holders.some((id) => citedIds.has(id))) {
      extraSourceIds.add(holders[0]);
    }
  }

  if (unsupported.length > 0) return { ok: false, unsupported };
  return { ok: true, extraSourceIds: [...extraSourceIds] };
}
