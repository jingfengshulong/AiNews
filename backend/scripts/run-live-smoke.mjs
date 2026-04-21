import { resolve } from 'node:path';

import { createApiServer } from '../src/api/server.ts';
import { loadConfigFromEnvFile } from '../src/config/env.ts';
import { createLogger } from '../src/logging/logger.ts';
import { createLiveRuntime } from '../src/live/live-runtime.ts';

const config = await loadConfigFromEnvFile();
applyLiveEnvOptions(config);
const runtime = await createLiveRuntime({
  config,
  requestTimeoutMs: liveRequestTimeoutMs()
});
const sourceIds = sourceIdsFromEnv(runtime);
const report = await runtime.runOnce({
  maxItemsPerSource: liveMaxItemsPerSource(),
  sourceIds
});
const server = createApiServer({
  config,
  logger: createLogger(),
  servingService: runtime.servingService,
  staticRoot: resolve('.')
});

await new Promise((resolveListen) => server.listen(0, resolveListen));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const homeResponse = await fetch(`${baseUrl}/api/home`);
  const home = await homeResponse.json();
  const pageResponse = await fetch(`${baseUrl}/`);
  const page = await pageResponse.text();

  if (homeResponse.status !== 200 || home.dataStatus?.mode !== 'live') {
    throw new Error('Live API did not return live data status');
  }
  if (!home.leadSignal?.id) {
    throw new Error('Live API did not return a visible lead signal');
  }
  if (pageResponse.status !== 200 || !page.includes('data-page="home"')) {
    throw new Error('Live frontend did not serve the homepage');
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    runId: report.runId,
    leadSignal: home.leadSignal.title,
    visibleSignals: home.stats.visibleSignals,
    dataStatus: home.dataStatus,
    sourceOutcomeCounts: report.sourceOutcomeCounts,
    selectedSourceCount: sourceIds?.length
  }, null, 2));
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}

function applyLiveEnvOptions(config) {
  if (process.env.LIVE_DISABLE_AI_ENRICHMENT === '1') {
    config.secrets.enrichment = undefined;
  }
}

function liveMaxItemsPerSource() {
  const value = Number(process.env.LIVE_MAX_ITEMS_PER_SOURCE || 0);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function liveRequestTimeoutMs() {
  const value = Number(process.env.LIVE_REQUEST_TIMEOUT_MS || 0);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function sourceIdsFromEnv(runtime) {
  const names = new Set(String(process.env.LIVE_SOURCE_NAMES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean));
  if (names.size === 0) {
    return undefined;
  }
  return runtime.sourceService.listSources()
    .filter((source) => names.has(source.name))
    .map((source) => source.id);
}
