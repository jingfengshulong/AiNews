import test from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig } from '../src/config/env.ts';
import { SourceFetchError } from '../src/ingestion/source-fetch-error.ts';
import { createLiveRuntime, evaluateLiveSourceReadiness } from '../src/live/live-runtime.ts';
import { createLiveIngestionScheduler } from '../src/live/live-scheduler.ts';

const usagePolicy = {
  allowFullText: false,
  allowSummary: true,
  commercialUseNeedsReview: true,
  attributionRequired: true
};

function source(input) {
  return {
    id: input.id,
    name: input.name || input.id,
    sourceType: input.sourceType,
    family: input.family || 'technology_media',
    enabled: input.enabled !== false,
    feedUrl: input.feedUrl,
    apiEndpoint: input.apiEndpoint,
    credentialRef: input.credentialRef,
    fetchLimit: input.fetchLimit,
    language: input.language || 'en',
    usagePolicy
  };
}

function createSeedSources(records) {
  return (sourceService) => records.map((record) => sourceService.createSource({
    name: record.name,
    sourceType: record.sourceType,
    family: record.family || 'technology_media',
    feedUrl: record.feedUrl,
    apiEndpoint: record.apiEndpoint,
    query: record.query,
    fetchLimit: record.fetchLimit,
    filterKeywords: record.filterKeywords,
    language: record.language || 'en',
    fetchIntervalMinutes: record.fetchIntervalMinutes || 60,
    trustScore: record.trustScore || 0.8,
    credentialRef: record.credentialRef,
    usagePolicy,
    enabled: record.enabled !== false
  }));
}

function adapterRecord(sourceRecord, patch = {}) {
  return {
    sourceId: sourceRecord.id,
    sourceType: sourceRecord.sourceType,
    externalId: patch.externalId || `${sourceRecord.id}-item`,
    title: patch.title || 'OpenAI agent reliability platform enters enterprise preview',
    url: patch.url || `https://example.com/${sourceRecord.id}-item`,
    publishedAt: Object.hasOwn(patch, 'publishedAt') ? patch.publishedAt : '2026-04-21T08:00:00.000Z',
    author: patch.author || sourceRecord.name,
    summary: patch.summary || 'A source item about agent reliability infrastructure.',
    categories: patch.categories || ['AI Agent'],
    rawPayload: {
      title: patch.title || 'OpenAI agent reliability platform enters enterprise preview',
      summary: patch.summary || 'A source item about agent reliability infrastructure.'
    },
    responseMeta: {
      adapter: sourceRecord.sourceType,
      fixture: 'live-test'
    }
  };
}

function createArticleFetcher() {
  return {
    async fetchArticle({ url, rawItem, source }) {
      const textForAI = [
        rawItem.payload.title,
        rawItem.payload.summary,
        'This live test article has enough backend text for clustering, scoring, and enrichment.'
      ].filter(Boolean).join(' ');

      return {
        rawItemId: rawItem.id,
        sourceId: source.id,
        canonicalUrl: url,
        title: rawItem.payload.title,
        language: source.language,
        excerpt: rawItem.payload.summary,
        publishedAt: rawItem.payload.publishedAt,
        author: rawItem.payload.author,
        textForAI,
        fullTextDisplayAllowed: false,
        contentHash: `${rawItem.id}`.padEnd(64, '0').slice(0, 64),
        extractionMeta: {
          extractor: 'live-test',
          sourceType: source.sourceType,
          textLength: textForAI.length
        }
      };
    }
  };
}

const enrichmentProvider = {
  name: 'live-test-enrichment',
  async generate(context) {
    return {
      aiBrief: `${context.signal.title} 已由 ${context.sources.length} 个实时来源提供证据。`,
      keyPoints: context.sources.slice(0, 2).map((sourceRecord) => ({
        text: `${sourceRecord.name} 提供了实时来源证据。`,
        sourceIds: [sourceRecord.id]
      })),
      timeline: context.articles.slice(0, 2).map((article) => ({
        label: `${article.title} 已发布并被采集。`,
        at: article.publishedAt,
        sourceIds: [article.sourceId]
      })),
      sourceMix: context.sources.map((sourceRecord) => ({
        sourceId: sourceRecord.id,
        sourceName: sourceRecord.name,
        role: sourceRecord.family === 'company_announcement' ? 'official' : 'supporting'
      })),
      nextWatch: '继续关注更多实时来源确认。',
      relatedSignalIds: []
    };
  }
};

