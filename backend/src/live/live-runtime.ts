import { createOpenAICompatibleEnrichmentProvider } from '../ai/openai-compatible-enrichment-provider.ts';
import { createRelevanceFilter } from '../ai/relevance-filter.ts';
import { createNewsServingService } from '../api/news-serving-service.ts';
import { InMemoryStore } from '../db/in-memory-store.ts';
import {
  loadRuntimeSnapshot,
  restoreRuntimeStore,
  saveRuntimeSnapshot,
  serializeRuntimeStore
} from '../db/runtime-snapshot.ts';
import { ArticleFetcher } from '../ingestion/article-fetcher.ts';
import { ArticleRepository } from '../ingestion/article-repository.ts';
import { ArxivAdapter } from '../ingestion/arxiv-adapter.ts';
import { CrossrefAdapter } from '../ingestion/crossref-adapter.ts';
import { createFetchJobHandler, processFetchJobs } from '../ingestion/fetch-job-handler.ts';
import { HackerNewsAdapter } from '../ingestion/hacker-news-adapter.ts';
import { NewsApiAdapter } from '../ingestion/newsapi-adapter.ts';
import { createProcessJobHandler, processQueuedJobs } from '../ingestion/process-job-handler.ts';
import { ProductHuntAdapter } from '../ingestion/product-hunt-adapter.ts';
import { RawItemRepository } from '../ingestion/raw-item-repository.ts';
import { RssAtomAdapter } from '../ingestion/rss-atom-adapter.ts';
import { SemanticScholarAdapter } from '../ingestion/semantic-scholar-adapter.ts';
import { InMemoryQueue } from '../queue/in-memory-queue.ts';
import { ArticleDedupeService } from '../signal-processing/article-dedupe-service.ts';
import { createEnrichmentJobHandler, enqueuePendingEnrichmentJobs, processEnrichmentJobs } from '../signal-processing/enrichment-job-handler.ts';
import { ScoreComponentRepository } from '../signal-processing/score-component-repository.ts';
import { ArticleQualityService } from '../signal-processing/article-quality-service.ts';
import { SignalClusterService } from '../signal-processing/signal-cluster-service.ts';
import { SignalRepository } from '../signal-processing/signal-repository.ts';
import { SignalScoringService } from '../signal-processing/signal-scoring-service.ts';
import { SourceRelationRepository } from '../signal-processing/source-relation-repository.ts';
import { TopicClassifier } from '../signal-processing/topic-classifier.ts';
import { TopicRepository } from '../signal-processing/topic-repository.ts';
import { seedMvpSources } from '../sources/seed-sources.ts';
import { SourceRepository } from '../sources/source-repository.ts';
import { SourceService } from '../sources/source-service.ts';

const defaultStaleAfterMs = 6 * 60 * 60 * 1000;
const defaultStartupLookbackHours = 24;
const supportedSourceTypes = new Set(['rss', 'atom', 'newsapi', 'arxiv', 'semantic_scholar', 'hacker_news', 'product_hunt', 'crossref']);
const credentialOptionalSourceTypes = new Set(['semantic_scholar']);

