import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkText } from './chunk.js';
import { CHUNK_OPTIONS, documents } from './corpus.js';

test('chunkText returns one piece when the text already fits', () => {
  assert.deepEqual(chunkText('  hello   world  ', { size: 40, overlap: 10 }), [
    'hello world',
  ]);
});

test('chunkText returns nothing for blank text', () => {
  assert.deepEqual(chunkText('   ', { size: 40, overlap: 10 }), []);
});

test('chunkText splits on a word boundary and keeps the ending', () => {
  const text = 'alpha bravo charlie delta echo foxtrot';
  const chunks = chunkText(text, { size: 18, overlap: 4 });
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 18));
  assert.match(chunks[0], /^alpha/);
  assert.match(chunks.at(-1) ?? '', /foxtrot$/);
});

test('chunkText finishes when there are no spaces to break on', () => {
  const chunks = chunkText('a'.repeat(100), { size: 30, overlap: 10 });
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((chunk) => chunk.length > 0 && chunk.length <= 30));
  assert.match(chunks.at(-1) ?? '', /a$/);
});

test('chunkText rejects an overlap that cannot advance', () => {
  assert.throws(
    () => chunkText('hello', { size: 10, overlap: 10 }),
    /overlap/i,
  );
});

test('each demo document splits into more than one chunk', () => {
  for (const document of documents) {
    const chunks = chunkText(document.text, CHUNK_OPTIONS);
    assert.ok(chunks.length >= 2, document.id);
  }
});
