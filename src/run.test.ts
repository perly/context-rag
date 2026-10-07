import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTurn } from './run.js';
import type { DemoQuestion } from './corpus.js';
import type { RagAnswer } from './types.js';

function answer(partial: Partial<RagAnswer> = {}): RagAnswer {
  return {
    answer: "I don't know based on the provided documents.",
    sources: [],
    closestMiss: null,
    usedModel: false,
    ...partial,
  };
}

function question(partial: Partial<DemoQuestion> = {}): DemoQuestion {
  return {
    name: 'sample',
    tenantId: 'guesty',
    question: 'question',
    ...partial,
  };
}

test('checkTurn accepts the expected document and a refusal', () => {
  assert.equal(
    checkTurn({
      question: question({ expectedDocumentId: 'guesty-office' }),
      answer: answer({
        sources: [
          {
            id: 'guesty-office:0',
            documentId: 'guesty-office',
            tenantId: 'guesty',
            similarity: 0.8,
            text: 'wifi',
          },
        ],
        usedModel: true,
        answer: 'Use Guesty-Guest. [guesty-office:0]',
      }),
    }),
    null,
  );

  assert.equal(
    checkTurn({
      question: question({ expectRefusal: true }),
      answer: answer(),
    }),
    null,
  );
});

test('checkTurn reports a leaked tenant and a missing refusal', () => {
  const leaked = checkTurn({
    question: question({ tenantId: 'melio', expectNoOtherTenant: true }),
    answer: answer({
      sources: [
        {
          id: 'guesty-office:0',
          documentId: 'guesty-office',
          tenantId: 'guesty',
          similarity: 0.9,
          text: 'wifi',
        },
      ],
    }),
  });
  assert.match(leaked ?? '', /tenant guesty/);

  const answered = checkTurn({
    question: question({ expectRefusal: true }),
    answer: answer({ answer: 'Paris is the capital.' }),
  });
  assert.match(answered ?? '', /refusal/);
});
