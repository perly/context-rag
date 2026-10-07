import { createHash } from 'node:crypto';
import { chunkText } from './chunk.js';
import { cosineSimilarity } from './similarity.js';
import type {
  Chunk,
  ChunkOptions,
  Embedder,
  SearchHit,
  SearchResult,
} from './types.js';

export interface DocumentInput {
  id: string;
  tenantId: string;
  text: string;
}

export interface IngestResult {
  chunks: number;
  embedded: number;
  reused: number;
}

export interface SearchOptions {
  tenantId: string;
  topK: number;
  minSimilarity: number;
}

function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function requireId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

export class MemoryVectorStore {
  private readonly chunks = new Map<string, Chunk>();

  get(id: string): Chunk | undefined {
    return this.chunks.get(id);
  }

  list(): Chunk[] {
    return [...this.chunks.values()];
  }

  replaceDocumentChunks(documentId: string, chunks: Chunk[]): void {
    for (const [id, chunk] of this.chunks) {
      if (chunk.documentId === documentId) this.chunks.delete(id);
    }
    for (const chunk of chunks) this.chunks.set(chunk.id, chunk);
  }

  /**
   * Scores chunks for one tenant only. Another tenant's vectors are never ranked.
   */
  search(queryEmbedding: number[], options: SearchOptions): SearchResult {
    const tenantId = requireId(options.tenantId, 'tenantId');
    if (!Number.isInteger(options.topK) || options.topK < 1) {
      throw new Error('topK must be a positive integer.');
    }
    if (!Number.isFinite(options.minSimilarity)) {
      throw new Error('minSimilarity must be a finite number.');
    }

    const hits: SearchHit[] = [];
    let closestMiss: SearchHit | null = null;

    for (const chunk of this.chunks.values()) {
      if (chunk.tenantId !== tenantId) continue;
      const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
      const hit = { chunk, similarity };
      if (similarity >= options.minSimilarity) {
        hits.push(hit);
      } else if (!closestMiss || similarity > closestMiss.similarity) {
        closestMiss = hit;
      }
    }

    hits.sort(
      (a, b) =>
        b.similarity - a.similarity || a.chunk.chunkIndex - b.chunk.chunkIndex,
    );

    return { hits: hits.slice(0, options.topK), closestMiss };
  }
}

/**
 * Splits a document, embeds only chunks whose text changed, and drops stale chunks.
 */
export async function ingestDocument(
  store: MemoryVectorStore,
  embed: Embedder,
  document: DocumentInput,
  options: ChunkOptions,
): Promise<IngestResult> {
  const documentId = requireId(document.id, 'document id');
  const tenantId = requireId(document.tenantId, 'tenantId');
  const pieces = chunkText(document.text, options);

  const planned = pieces.map((text, chunkIndex) => ({
    id: `${documentId}:${chunkIndex}`,
    documentId,
    tenantId,
    chunkIndex,
    text,
    contentHash: contentHash(text),
  }));

  const embeddings: Array<number[] | undefined> = new Array(planned.length);
  const toEmbed: string[] = [];
  const toEmbedAt: number[] = [];

  for (let index = 0; index < planned.length; index += 1) {
    const existing = store.get(planned[index].id);
    if (existing && existing.contentHash === planned[index].contentHash) {
      embeddings[index] = existing.embedding;
    } else {
      toEmbed.push(planned[index].text);
      toEmbedAt.push(index);
    }
  }

  if (toEmbed.length > 0) {
    const fresh = await embed(toEmbed);
    if (fresh.length !== toEmbed.length) {
      throw new Error(
        `Embedder returned ${fresh.length} vectors for ${toEmbed.length} inputs.`,
      );
    }
    toEmbedAt.forEach((chunkIndex, freshIndex) => {
      embeddings[chunkIndex] = fresh[freshIndex];
    });
  }

  store.replaceDocumentChunks(
    documentId,
    planned.map((chunk, index) => {
      const embedding = embeddings[index];
      if (!embedding) throw new Error(`Missing embedding for ${chunk.id}.`);
      return { ...chunk, embedding };
    }),
  );

  return {
    chunks: planned.length,
    embedded: toEmbed.length,
    reused: planned.length - toEmbed.length,
  };
}