export async function createLiveRuntime({
  config = {},
  seedSources = seedMvpSources,
  adapters,
  fetchImpl = globalThis.fetch,
  articleFetcher,
  enrichmentProvider,
  requestTimeoutMs = 15_000,
  staleAfterMs = defaultStaleAfterMs,
  snapshotPath,
  now = () => new Date()
} = {}) {
  const liveFetchImpl = withRequestTimeout(fetchImpl, requestTimeoutMs);
  const restored = await restoreSnapshot(snapshotPath);
  const store = restored.store;
  const queue = new InMemoryQueue(store);
  const sourceService = new SourceService(new SourceRepository(store));
  const rawItemRepository = new RawItemRepository(store);
  const articleRepository = new ArticleRepository(store);
  const sourceRelationRepository = new SourceRelationRepository(store);
  const signalRepository = new SignalRepository(store);
  const topicRepository = new TopicRepository(store);
  const scoreComponentRepository = new ScoreComponentRepository(store);
  topicRepository.seedDefaultTopics();

  if (sourceService.listSources().length === 0) {
    seedSources(sourceService);
  }
  activateConfiguredLiveSources({ sourceService, config });
  const sources = sourceService.listSources();
  let lastRunReport = restored.metadata.latestRunReport || createInitialReport({ now, sources });
  let runSequence = restored.metadata.runSequence || 0;
  let activeRun;
  let skippedOverlapCount = restored.metadata.skippedOverlapCount || 0;

  const servingService = createNewsServingService({
    signalRepository,
    articleRepository,
    sourceService,
    topicRepository,
    scoreComponentRepository,
    dataStatus: () => reportToDataStatus(lastRunReport, { now, staleAfterMs }),
    now
  });

  return {
    store,
    queue,
    sourceService,
    rawItemRepository,
    articleRepository,
    sourceRelationRepository,
    signalRepository,
    topicRepository,
    scoreComponentRepository,
    servingService,
    getLastRunReport() {
      return clone(lastRunReport);
    },
    async runOnce(options = {}) {
      const runOptions = normalizeRunOptions(options);
      if (activeRun) {
        skippedOverlapCount += 1;
        const report = createSkippedOverlapReport({
          mode: runOptions.mode,
          runSequence: runSequence + 1,
          skippedOverlapCount,
          now,
          lastRunReport
        });
        lastRunReport = report;
        await persistSnapshot({ snapshotPath, store, lastRunReport, runSequence, skippedOverlapCount });
        return clone(report);
      }
      runSequence += 1;
      activeRun = runLiveOnce({
        config,
        queue,
        sourceService,
        rawItemRepository,
        articleRepository,
        sourceRelationRepository,
        signalRepository,
        topicRepository,
        scoreComponentRepository,
        adapters: wrapAdapters(adapters || createLiveAdapters({ config, fetchImpl: liveFetchImpl, now })),
        articleFetcher: articleFetcher || new ArticleFetcher({ fetchImpl: liveFetchImpl }),
        enrichmentProvider: enrichmentProvider || createLiveEnrichmentProvider({ config, fetchImpl }),
        sourceIds: options.sourceIds,
        runOptions,
        skippedOverlapCount,
        fetchImpl,
        runSequence,
        now
      });
      try {
        const report = await activeRun;
        lastRunReport = report;
        await persistSnapshot({ snapshotPath, store, lastRunReport, runSequence, skippedOverlapCount });
        return clone(report);
      } finally {
        activeRun = undefined;
      }
    }
  };
}

async function restoreSnapshot(snapshotPath) {
  if (!snapshotPath) {
    return { store: new InMemoryStore(), metadata: {} };
  }
  const snapshot = await loadRuntimeSnapshot(snapshotPath);
  if (!snapshot) {
    return { store: new InMemoryStore(), metadata: {} };
  }
  return restoreRuntimeStore(snapshot);
}

async function persistSnapshot({ snapshotPath, store, lastRunReport, runSequence, skippedOverlapCount = 0 }) {
  if (!snapshotPath) {
    return;
  }
  await saveRuntimeSnapshot(snapshotPath, serializeRuntimeStore(store, {
    metadata: {
      latestRunReport: lastRunReport,
      runSequence,
      skippedOverlapCount
    }
  }));
}

export function evaluateLiveSourceReadiness({ sources = [], config = {}, sourceIds } = {}) {
  const allowedSourceIds = sourceIds ? new Set(sourceIds) : undefined;
  return sources
    .filter((source) => !allowedSourceIds || allowedSourceIds.has(source.id))
    .map((source) => evaluateSourceReadiness({ source, config }));
}

