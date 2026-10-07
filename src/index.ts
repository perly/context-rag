import { requireApiKey } from './env.js';
import { createOpenAiAdapters } from './openai.js';
import { formatTurn, loadCorpus, answerQuestions } from './run.js';
import { ingestDocument, MemoryVectorStore } from './store.js';
import { CHUNK_OPTIONS, documents } from './corpus.js';

async function main(): Promise<void> {
  const adapters = createOpenAiAdapters(requireApiKey());
  const store = new MemoryVectorStore();

  console.log('Ingest');
  const ingested = await loadCorpus(store, adapters.embed);
  for (const { document, ingest } of ingested) {
    console.log(
      `${document.id} (${document.tenantId}): ${ingest.chunks} chunks, embedded ${ingest.embedded}, reused ${ingest.reused}`,
    );
  }

  const again = await ingestDocument(
    store,
    adapters.embed,
    documents[0],
    CHUNK_OPTIONS,
  );
  console.log(
    `re-ingest ${documents[0].id} with the same text: embedded ${again.embedded}, reused ${again.reused}`,
  );

  console.log('\nQuestions');
  const turns = await answerQuestions(store, adapters);
  for (const turn of turns) {
    console.log(`\n${formatTurn(turn)}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
