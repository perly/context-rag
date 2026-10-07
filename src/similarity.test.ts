import assert from 'node:assert/strict';
import test from 'node:test';
import { cosineSimilarity } from './similarity.js';

test('cosineSimilarity scores identical, opposite, and orthogonal vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('cosineSimilarity returns 0 for a zero vector', () => {
  assert.equal(cosineSimilarity([0, 0], [1, 2]), 0);
});

test('cosineSimilarity rejects mismatched lengths and non-finite values', () => {
  assert.throws(() => cosineSimilarity([1], [1, 0]), /length/i);
  assert.throws(() => cosineSimilarity([Number.NaN], [1]), /finite/i);
});