export function reportToDataStatus(report, { now = () => new Date(), staleAfterMs = defaultStaleAfterMs } = {}) {
  if (!report) {
    return {
      mode: 'unknown',
      state: 'unknown',
      stale: true,
      sourceOutcomeCounts: emptyOutcomeCounts()
    };
  }

  const stale = report.mode === 'live' ? isStale(report.lastLiveFetchAt, now(), staleAfterMs) : false;
  return {
    mode: report.mode,
    state: runStateForReport({ report, stale }),
    runId: report.runId,
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    lastLiveFetchAt: report.lastLiveFetchAt,
    stale,
    sourceOutcomeCounts: clone(report.sourceOutcomeCounts || emptyOutcomeCounts()),
    skippedReasons: clone(report.skippedReasons || {})
  };
}

async function runLiveOnce({
  config,
  queue,
  sourceService,
  rawItemRepository,
  articleRepository,
  sourceRelationRepository,
  signalRepository,
  topicRepository,
  scoreComponentRepository,
  adapters,
  articleFetcher,
  enrichmentProvider,
  sourceIds,
  runOptions,
  skippedOverlapCount,
  runSequence,
  fetchImpl,
  now
}) {
  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();
  const runId = createRunId(startedAtDate, runSequence);
  const readiness = evaluateLiveSourceReadiness({
    sources: sourceService.listSources(),
    config,
    sourceIds
  });
  const outcomes = readiness.map((item) => ({
    ...item,
    fetched: 0,
    processed: 0
  }));
  const outcomesBySourceId = new Map(outcomes.map((item) => [item.sourceId, item]));
  const readySources = [];
  for (const outcome of outcomes) {
    if (outcome.status !== 'ready') {
      continue;
    }
    const source = sourceService.getSource(outcome.sourceId);
    if (shouldSkipForSchedule({ source, runOptions, now: startedAtDate })) {
      outcome.status = 'skipped';
      outcome.reason = 'not_due';
      continue;
    }
    readySources.push(source);
  }

  for (const source of readySources) {
    queue.enqueue('fetch', {
      sourceId: source.id,
      sourceType: source.sourceType,
      runId,
      runOptions
    }, {
      jobKey: `live:${runId}:fetch:${source.id}`,
      runAfter: startedAtDate
    });
  }

  const fetchSummary = await processFetchJobs({
    queue,
    handler: createFetchJobHandler({
      sourceService,
      rawItemRepository,
      queue,
      adapters
    }),
    limit: Math.max(readySources.length, 1),
    now: startedAtDate,
    filter: (job) => job.payload?.runId === runId
  });
  applyFetchOutcomes({ queue, runId, outcomesBySourceId });

  const processSummary = await processQueuedJobs({
    queue,
    handler: createProcessJobHandler({
      rawItemRepository,
      sourceService,
      articleFetcher,
      articleRepository
    }),
    limit: countDueQueuedJobs(queue, 'process', startedAtDate),
    now: startedAtDate,
    filter: (job) => job.payload?.runId === runId
  });
  applyProcessOutcomes({ processSummary, outcomesBySourceId });

  // AI relevance filter: for general tech sources, use AI to judge if articles are AI-related
  await applyRelevanceFilter({ articleRepository, sourceService, config, fetchImpl });

  const qualitySummary = new ArticleQualityService({
    articleRepository,
    sourceService,
    now
  }).classifyArticles();
  const dedupeSummary = new ArticleDedupeService({
    articleRepository,
    sourceRelationRepository,
    now
  }).dedupeArticles();
  const clusterSummary = new SignalClusterService({
    articleRepository,
    signalRepository,
    sourceRelationRepository,
    sourceService,
    now
  }).clusterArticles();
  const topicSummary = await new TopicClassifier({
    topicRepository,
    signalRepository,
    articleRepository,
    sourceService,
    now
  }).classifySignals();
  const scoringSummary = new SignalScoringService({
    signalRepository,
    articleRepository,
    sourceService,
    sourceRelationRepository,
    topicRepository,
    scoreComponentRepository,
    now
  }).scoreSignals();

  enqueuePendingEnrichmentJobs({
    signalRepository,
    queue,
    now: startedAtDate,
    retryFallback: canGenerateAiEnrichment(enrichmentProvider)
  });
  const enrichmentSummary = await processEnrichmentJobs({
    queue,
    handler: createEnrichmentJobHandler({
      signalRepository,
      articleRepository,
      sourceService,
      provider: enrichmentProvider
    }),
    limit: countDueQueuedJobs(queue, 'enrichment', startedAtDate),
    now: startedAtDate
  });

  const completedAt = now().toISOString();
  const sources = Array.from(outcomesBySourceId.values());
  const sourceOutcomeCounts = countSourceOutcomes(sources);

  return {
    mode: 'live',
    runMode: runOptions.mode,
    state: runStateForReport({ completedAt, sourceOutcomeCounts }),
    runId,
    startedAt,
    completedAt,
    lastLiveFetchAt: sourceOutcomeCounts.succeeded > 0 ? completedAt : undefined,
    intervalMinutes: runOptions.intervalMinutes,
    lookbackHours: runOptions.lookbackHours,
    incremental: runOptions.incremental,
    force: runOptions.force,
    recovery: runOptions.recovery,
    skippedOverlapCount,
    sources,
    sourceOutcomeCounts,
    skippedReasons: countSkippedReasons(sources),
    totals: {
      fetched: sourceOutcomeCounts.fetched,
      processed: sourceOutcomeCounts.processed,
      rawItems: rawItemRepository.listRawItems().length,
      articles: articleRepository.listArticles().length,
      signals: signalRepository.listSignals().length
    },
    pipeline: {
      fetch: fetchSummary,
      process: processSummary,
      quality: qualitySummary,
      dedupe: dedupeSummary,
      cluster: clusterSummary,
      topics: topicSummary,
      scoring: scoringSummary,
      enrichment: enrichmentSummary
    }
  };
}

