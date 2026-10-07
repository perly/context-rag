export interface ChunkOptions {
  size: number;
  overlap: number;
}

export interface Chunk {
  id: string;
  documentId: string;
  tenantId: string;
  chunkIndex: number;
  text: string;
  contentHash: string;
  embedding: number[];
}

export interface SearchHit {
  chunk: Chunk;
  similarity: number;
}

export interface SearchResult {
  hits: SearchHit[];
  closestMiss: SearchHit | null;
}

export type Embedder = (inputs: string[]) => Promise<number[][]>;

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export type Completer = (messages: ChatMessage[]) => Promise<string>;

export interface RagSource {
  id: string;
  documentId: string;
  tenantId: string;
  similarity: number;
  text: string;
}

export interface RagAnswer {
  answer: string;
  sources: RagSource[];
  closestMiss: RagSource | null;
  usedModel: boolean;
}
