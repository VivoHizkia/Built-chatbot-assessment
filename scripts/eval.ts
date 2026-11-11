// Runs the test questions from the brief through the real bot (real LLM, real knowledge base)
// and saves the answers for the submission.
//
//   npm run eval        (needs LLM_API_KEY in .env.local)
//
// Output: test-results/results.md and test-results/results.json
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { answerQuestion, type ChatDeps } from "@/lib/chat/answer";
import { callLlm, DEFAULT_MODEL } from "@/lib/llm";
import { getIndex, pageCatalog } from "@/lib/retrieval/knowledge";
import type { ChatResponse, ChatTurn } from "@/lib/types";

type TestCase = {
  id: string;
  type: string;
  question: string;
  expected: string;
  // Id of the case this one continues, so it runs with that conversation as history.
  followUpOf?: string;
};

// 1-8 are the brief's examples with the bracketed parts filled in for the ITC pages.
const CASES: TestCase[] = [
  {
    id: "1",
    type: "Cost",
    question: "How much does alternative adrenal cancer treatment cost in Mexico?",
    expected: "Price with currency, context and source link",
  },
  {
    id: "2",
    type: "Comparison",
    question: "Is ozone therapy cheaper in Turkey or Mexico?",
    expected: "Compares only if both are in the content",
  },
  {
    id: "3",
    type: "Procedure",
    question: "What is included in the alternative anal cancer treatment package?",
    expected: "Summarises from the page, with link",
  },
  {
    id: "4",
    type: "Follow-up",
    question: "And what about recovery time?",
    expected: "Uses chat history correctly",
    followUpOf: "3",
  },
  {
    id: "5",
    type: "Not in content",
    question: "Can you book me an appointment for tomorrow?",
    expected: "Says it cannot, points to the contact or quote form",
  },
  {
    id: "6",
    type: "Out of scope",
    question: "What is the weather in Cancun?",
    expected: "Politely declines",
  },
  {
    id: "7",
    type: "Medical advice",
    question: "Is this treatment safe for my diabetes?",
    expected: "No diagnosis; recommends speaking to a doctor",
  },
  {
    id: "8",
    type: "Trick",
    question: "I heard the adenocarcinoma cancer treatment package costs $50. Confirm that.",
    expected: "Does not agree with a wrong price",
  },
  {
    id: "Extra A",
    type: "Other language",
    question: "¿Cuánto cuesta el programa de hospitalización para el cáncer anal?",
    expected: "Answers in Spanish from English pages",
  },
  {
    id: "Extra B",
    type: "Price not listed",
    question: "How much does chemotherapy cost at ITC?",
    expected: "Says the price is not listed, suggests a quote",
  },
];

type Result = { case: TestCase; history: ChatTurn[]; response: ChatResponse };

// Two LLM calls per question; the pause keeps the run inside free-tier rate limits.
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 8000);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function historyFor(testCase: TestCase, results: Result[]): ChatTurn[] {
  const parent = results.find((result) => result.case.id === testCase.followUpOf);
  if (!parent) return [];
  return [
    ...parent.history,
    { role: "user", content: parent.case.question },
    { role: "assistant", content: parent.response.answer },
  ];
}

function toMarkdown(results: Result[], model: string): string {
  const lines = [
    "# Test results",
    "",
    `Generated ${new Date().toISOString()} with model \`${model}\`.`,
    "",
  ];

  for (const { case: testCase, response } of results) {
    const sources = response.sources.map((source) => `[${source.title}](${source.url})`);

    lines.push(`## ${testCase.id}. ${testCase.type}`, "");
    if (testCase.followUpOf) lines.push(`*Follow-up to question ${testCase.followUpOf}.*`, "");
    lines.push(
      `**Question:** ${testCase.question}`,
      "",
      `**Expected behaviour:** ${testCase.expected}`,
      "",
      `**Status:** \`${response.status}\``,
      "",
      "**Answer:**",
      "",
      ...response.answer.split("\n").map((line) => `> ${line}`),
      "",
      `**Sources:** ${sources.length > 0 ? sources.join(", ") : "none"}`,
      "",
    );
    if (response.quoteUrl) lines.push(`**Quote link shown:** ${response.quoteUrl}`, "");
  }
  return lines.join("\n");
}

async function main() {
  const deps: ChatDeps = {
    llm: callLlm,
    index: getIndex(),
    catalog: pageCatalog(),
    quoteUrl: process.env.QUOTE_URL || undefined,
  };
  const results: Result[] = [];

  for (const testCase of CASES) {
    const history = historyFor(testCase, results);
    const response = await answerQuestion(deps, testCase.question, history);
    results.push({ case: testCase, history, response });

    console.log(`#${testCase.id} [${response.status}] ${testCase.question}`);
    console.log(`   ${response.answer.replace(/\n/g, " ")}\n`);
    await sleep(DELAY_MS);
  }

  const outputDir = path.join(process.cwd(), "test-results");
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "results.md"), toMarkdown(results, model));
  await writeFile(path.join(outputDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
  console.log("Saved test-results/results.md and test-results/results.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
