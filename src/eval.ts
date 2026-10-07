import { requireApiKey } from './env.js';
import { createOpenAiAdapters } from './openai.js';
import { answerQuestions, checkTurn, formatTurn, loadCorpus } from './run.js';
import { MemoryVectorStore } from './store.js';

async function main(): Promise<void> {
  const adapters = createOpenAiAdapters(requireApiKey());
  const store = new MemoryVectorStore();
  await loadCorpus(store, adapters.embed);

  const failures: string[] = [];
  const turns = await answerQuestions(store, adapters);
  for (const turn of turns) {
    console.log(`\n${formatTurn(turn)}`);
    const failure = checkTurn(turn);
    if (failure) failures.push(failure);
  }

  if (failures.length > 0) {
    console.error(`\nEval failed\n${failures.join('\n')}`);
    process.exit(1);
  }

  console.log('\nEval passed.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
