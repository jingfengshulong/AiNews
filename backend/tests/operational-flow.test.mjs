import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createApiServer } from '../src/api/server.ts';
import { loadConfig } from '../src/config/env.ts';
import { createDemoRuntime } from '../src/demo/demo-runtime.ts';
import { createMemoryLogger } from '../src/logging/logger.ts';

test('demo runtime builds deterministic source, article, signal, scoring, enrichment, and serving data', async () => {
  const runtime = await createDemoRuntime({
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });
  const home = runtime.servingService.getHome();
  const detail = runtime.servingService.getSignalDetail(home.leadSignal.id);
  const rawItems = runtime.rawItemRepository.listRawItems();
  const sourceTypes = new Set(runtime.sourceService.listSources().map((source) => source.sourceType));
  const serializedDetail = JSON.stringify(detail);

  assert.equal(home.leadSignal.title, 'OpenAI introduces Agent SDK updates for enterprise developers');
  assert.ok(home.rankedSignals.length >= 4);
  assert.ok(home.stats.visibleSignals >= 5);
  assert.ok(home.sourceSummaries.some((item) => item.family === 'research'));
  assert.ok(home.dateSummaries.some((item) => item.date === '2026-04-21'));
  assert.deepEqual(
    Array.from(sourceTypes).sort(),
    ['arxiv', 'crossref', 'hacker_news', 'newsapi', 'product_hunt', 'rss', 'semantic_scholar'].sort()
  );
  assert.ok(rawItems.length >= 7);
  assert.ok(rawItems.every((item) => item.responseMeta.adapter || item.responseMeta.feedFormat));
  assert.ok(runtime.queue.list('process').every((job) => job.status === 'completed'));
  assert.ok(runtime.queue.list('enrichment').every((job) => job.status === 'completed'));
  assert.equal(detail.signal.id, home.leadSignal.id);
  assert.ok(detail.keyPoints.length >= 2);
  assert.ok(detail.supportingArticles.every((article) => article.originalUrl));
  assert.doesNotMatch(serializedDetail, /textForAI/);
  assert.doesNotMatch(serializedDetail, /workflow orchestration and enterprise integration patterns/);
});

test('API server can serve static frontend files and demo API data from one local origin', async () => {
  const runtime = await createDemoRuntime({
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });
  const server = createApiServer({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    logger: createMemoryLogger(),
    servingService: runtime.servingService,
    staticRoot: resolve('.')
  });

  await new Promise((resolveListen) => server.listen(0, resolveListen));
  const address = server.address();

  try {
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const htmlResponse = await fetch(`${baseUrl}/`);
    const html = await htmlResponse.text();
    const apiResponse = await fetch(`${baseUrl}/api/home`);
    const apiBody = await apiResponse.json();
    const traversalResponse = await fetch(`${baseUrl}/../.env`);

    assert.equal(htmlResponse.status, 200);
    assert.match(htmlResponse.headers.get('content-type'), /text\/html/);
    assert.match(html, /data-page="home"/);
    assert.equal(apiResponse.status, 200);
    assert.equal(apiBody.leadSignal.title, 'OpenAI introduces Agent SDK updates for enterprise developers');
    assert.equal(traversalResponse.status, 404);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test('package scripts expose local demo startup and smoke verification commands', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const startLiveScript = await readFile(new URL('../scripts/start-live-api.mjs', import.meta.url), 'utf8');

  assert.match(packageJson.scripts['backend:demo'], /start-demo-api/);
  assert.match(packageJson.scripts['backend:demo:smoke'], /run-demo-smoke/);
  assert.match(packageJson.scripts['backend:ingest:demo'], /run-demo-ingestion/);
  assert.match(packageJson.scripts['backend:ingest:live'], /run-live-ingestion/);
  assert.match(packageJson.scripts['backend:live'], /start-live-api/);
  assert.match(packageJson.scripts['backend:live:smoke'], /run-live-smoke/);
  assert.match(startLiveScript, /LIVE_SOURCE_NAMES/);
  assert.match(startLiveScript, /LIVE_MAX_ITEMS_PER_SOURCE/);
  assert.match(startLiveScript, /LIVE_REQUEST_TIMEOUT_MS/);
  assert.match(startLiveScript, /LIVE_DISABLE_AI_ENRICHMENT/);
  assert.ok(
    startLiveScript.indexOf('listen(port') < startLiveScript.indexOf('refreshLiveData'),
    'live startup should listen before refreshing sources'
  );
});
