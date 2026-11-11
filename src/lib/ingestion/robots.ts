// A small robots.txt reader: enough to respect Allow/Disallow for one crawler.

export type RobotsRule = { allow: boolean; pattern: string };

type Group = { agents: string[]; rules: RobotsRule[] };

// Returns the rules that apply to `crawlerName`: its own group if robots.txt has one,
// otherwise the "*" group.
export function parseRobots(text: string, crawlerName: string): RobotsRule[] {
  const groups: Group[] = [];
  let group: Group | null = null;
  let previousWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;

    const field = match[1].toLowerCase();
    const value = match[2].trim();

    if (field === "user-agent") {
      // Several User-agent lines in a row share one group of rules.
      if (!group || !previousWasAgent) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
      previousWasAgent = true;
      continue;
    }

    previousWasAgent = false;
    if ((field === "allow" || field === "disallow") && group && value) {
      group.rules.push({ allow: field === "allow", pattern: value });
    }
  }

  const name = crawlerName.toLowerCase();
  const own = groups.filter((g) => g.agents.some((agent) => agent !== "*" && name.includes(agent)));
  const applicable = own.length > 0 ? own : groups.filter((g) => g.agents.includes("*"));
  return applicable.flatMap((g) => g.rules);
}

// robots.txt patterns support "*" (any characters) and a trailing "$" (end of URL).
function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

// The longest matching pattern wins; on a tie, Allow wins. No matching rule means allowed.
export function isAllowed(rules: RobotsRule[], url: string): boolean {
  const { pathname, search } = new URL(url);
  const path = pathname + search;

  let winner: RobotsRule | null = null;
  for (const rule of rules) {
    if (!patternToRegex(rule.pattern).test(path)) continue;
    const longer = !winner || rule.pattern.length > winner.pattern.length;
    const tieButAllow = winner && rule.pattern.length === winner.pattern.length && rule.allow;
    if (longer || tieButAllow) winner = rule;
  }
  return winner ? winner.allow : true;
}
