import { CHUNK_OPTIONS, demoQuestions, documents } from './corpus.js';
import type { OpenAiAdapters } from './openai.js';
import { ask, DEFAULT_MIN_SIMILARITY, DEFAULT_TOP_K } from './rag.js';
import { ingestDocument, MemoryVectorStore } from './store.js';
import type { Embedder, RagAnswer } from './types.js';
import type { DemoQuestion } from './corpus.js';

export interface DemoTurn {
  question: DemoQuestion;
  answer: RagAnswer;
}

export async function loadCorpus(store: MemoryVectorStore, embed: Embedder) {
  const results = [];
  for (const document of documents) {
    results.push({
      document,
      ingest: await ingestDocument(store, embed, document, CHUNK_OPTIONS),
    });
  }
  return results;
}

export async function answerQuestions(
  store: MemoryVectorStore,
  adapters: OpenAiAdapters,
): Promise<DemoTurn[]> {
  const turns: DemoTurn[] = [];
  for (const question of demoQuestions) {
    turns.push({
      question,
      answer: await ask({
        question: question.question,
        tenantId: question.tenantId,
        store,
        embed: adapters.embed,
        complete: adapters.complete,
        topK: DEFAULT_TOP_K,
        minSimilarity: DEFAULT_MIN_SIMILARITY,
      }),
    });
  }
  return turns;
}

export function formatTurn(turn: DemoTurn): string {
  const { question, answer } = turn;
  const lines = [
    question.name,
    `tenant: ${question.tenantId}`,
    `question: ${question.question}`,
  ];

  if (answer.sources.length === 0) {
    lines.push('sources: none');
    if (answer.closestMiss) {
      lines.push(
        `closest miss: ${answer.closestMiss.id}  similarity ${answer.closestMiss.similarity.toFixed(3)}`,
      );
    }
  } else {
    for (const source of answer.sources) {
      lines.push(
        `source: ${source.id}  tenant ${source.tenantId}  similarity ${source.similarity.toFixed(3)}`,
      );
    }
  }

  lines.push(`model called: ${answer.usedModel ? 'yes' : 'no'}`);
  lines.push(`answer: ${answer.answer}`);
  return lines.join('\n');
}

function isRefusal(answer: string): boolean {
  return /do not know|don't know|does not (contain|include|mention|say)|do not (contain|include|mention)|not mentioned|no information/i.test(
    answer,
  );
}

export function checkTurn(turn: DemoTurn): string | null {
  const { question, answer } = turn;
  const top = answer.sources[0];

  if (question.expectedDocumentId) {
    if (!top || top.documentId !== question.expectedDocumentId) {
      return `${question.name}: expected ${question.expectedDocumentId}, got ${top?.documentId ?? 'no source'}.`;
    }
  }

  if (question.expectNoOtherTenant) {
    const leaked = answer.sources.find((source) => source.tenantId !== question.tenantId);
    if (leaked) {
      return `${question.name}: retrieved ${leaked.id} from tenant ${leaked.tenantId}.`;
    }
  }

  if (question.expectRefusal && !isRefusal(answer.answer)) {
    return `${question.name}: expected a refusal, got: ${answer.answer}`;
  }

  return null;
}
