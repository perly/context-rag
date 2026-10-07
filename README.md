# Context RAG

A small retrieval-augmented generation pipeline. It chunks documents, embeds them, retrieves the closest chunks inside one tenant, and answers from that text only.

The store is in memory on purpose. Two documents are enough to show the behavior. The production pieces that are missing are called out at the end, so the demo does not pretend to be a search engine.

## Pipeline

1. Split each document into overlapping chunks.
2. Embed only chunks whose text changed. A content hash skips the paid call on a re-ingest.
3. Embed the question.
4. Rank chunks for that tenant. Chunks from any other tenant are not scored.
5. Keep the top matches above a similarity cutoff. If none qualify, return a refusal and do not call the chat model.
6. Otherwise ask the model to answer from those chunks, with the chunks marked as data rather than instructions.

## Run it locally

Clone the repository and run it on your machine. You need Node.js 20 or newer.

```bash
git clone https://github.com/perly/context-rag.git
cd context-rag
npm install
npm test
```

`npm test` checks chunking, tenant isolation, embedding reuse, and the refusal path. It uses hand-built vectors, so it needs no API key.

To see the live answers, copy the example env file and set your own key:

```bash
cp .env.example .env
```

`.env` stays on your machine. Then:

```bash
npm start
npm run eval
```

`npm start` prints the ingest counts and four questions. `npm run eval` runs those questions and exits with an error if retrieval or the refusal check fails.

## What the demo shows

The corpus has an office note for tenant `guesty` and a company note for tenant `melio`.

- "How do I get online at the Tel Aviv office?" as `guesty` should cite `guesty-office`. The question does not contain the words "wifi password".
- The same question as `melio` must not cite the Guesty document. If nothing in the Melio note is close enough, the model is not called.
- "Who founded Melio?" as `melio` should cite `melio-history`.
- "What is the capital of France?" is not in either document. The answer should refuse. A correct city name here would mean the model ignored retrieval.

After the first ingest, the demo writes the Guesty document again. The log should show `embedded 0` and the previous chunks reused.

## Layout

- `src/chunk.ts` splits text, breaking on a space when it can.
- `src/similarity.ts` is cosine similarity, including the zero-vector case.
- `src/store.ts` is the in-memory index, tenant filter, and idempotent ingest.
- `src/rag.ts` retrieves, builds the prompt, and skips the model when retrieval misses.
- `src/corpus.ts` is the sample documents and questions.
- `src/eval.ts` is the live check against the API.

## Decisions worth walking through

Retrieval returns up to three chunks, not a single document. The cutoff is `0.35` cosine similarity for `text-embedding-3-small`. That number is a starting point. A real system tunes it on a question set, because a cutoff that is too low feeds the model irrelevant text and a cutoff that is too high returns "I don't know" for good paraphrases.

Generation uses temperature `0` and a prompt that forbids outside knowledge. The France question is the check. The earlier version of this project told the model it could answer from general knowledge, so that question looked successful while retrieval was being ignored.

Tenant id is a hard filter before similarity. Hiding a chunk in the prompt is too late: the model has already seen it. Two companies in the sample corpus make that concrete.

Re-ingest is an upsert by chunk id plus a hash of the text. Unchanged chunks keep their vectors. Chunks that disappear from a shorter document are deleted, so old passages cannot keep matching.

## Tests

Unit tests cover chunk boundaries, cosine edge cases, tenant isolation, embedding reuse, stale-chunk deletion, the refusal short-circuit, and the prompt shape. They use hand-built vectors, so they stay deterministic.

The live eval is separate because embedding scores move when the model changes.

## Deliberately not in this repo

These are the next steps, not hidden features:

- An approximate nearest-neighbor index, such as Postgres with pgvector, once the corpus is larger than a linear scan.
- Hybrid search. Vectors miss exact tokens such as an error code or a network name. Keyword search plus vector search covers both.
- A reranker on the top candidates. The first search is cheap. A slower cross-encoder is how you spend latency on purpose.
- An offline set that scores retrieval hit rate and whether the answer is supported by the cited chunk.
- Richer ingestion: page metadata, document versions, and batch sync from a source system.

## Security

Each person sets their own `OPENAI_API_KEY` in a local `.env` file. That file is gitignored. Leave the key out of source, commits, and chat. If a key was ever saved in a file that got shared, revoke it in the provider dashboard and create a new one.
