import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/env.ts';
import { loadRuntimeConfig } from '../config/runtime-config.ts';
import { createHealthSnapshot } from '../health.ts';
import { createLogger } from '../logging/logger.ts';

export function createApiServer({ config = loadConfig(), logger = createLogger() } = {}) {
  return createServer((request, response) => {
    const startedAt = Date.now();
    const url = new URL(request.url || '/', 'http://localhost');

    if (url.pathname === '/healthz' || url.pathname === '/readyz') {
      const body = createHealthSnapshot({
        service: 'api',
        config,
        checks: { database: Boolean(config.databaseUrl), queue: Boolean(config.redisUrl) }
      });
      writeJson(response, 200, body);
      logger.info('http_request', {
        method: request.method,
        path: url.pathname,
        status: 200,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    writeJson(response, 404, { error: 'not_found' });
    logger.info('http_request', {
      method: request.method,
      path: url.pathname,
      status: 404,
      durationMs: Date.now() - startedAt
    });
  });
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(body));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = await loadRuntimeConfig();
  const logger = createLogger();
  const port = Number(process.env.PORT || 4100);
  createApiServer({ config, logger }).listen(port, () => {
    logger.info('api_started', { port, runtimeMode: config.runtimeMode });
  });
}
