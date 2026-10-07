import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadEnvFile, requireApiKey } from './env.js';

test('loadEnvFile sets a missing variable and keeps an existing one', () => {
  const directory = mkdtempSync(join(tmpdir(), 'context-rag-'));
  const path = join(directory, 'test.env');
  writeFileSync(path, 'export NEW_RAG_KEY="from-file"\nKEEP_RAG_KEY=from-file\n# comment\n\n');

  const previousNew = process.env.NEW_RAG_KEY;
  const previousKeep = process.env.KEEP_RAG_KEY;
  delete process.env.NEW_RAG_KEY;
  process.env.KEEP_RAG_KEY = 'already-set';

  try {
    loadEnvFile(path);
    assert.equal(process.env.NEW_RAG_KEY, 'from-file');
    assert.equal(process.env.KEEP_RAG_KEY, 'already-set');
  } finally {
    if (previousNew === undefined) delete process.env.NEW_RAG_KEY;
    else process.env.NEW_RAG_KEY = previousNew;
    if (previousKeep === undefined) delete process.env.KEEP_RAG_KEY;
    else process.env.KEEP_RAG_KEY = previousKeep;
  }
});

test('requireApiKey fails with an actionable message when the key is missing', () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.throws(
      () => requireApiKey(join(mkdtempSync(join(tmpdir(), 'context-rag-')), 'missing.env')),
      /Copy \.env\.example/,
    );
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});
