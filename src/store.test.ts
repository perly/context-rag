import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestDocument, MemoryVectorStore } from './store.js';
import type { Chunk, Embedder } from './types.js';

function chunk(partial: Pick<Chunk, 'id' | 'documentId' | 'tenantId' | 'embedding'> & {
  text?: string;
  chunkIndex?: number;
}): Chunk {
  return {
    text: partial.text ?? partial.id,
    chunkIndex: partial.chunkIndex ?? 0,
    contentHash: 'hash',
    ...partial,
  };
}

test('search keeps other tenants out even when their vector is closer', () => {
  const store = new MemoryVectorStore();
  store.replaceDocumentChunks('guesty-office', [
    chunk({
      id: 'guesty-office:0',
      documentId: 'guesty-office',
      tenantId: 'guesty',
      embedding: [1, 0],
    }),
  ]);
  store.replaceDocumentChunks('melio-history', [
    chunk({
      id: 'melio-history:0',
      documentId: 'melio-history',
      tenantId: 'melio',
      embedding: [0, 1],
    }),
  ]);

  const guesty = store.search([1, 0], {
    tenantId: 'guesty',
    topK: 3,
    minSimilarity: 0.35,
  });
  assert.deepEqual(
    guesty.hits.map((hit) => hit.chunk.id),
    ['guesty-office:0'],
  );
  assert.equal(guesty.closestMiss, null);

  const melio = store.search([1, 0], {
    tenantId: 'melio',
    topK: 3,
    minSimilarity: 0.35,
  });
  assert.deepEqual(melio.hits, []);
  assert.equal(melio.closestMiss?.chunk.id, 'melio-history:0');
  assert.equal(melio.closestMiss?.similarity, 0);
});

test('ingest reuses embeddings, then replaces stale chunks', async () => {
  const store = new MemoryVectorStore();
  const calls: string[][] = [];
  const embed: Embedder = async (inputs) => {
    calls.push(inputs);
    return inputs.map((_, index) => [calls.length, index + 1]);
  };

  const first = await ingestDocument(
    store,
    embed,
    { id: 'doc', tenantId: 'guesty', text: 'alpha bravo charlie delta echo foxtrot' },
    { size: 18, overlap: 4 },
  );
  assert.ok(first.chunks >= 2);
  assert.equal(first.embedded, first.chunks);
  assert.equal(first.reused, 0);
  assert.equal(store.list().length, first.chunks);

  const second = await ingestDocument(
    store,
    embed,
    { id: 'doc', tenantId: 'guesty', text: 'alpha bravo charlie delta echo foxtrot' },
    { size: 18, overlap: 4 },
  );
  assert.equal(second.embedded, 0);
  assert.equal(second.reused, first.chunks);
  assert.equal(calls.length, 1);

  const third = await ingestDocument(
    store,
    embed,
    { id: 'doc', tenantId: 'guesty', text: 'only one short note' },
    { size: 180, overlap: 40 },
  );
  assert.equal(third.chunks, 1);
  assert.equal(third.embedded, 1);
  assert.equal(store.list().map((item) => item.id).join(','), 'doc:0');
  assert.equal(store.get('doc:1'), undefined);
});

test('ingest of blank text removes the document', async () => {
  const store = new MemoryVectorStore();
  const embed: Embedder = async () => [[1, 0]];
  await ingestDocument(
    store,
    embed,
    { id: 'doc', tenantId: 'guesty', text: 'hello' },
    { size: 40, overlap: 0 },
  );
  const cleared = await ingestDocument(
    store,
    async () => {
      throw new Error('should not embed empty text');
    },
    { id: 'doc', tenantId: 'guesty', text: '   ' },
    { size: 40, overlap: 0 },
  );
  assert.deepEqual(cleared, { chunks: 0, embedded: 0, reused: 0 });
  assert.equal(store.list().length, 0);
});
