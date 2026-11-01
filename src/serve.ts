import { requireApiKey } from './env.js';
import { createOpenAiAdapters } from './openai.js';
import { loadCorpus } from './run.js';
import { createServer, listen, LOCALHOST } from './server.js';
import { MemoryVectorStore } from './store.js';

function portFromEnv(): number {
  const raw = process.env.PORT;
  if (!raw) return 3000;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer from 0 to 65535.');
  }
  return port;
}

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

  const server = createServer(store, adapters.embed, adapters.complete);
  const port = await listen(server, portFromEnv());
  console.log(`Chat at http://${LOCALHOST}:${port}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
