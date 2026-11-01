import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { NO_CONTEXT_ANSWER } from './rag.js';
import { createServer, listen, LOCALHOST } from './server.js';
import { MemoryVectorStore } from './store.js';
import type { Chunk, Completer, Embedder } from './types.js';

function chunk(
  partial: Pick<Chunk, 'id' | 'documentId' | 'tenantId' | 'embedding' | 'text'>,
): Chunk {
  return {
    chunkIndex: 0,
    contentHash: 'hash',
    ...partial,
  };
}

function close(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('POST /api/chat returns a tenant hit, a refusal, and a 400 for an empty question', async () => {
  const store = new MemoryVectorStore();
  store.replaceDocumentChunks('guesty-office', [
    chunk({
      id: 'guesty-office:0',
      documentId: 'guesty-office',
      tenantId: 'guesty',
      text: 'The wifi password is example-only.',
      embedding: [1, 0],
    }),
  ]);
  store.replaceDocumentChunks('melio-history', [
    chunk({
      id: 'melio-history:0',
      documentId: 'melio-history',
      tenantId: 'melio',
      text: 'Melio was founded in 2018.',
      embedding: [0, 1],
    }),
  ]);

  let modelCalls = 0;
  let seen = '';
  const embed: Embedder = async (inputs) =>
    inputs.map((text) => (text === 'What is the capital of France?' ? [0, 1] : [1, 0]));
  const complete: Completer = async (messages) => {
    modelCalls += 1;
    seen = messages.map((message) => message.content).join('\n');
    return 'The password is example-only. [guesty-office:0]';
  };

  const server = createServer(store, embed, complete);
  const port = await listen(server, 0);
  const address = server.address() as AddressInfo;
  assert.equal(address.address, LOCALHOST);

  const base = `http://${LOCALHOST}:${port}`;
  const post = (body: unknown) =>
    fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  try {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type') ?? '', /text\/html/);
    const html = await page.text();
    assert.match(html, /id="tenant"/);
    assert.match(html, /id="thread"/);

    const tenants = await fetch(`${base}/api/tenants`);
    assert.equal(tenants.status, 200);
    assert.deepEqual(await tenants.json(), { tenants: ['guesty', 'melio'] });

    const hitResponse = await post({
      tenantId: 'guesty',
      question: 'How do I get online at the Tel Aviv office?',
    });
    assert.equal(hitResponse.status, 200);
    const hit = await hitResponse.json();
    assert.equal(hit.usedModel, true);
    assert.equal(hit.answer, 'The password is example-only. [guesty-office:0]');
    assert.equal(hit.sources.length, 1);
    assert.equal(hit.sources[0].id, 'guesty-office:0');
    assert.equal(hit.sources[0].tenantId, 'guesty');
    assert.equal(hit.sources[0].text, 'The wifi password is example-only.');
    assert.ok(hit.sources[0].similarity >= 0.35);
    assert.equal(hit.closestMiss, null);
    assert.match(seen, /example-only/);
    assert.doesNotMatch(seen, /founded in 2018/);

    const missResponse = await post({
      tenantId: 'guesty',
      question: 'What is the capital of France?',
    });
    assert.equal(missResponse.status, 200);
    const miss = await missResponse.json();
    assert.equal(miss.usedModel, false);
    assert.equal(miss.answer, NO_CONTEXT_ANSWER);
    assert.deepEqual(miss.sources, []);
    assert.equal(miss.closestMiss.id, 'guesty-office:0');
    assert.equal(modelCalls, 1);

    const emptyResponse = await post({ tenantId: 'guesty', question: '   ' });
    assert.equal(emptyResponse.status, 400);
    assert.deepEqual(await emptyResponse.json(), { error: 'Question is required.' });

    const missingTenant = await post({ tenantId: ' ', question: 'Who founded Melio?' });
    assert.equal(missingTenant.status, 400);
    assert.deepEqual(await missingTenant.json(), { error: 'tenantId is required.' });
    assert.equal(modelCalls, 1);
  } finally {
    await close(server);
  }
});