test('live source readiness reports public ready, missing credentials skipped, disabled skipped, and bad endpoints skipped', () => {
  const config = loadConfig({ RUNTIME_MODE: 'test' });
  const outcomes = evaluateLiveSourceReadiness({
    config,
    sources: [
      source({ id: 'src_rss', sourceType: 'rss', feedUrl: 'https://example.com/feed.xml' }),
      source({ id: 'src_newsapi', sourceType: 'newsapi', apiEndpoint: 'https://newsapi.example/v2/everything', credentialRef: 'NEWSAPI_KEY' }),
      source({ id: 'src_disabled', sourceType: 'rss', feedUrl: 'https://example.com/disabled.xml', enabled: false }),
      source({ id: 'src_bad', sourceType: 'rss' })
    ]
  });

  assert.equal(outcomes.find((item) => item.sourceId === 'src_rss').status, 'ready');
  assert.deepEqual(
    {
      status: outcomes.find((item) => item.sourceId === 'src_newsapi').status,
      reason: outcomes.find((item) => item.sourceId === 'src_newsapi').reason
    },
    { status: 'skipped', reason: 'credential_missing' }
  );
  assert.equal(outcomes.find((item) => item.sourceId === 'src_disabled').reason, 'disabled');
  assert.equal(outcomes.find((item) => item.sourceId === 'src_bad').reason, 'missing_feed_url');
  assert.doesNotMatch(JSON.stringify(outcomes), /NEWSAPI_KEY=.*|secret/i);
});

test('live runtime processes mocked fetched records into visible ranked signals with live metadata', async () => {
  const seedSources = createSeedSources([
    {
      name: 'OpenAI Live RSS',
      sourceType: 'rss',
      family: 'company_announcement',
      feedUrl: 'https://example.com/openai.xml',
      trustScore: 0.95
    },
    {
      name: 'NewsAPI Live AI',
      sourceType: 'newsapi',
      family: 'technology_media',
      apiEndpoint: 'https://newsapi.example/v2/everything?q=ai',
      credentialRef: 'NEWSAPI_KEY',
      trustScore: 0.72
    }
  ]);
  const runtime = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test', NEWSAPI_KEY: 'test-newsapi-key' }),
    seedSources,
    adapters: {
      rss: { fetchSource: async (sourceRecord) => [adapterRecord(sourceRecord)] },
      newsapi: { fetchSource: async (sourceRecord) => [adapterRecord(sourceRecord, { externalId: 'newsapi-agent-reliability' })] }
    },
    articleFetcher: createArticleFetcher(),
    enrichmentProvider,
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });

  const report = await runtime.runOnce();
  const home = runtime.servingService.getHome();

  assert.equal(report.mode, 'live');
  assert.equal(report.sourceOutcomeCounts.succeeded, 2);
  assert.equal(report.totals.fetched, 2);
  assert.equal(report.totals.processed, 2);
  assert.equal(home.dataStatus.mode, 'live');
  assert.equal(home.dataStatus.stale, false);
  assert.equal(home.dataStatus.sourceOutcomeCounts.succeeded, 2);
  assert.ok(home.leadSignal.title.includes('OpenAI agent reliability platform'));
  assert.ok(home.leadSignal.sourceCount >= 2);
  assert.ok(home.stats.visibleSignals >= 1);
});

test('live runtime can limit synchronous enrichment work per run', async () => {
  const seedSources = createSeedSources([{
    name: 'OpenAI Live RSS',
    sourceType: 'rss',
    family: 'company_announcement',
    feedUrl: 'https://example.com/openai.xml',
    trustScore: 0.95
  }]);
  let generated = 0;
  const runtime = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    seedSources,
    adapters: {
      rss: {
        fetchSource: async (sourceRecord) => [1, 2, 3].map((index) => adapterRecord(sourceRecord, {
          externalId: `openai-live-${index}`,
          title: `OpenAI agent platform ${index} reaches live preview`,
          url: `https://example.com/openai-live-${index}`
        }))
      }
    },
    articleFetcher: createArticleFetcher(),
    enrichmentProvider: {
      ...enrichmentProvider,
      async generate(context) {
        generated += 1;
        return enrichmentProvider.generate(context);
      }
    },
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });

  const report = await runtime.runOnce({ enrichmentLimit: 1 });

  assert.equal(generated, 1);
  assert.equal(report.pipeline.enrichment.completed, 1);
  assert.equal(runtime.queue.list('enrichment').filter((job) => job.status === 'queued').length, 2);
});

