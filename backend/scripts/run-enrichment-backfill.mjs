import { loadConfigFromEnvFile } from '../src/config/env.ts';
import {
  loadRuntimeSnapshot,
  restoreRuntimeStore,
  saveRuntimeSnapshot,
  serializeRuntimeStore
} from '../src/db/runtime-snapshot.ts';
import { ArticleRepository } from '../src/ingestion/article-repository.ts';
import { InMemoryQueue } from '../src/queue/in-memory-queue.ts';
import { createOpenAICompatibleEnrichmentProvider } from '../src/ai/openai-compatible-enrichment-provider.ts';
import {
  createEnrichmentJobHandler,
  processEnrichmentJobs
} from '../src/signal-processing/enrichment-job-handler.ts';
import {
  currentEnrichmentVersion,
  enqueueEnrichmentBackfillJobs
} from '../src/signal-processing/enrichment-backfill-service.ts';
import { SignalRepository } from '../src/signal-processing/signal-repository.ts';
import { SourceRepository } from '../src/sources/source-repository.ts';
import { SourceService } from '../src/sources/source-service.ts';

const args = parseArgs(process.argv.slice(2));
const snapshotPath = args.snapshot || process.env.LIVE_RUNTIME_SNAPSHOT_PATH || '.data/news-runtime.json';
const snapshot = await loadRuntimeSnapshot(snapshotPath);

if (!snapshot) {
  throw new Error(`Runtime snapshot not found: ${snapshotPath}`);
}

const restored = restoreRuntimeStore(snapshot);
const store = restored.store;
const queue = new InMemoryQueue(store);
const signalRepository = new SignalRepository(store);
const articleRepository = new ArticleRepository(store);
const sourceService = new SourceService(new SourceRepository(store));
const now = new Date();
const publishedAfter = args.sinceHours
  ? new Date(now.getTime() - args.sinceHours * 60 * 60 * 1000)
  : undefined;

const backfill = enqueueEnrichmentBackfillJobs({
  signalRepository,
  queue,
  limit: args.limit,
  dryRun: args.dryRun,
  staleOnly: args.staleOnly,
  statuses: args.status,
  publishedAfter,
  now
});

if (args.dryRun) {
  printReport({
    snapshotPath,
    dryRun: true,
    publishedAfter,
    backfill,
    enrichmentSummary: undefined
  });
  process.exit(0);
}

const config = await loadConfigFromEnvFile();
const provider = createProvider({ config, timeoutMs: args.timeoutMs });
const backfillJobIds = new Set((backfill.jobs || []).map((job) => job.id));
const enrichmentSummary = backfillJobIds.size > 0
  ? await processEnrichmentJobs({
      queue,
      handler: createEnrichmentJobHandler({
        signalRepository,
        articleRepository,
        sourceService,
        provider
      }),
      limit: args.processLimit || backfillJobIds.size,
      now,
      filter: (job) => backfillJobIds.has(job.id)
    })
  : {
      completed: 0,
      failed: 0,
      results: []
    };

await saveRuntimeSnapshot(snapshotPath, serializeRuntimeStore(store, {
  metadata: {
    ...restored.metadata,
    latestEnrichmentBackfill: {
      ranAt: new Date().toISOString(),
      enrichmentVersion: currentEnrichmentVersion,
      publishedAfter: publishedAfter?.toISOString(),
      queued: backfill.queued,
      completed: enrichmentSummary.completed,
      failed: enrichmentSummary.failed
    }
  }
}));

printReport({
  snapshotPath,
  dryRun: false,
  publishedAfter,
  backfill,
  enrichmentSummary
});

function createProvider({ config, timeoutMs }) {
  if (!config.secrets.enrichment || !config.enrichment?.model || !config.enrichment?.baseUrl) {
    throw new Error('AI enrichment config is required. Set AI_ENRICHMENT_API_KEY, AI_ENRICHMENT_MODEL, and AI_ENRICHMENT_BASE_URL in .env.');
  }
  return createOpenAICompatibleEnrichmentProvider({
    apiKey: config.secrets.enrichment,
    model: config.enrichment.model,
    baseUrl: config.enrichment.baseUrl,
    timeoutMs
  });
}

function printReport({ snapshotPath, dryRun, publishedAfter, backfill, enrichmentSummary }) {
  console.log(JSON.stringify({
    ok: true,
    snapshotPath,
    dryRun,
    publishedAfter: publishedAfter?.toISOString(),
    enrichmentVersion: currentEnrichmentVersion,
    queued: backfill.queued,
    candidates: backfill.candidates.map((signal) => ({
      id: signal.id,
      title: signal.title,
      status: signal.enrichmentStatus,
      signalScore: signal.signalScore,
      heatScore: signal.heatScore,
      previousVersion: signal.enrichmentMeta?.enrichmentVersion
    })),
    enrichmentSummary
  }, null, 2));
}

function parseArgs(values) {
  const args = {
    limit: limitFromEnv('ENRICHMENT_BACKFILL_LIMIT', 25),
    processLimit: numberFromEnv('ENRICHMENT_BACKFILL_PROCESS_LIMIT', undefined),
    timeoutMs: numberFromEnv('AI_ENRICHMENT_TIMEOUT_MS', 30_000),
    dryRun: process.env.ENRICHMENT_BACKFILL_DRY_RUN === '1',
    staleOnly: process.env.ENRICHMENT_BACKFILL_STALE_ONLY === '1',
    status: process.env.ENRICHMENT_BACKFILL_STATUS,
    sinceHours: numberFromEnv('ENRICHMENT_BACKFILL_SINCE_HOURS', undefined)
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (value === '--stale-only') {
      args.staleOnly = true;
      continue;
    }
    if (value.startsWith('--limit=')) {
      args.limit = parseLimit(value.slice('--limit='.length), args.limit);
      continue;
    }
    if (value === '--limit') {
      args.limit = parseLimit(values[++index], args.limit);
      continue;
    }
    if (value.startsWith('--process-limit=')) {
      args.processLimit = parsePositiveInteger(value.slice('--process-limit='.length), args.processLimit);
      continue;
    }
    if (value === '--process-limit') {
      args.processLimit = parsePositiveInteger(values[++index], args.processLimit);
      continue;
    }
    if (value.startsWith('--status=')) {
      args.status = value.slice('--status='.length);
      continue;
    }
    if (value === '--status') {
      args.status = values[++index];
      continue;
    }
    if (value.startsWith('--snapshot=')) {
      args.snapshot = value.slice('--snapshot='.length);
      continue;
    }
    if (value === '--snapshot') {
      args.snapshot = values[++index];
      continue;
    }
    if (value.startsWith('--since-hours=')) {
      args.sinceHours = parsePositiveNumber(value.slice('--since-hours='.length), args.sinceHours);
      continue;
    }
    if (value === '--since-hours') {
      args.sinceHours = parsePositiveNumber(values[++index], args.sinceHours);
      continue;
    }
  }

  return args;
}

function limitFromEnv(name, fallback) {
  return parseLimit(process.env[name], fallback);
}

function numberFromEnv(name, fallback) {
  return parsePositiveInteger(process.env[name], fallback);
}

function parseLimit(value, fallback) {
  if (String(value || '').toLowerCase() === 'all') {
    return 'all';
  }
  return parsePositiveInteger(value, fallback);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
