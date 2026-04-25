import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadConfig } from '../src/config/env.ts';
import { InMemoryStore } from '../src/db/in-memory-store.ts';
import {
  loadRuntimeSnapshot,
  restoreRuntimeStore,
  saveRuntimeSnapshot,
  serializeRuntimeStore
} from '../src/db/runtime-snapshot.ts';
import { createJobRecord } from '../src/queue/job.ts';
import { createLiveRuntime } from '../src/live/live-runtime.ts';

const usagePolicy = {
  allowFullText: false,
  allowSummary: true,
  commercialUseNeedsReview: true,
  attributionRequired: true
};

test('runtime snapshot serializes and restores store maps, indexes, counters, jobs, and metadata', async () => {
  const store = new InMemoryStore();
  store.sources.set('src_0001', {
    id: 'src_0001',
    name: 'OpenAI Live RSS',
    sourceType: 'rss',
    family: 'company_announcement',
    enabled: true,
    feedUrl: 'https://example.com/openai.xml',
    language: 'en',
    fetchIntervalMinutes: 60,
    trustScore: 0.95,
    usagePolicy,
    health: { lastSuccessfulAt: '2026-04-21T12:00:00.000Z', failureCount: 0 }
  });
  store.rawItems.set('raw_0001', {
    id: 'raw_0001',
    sourceId: 'src_0001',
    externalId: 'openai-live-1',
    payload: { title: 'OpenAI launches a persistent agent platform' }
  });
  store.rawItemIndex.set('src_0001:openai-live-1', 'raw_0001');
  store.articles.set('art_0001', {
    id: 'art_0001',
    rawItemId: 'raw_0001',
    sourceId: 'src_0001',
    canonicalUrl: 'https://example.com/openai-live-1',
    title: 'OpenAI launches a persistent agent platform',
    textForAI: 'Backend text for AI processing.'
  });
  store.articleIndex.set('raw_0001', 'art_0001');
  store.signals.set('sig_0001', {
    id: 'sig_0001',
    title: 'OpenAI launches a persistent agent platform',
    status: 'candidate',
    primaryPublishedAt: '2026-04-21T12:00:00.000Z'
  });
  store.signalArticles.set('sigart_0001', {
    id: 'sigart_0001',
    signalId: 'sig_0001',
    articleId: 'art_0001'
  });
  store.signalArticleIndex.set('sig_0001:art_0001', 'sigart_0001');
  store.jobs.get('fetch').set('job_0001', createJobRecord({
    id: 'job_0001',
    lane: 'fetch',
    payload: { sourceId: 'src_0001' },
    jobKey: 'fetch:src_0001',
    runAfter: '2026-04-21T12:00:00.000Z',
    now: new Date('2026-04-21T12:00:00.000Z')
  }));
  store.jobKeyIndex.get('fetch').set('fetch:src_0001', 'job_0001');
  store.counters.set('src', 1);
  store.counters.set('raw', 1);

  const metadata = {
    latestRunReport: {
      mode: 'live',
      runId: 'live_test',
      completedAt: '2026-04-21T12:01:00.000Z'
    }
  };
  const snapshot = serializeRuntimeStore(store, { metadata });
  const { store: restored, metadata: restoredMetadata } = restoreRuntimeStore(snapshot);
  const path = join(await mkdtemp(join(tmpdir(), 'ai-news-runtime-')), 'runtime.json');

  await saveRuntimeSnapshot(path, snapshot);
  const persisted = await loadRuntimeSnapshot(path);
  const rawFile = await readFile(path, 'utf8');

  assert.equal(snapshot.version, 1);
  assert.deepEqual(restored.sources.get('src_0001'), store.sources.get('src_0001'));
  assert.equal(restored.rawItemIndex.get('src_0001:openai-live-1'), 'raw_0001');
  assert.equal(restored.articleIndex.get('raw_0001'), 'art_0001');
  assert.equal(restored.signalArticleIndex.get('sig_0001:art_0001'), 'sigart_0001');
  assert.equal(restored.jobs.get('fetch').get('job_0001').jobKey, 'fetch:src_0001');
  assert.equal(restored.jobKeyIndex.get('fetch').get('fetch:src_0001'), 'job_0001');
  assert.equal(restored.nextId('src'), 'src_0002');
  assert.deepEqual(restoredMetadata, metadata);
  assert.equal(persisted.version, 1);
  assert.match(rawFile, /"version": 1/);
});

