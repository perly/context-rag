import { readFile } from 'node:fs/promises';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask } from './rag.js';
import type { MemoryVectorStore } from './store.js';
import type { Completer, Embedder } from './types.js';

export const LOCALHOST = '127.0.0.1';

const MAX_BODY_BYTES = 64 * 1024;
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

const STATIC_FILES: Record<string, { name: string; type: string }> = {
  '/': { name: 'index.html', type: 'text/html; charset=utf-8' },
  '/chat.css': { name: 'chat.css', type: 'text/css; charset=utf-8' },
  '/chat.js': { name: 'chat.js', type: 'text/javascript; charset=utf-8' },
};

class ResponseError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Chat HTTP server. Bind it with listen() so it stays on 127.0.0.1. */
export function createServer(
  store: MemoryVectorStore,
  embed: Embedder,
  complete: Completer,
): Server {
  return createHttpServer((req, res) => {
    handle(req, res, store, embed, complete).catch((error: unknown) => {
      if (res.headersSent || res.writableEnded) {
        res.destroy();
        return;
      }
      const status = error instanceof ResponseError ? error.status : 500;
      const message = error instanceof Error ? error.message : String(error);
      if (status === 500) console.error(message);
      sendJson(res, status, { error: message });
    });
  });
}

export function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Expected the chat server to listen on a TCP port.'));
        return;
      }
      resolve(address.port);
    };
    server.once('error', onError);
    server.listen(port, LOCALHOST, onListening);
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  store: MemoryVectorStore,
  embed: Embedder,
  complete: Completer,
): Promise<void> {
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;

  if (pathname === '/favicon.ico') {
    res.writeHead(204, { connection: 'close' });
    res.end();
    return;
  }

  if (pathname === '/api/chat') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed.' }, { allow: 'POST' });
      return;
    }
    const body = await readJson(req);
    const answer = await ask({
      question: stringField(body, 'question', 'Question'),
      tenantId: stringField(body, 'tenantId', 'tenantId'),
      store,
      embed,
      complete,
    });
    sendJson(res, 200, answer);
    return;
  }

  if (pathname === '/api/tenants') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed.' }, { allow: 'GET' });
      return;
    }
    sendJson(res, 200, { tenants: tenantIds(store) });
    return;
  }

  const file = STATIC_FILES[pathname];
  if (file) {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed.' }, { allow: 'GET' });
      return;
    }
    await sendFile(res, file);
    return;
  }

  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'Not found.' });
    return;
  }
  sendText(res, 404, 'Not found.');
}

function tenantIds(store: MemoryVectorStore): string[] {
  const ids: string[] = [];
  for (const chunk of store.list()) {
    if (!ids.includes(chunk.tenantId)) ids.push(chunk.tenantId);
  }
  return ids;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request body must be JSON.';
    throw new ResponseError(400, message);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ResponseError(400, 'Request body must be JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ResponseError(400, 'Request body must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function stringField(
  body: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = body[key];
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) throw new ResponseError(400, `${label} is required.`);
  return trimmed;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(new Error('Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (error) => fail(error));
  });
}

async function sendFile(
  res: ServerResponse,
  file: { name: string; type: string },
): Promise<void> {
  let payload: Buffer;
  try {
    payload = await readFile(join(publicDir, file.name));
  } catch {
    sendText(res, 404, 'Not found.');
    return;
  }
  res.writeHead(200, {
    'content-type': file.type,
    'content-length': payload.length,
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
    connection: 'close',
  });
  res.end(payload);
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  if (res.writableEnded) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'x-content-type-options': 'nosniff',
    connection: 'close',
    ...headers,
  });
  res.end(payload);
}

function sendText(res: ServerResponse, status: number, message: string): void {
  if (res.writableEnded) return;
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(message),
    'x-content-type-options': 'nosniff',
    connection: 'close',
  });
  res.end(message);
}
