import { resolve } from 'node:path';

import { createApiServer } from '../src/api/server.ts';
import { loadConfigFromEnvFile } from '../src/config/env.ts';
import { createLogger } from '../src/logging/logger.ts';
import { createLiveRuntime } from '../src/live/live-runtime.ts';

const logger = createLogger();
const config = await loadConfigFromEnvFile();
applyLiveEnvOptions(config);
const runtime = await createLiveRuntime({
  config,
  requestTimeoutMs: liveRequestTimeoutMs(),
  snapshotPath: liveRuntimeSnapshotPath()
});
const sourceIds = sourceIdsFromEnv(runtime);
const port = Number(process.env.PORT || 4100);

createApiServer({
  config,
  logger,
  servingService: runtime.servingService,
  staticRoot: resolve('.')
}).listen(port, () => {
  logger.info('live_api_started', {
    port,
    url: `http://localhost:${port}/`,
    runtimeMode: config.runtimeMode,
    selectedSourceCount: sourceIds?.length
  });
  void refreshLiveData();
});

async function refreshLiveData() {
  try {
    const report = await runtime.runOnce({
      maxItemsPerSource: liveMaxItemsPerSource(),
      sourceIds
    });
    logger.info('live_refresh_completed', {
      runId: report.runId,
      sourceOutcomeCounts: report.sourceOutcomeCounts,
      totals: report.totals,
      selectedSourceCount: sourceIds?.length
    });
  } catch (error) {
    logger.error('live_refresh_failed', {
      message: error.message,
      selectedSourceCount: sourceIds?.length
    });
  }
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

function liveRuntimeSnapshotPath() {
  if (process.env.LIVE_DISABLE_PERSISTENCE === '1') {
    return undefined;
  }
  return process.env.LIVE_RUNTIME_SNAPSHOT_PATH || '.data/news-runtime.json';
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
