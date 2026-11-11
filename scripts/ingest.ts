// Rebuilds data/knowledge.json from the pages in src/config/sources.ts.
//
//   npm run ingest
//
// Crawling rules from the brief: only the shared URLs, respect robots.txt, a clear User-Agent,
// about one request per second.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CRAWLER_NAME, CRAWLER_USER_AGENT, SOURCES, type Source } from "@/config/sources";
import { chunkPage } from "@/lib/ingestion/chunk";
import { extractPage } from "@/lib/ingestion/extract";
import { isAllowed, parseRobots } from "@/lib/ingestion/robots";
import type { Chunk, KnowledgeBase, PageSummary } from "@/lib/types";

const OUTPUT_FILE = path.join(process.cwd(), "data", "knowledge.json");
const REQUEST_DELAY_MS = 1100;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": CRAWLER_USER_AGENT, Accept: "text/html,text/plain" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      // Wait longer after each failure.
      await sleep(REQUEST_DELAY_MS * attempt * 2);
    }
  }
}

async function loadPrevious(): Promise<KnowledgeBase | null> {
  try {
    return JSON.parse(await readFile(OUTPUT_FILE, "utf8")) as KnowledgeBase;
  } catch {
    return null; // first run
  }
}

// The hash lets the refresh workflow (and this script's log) tell whether a page changed.
function hashContent(chunks: Chunk[]): string {
  const text = chunks.map((chunk) => chunk.text).join("\n");
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function ingestPage(source: Source): Promise<{ page: PageSummary; chunks: Chunk[] }> {
  const html = await fetchText(source.url);
  const extracted = extractPage(html, source);
  const chunks = chunkPage(extracted);

  const page: PageSummary = {
    sourceId: source.id,
    url: source.url,
    title: extracted.title,
    type: source.type,
    contentHash: hashContent(chunks),
    chunkCount: chunks.length,
  };
  return { page, chunks };
}

async function main() {
  const previous = await loadPrevious();

  const robotsUrl = new URL("/robots.txt", SOURCES[0].url).toString();
  const rules = parseRobots(await fetchText(robotsUrl), CRAWLER_NAME);
  console.log(`robots.txt loaded (${rules.length} rules)`);

  const knowledge: KnowledgeBase = { generatedAt: new Date().toISOString(), pages: [], chunks: [] };
  let changed = 0;
  let failed = 0;

  for (const source of SOURCES) {
    await sleep(REQUEST_DELAY_MS);

    if (!isAllowed(rules, source.url)) {
      console.warn(`SKIP ${source.id}: disallowed by robots.txt`);
      continue;
    }

    const oldPage = previous?.pages.find((page) => page.sourceId === source.id);

    try {
      const { page, chunks } = await ingestPage(source);
      knowledge.pages.push(page);
      knowledge.chunks.push(...chunks);

      const isChanged = oldPage?.contentHash !== page.contentHash;
      if (isChanged) changed++;
      const note = oldPage && isChanged ? " (changed)" : "";
      console.log(`OK   ${source.id} ${page.title} -> ${chunks.length} chunks${note}`);
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : String(err);

      // A page that is down today keeps yesterday's content instead of vanishing from the bot.
      if (previous && oldPage) {
        knowledge.pages.push(oldPage);
        knowledge.chunks.push(...previous.chunks.filter((c) => c.sourceId === source.id));
        console.warn(`FAIL ${source.id}: ${reason} (kept previous content)`);
      } else {
        console.warn(`FAIL ${source.id}: ${reason} (no previous content)`);
      }
    }
  }

  if (knowledge.chunks.length === 0) {
    console.error("No content ingested; leaving the existing knowledge base untouched.");
    process.exit(1);
  }

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(knowledge, null, 2) + "\n");
  console.log(
    `Wrote ${knowledge.chunks.length} chunks from ${knowledge.pages.length} pages ` +
      `to data/knowledge.json (${changed} changed, ${failed} failed)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
