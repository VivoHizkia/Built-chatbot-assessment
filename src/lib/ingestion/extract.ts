import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { Source } from "@/config/sources";
import type { ExtractedPage, Section } from "@/lib/types";

// On PlacidWay pages the real content sits in `main .pack-inner-content`. The rest of the page
// (related clinics, other packages, articles, footer) lists prices of unrelated clinics, so we
// only fall back to wider containers when the specific one is missing.
const CONTENT_SELECTORS = [
  "main.article-dt-desc .pack-inner-content",
  "main .pack-inner-content",
  "main",
  "body",
];

const REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "iframe",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "nav",
  ".modal",
  ".request-vido-popup-main",
  ".table-of-contents",
];

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4"]);

// Read as a single line, so "<strong>Label:</strong> value" keeps the label next to its value.
const TEXT_TAGS = new Set(["p", "li", "dt", "dd", "blockquote", "figcaption", "td", "th", "label"]);

const BLOCK_TAGS = new Set([
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "aside",
  "nav",
  "ul",
  "ol",
  "dl",
  "li",
  "p",
  "blockquote",
  "figure",
  "table",
  "thead",
  "tbody",
  "tr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

// Table columns that only hold buttons.
const BUTTON_COLUMN = /^(actions?|quote)$/i;

// Button and link labels that are not content.
const NOISE = new Set([
  "read more",
  "read less",
  "show more",
  "show less",
  "share",
  "quote",
  "get quote",
  "get your quote now!",
  "request a free quote",
  "contact us",
  "chat with center",
  "view package",
  "watch video",
  "medical center reviews",
  "modified date",
]);

export function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function isNoise(line: string): boolean {
  return line.length < 2 || NOISE.has(line.toLowerCase());
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag";
}

function hasBlockChild(el: Element): boolean {
  return el.children.some((child) => isElement(child) && BLOCK_TAGS.has(child.name));
}

// In the clinic comparison table the price cell also holds the date it was last edited:
// "$110 Modified date Jul 31, 2023". Left like that, the price reads as part of a sentence,
// so it is split into "$110; Modified date: Jul 31, 2023".
function splitModifiedDate(value: string): string {
  return value.replace(/\s+Modified date\s+/i, "; Modified date: ");
}

// A table row becomes "- Program Type: In-Patient Program; Duration: 3 Weeks; Total Cost (USD): $30,000"
// so that a price is never separated from the thing it belongs to.
export function tableToLines($: cheerio.CheerioAPI, table: Element): string[] {
  const rows = $(table).find("tr").toArray();
  if (rows.length === 0) return [];

  const readCells = (row: Element) =>
    $(row)
      .children("th,td")
      .toArray()
      .map((cell) => clean($(cell).text()));

  const headers = readCells(rows[0]);
  const lines: string[] = [];

  for (const row of rows.slice(1)) {
    const pairs: string[] = [];
    readCells(row).forEach((value, i) => {
      const header = headers[i] ?? `Column ${i + 1}`;
      if (BUTTON_COLUMN.test(header) || value === "" || isNoise(value)) return;
      pairs.push(`${header}: ${splitModifiedDate(value)}`);
    });
    if (pairs.length > 0) lines.push(`- ${pairs.join("; ")}`);
  }
  return lines;
}

// The page header shows the package price in its own box, outside the main content.
function readHeaderPrice($: cheerio.CheerioAPI): string | null {
  const text = clean($(".pack-price-block").first().text());
  const amount = text.match(/\$\s?\d[\d,]*(?:\.\d+)?/)?.[0];
  return amount ? `Price starting from ${amount.replace(/\s/g, "")} (USD)` : null;
}

function findContentRoot($: cheerio.CheerioAPI): Element | undefined {
  for (const selector of CONTENT_SELECTORS) {
    const el = $(selector).get(0);
    if (el && isElement(el)) return el;
  }
  return undefined;
}

export function extractPage(html: string, source: Source): ExtractedPage {
  const $ = cheerio.load(html);
  $(REMOVE_SELECTORS.join(",")).remove();

  const title = clean($("h1").first().text()) || clean($("title").first().text()) || source.url;
  const headerPrice = readHeaderPrice($);

  // Text before the first heading goes into "Overview".
  const sections: Section[] = [{ heading: "Overview", lines: [] }];

  const addLine = (raw: string) => {
    const line = clean(raw);
    if (isNoise(line)) return;
    const lines = sections[sections.length - 1].lines;
    // Skip a line that just repeats the one before it.
    if (lines[lines.length - 1] !== line) lines.push(line);
  };

  const walk = (node: AnyNode) => {
    if (node.type === "text") {
      addLine(node.data);
      return;
    }
    if (!isElement(node)) return;

    if (HEADING_TAGS.has(node.name)) {
      const heading = clean($(node).text());
      if (heading) sections.push({ heading, lines: [] });
      return;
    }
    if (node.name === "table") {
      tableToLines($, node).forEach(addLine);
      return;
    }
    if (TEXT_TAGS.has(node.name) && !hasBlockChild(node)) {
      const text = $(node).text();
      addLine(node.name === "li" ? `- ${clean(text)}` : text);
      return;
    }
    node.children.forEach(walk);
  };

  findContentRoot($)?.children.forEach(walk);

  return {
    sourceId: source.id,
    url: source.url,
    type: source.type,
    title,
    headerPrice,
    sections: sections.filter((section) => section.lines.length > 0),
  };
}