function evaluateSourceReadiness({ source, config }) {
  const base = {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.sourceType
  };

  if (!source.enabled) {
    return { ...base, status: 'skipped', reason: 'disabled' };
  }
  if (!supportedSourceTypes.has(source.sourceType)) {
    return { ...base, status: 'skipped', reason: 'unsupported_source_type' };
  }

  const endpointReason = missingEndpointReason(source);
  if (endpointReason) {
    return { ...base, status: 'skipped', reason: endpointReason };
  }

  if (source.credentialRef && !credentialOptionalSourceTypes.has(source.sourceType) && !secretForRef(source.credentialRef, config)) {
    return { ...base, status: 'skipped', reason: 'credential_missing' };
  }
  if (source.credentialRef && credentialOptionalSourceTypes.has(source.sourceType) && !secretForRef(source.credentialRef, config)) {
    return { ...base, status: 'skipped', reason: 'credential_missing' };
  }

  return { ...base, status: 'ready' };
}

function activateConfiguredLiveSources({ sourceService, config }) {
  for (const source of sourceService.listSources()) {
    if (source.sourceType === 'newsapi' || source.sourceType === 'product_hunt') {
      if (source.credentialRef) {
        sourceService.enableSource(source.id);
      }
      continue;
    }

    if (source.sourceType === 'semantic_scholar') {
      if (source.credentialRef && !secretForRef(source.credentialRef, config)) {
        sourceService.updateSource(source.id, {
          enabled: true,
          credentialRef: undefined
        });
        continue;
      }
      sourceService.enableSource(source.id);
      continue;
    }

    if (source.sourceType === 'crossref') {
      sourceService.enableSource(source.id);
    }
  }
}

function missingEndpointReason(source) {
  if ((source.sourceType === 'rss' || source.sourceType === 'atom') && !source.feedUrl) {
    return 'missing_feed_url';
  }
  if (['newsapi', 'arxiv', 'semantic_scholar', 'product_hunt', 'crossref'].includes(source.sourceType) && !source.apiEndpoint) {
    return 'missing_api_endpoint';
  }
  return undefined;
}

