import test from 'node:test';
import assert from 'node:assert/strict';

import { ArticleRepository } from '../src/ingestion/article-repository.ts';
import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { InMemoryQueue } from '../src/queue/in-memory-queue.ts';
import { enqueuePendingEnrichmentJobs, createEnrichmentJobHandler, processEnrichmentJobs } from '../src/signal-processing/enrichment-job-handler.ts';
import { SignalRepository } from '../src/signal-processing/signal-repository.ts';
import { SourceRepository } from '../src/sources/source-repository.ts';
import { SourceService } from '../src/sources/source-service.ts';
import { createWorker } from '../src/worker/worker.ts';
import { createMemoryLogger } from '../src/logging/logger.ts';

const restrictedUsagePolicy = {
  allowFullText: false,
  allowSummary: true,
  commercialUseNeedsReview: true,
  attributionRequired: true
};

const permissiveUsagePolicy = {
  allowFullText: true,
  allowSummary: true,
  commercialUseNeedsReview: false,
  attributionRequired: true
};

function createRuntime() {
  const store = new InMemoryStore();
  const sourceService = new SourceService(new SourceRepository(store));
  return {
    store,
    queue: new InMemoryQueue(store),
    sourceService,
    articleRepository: new ArticleRepository(store),
    signalRepository: new SignalRepository(store)
  };
}

function createSource(sourceService, input) {
  return sourceService.createSource({
    name: input.name,
    sourceType: input.sourceType || 'rss',
    family: input.family,
    feedUrl: input.feedUrl || 'https://example.com/feed.xml',
    language: 'en',
    fetchIntervalMinutes: 60,
    trustScore: input.trustScore,
    usagePolicy: input.usagePolicy || restrictedUsagePolicy
  });
}

function createArticle(repository, patch) {
  return repository.upsertArticleCandidate({
    rawItemId: patch.rawItemId,
    sourceId: patch.sourceId,
    canonicalUrl: patch.canonicalUrl || `https://example.com/${patch.rawItemId}`,
    title: patch.title,
    language: 'en',
    excerpt: patch.excerpt,
    publishedAt: patch.publishedAt || '2026-04-21T08:00:00.000Z',
    author: patch.author || 'Example Author',
    textForAI: patch.textForAI,
    fullTextDisplayAllowed: patch.fullTextDisplayAllowed === true,
    contentHash: patch.contentHash,
    extractionMeta: patch.extractionMeta || {}
  });
}

function createSignal(runtime, { title, articles }) {
  const signal = runtime.signalRepository.createSignal({
    title,
    primaryPublishedAt: articles[0].publishedAt,
    status: 'candidate',
    enrichmentStatus: 'pending'
  });
  articles.forEach((article, index) => {
    runtime.signalRepository.linkArticle({
      signalId: signal.id,
      articleId: article.id,
      role: index === 0 ? 'lead' : 'supporting'
    });
  });
  return signal;
}

function createHandler(runtime, provider) {
  return createEnrichmentJobHandler({
    signalRepository: runtime.signalRepository,
    articleRepository: runtime.articleRepository,
    sourceService: runtime.sourceService,
    provider
  });
}

test('enrichment jobs are enqueued for pending signals and persist attributable output', async () => {
  const runtime = createRuntime();
  const official = createSource(runtime.sourceService, {
    name: 'OpenAI News',
    family: 'company_announcement',
    trustScore: 0.95,
    usagePolicy: restrictedUsagePolicy
  });
  const media = createSource(runtime.sourceService, {
    name: 'Tech Media',
    family: 'technology_media',
    trustScore: 0.72,
    usagePolicy: restrictedUsagePolicy
  });
  const lead = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_1',
    sourceId: official.id,
    title: 'OpenAI launches Agent SDK for developers',
    excerpt: 'OpenAI announces a new Agent SDK.',
    textForAI: 'OpenAI launches a new Agent SDK for developers with tool use, workflow automation, and integration hooks.',
    contentHash: 'a'.repeat(64)
  });
  const support = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_2',
    sourceId: media.id,
    title: 'Developers react to OpenAI Agent SDK',
    excerpt: 'Developers discuss the new agent tooling.',
    textForAI: 'Developer coverage explains integrations, early use cases, and deployment questions around the SDK.',
    contentHash: 'b'.repeat(64)
  });
  const signal = createSignal(runtime, {
    title: lead.title,
    articles: [lead, support]
  });

  const jobs = enqueuePendingEnrichmentJobs({
    signalRepository: runtime.signalRepository,
    queue: runtime.queue
  });
  const handler = createHandler(runtime, {
    generate: async (context) => ({
      aiBrief: `${context.signal.title} is gaining attention because official and media sources both describe new agent tooling.`,
      keyPoints: [
        { text: 'Official source confirms the SDK launch.', sourceIds: [official.id] },
        { text: 'Media coverage adds developer adoption context.', sourceIds: [media.id] }
      ],
      timeline: [
        { label: 'Official launch post published.', at: '2026-04-21T08:00:00.000Z', sourceIds: [official.id] },
        { label: 'Media coverage followed with developer context.', at: '2026-04-21T09:00:00.000Z', sourceIds: [media.id] }
      ],
      sourceMix: [
        { sourceId: official.id, sourceName: 'OpenAI News', role: 'official' },
        { sourceId: media.id, sourceName: 'Tech Media', role: 'media' }
      ],
      nextWatch: 'Watch for SDK adoption examples and safety guidance from official sources.',
      relatedSignalIds: []
    })
  });

  const summary = await processEnrichmentJobs({ queue: runtime.queue, handler });
  const updated = runtime.signalRepository.getSignal(signal.id);
  const completedJob = runtime.queue.list('enrichment')[0];

  assert.equal(jobs.length, 1);
  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 0);
  assert.equal(completedJob.status, 'completed');
  assert.equal(updated.enrichmentStatus, 'completed');
  assert.match(updated.aiBrief, /gaining attention/);
  assert.equal(updated.keyPoints.length, 2);
  assert.equal(updated.timeline.length, 2);
  assert.equal(updated.sourceMix.length, 2);
  assert.match(updated.nextWatch, /adoption/);
  assert.deepEqual(updated.relatedSignalIds, []);
  assert.equal(updated.enrichmentError, undefined);
});

