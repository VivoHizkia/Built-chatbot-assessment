# Write-up: limitations and next steps

## Design choices in one paragraph

I kept the bot small and verifiable: a polite crawler limited to the 7 URLs, extraction that keeps only each page's main content, section-level chunks, BM25 retrieval, and an OpenAI-compatible LLM (Gemini free tier by default). Honesty is enforced in code as well as in the prompt: sources can only be passages that were retrieved, links are built by the server, and any price in an answer that does not appear in a retrieved passage causes the answer to be replaced with "I couldn't find that" plus the quote link.

## Known limitations

- **Keyword retrieval.** BM25 relies on the planner's English rewrite for synonyms and other languages. A planner failure falls back to the raw question, which is weaker for non-English questions.
- **Price guard is number-based.** It checks that every amount exists in the retrieved passages, not that it is attached to the right item. A wrong pairing (a correct number under the wrong program) is still possible, although the prompt asks for exact copying with context.
- **Fallback messages are English only.** Normal answers follow the visitor's language, but the code-level fallbacks (invented-price or LLM error) are fixed English text.
- **Logs are not a database.** Unanswered questions and leads go to the server log and an optional webhook; there is no dashboard.
- **Free-tier LLM limits.** Each message uses two LLM calls (plan + answer). Heavy testing can hit the free quota; the bot then answers with a polite error instead of guessing.
- **Comparisons use individual clinic listings.** The comparison page lists prices per clinic, not per country. For "is X cheaper in Turkey or Mexico" the bot gives the listed clinic prices and says they are not a rule for the whole country; it cannot give a country average.
- **The planner can misjudge intent.** If it labels a real treatment question as out of scope, retrieval is skipped and the bot answers "not found". That is a safe failure, but it is still a miss.
- **Videos page.** The clinic videos page is mostly titles and short descriptions, so it adds little knowledge.

## With another week I would

1. Add hybrid retrieval (BM25 + multilingual embeddings) and evaluate recall on a labelled set of ~50 questions.
2. Attach prices to their row or label in a structured price table during ingestion, and verify item + amount pairs, not just amounts.
3. Build a small dashboard for unanswered questions and leads (Postgres or Google Sheets) to close content gaps.
4. Stream answers token by token for a faster feel, and translate the fallback messages.
5. Run the evaluation in CI on every change, with a regression set of tricky and adversarial questions.