test('live runtime does not truncate fetched records by maxItemsPerSource', async () => {
  const seedSources = createSeedSources([{
    name: 'OpenAI Live RSS',
    sourceType: 'rss',
    family: 'company_announcement',
    feedUrl: 'https://example.com/openai.xml',
    trustScore: 0.95
  }]);
  const runtime = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    seedSources,
    adapters: {
      rss: {
        fetchSource: async (sourceRecord) => [
          adapterRecord(sourceRecord, { externalId: 'item-1', title: 'OpenAI agent reliability platform one' }),
          adapterRecord(sourceRecord, { externalId: 'item-2', title: 'OpenAI agent reliability platform two' }),
          adapterRecord(sourceRecord, { externalId: 'item-3', title: 'OpenAI agent reliability platform three' })
        ]
      }
    },
    articleFetcher: createArticleFetcher(),
    enrichmentProvider,
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });

  const report = await runtime.runOnce({ maxItemsPerSource: 1 });

  assert.equal(report.totals.fetched, 3);
  assert.equal(report.totals.processed, 3);
  assert.equal(runtime.rawItemRepository.listRawItems().length, 3);
});

test('startup catch-up filters reliable records outside the default 24-hour lookback', async () => {
  const seedSources = createSeedSources([{
    name: 'OpenAI Live RSS',
    sourceType: 'rss',
    family: 'company_announcement',
    feedUrl: 'https://example.com/openai.xml',
    trustScore: 0.95
  }]);
  const runtime = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    seedSources,
    adapters: {
      rss: {
        fetchSource: async (sourceRecord) => [
          adapterRecord(sourceRecord, { externalId: 'recent', publishedAt: '2026-04-21T08:00:00.000Z' }),
          adapterRecord(sourceRecord, { externalId: 'old', publishedAt: '2026-04-19T08:00:00.000Z' }),
          adapterRecord(sourceRecord, { externalId: 'missing-date', publishedAt: undefined })
        ]
      }
    },
    articleFetcher: createArticleFetcher(),
    enrichmentProvider,
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });

  const report = await runtime.runOnce({ mode: 'startup' });
  const externalIds = runtime.rawItemRepository.listRawItems().map((item) => item.externalId).sort();

  assert.deepEqual(externalIds, ['missing-date', 'recent']);
  assert.equal(report.sources[0].filtered.skippedByLookback, 1);
});

test('scheduled runs use cursor state to process only newly observed items', async () => {
  let currentNow = new Date('2026-04-21T12:00:00.000Z');
  let run = 0;
  const seedSources = createSeedSources([{
    name: 'OpenAI Live RSS',
    sourceType: 'rss',
    family: 'company_announcement',
    feedUrl: 'https://example.com/openai.xml',
    fetchIntervalMinutes: 5,
    trustScore: 0.95
  }]);
  const runtime = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    seedSources,
    adapters: {
      rss: {
        fetchSource: async (sourceRecord) => {
          run += 1;
          if (run === 1) {
            return [adapterRecord(sourceRecord, { externalId: 'first', publishedAt: '2026-04-21T11:55:00.000Z' })];
          }
          return [
            adapterRecord(sourceRecord, { externalId: 'first', publishedAt: '2026-04-21T11:55:00.000Z' }),
            adapterRecord(sourceRecord, { externalId: 'second', publishedAt: '2026-04-21T12:04:00.000Z' })
          ];
        }
      }
    },
    articleFetcher: createArticleFetcher(),
    enrichmentProvider,
    now: () => currentNow
  });

  await runtime.runOnce({ mode: 'startup' });
  currentNow = new Date('2026-04-21T12:06:00.000Z');
  const report = await runtime.runOnce({ mode: 'scheduled' });
  const cursor = runtime.sourceService.listSources()[0].ingestionCursor;

  assert.equal(report.totals.rawItems, 2);
  assert.equal(report.sources[0].fetched, 1);
  assert.equal(report.sources[0].filtered.skippedByCursor, 1);
  assert.equal(cursor.lastSeenPublishedAt, '2026-04-21T12:04:00.000Z');
  assert.deepEqual(cursor.seenExternalIds.sort(), ['first', 'second']);
});

