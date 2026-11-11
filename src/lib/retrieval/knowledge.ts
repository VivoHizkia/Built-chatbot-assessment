import type { KnowledgeBase } from "@/lib/types";
import knowledgeJson from "../../../data/knowledge.json";
import { Bm25Index } from "./bm25";

// data/knowledge.json is written by `npm run ingest` and bundled into the build, so the
// deployed bot has no database to connect to.
export const knowledgeBase = knowledgeJson as KnowledgeBase;

let index: Bm25Index | null = null;

// Built on first use and then reused for the lifetime of the server instance.
export function getIndex(): Bm25Index {
  index ??= new Bm25Index(knowledgeBase.chunks);
  return index;
}

// One line per page, given to the planner so it knows what the knowledge base covers.
export function pageCatalog(): string {
  return knowledgeBase.pages
    .map((page) => `- ${page.title} (${page.type.replace(/_/g, " ")})`)
    .join("\n");
}
