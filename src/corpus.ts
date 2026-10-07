import type { ChunkOptions } from './types.js';
import type { DocumentInput } from './store.js';

export const CHUNK_OPTIONS: ChunkOptions = { size: 180, overlap: 40 };

export const documents: DocumentInput[] = [
  {
    id: 'guesty-office',
    tenantId: 'guesty',
    text: [
      'The Guesty Tel Aviv office is on the 4th floor of the Rothschild building.',
      'Visitors check in at reception and receive a badge before they enter the workspace.',
      'The guest wifi network is named Guesty-Guest.',
      'The wifi password is example-only.',
      'Daily standup is at 10:00 in the room called Harbor.',
      'The office kitchen is at the end of the hall, and the quiet room for calls is next to it.',
    ].join(' '),
  },
  {
    id: 'melio-history',
    tenantId: 'melio',
    text: [
      'Melio was founded in 2018 by Matan Bar, Ziv Paz, and Ilan Atias.',
      'The company helps small businesses pay bills without writing checks.',
      'An accounts payable team uploads an invoice, and the vendor can be paid by bank transfer or by check.',
      'The first product was bill pay for companies that do not have a full finance department.',
      'Customer support for bill pay questions is handled by the accounts team.',
    ].join(' '),
  },
];

export interface DemoQuestion {
  name: string;
  tenantId: string;
  question: string;
  expectedDocumentId?: string;
  expectNoOtherTenant?: boolean;
  expectRefusal?: boolean;
}

export const demoQuestions: DemoQuestion[] = [
  {
    name: 'Semantic match inside the tenant',
    tenantId: 'guesty',
    question: 'How do I get online at the Tel Aviv office?',
    expectedDocumentId: 'guesty-office',
  },
  {
    name: 'Same question, other tenant',
    tenantId: 'melio',
    question: 'How do I get online at the Tel Aviv office?',
    expectNoOtherTenant: true,
    expectRefusal: true,
  },
  {
    name: 'The other tenant retrieves its own document',
    tenantId: 'melio',
    question: 'Who founded Melio and what does the company do?',
    expectedDocumentId: 'melio-history',
  },
  {
    name: 'Question outside the documents',
    tenantId: 'guesty',
    question: 'What is the capital of France?',
    expectRefusal: true,
  },
];
