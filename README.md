# PlacidWay Website Knowledge Chatbot

A chatbot that answers visitor questions using only the seven PlacidWay pages shared for the AI Automation Engineer assessment. Every answer links to the page it came from. When the pages do not cover a question, the bot says so and points to the free-quote form instead of guessing.

- **Live demo:** _add your Vercel URL here_
- **Test results:** [test-results/results.md](test-results/results.md)
- **Limitations and next steps:** [WRITEUP.md](WRITEUP.md)

## Tools and models, and why

| Choice                                                           | Why                                                                                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js 16 + TypeScript**                                      | Chat UI and API routes in one project, one-click deploy to Vercel.                                                                                                         |
| **cheerio**                                                      | The pages are server rendered HTML, so a plain HTML parser is enough; no headless browser.                                                                                 |
| **BM25 keyword search** (written in `src/lib/retrieval/bm25.ts`) | Seven pages become 178 chunks. At that size keyword search is fast, free, and every hit can be explained by the words it matched. No vector database or embedding service. |
| **Gemini `gemini-3.5-flash-lite`** (Google AI Studio free tier)  | Free and fast enough for two calls per message. The client speaks the OpenAI-compatible API, so Groq, OpenAI or a local model work by changing two env vars.               |
| **JSON file as the knowledge base**                              | `data/knowledge.json` is committed and bundled at build time: no database to run, and a content refresh is a normal commit that can be reviewed in a diff.                 |
| **Vitest**                                                       | Unit tests for extraction, retrieval and the guardrails, with the LLM mocked so they need no network or key.                                                               |

## How it works

```
npm run ingest   (manual, or weekly through GitHub Actions)

  7 PlacidWay URLs -> robots.txt check -> fetch (1 request/second, clear User-Agent)
                   -> keep main content only -> one chunk per section -> data/knowledge.json

Visitor question

  1. Planner (LLM)   detects language and intent, rewrites the message into a standalone
                     English search query (this is what makes follow-ups and Spanish work)
  2. Retrieval       BM25 over the chunks, top 8 passages
  3. Answer (LLM)    answers from those passages only, returns {status, answer, source_ids}
  4. Guardrails      checks in code, see below
```

### Ingestion

Code: `scripts/ingest.ts`, `src/lib/ingestion/`.

- Fetches only the URLs in `src/config/sources.ts`. It never follows links.
- Reads `robots.txt` first and skips anything disallowed. Sends the User-Agent `PlacidWayKnowledgeBot/1.0` and waits about 1.1 seconds between requests.
- Keeps only the page's main content (`main .pack-inner-content`) and the "Price starting from" box in the header. The sidebars, related clinics, other packages and footer are dropped because they list prices of unrelated clinics, which would otherwise leak into answers.
- Tables become labelled rows such as `Program Type: In-Patient Program; Duration: 3 Weeks; Total Cost (USD): $30,000`, so a price always stays next to the thing it belongs to.
- One chunk per page section (split above 1,200 characters, very small sections merged). Each chunk carries the page title, section heading and URL.
- If a page fails to download, its previous content is kept, so a refresh can never empty the bot.

### Retrieval

Code: `src/lib/retrieval/`.

BM25 with a small boost for section headings, and number normalisation so `$18,995`, `18.995` and `18995` match each other. The search runs twice, once with the planner's rewritten query and once with the visitor's original words, and the results are merged.

### Answering and honesty

Code: `src/lib/chat/`.

The answer prompt tells the model to use only the retrieved passages. The following checks then run in code, because a prompt alone is not a guarantee:

- **Sources are real.** A cited passage id only counts if that passage was retrieved for this question. Links are built by the server from the stored URLs; the model never writes a URL.
- **Prices are real.** Every money amount in the answer must appear in a retrieved passage. If one does not, the whole answer is replaced by a fixed "I couldn't find that" message with the quote link.
- **No source, no answer.** An answer marked as answered without a valid source is treated as not found.
- **Gaps are logged.** Every not-found or rejected answer is logged with the question, so missing content can be found later.

Each reply has one of six statuses:

