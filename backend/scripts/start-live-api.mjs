import { resolve } from 'node:path';

import { createApiServer } from '../src/api/server.ts';
import { loadConfigFromEnvFile } from '../src/config/env.ts';
import { createLogger } from '../src/logging/logger.ts';
import { createLiveRuntime } from '../src/live/live-runtime.ts';
import { createLiveIngestionScheduler } from '../src/live/live-scheduler.ts';

const logger = createLogger();
const config = await loadConfigFromEnvFile();
applyLiveEnvOptions(config);
const runtime = await createLiveRuntime({
  config,
  requestTimeoutMs: liveRequestTimeoutMs(),
  snapshotPath: liveRuntimeSnapshotPath(),
  onProgress: (event, fields = {}) => logger.info(event, fields)
});
const sourceIds = sourceIdsFromEnv(runtime);
const port = Number(process.env.PORT || 4100);
const scheduler = createLiveIngestionScheduler({
  runtime,
  logger,
  intervalMinutes: liveSchedulerIntervalMinutes(),
  enrichmentLimit: liveScheduledEnrichmentLimit(),
  enabled: liveScheduledIngestionEnabled(),
  sourceIds
});

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
  if (liveStartupRefreshEnabled()) {
    void refreshLiveData();
  }
  scheduler.start();
});

async function refreshLiveData() {
  try {
    const report = await runtime.runOnce({
      mode: 'startup',
      incremental: false,
      enrichmentLimit: liveStartupEnrichmentLimit(),
      lookbackHours: liveStartupLookbackHours(),
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

function liveRequestTimeoutMs() {
  const value = Number(process.env.LIVE_REQUEST_TIMEOUT_MS || 0);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function liveStartupRefreshEnabled() {
  return envFlag('LIVE_STARTUP_REFRESH_ENABLED', true);
}

function liveScheduledIngestionEnabled() {
  return envFlag('LIVE_SCHEDULED_INGESTION_ENABLED', true);
}

function liveSchedulerIntervalMinutes() {
  return positiveNumberFromEnv('LIVE_INGESTION_INTERVAL_MINUTES', 30);
}

function liveStartupLookbackHours() {
  return positiveNumberFromEnv('LIVE_STARTUP_LOOKBACK_HOURS', 24);
}

function liveStartupEnrichmentLimit() {
  return nonNegativeIntegerFromEnv('LIVE_STARTUP_ENRICHMENT_LIMIT', 0);
}

function liveScheduledEnrichmentLimit() {
  return nonNegativeIntegerFromEnv('LIVE_SCHEDULED_ENRICHMENT_LIMIT', 20);
}

function positiveNumberFromEnv(name, fallback) {
  const value = Number(process.env[name] || 0);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeIntegerFromEnv(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') {
    return fallback;
  }
  const value = Number(rawValue);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function envFlag(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return fallback;
  }
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
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
