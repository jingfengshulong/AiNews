import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/env.ts';
import { loadRuntimeConfig } from '../config/runtime-config.ts';
import { createHealthSnapshot } from '../health.ts';
import { createLogger } from '../logging/logger.ts';

export function createApiServer({ config = loadConfig(), logger = createLogger(), servingService, staticRoot } = {}) {
  return createServer((request, response) => {
    const startedAt = Date.now();
    const url = new URL(request.url || '/', 'http://localhost');
    let status = 200;

    try {
      if (url.pathname === '/healthz' || url.pathname === '/readyz') {
        const body = createHealthSnapshot({
          service: 'api',
          config,
          checks: { database: Boolean(config.databaseUrl), queue: Boolean(config.redisUrl) }
        });
        status = 200;
        writeJson(response, 200, body);
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        const result = routeApiRequest({ request, url, servingService });
        status = result.status;
        writeJson(response, result.status, result.body);
        return;
      }

      if (staticRoot) {
        const served = writeStaticFile({ response, url, staticRoot });
        if (served) {
          status = 200;
          return;
        }
      }

      status = 404;
      writeJson(response, 404, { error: 'not_found' });
    } catch (error) {
      status = 500;
      writeJson(response, 500, { error: 'internal_error', message: error.message });
    } finally {
      logger.info('http_request', {
        method: request.method,
        path: url.pathname,
        status,
        durationMs: Date.now() - startedAt
      });
    }
  });
}

function routeApiRequest({ request, url, servingService }) {
  if (request.method !== 'GET') {
    return { status: 405, body: { error: 'method_not_allowed' } };
  }
  if (!servingService) {
    return { status: 503, body: { error: 'serving_service_unavailable' } };
  }

  const parts = url.pathname.split('/').filter(Boolean);

  if (url.pathname === '/api/home') {
    return ok(servingService.getHome());
  }
  if (parts[1] === 'signals' && parts[2]) {
    const detail = servingService.getSignalDetail(parts[2]);
    return detail ? ok(detail) : notFound();
  }
  if (url.pathname === '/api/sources') {
    return ok(servingService.listSources());
  }
  if (parts[1] === 'sources' && parts[2] && parts[3]) {
    const archive = servingService.getSourceArchive(decodeURIComponent(parts[2]), decodeURIComponent(parts[3]));
    return archive ? ok(archive) : notFound();
  }
  if (parts[1] === 'sources' && parts[2]) {
    const archive = servingService.getSourceFamilyArchive(decodeURIComponent(parts[2]));
    return archive ? ok(archive) : notFound();
  }
  if (parts[1] === 'dates' && parts[2]) {
    return ok(servingService.getDateArchive({ label: decodeURIComponent(parts[2]) }));
  }
  if (url.pathname === '/api/dates') {
    return ok(servingService.getDateArchive({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to')
    }));
  }
  if (url.pathname === '/api/topics') {
    return ok(servingService.listTopics());
  }
  if (parts[1] === 'topics' && parts[2]) {
    const archive = servingService.getTopicArchive(decodeURIComponent(parts[2]));
    return archive ? ok(archive) : notFound();
  }
  if (url.pathname === '/api/search') {
    return ok(servingService.search({
      q: url.searchParams.get('q') || '',
      topic: url.searchParams.get('topic') || undefined,
      sourceFamily: url.searchParams.get('sourceFamily') || undefined,
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined
    }));
  }

  return notFound();
}

function ok(body) {
  return { status: 200, body };
}

function notFound() {
  return { status: 404, body: { error: 'not_found' } };
}

function writeStaticFile({ response, url, staticRoot }) {
  const filePath = resolveStaticPath({ staticRoot, pathname: url.pathname });
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }

  response.writeHead(200, {
    'content-type': contentType(filePath),
    'cache-control': 'no-store'
  });
  response.end(readFileSync(filePath));
  return true;
}

function resolveStaticPath({ staticRoot, pathname }) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0')) {
    return undefined;
  }

  const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const extension = extname(relativePath).toLowerCase();
  if (!staticExtensions.has(extension)) {
    return undefined;
  }

  const root = resolve(staticRoot);
  const filePath = resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    return undefined;
  }
  return filePath;
}

function contentType(filePath) {
  const extension = extname(filePath).toLowerCase();
  return contentTypes[extension] || 'application/octet-stream';
}

const staticExtensions = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico']);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*'
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