test('live runtime single-flight guard skips overlapping runs', async () => {
  const seedSources = createSeedSources([{
    name: 'OpenAI Live RSS',
    sourceType: 'rss',
    family: 'company_announcement',
    feedUrl: 'https://example.com/openai.xml',
    trustScore: 0.95
  }]);
  let releaseFetch;
  const fetchGate = new Promise((resolve) => {
    releaseFetch = resolve;
  });
  const runtime = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    seedSources,
    adapters: {
      rss: {
        fetchSource: async (sourceRecord) => {
          await fetchGate;
          return [adapterRecord(sourceRecord)];
        }
      }
    },
    articleFetcher: createArticleFetcher(),
    enrichmentProvider,
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });

  const first = runtime.runOnce({ mode: 'startup' });
  const skipped = await runtime.runOnce({ mode: 'scheduled' });
  releaseFetch();
  const completed = await first;

  assert.equal(skipped.state, 'skipped');
  assert.equal(skipped.reason, 'overlap');
  assert.equal(skipped.skippedOverlapCount, 1);
  assert.equal(completed.sourceOutcomeCounts.succeeded, 1);
});

test('live ingestion scheduler runs scheduled incremental mode and exposes interval state', async () => {
  const calls = [];
  const runtime = {
    async runOnce(options) {
      calls.push(options);
      return {
        runId: 'live_scheduler_test',
        runMode: options.mode,
        state: 'live',
        skippedOverlapCount: 0,
        sourceOutcomeCounts: { succeeded: 1 },
        totals: { fetched: 1 }
      };
    }
  };
  const logs = [];
  const scheduler = createLiveIngestionScheduler({
    runtime,
    logger: { info: (event, payload) => logs.push({ event, payload }), error: () => {} },
    intervalMinutes: 30,
    sourceIds: ['src_0001'],
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });

  scheduler.start();
  await scheduler.runNow();
  const state = scheduler.getState();
  scheduler.stop();

  assert.equal(state.running, true);
  assert.equal(state.intervalMinutes, 30);
  assert.deepEqual(calls[0], {
    mode: 'scheduled',
    incremental: true,
    intervalMinutes: 30,
    sourceIds: ['src_0001']
  });
  assert.ok(logs.some((entry) => entry.event === 'live_scheduled_refresh_completed'));
});

test('live runtime schedules process jobs from fetch time instead of wall clock time', async () => {
  const seedSources = createSeedSources([
    {
      name: 'AI Media Live RSS',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://example.com/ai-media.xml',
      trustScore: 0.8,
      filterKeywords: ['AI']
    }
  ]);
  const runtime = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    seedSources,
    adapters: {
      rss: { fetchSource: async (sourceRecord) => [adapterRecord(sourceRecord)] }
    },
    articleFetcher: createArticleFetcher(),
    enrichmentProvider,
    now: () => new Date('1970-01-01T00:00:00.000Z')
  });

  const report = await runtime.runOnce({ maxItemsPerSource: 1 });

  assert.equal(report.totals.fetched, 1);
  assert.equal(report.totals.processed, 1);
  assert.equal(runtime.queue.list('process')[0].runAfter, '1970-01-01T00:00:00.000Z');
});

test('live runtime passes abort signals to source fetches for request timeout control', async () => {
  const seedSources = createSeedSources([
    {
      name: 'OpenAI Live RSS',
      sourceType: 'rss',
      family: 'company_announcement',
      feedUrl: 'https://example.com/openai.xml',
      trustScore: 0.95
    }
  ]);
  const runtime = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    seedSources,
    requestTimeoutMs: 50,
    fetchImpl: async (_url, options = {}) => {
      assert.ok(options.signal);
      assert.equal(options.signal.aborted, false);
      return {
        status: 200,
        headers: { get: () => 'application/rss+xml' },
        text: async () => `<?xml version="1.0"?>
          <rss version="2.0">
            <channel>
              <item>
                <guid>live-timeout-signal</guid>
                <title>OpenAI agent reliability platform enters enterprise preview</title>
                <link>https://example.com/live-timeout-signal</link>
                <pubDate>Tue, 21 Apr 2026 08:00:00 GMT</pubDate>
                <description>A source item about agent reliability infrastructure.</description>
              </item>
            </channel>
          </rss>`
      };
    },
    articleFetcher: createArticleFetcher(),
    enrichmentProvider,
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });

  const report = await runtime.runOnce({ maxItemsPerSource: 1 });

  assert.equal(report.sourceOutcomeCounts.succeeded, 1);
  assert.equal(report.totals.processed, 1);
});

