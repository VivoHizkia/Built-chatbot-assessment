import { describe, expect, it } from "vitest";
import { checkPrices, moneyAmounts } from "@/lib/chat/guardrails";
import type { Chunk } from "@/lib/types";

const chunk = (id: string, text: string): Chunk => ({
  id,
  sourceId: id.split("-")[0],
  url: "https://www.placidway.com/x",
  pageTitle: "T",
  pageType: "treatment_package",
  section: "S",
  text,
});

describe("moneyAmounts", () => {
  it("reads common price formats, including Spanish thousands separators", () => {
    expect(moneyAmounts("From $18,995 or US$ 30,000; extras 3,950 USD; ES: 18.995 USD")).toEqual([
      "18995",
      "30000",
      "3950",
    ]);
  });
  it("catches bare thousands-formatted numbers", () => {
    expect(moneyAmounts("It costs 25,000 in total")).toEqual(["25000"]);
  });
});

describe("checkPrices", () => {
  const retrieved = [
    chunk("p3-c4", "Out-Patient Program: $18,995\nIn-Patient Program: $30,000"),
    chunk("p7-c3", "Initial Holistic Consultation: $50"),
  ];

  it("accepts prices that appear in retrieved passages and adds the passage as a source", () => {
    const result = checkPrices("The in-patient program costs $30,000 USD.", retrieved, new Set());
    expect(result).toEqual({ ok: true, extraSourceIds: ["p3-c4"] });
  });

  it("rejects an invented price", () => {
    const result = checkPrices("It costs $12,500.", retrieved, new Set(["p3-c4"]));
    expect(result).toEqual({ ok: false, unsupported: ["12500"] });
  });

  it("accepts a price that appears only in the section heading of a passage", () => {
    const inPatient: Chunk = {
      ...chunk("p3-c6", "Full Room and Board: Private accommodations and three meals daily."),
      section: "Included in the In-Patient Program ($30,000 USD)",
    };
    const result = checkPrices(
      "The $30,000 program includes room and board.",
      [inPatient],
      new Set(),
    );
    expect(result).toEqual({ ok: true, extraSourceIds: ["p3-c6"] });
  });

  it("passes answers with no prices", () => {
    expect(checkPrices("The program lasts three weeks.", retrieved, new Set())).toEqual({
      ok: true,
      extraSourceIds: [],
    });
  });
});