test('enrichment validation rejects copied restricted full text and preserves failed status', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: 'Restricted Source',
    family: 'technology_media',
    trustScore: 0.7,
    usagePolicy: restrictedUsagePolicy
  });
  const copiedSentence = 'OpenAI launches a new Agent SDK for developers with tool use workflow automation and integration hooks across enterprise systems.';
  const article = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_copied',
    sourceId: source.id,
    title: 'OpenAI launches Agent SDK for developers',
    excerpt: 'Restricted article excerpt.',
    textForAI: `${copiedSentence} The rest of this article provides background and analysis.`,
    contentHash: 'c'.repeat(64)
  });
  const signal = createSignal(runtime, {
    title: article.title,
    articles: [article]
  });
  runtime.queue.enqueue('enrichment', { signalId: signal.id }, { jobKey: `enrichment:${signal.id}` });

  const summary = await processEnrichmentJobs({
    queue: runtime.queue,
    handler: createHandler(runtime, {
      generate: async () => ({
        aiBrief: copiedSentence,
        keyPoints: [{ text: 'Copied source language appears here.', sourceIds: [source.id] }],
        timeline: [{ label: 'Story published.', sourceIds: [source.id] }],
        sourceMix: [{ sourceId: source.id, sourceName: source.name, role: 'media' }],
        nextWatch: 'Watch for follow-up coverage.',
        relatedSignalIds: []
      })
    })
  });
  const updated = runtime.signalRepository.getSignal(signal.id);
  const failedJob = runtime.queue.list('enrichment')[0];

  assert.equal(summary.completed, 0);
  assert.equal(summary.failed, 1);
  assert.equal(failedJob.status, 'failed');
  assert.equal(failedJob.lastErrorCategory, 'enrichment_validation_failed');
  assert.equal(updated.enrichmentStatus, 'failed');
  assert.match(updated.enrichmentError, /copied restricted source text/i);
  assert.equal(updated.aiBrief, undefined);
});

test('enrichment validation rejects overlong unattributed output', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: 'Permissive Source',
    family: 'research',
    trustScore: 0.85,
    usagePolicy: permissiveUsagePolicy
  });
  const article = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_long',
    sourceId: source.id,
    title: 'New benchmark paper evaluates reasoning agents',
    excerpt: 'A benchmark paper.',
    textForAI: 'A paper evaluates reasoning agents with benchmark datasets and clear source metadata.',
    fullTextDisplayAllowed: true,
    contentHash: 'd'.repeat(64)
  });
  const signal = createSignal(runtime, {
    title: article.title,
    articles: [article]
  });
  runtime.queue.enqueue('enrichment', { signalId: signal.id }, { jobKey: `enrichment:${signal.id}` });

  const summary = await processEnrichmentJobs({
    queue: runtime.queue,
    handler: createHandler(runtime, {
      generate: async () => ({
        aiBrief: Array.from({ length: 130 }, (_, index) => `word${index}`).join(' '),
        keyPoints: [{ text: 'This point has no source references.', sourceIds: [] }],
        timeline: [],
        sourceMix: [],
        nextWatch: 'Watch for independent replications.',
        relatedSignalIds: []
      })
    })
  });
  const updated = runtime.signalRepository.getSignal(signal.id);

  assert.equal(summary.failed, 1);
  assert.equal(updated.enrichmentStatus, 'failed');
  assert.match(updated.enrichmentError, /AI brief is too long|source mix is required|source references/i);
});

test('worker can run queued enrichment jobs through the configured enrichment handler', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: 'OpenAI News',
    family: 'company_announcement',
    trustScore: 0.95,
    usagePolicy: restrictedUsagePolicy
  });
  const article = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_worker',
    sourceId: source.id,
    title: 'OpenAI introduces model routing updates',
    excerpt: 'A short model routing update.',
    textForAI: 'OpenAI introduces model routing updates with developer API changes and rollout details.',
    contentHash: 'e'.repeat(64)
  });
  const signal = createSignal(runtime, {
    title: article.title,
    articles: [article]
  });
  runtime.queue.enqueue('enrichment', { signalId: signal.id }, { jobKey: `enrichment:${signal.id}` });

  const worker = createWorker({
    config: { runtimeMode: 'test', databaseUrl: 'memory', redisUrl: 'memory' },
    queue: runtime.queue,
    logger: createMemoryLogger(),
    enrichmentJobHandler: createHandler(runtime, {
      generate: async () => ({
        aiBrief: 'OpenAI introduced model routing updates with developer-facing changes.',
        keyPoints: [{ text: 'The update affects developer API routing.', sourceIds: [source.id] }],
        timeline: [{ label: 'Official update published.', sourceIds: [source.id] }],
        sourceMix: [{ sourceId: source.id, sourceName: source.name, role: 'official' }],
        nextWatch: 'Watch for migration notes and developer feedback.',
        relatedSignalIds: []
      })
    })
  });

  const summary = await worker.runEnrichmentJobs();

  assert.equal(summary.completed, 1);
  assert.equal(runtime.signalRepository.getSignal(signal.id).enrichmentStatus, 'completed');
});
