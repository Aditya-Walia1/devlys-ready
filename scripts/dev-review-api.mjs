import { readFileSync } from 'node:fs';

import worker from '../worker/index.js';

const migration = readFileSync(
  new URL('../drizzle/0000_chief_princess_powerful.sql', import.meta.url),
  'utf8',
);

class DevD1Statement {
  constructor(database, sql) {
    this.statement = database.prepare(sql);
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    return this.statement.get(...this.values) || null;
  }

  async all() {
    return { results: this.statement.all(...this.values) };
  }

  async run() {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      meta: {
        changes: Number(result.changes || 0),
        last_row_id: Number(result.lastInsertRowid || 0),
      },
    };
  }
}

export async function createDevDatabase() {
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  migration
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .forEach((statement) => database.exec(statement));

  return {
    prepare(sql) {
      return new DevD1Statement(database, sql);
    },
    close() {
      database.close();
    },
  };
}

function requestHeaders(incomingHeaders) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incomingHeaders)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function sendWorkerResponse(response, outgoing) {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => outgoing.setHeader(name, value));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

export function devReviewApi() {
  return {
    name: 'devlys-review-api',
    apply: 'serve',
    async configureServer(server) {
      const database = await createDevDatabase();
      server.httpServer?.once('close', () => database.close());

      server.middlewares.use(async (request, response, next) => {
        const authority = `http://${request.headers.host || '127.0.0.1'}`;
        const url = new URL(request.url || '/', authority);

        if (url.pathname.startsWith('/r/')) {
          request.url = '/review.html';
          next();
          return;
        }

        if (!url.pathname.startsWith('/api/')) {
          next();
          return;
        }

        try {
          const method = request.method || 'GET';
          const body = ['GET', 'HEAD'].includes(method) ? undefined : await requestBody(request);
          const workerRequest = new Request(url, {
            method,
            headers: requestHeaders(request.headers),
            body,
          });
          const workerResponse = await worker.fetch(workerRequest, { DB: database });
          await sendWorkerResponse(workerResponse, response);
        } catch (error) {
          server.config.logger.error(`Local Smart Review API failed: ${error.message}`);
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ error: 'The local review service could not complete this request.' }));
        }
      });
    },
  };
}
