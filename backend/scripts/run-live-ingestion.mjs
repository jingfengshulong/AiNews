import { loadConfigFromEnvFile } from '../src/config/env.ts';
import { createLiveRuntime } from '../src/live/live-runtime.ts';

const config = await loadConfigFromEnvFile();
applyLiveEnvOptions(config);
const args = parseArgs(process.argv.slice(2));
const runtime = await createLiveRuntime({
  config,
  requestTimeoutMs: liveRequestTimeoutMs(),
  snapshotPath: liveRuntimeSnapshotPath()
});
const sourceIds = sourceIdsFromEnv(runtime);
const report = await runtime.runOnce({
  mode: args.mode || process.env.LIVE_RUN_MODE || 'manual',
  incremental: args.incremental ?? envFlag('LIVE_INCREMENTAL_RUN', false),
  recovery: args.recovery ?? envFlag('LIVE_RECOVERY_RUN', false),
  force: args.force ?? envFlag('LIVE_FORCE_RUN', false),
  lookbackHours: args.lookbackHours ?? positiveNumberFromEnv('LIVE_STARTUP_LOOKBACK_HOURS', undefined),
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

function liveRequestTimeoutMs() {
  const value = Number(process.env.LIVE_REQUEST_TIMEOUT_MS || 0);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function parseArgs(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value.startsWith('--mode=')) {
      args.mode = value.slice('--mode='.length);
      continue;
    }
    if (value === '--mode') {
      args.mode = values[++index];
      continue;
    }
    if (value === '--incremental') {
      args.incremental = true;
      continue;
    }
    if (value === '--no-incremental') {
      args.incremental = false;
      continue;
    }
    if (value === '--recovery' || value === '--full-window') {
      args.recovery = true;
      continue;
    }
    if (value === '--force') {
      args.force = true;
      continue;
    }
    if (value.startsWith('--lookback-hours=')) {
      args.lookbackHours = parsePositiveNumber(value.slice('--lookback-hours='.length), args.lookbackHours);
      continue;
    }
    if (value === '--lookback-hours') {
      args.lookbackHours = parsePositiveNumber(values[++index], args.lookbackHours);
    }
  }
  return args;
}

function positiveNumberFromEnv(name, fallback) {
  return parsePositiveNumber(process.env[name], fallback);
}

function parsePositiveNumber(value, fallback) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : fallback;
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