test('live runtime request timeout also covers stalled response body reads', async () => {
  const seedSources = createSeedSources([
    {
      name: 'Stalled Live RSS',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://example.com/stalled.xml',
      trustScore: 0.7
    }
  ]);
  let bodyAbortObserved = false;
  const runtime = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    seedSources,
    requestTimeoutMs: 20,
    fetchImpl: async (_url, options = {}) => ({
      status: 200,
      headers: { get: () => 'application/rss+xml' },
      text: async () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          bodyAbortObserved = true;
          reject(new Error('stalled body aborted'));
        }, { once: true });
      })
    }),
    articleFetcher: createArticleFetcher(),
    enrichmentProvider,
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });

  const startedAt = Date.now();
  const report = await runtime.runOnce();

  assert.equal(bodyAbortObserved, true);
  assert.ok(Date.now() - startedAt < 1000);
  assert.equal(report.sourceOutcomeCounts.succeeded, 0);
  assert.equal(report.pipeline.fetch.retried, 1);
  assert.equal(report.totals.processed, 0);
});

test('live runtime applies request timeout to AI enrichment requests', async () => {
  const seedSources = createSeedSources([
    {
      name: 'OpenAI Live RSS',
      sourceType: 'rss',
      family: 'company_announcement',
      feedUrl: 'https://example.com/openai.xml',
      trustScore: 0.95
    }
  ]);
  let enrichmentAbortObserved = false;
  const runtime = await createLiveRuntime({
    config: loadConfig({
      RUNTIME_MODE: 'test',
      AI_ENRICHMENT_API_KEY: 'test-key',
      AI_ENRICHMENT_MODEL: 'test-model',
      AI_ENRICHMENT_BASE_URL: 'https://ai.example/v1'
    }),
    seedSources,
    requestTimeoutMs: 20,
    adapters: {
      rss: {
        fetchSource: async (sourceRecord) => [adapterRecord(sourceRecord)]
      }
    },
    fetchImpl: async (_url, options = {}) => new Promise((_resolve, reject) => {
      if (options.signal?.aborted) {
        enrichmentAbortObserved = true;
        reject(new Error('stalled AI request aborted'));
        return;
      }
      options.signal.addEventListener('abort', () => {
        enrichmentAbortObserved = true;
        reject(new Error('stalled AI request aborted'));
      }, { once: true });
    }),
    articleFetcher: createArticleFetcher(),
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });

  const startedAt = Date.now();
  const report = await runtime.runOnce();

  assert.equal(enrichmentAbortObserved, true);
  assert.ok(Date.now() - startedAt < 1000);
  assert.equal(report.sourceOutcomeCounts.succeeded, 1);
  assert.equal(report.totals.processed, 1);
  assert.equal(report.pipeline.enrichment.failed, 1);
});

test('live runtime retries fallback enrichment after an AI provider becomes available', async () => {
  const seedSources = createSeedSources([
    {
      name: 'OpenAI Live RSS',
      sourceType: 'rss',
      family: 'company_announcement',
      feedUrl: 'https://example.com/openai.xml',
      trustScore: 0.95
    }
  ]);
  let fallbackOnly = true;
  const mutableProvider = {
    name: 'mutable-live-enrichment',
    get fallbackOnly() {
      return fallbackOnly;
    },
    async generate(context) {
      return enrichmentProvider.generate(context);
    }
  };
  const runtime = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    seedSources,
    adapters: {
      rss: { fetchSource: async (sourceRecord) => [adapterRecord(sourceRecord)] }
    },
    articleFetcher: createArticleFetcher(),
    enrichmentProvider: mutableProvider,
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });

  await runtime.runOnce({ maxItemsPerSource: 1 });
  const fallbackSignal = runtime.signalRepository.listSignals()[0];
  assert.equal(fallbackSignal.enrichmentStatus, 'fallback');

  fallbackOnly = false;
  const report = await runtime.runOnce({ maxItemsPerSource: 1, recovery: true });
  const completedSignal = runtime.signalRepository.getSignal(fallbackSignal.id);

  assert.equal(report.pipeline.enrichment.completed, 1);
  assert.equal(completedSignal.enrichmentStatus, 'completed');
  assert.equal(completedSignal.enrichmentMeta.provider, 'mutable-live-enrichment');
});