function createLiveAdapters({ config = {}, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const getSecret = (name) => secretForRef(name, config);
  return {
    rss: new RssAtomAdapter({ fetchImpl, now }),
    atom: new RssAtomAdapter({ fetchImpl, now }),
    newsapi: new NewsApiAdapter({ fetchImpl, getSecret, now }),
    arxiv: new ArxivAdapter({ fetchImpl, now }),
    semantic_scholar: new SemanticScholarAdapter({ fetchImpl, getSecret, now }),
    hacker_news: new HackerNewsAdapter({ fetchImpl, now }),
    product_hunt: new ProductHuntAdapter({ fetchImpl, getSecret, now }),
    crossref: new CrossrefAdapter({
      fetchImpl,
      contactEmail: config.crossrefContactEmail,
      now
    })
  };
}

function wrapAdapters(adapters) {
  const wrapped = {};
  for (const [sourceType, adapter] of Object.entries(adapters || {})) {
    wrapped[sourceType] = {
      async fetchSource(source, context) {
        return asArray(await adapter.fetchSource(source, context));
      }
    };
  }
  return wrapped;
}

function normalizeRunOptions(options = {}) {
  const mode = ['startup', 'scheduled', 'manual'].includes(options.mode) ? options.mode : 'manual';
  const recovery = Boolean(options.recovery || options.fullWindow);
  const force = Boolean(options.force);
  const incremental = options.incremental !== undefined
    ? Boolean(options.incremental)
    : mode === 'scheduled';
  const lookbackHours = normalizePositiveNumber(
    options.lookbackHours,
    mode === 'startup' ? defaultStartupLookbackHours : undefined
  );
  const intervalMinutes = normalizePositiveNumber(options.intervalMinutes, undefined);

  return {
    mode,
    incremental: recovery ? false : incremental,
    force,
    recovery,
    lookbackHours,
    intervalMinutes
  };
}

function normalizePositiveNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function shouldSkipForSchedule({ source, runOptions, now }) {
  if (runOptions.force || runOptions.mode !== 'scheduled') {
    return false;
  }
  if (!source.nextFetchAt) {
    return false;
  }
  return new Date(source.nextFetchAt).getTime() > new Date(now).getTime();
}

function countDueQueuedJobs(queue, lane, now) {
  const currentTime = new Date(now).getTime();
  return queue.list(lane).filter((job) =>
    job.status === 'queued' &&
    new Date(job.runAfter).getTime() <= currentTime
  ).length;
}

function createSkippedOverlapReport({ mode, runSequence, skippedOverlapCount, now, lastRunReport }) {
  const at = now().toISOString();
  return {
    mode: 'live',
    runMode: mode,
    state: 'skipped',
    reason: 'overlap',
    runId: createRunId(new Date(at), runSequence),
    startedAt: at,
    completedAt: at,
    lastLiveFetchAt: lastRunReport?.lastLiveFetchAt,
    skippedOverlapCount,
    sourceOutcomeCounts: clone(lastRunReport?.sourceOutcomeCounts || emptyOutcomeCounts()),
    skippedReasons: {
      ...(lastRunReport?.skippedReasons || {}),
      overlap: skippedOverlapCount
    },
    totals: clone(lastRunReport?.totals || {
      fetched: 0,
      processed: 0,
      rawItems: 0,
      articles: 0,
      signals: 0
    }),
    sources: clone(lastRunReport?.sources || []),
    pipeline: clone(lastRunReport?.pipeline || {})
  };
}

function createLiveEnrichmentProvider({ config = {}, fetchImpl = globalThis.fetch } = {}) {
  if (config.secrets?.enrichment && config.enrichment?.baseUrl && config.enrichment?.model && config.enrichment.model !== 'mock-enrichment') {
    return createOpenAICompatibleEnrichmentProvider({
      apiKey: config.secrets.enrichment,
      model: config.enrichment.model,
      baseUrl: config.enrichment.baseUrl,
      fetchImpl
    });
  }
  return createMetadataEnrichmentProvider();
}

function canGenerateAiEnrichment(provider) {
  return Boolean(provider?.generate && !provider.fallbackOnly);
}

function createMetadataEnrichmentProvider() {
  return {
    name: 'metadata-enrichment',
    fallbackOnly: true,
    fallbackReason: 'ai_credentials_missing',
    async generate(context) {
      const sources = asArray(context.sources);
      const articles = asArray(context.articles);
      const leadSource = sources[0];
      return {
        aiBrief: `${context.signal.title} 已由 ${sources.length} 个实时来源提供基础证据。`,
        keyPoints: sources.slice(0, 3).map((source) => ({
          text: `${source.name} 提供了该信号的实时来源证据。`,
          sourceIds: [source.id]
        })),
        timeline: articles.slice(0, 4).map((article) => ({
          label: `${sourceNameFor(sources, article.sourceId)} 捕获了相关来源。`,
          at: article.publishedAt,
          sourceIds: [article.sourceId]
        })),
        sourceMix: sources.map((source) => ({
          sourceId: source.id,
          sourceName: source.name,
          role: roleForSource(source, leadSource?.id)
        })),
        nextWatch: '继续关注更多来源确认、后续分析和官方更新。',
        relatedSignalIds: []
      };
    }
  };
}

function applyFetchOutcomes({ queue, runId, outcomesBySourceId }) {
  const jobs = queue.list('fetch').filter((job) => job.payload?.runId === runId);
  for (const job of jobs) {
    const outcome = outcomesBySourceId.get(job.payload?.sourceId);
    if (!outcome) {
      continue;
    }
    if (job.status === 'completed') {
      outcome.status = 'succeeded';
      outcome.reason = undefined;
      outcome.fetched = job.result?.fetched || 0;
      outcome.received = job.result?.received || outcome.fetched;
      outcome.filtered = clone(job.result?.filtered);
      outcome.created = job.result?.created || 0;
      outcome.duplicates = job.result?.duplicates || 0;
      continue;
    }
    if (job.status === 'failed' || job.lastErrorCategory) {
      outcome.status = 'failed';
      outcome.reason = job.lastErrorCategory || 'fetch_failed';
      outcome.errorCategory = job.lastErrorCategory || 'fetch_failed';
    }
  }
}

function applyProcessOutcomes({ processSummary, outcomesBySourceId }) {
  for (const item of processSummary.results || []) {
    const sourceId = item.result?.sourceId;
    if (item.status !== 'completed' || !sourceId) {
      continue;
    }
    const outcome = outcomesBySourceId.get(sourceId);
    if (outcome) {
      outcome.processed = (outcome.processed || 0) + 1;
    }
  }
}

async function applyRelevanceFilter({ articleRepository, sourceService, config, fetchImpl }) {
  const apiKey = config.secrets?.enrichment;
  const model = config.enrichment?.model;
  const baseUrl = config.enrichment?.baseUrl;

  if (!apiKey || !model || !baseUrl || model === 'mock-enrichment') {
    return;
  }

  const filter = createRelevanceFilter({ apiKey, model, baseUrl, fetchImpl });
  if (!filter) {
    return;
  }

  const articles = articleRepository.listArticles();
  const sourcesWithKeywords = new Set();
  for (const source of sourceService.listSources()) {
    if (source.filterKeywords && source.filterKeywords.length > 0) {
      sourcesWithKeywords.add(source.id);
    }
  }

  const candidateArticles = articles.filter((article) =>
    sourcesWithKeywords.has(article.sourceId) &&
    article.qualityStatus !== 'low_quality'
  );

  if (candidateArticles.length === 0) {
    return;
  }

  const relevantArticles = await filter.filterArticles(candidateArticles);
  const relevantIds = new Set(relevantArticles.map((a) => a.id));

  for (const article of candidateArticles) {
    if (!relevantIds.has(article.id)) {
      articleRepository.updateQualityStatus(article.id, {
        qualityStatus: 'low_quality',
        visibilityStatus: 'hidden_latest',
        qualityReasons: ['irrelevant_to_topic'],
        qualityCheckedAt: new Date().toISOString()
      });
    }
  }
}

function countSourceOutcomes(sources) {
  const counts = {
    ready: 0,
    skipped: 0,
    succeeded: 0,
    failed: 0,
    fetched: 0,
    processed: 0
  };

  for (const source of sources) {
    if (source.status === 'ready' || source.status === 'succeeded' || source.status === 'failed') {
      counts.ready += 1;
    }
    if (source.status === 'skipped') {
      counts.skipped += 1;
    }
    if (source.status === 'succeeded') {
      counts.succeeded += 1;
    }
    if (source.status === 'failed') {
      counts.failed += 1;
    }
    counts.fetched += source.fetched || 0;
    counts.processed += source.processed || 0;
  }

  return counts;
}

function countSkippedReasons(sources) {
  const counts = {};
  for (const source of sources) {
    if (source.status !== 'skipped' || !source.reason) {
      continue;
    }
    counts[source.reason] = (counts[source.reason] || 0) + 1;
  }
  return counts;
}

function createInitialReport({ now, sources }) {
  const at = now().toISOString();
  return {
    mode: 'live',
    state: 'loading',
    runId: undefined,
    startedAt: undefined,
    completedAt: undefined,
    lastLiveFetchAt: undefined,
    sources: asArray(sources).map((source) => ({
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.sourceType,
      status: 'pending',
      fetched: 0,
      processed: 0
    })),
    sourceOutcomeCounts: emptyOutcomeCounts(),
    skippedReasons: {},
    totals: {
      fetched: 0,
      processed: 0,
      rawItems: 0,
      articles: 0,
      signals: 0
    },
    createdAt: at
  };
}

function emptyOutcomeCounts() {
  return {
    ready: 0,
    skipped: 0,
    succeeded: 0,
    failed: 0,
    fetched: 0,
    processed: 0
  };
}

function secretForRef(ref, config) {
  if (!ref) {
    return undefined;
  }
  const byRef = {
    NEWSAPI_KEY: config.secrets?.newsapi,
    PRODUCT_HUNT_TOKEN: config.secrets?.productHunt,
    SEMANTIC_SCHOLAR_API_KEY: config.secrets?.semanticScholar
  };
  return byRef[ref] || config.secrets?.[ref] || process.env[ref];
}

function runStateForReport({ report, completedAt, sourceOutcomeCounts, stale = false }) {
  const counts = sourceOutcomeCounts || report?.sourceOutcomeCounts || emptyOutcomeCounts();
  if (!report && !completedAt) {
    return 'unknown';
  }
  if (report?.mode && report.mode !== 'live') {
    return report.mode;
  }
  if (!completedAt && !report?.completedAt) {
    return 'loading';
  }
  if (counts.succeeded > 0 && (counts.failed > 0 || counts.skipped > 0)) {
    return 'partial_live';
  }
  if (counts.succeeded > 0) {
    return stale ? 'stale_live' : 'live';
  }
  if (counts.failed > 0) {
    return 'failed';
  }
  return 'empty';
}

function createRunId(date, sequence = 0) {
  const base = `live_${date.toISOString().replace(/[-:.]/g, '').replace('T', '_').replace('Z', '')}`;
  return sequence > 1 ? `${base}_${sequence}` : base;
}

function withRequestTimeout(fetchImpl, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) {
    return fetchImpl;
  }

  return async function fetchWithRequestTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const upstreamSignal = options.signal;
    if (upstreamSignal?.aborted) {
      controller.abort();
    } else if (upstreamSignal?.addEventListener) {
      upstreamSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      return await fetchImpl(url, {
        ...options,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

function isStale(value, now, staleAfterMs) {
  if (!value) {
    return true;
  }
  return now.getTime() - new Date(value).getTime() > staleAfterMs;
}

function roleForSource(source, leadSourceId) {
  if (source.id === leadSourceId) {
    return 'lead';
  }
  if (source.family === 'company_announcement') {
    return 'official';
  }
  if (source.family === 'research') {
    return 'research';
  }
  if (source.family === 'community') {
    return 'community';
  }
  if (source.family === 'product_launch') {
    return 'product';
  }
  return 'supporting';
}

function sourceNameFor(sources, sourceId) {
  return sources.find((source) => source.id === sourceId)?.name || 'source';
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}
