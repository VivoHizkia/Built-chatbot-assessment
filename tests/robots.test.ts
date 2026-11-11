import { describe, expect, it } from "vitest";
import { isAllowed, parseRobots } from "@/lib/ingestion/robots";

const CRAWLER = "PlacidWayKnowledgeBot";
const PACKAGE_URL = "https://www.placidway.com/package/7902/Adrenal";

describe("robots.txt", () => {
  it("allows the shared pages and blocks disallowed paths", () => {
    const rules = parseRobots(
      ["User-agent: *", "User-agent: GPTBot", "Allow: /", "Disallow: /rfi/"].join("\n"),
      CRAWLER,
    );
    expect(isAllowed(rules, PACKAGE_URL)).toBe(true);
    expect(isAllowed(rules, "https://www.placidway.com/rfi/5/ITC")).toBe(false);
  });

  it("uses the crawler's own group instead of the wildcard group when there is one", () => {
    const rules = parseRobots(
      ["User-agent: *", "Disallow: /", "", `User-agent: ${CRAWLER}`, "Allow: /"].join("\n"),
      CRAWLER,
    );
    expect(isAllowed(rules, PACKAGE_URL)).toBe(true);
  });
});
