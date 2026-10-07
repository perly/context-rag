import { OpenAI } from 'openai';
import type { Completer, Embedder } from './types.js';

export interface OpenAiAdapters {
  embed: Embedder;
  complete: Completer;
}

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const CHAT_MODEL = 'gpt-4o-mini';

export function createOpenAiAdapters(apiKey: string): OpenAiAdapters {
  const client = new OpenAI({ apiKey });

  const embed: Embedder = async (inputs) => {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: inputs,
    });
    return [...response.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  };

  const complete: Completer = async (messages) => {
    const response = await client.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      messages,
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) throw new Error('The model returned an empty response.');
    return content;
  };

  return { embed, complete };
}
