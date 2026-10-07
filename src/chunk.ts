import type { ChunkOptions } from './types.js';

export function chunkText(text: string, options: ChunkOptions): string[] {
  const { size, overlap } = options;
  if (!Number.isInteger(size) || size < 1) {
    throw new Error('Chunk size must be a positive integer.');
  }
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= size) {
    throw new Error('Chunk overlap must be an integer smaller than the chunk size.');
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= size) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + size, normalized.length);
    if (end < normalized.length) {
      const breakAt = normalized.lastIndexOf(' ', end);
      if (breakAt > start + Math.floor(size / 2)) end = breakAt;
    }

    const piece = normalized.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= normalized.length) break;

    const next = end - overlap;
    start = next > start ? next : end;
  }

  return chunks;
}
