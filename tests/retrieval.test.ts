import { describe, expect, it } from "vitest";
import { getIndex, knowledgeBase } from "@/lib/retrieval/knowledge";
import { tokenize } from "@/lib/retrieval/bm25";

// Runs against the real data/knowledge.json produced by `npm run ingest`.
describe("knowledge base", () => {
  it("covers all 7 source pages", () => {
    expect(knowledgeBase.pages).toHaveLength(7);
    expect(new Set(knowledgeBase.chunks.map((c) => c.sourceId)).size).toBe(7);
  });
});

describe("BM25 retrieval", () => {
  const index = getIndex();
  const topPages = (q: string, n = 3) => index.search(q, n).map((h) => h.chunk.sourceId);

  it("tokenizes prices and plurals consistently", () => {
    expect(tokenize("$18,995 Packages")).toEqual(["18995", "package"]);
  });

  it("finds the adrenal package for an adrenal price question", () => {
    expect(topPages("adrenal cancer treatment package price cost")).toContain("p3");
  });

  it("finds in-patient inclusions for the anal cancer package", () => {
    const hits = index.search("anal cancer in-patient program included", 5);
    expect(
      hits.some(
        (h) => h.chunk.sourceId === "p4" && /in-patient/i.test(h.chunk.section + h.chunk.text),
      ),
    ).toBe(true);
  });

  it("finds the price comparison page for ozone therapy by country", () => {
    expect(topPages("ozone therapy price Turkey Mexico clinic", 5)).toContain("p7");
  });

  it("finds the clinic price list", () => {
    expect(topPages("ITC price list breast prostate lung cancer price USD")).toContain("p6");
  });

  it("returns nothing for unrelated words", () => {
    expect(
      index
        .search("weather forecast cancun rain", 3)
        .every((h) => !/weather|rain/i.test(h.chunk.text)),
    ).toBe(true);
  });
});