| Status      | When                                            | What the visitor sees                               |
| ----------- | ----------------------------------------------- | --------------------------------------------------- |
| `answered`  | The pages answer the question                   | Answer and source link(s)                           |
| `not_found` | The pages do not cover it, or a guardrail fired | "Not on our pages", quote link, optional lead form  |
| `booking`   | The visitor asks to book or take an action      | "I can't book", quote link, optional lead form      |
| `medical`   | The visitor asks about their own condition      | No assessment, "speak with your doctor", disclaimer |
| `declined`  | Unrelated to medical travel                     | Polite decline                                      |
| `smalltalk` | Greetings and thanks                            | Short reply                                         |

Prices are copied with their currency and context (starting from, out-patient or in-patient, duration) and are never converted or calculated. A wrong price stated by the visitor is not confirmed; the bot gives the listed price instead.

### Nice-to-haves included

- Answers in the visitor's language (for example Spanish questions about the English pages).
- Follow-up questions through chat history.
- A medical disclaimer shown once per conversation, the first time it is relevant.
- Lead capture (name and email) offered on quote, booking and not-found answers.
- Logging of unanswered questions and leads.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local      # then put your key in LLM_API_KEY
npm run dev                     # http://localhost:3000
```

A free Gemini key is available at https://aistudio.google.com/apikey.

| Command             | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `npm run dev`       | Start the app locally                                                |
| `npm run ingest`    | Re-crawl the 7 pages and rebuild `data/knowledge.json`               |
| `npm run eval`      | Run the test questions against the real model, write `test-results/` |
| `npm test`          | Unit tests (no network, LLM mocked)                                  |
| `npm run typecheck` | TypeScript check                                                     |
| `npm run format`    | Format with Prettier                                                 |
| `npm run build`     | Production build                                                     |

### Environment variables

| Name                 | Required | Purpose                                                                     |
| -------------------- | -------- | --------------------------------------------------------------------------- |
| `LLM_API_KEY`        | yes      | API key for the LLM provider                                                |
| `LLM_BASE_URL`       | no       | OpenAI-compatible endpoint. Default: Gemini                                 |
| `LLM_MODEL`          | no       | Default: `gemini-3.5-flash-lite`                                            |
| `LLM_FALLBACK_MODEL` | no       | Second model on the same endpoint, used when the first stays busy (429/503) |
| `QUOTE_URL`          | no       | Where quote links point. Default: the ITC request-a-quote page              |
| `EVENTS_WEBHOOK_URL` | no       | Receives unanswered questions and leads as JSON                             |

## Refreshing the content

- **Manual:** run `npm run ingest`, commit `data/knowledge.json`, push. Vercel redeploys.
- **Automatic:** `.github/workflows/refresh.yml` runs every Monday (and on demand from the Actions tab). It re-crawls, runs the tests, and commits the file only if the content changed.

## Deploy on Vercel

1. Push the repository to GitHub and import it in Vercel (framework preset: Next.js).
2. Add the environment variable `LLM_API_KEY`.
3. Deploy. There is no database to set up.

## Logs

Unanswered questions, leads and errors are written to the server log as JSON lines (`{"botEvent": {...}}`). Set `EVENTS_WEBHOOK_URL` to also send them to a Google Sheet (Apps Script), n8n or Slack.

## Project structure

```
src/
  app/                    Next.js routes
    api/chat/route.ts       POST /api/chat
    api/lead/route.ts       POST /api/lead
    page.tsx, layout.tsx, globals.css
  components/             Chat, ChatMessage, LeadForm
  config/sources.ts       the 7 allowed URLs, crawler User-Agent, quote URL
  lib/
    ingestion/            extract.ts (HTML -> sections), chunk.ts, robots.ts
    retrieval/            bm25.ts (tokenizer + index), knowledge.ts (loads the JSON)
    chat/                 answer.ts (the pipeline), prompts.ts, guardrails.ts
    llm.ts                OpenAI-compatible client
    log.ts                unanswered / lead / error events
    rate-limit.ts         per-IP limiter
    types.ts
scripts/
  ingest.ts               crawler -> data/knowledge.json
  eval.ts                 test questions -> test-results/
data/knowledge.json       the knowledge base (generated, committed)
tests/                    Vitest unit tests
test-results/             answers to the assessment's test questions
```

## Security notes

- The API key is read only on the server, from environment variables. Nothing secret is in the repository.
- Questions are limited to 500 characters, history to the last 6 turns, and a per-IP rate limit protects the free-tier key.
- Page text is passed to the model as data, with an instruction to ignore any instructions inside it.