test('live runtime restores persisted live data and latest run metadata on restart', async () => {
  const snapshotPath = join(await mkdtemp(join(tmpdir(), 'ai-news-live-')), 'runtime.json');
  const seedSources = createSeedSources([{
    name: 'OpenAI Live RSS',
    sourceType: 'rss',
    family: 'company_announcement',
    feedUrl: 'https://example.com/openai.xml',
    trustScore: 0.95
  }]);
  const runtime = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    snapshotPath,
    seedSources,
    adapters: {
      rss: { fetchSource: async (sourceRecord) => [adapterRecord(sourceRecord)] }
    },
    articleFetcher: createArticleFetcher(),
    enrichmentProvider,
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });
  const report = await runtime.runOnce({ maxItemsPerSource: 1 });

  const restarted = await createLiveRuntime({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    snapshotPath,
    seedSources,
    adapters: {
      rss: { fetchSource: async () => [] }
    },
    articleFetcher: createArticleFetcher(),
    enrichmentProvider,
    now: () => new Date('2026-04-21T12:05:00.000Z')
  });
  const home = restarted.servingService.getHome();

  assert.equal(restarted.rawItemRepository.listRawItems().length, 1);
  assert.equal(restarted.articleRepository.listArticles().length, 1);
  assert.equal(restarted.sourceService.listSources().length, 1);
  assert.equal(restarted.getLastRunReport().runId, report.runId);
  assert.equal(home.dataStatus.runId, report.runId);
  assert.equal(home.stats.visibleSignals, 1);
  assert.equal(restarted.store.nextId('raw'), 'raw_0002');
});

function createSeedSources(records) {
  return (sourceService) => records.map((record) => sourceService.createSource({
    name: record.name,
    sourceType: record.sourceType,
    family: record.family || 'technology_media',
    feedUrl: record.feedUrl,
    apiEndpoint: record.apiEndpoint,
    query: record.query,
    fetchLimit: record.fetchLimit,
    language: record.language || 'en',
    fetchIntervalMinutes: record.fetchIntervalMinutes || 60,
    trustScore: record.trustScore || 0.8,
    credentialRef: record.credentialRef,
    usagePolicy,
    enabled: record.enabled !== false
  }));
}

function adapterRecord(sourceRecord) {
  return {
    sourceId: sourceRecord.id,
    sourceType: sourceRecord.sourceType,
    externalId: 'openai-live-1',
    title: 'OpenAI launches a persistent agent platform',
    url: 'https://example.com/openai-live-1',
    publishedAt: '2026-04-21T08:00:00.000Z',
    author: sourceRecord.name,
    summary: 'A persistent runtime lets local AI news survive restarts.',
    categories: ['AI Agent'],
    rawPayload: {
      title: 'OpenAI launches a persistent agent platform',
      summary: 'A persistent runtime lets local AI news survive restarts.'
    },
    responseMeta: {
      adapter: sourceRecord.sourceType,
      fixture: 'runtime-persistence-test'
    }
  };
}

function createArticleFetcher() {
  return {
    async fetchArticle({ url, rawItem, source }) {
      return {
        rawItemId: rawItem.id,
        sourceId: source.id,
        canonicalUrl: url,
        title: rawItem.payload.title,
        language: source.language,
        excerpt: rawItem.payload.summary,
        publishedAt: rawItem.payload.publishedAt,
        author: rawItem.payload.author,
        textForAI: `${rawItem.payload.title} ${rawItem.payload.summary} enough backend article text`,
        fullTextDisplayAllowed: false,
        contentHash: `${rawItem.id}`.padEnd(64, '0').slice(0, 64),
        extractionMeta: { extractor: 'runtime-persistence-test' }
      };
    }
  };
}

const enrichmentProvider = {
  name: 'runtime-persistence-test',
  async generate(context) {
    return {
      aiBrief: `${context.signal.title} has persisted live evidence.`,
      keyPoints: context.sources.map((sourceRecord) => ({
        text: `${sourceRecord.name} provided persisted evidence.`,
        sourceIds: [sourceRecord.id]
      })),
      timeline: context.articles.map((article) => ({
        label: `${article.title} was captured.`,
        at: article.publishedAt,
        sourceIds: [article.sourceId]
      })),
      sourceMix: context.sources.map((sourceRecord) => ({
        sourceId: sourceRecord.id,
        sourceName: sourceRecord.name,
        role: 'lead'
      })),
      nextWatch: 'Watch whether persistence survives further refreshes.',
      relatedSignalIds: []
    };
  }
};