test('live runtime enables configured live API sources and public research fallbacks', async () => {
  const runtime = await createLiveRuntime({
    config: loadConfig({
      RUNTIME_MODE: 'test',
      NEWSAPI_KEY: 'newsapi-secret',
      PRODUCT_HUNT_TOKEN: 'product-hunt-secret',
      CROSSREF_CONTACT_EMAIL: 'research@example.com'
    }),
    seedSources: createSeedSources([
      {
        name: 'NewsAPI Live AI',
        sourceType: 'newsapi',
        apiEndpoint: 'https://newsapi.example/v2/everything?q=ai',
        credentialRef: 'NEWSAPI_KEY',
        enabled: false
      },
      {
        name: 'Product Hunt Live AI',
        sourceType: 'product_hunt',
        family: 'product_launch',
        apiEndpoint: 'https://api.producthunt.com/v2/api/graphql',
        credentialRef: 'PRODUCT_HUNT_TOKEN',
        enabled: false
      },
      {
        name: 'Semantic Scholar Public AI',
        sourceType: 'semantic_scholar',
        family: 'research',
        apiEndpoint: 'https://api.semanticscholar.org/graph/v1/paper/search',
        credentialRef: 'SEMANTIC_SCHOLAR_API_KEY',
        enabled: false
      },
      {
        name: 'Crossref Public AI',
        sourceType: 'crossref',
        family: 'research',
        apiEndpoint: 'https://api.crossref.org/works?query=artificial%20intelligence',
        enabled: false
      }
    ])
  });

  const sources = runtime.sourceService.listSources();
  const newsapi = sources.find((item) => item.sourceType === 'newsapi');
  const productHunt = sources.find((item) => item.sourceType === 'product_hunt');
  const semantic = sources.find((item) => item.sourceType === 'semantic_scholar');
  const crossref = sources.find((item) => item.sourceType === 'crossref');
  const readiness = evaluateLiveSourceReadiness({
    config: loadConfig({
      RUNTIME_MODE: 'test',
      NEWSAPI_KEY: 'newsapi-secret',
      PRODUCT_HUNT_TOKEN: 'product-hunt-secret',
      CROSSREF_CONTACT_EMAIL: 'research@example.com'
    }),
    sources
  });

  assert.equal(newsapi.enabled, true);
  assert.equal(productHunt.enabled, true);
  assert.equal(semantic.enabled, true);
  assert.equal(semantic.credentialRef, undefined);
  assert.equal(crossref.enabled, true);
  assert.equal(readiness.every((item) => item.status === 'ready'), true);
});

test('live runtime records failed source outcomes and continues processing successful sources', async () => {
  const seedSources = createSeedSources([
    {
      name: 'OpenAI Live RSS',
      sourceType: 'rss',
      family: 'company_announcement',
      feedUrl: 'https://example.com/openai.xml',
      trustScore: 0.95
    },
    {
      name: 'Failing Live RSS',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://example.com/failing.xml',
      trustScore: 0.5
    }
  ]);
  const runtime = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    seedSources,
    adapters: {
      rss: {
        fetchSource: async (sourceRecord) => {
          if (sourceRecord.name.includes('Failing')) {
            throw new SourceFetchError('upstream failed', {
              category: 'transient_failure',
              retryable: false
            });
          }
          return [adapterRecord(sourceRecord)];
        }
      }
    },
    articleFetcher: createArticleFetcher(),
    enrichmentProvider,
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });

  const report = await runtime.runOnce();
  const home = runtime.servingService.getHome();

  assert.equal(report.sourceOutcomeCounts.succeeded, 1);
  assert.equal(report.sourceOutcomeCounts.failed, 1);
  assert.equal(report.sources.find((item) => item.sourceName === 'Failing Live RSS').status, 'failed');
  assert.equal(home.dataStatus.sourceOutcomeCounts.failed, 1);
  assert.ok(home.leadSignal.id);
});
