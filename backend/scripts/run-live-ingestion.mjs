import { loadConfigFromEnvFile } from '../src/config/env.ts';
import { createLiveRuntime } from '../src/live/live-runtime.ts';

const config = await loadConfigFromEnvFile();
applyLiveEnvOptions(config);
const runtime = await createLiveRuntime({
  config,
  requestTimeoutMs: liveRequestTimeoutMs(),
  snapshotPath: liveRuntimeSnapshotPath()
});
const sourceIds = sourceIdsFromEnv(runtime);
const report = await runtime.runOnce({
  maxItemsPerSource: liveMaxItemsPerSource(),
  sourceIds
});
const home = runtime.servingService.getHome();

console.log(JSON.stringify({
  ok: true,
  report: {
    runId: report.runId,
    mode: report.mode,
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    lastLiveFetchAt: report.lastLiveFetchAt,
    sourceOutcomeCounts: report.sourceOutcomeCounts,
    skippedReasons: report.skippedReasons,
    totals: report.totals,
    sources: report.sources
  },
  home: {
    dataStatus: home.dataStatus,
    leadSignal: home.leadSignal,
    rankedSignals: home.rankedSignals.length,
    stats: home.stats
  }
}, null, 2));

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
