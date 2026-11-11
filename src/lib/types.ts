import type { PageType } from "@/config/sources";

// --- Ingestion -------------------------------------------------------------

export type Section = { heading: string; lines: string[] };

export type ExtractedPage = {
  sourceId: string;
  url: string;
  type: PageType;
  title: string;
  headerPrice: string | null;
  sections: Section[];
};

export type Chunk = {
  id: string;
  sourceId: string;
  url: string;
  pageTitle: string;
  pageType: PageType;
  section: string;
  text: string;
};

export type PageSummary = {
  sourceId: string;
  url: string;
  title: string;
  type: PageType;
  contentHash: string;
  chunkCount: number;
};

export type KnowledgeBase = {
  generatedAt: string;
  pages: PageSummary[];
  chunks: Chunk[];
};

// --- Chat ------------------------------------------------------------------

export type ChatTurn = { role: "user" | "assistant"; content: string };

// The answer prompt in lib/chat/prompts.ts lists the same values; change both together.
export const ANSWER_STATUSES = [
  "answered",
  "not_found",
  "booking",
  "medical",
  "declined",
  "smalltalk",
] as const;

export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

export type SourceRef = { url: string; title: string; section: string };

export type ChatResponse = {
  status: AnswerStatus;
  answer: string;
  sources: SourceRef[];
  quoteUrl: string | null;
  offerLeadForm: boolean;
  showDisclaimer: boolean;
};
