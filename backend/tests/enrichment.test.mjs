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
      aiBrief: `${context.signal.title} 正在形成可展示的资讯信号：官方来源确认了工具发布，媒体来源补充了开发者采用背景。`,
      keyPoints: [
        { text: '官方来源确认了 Agent SDK 的发布信息。', sourceIds: [official.id] },
        { text: '媒体报道补充了开发者采用和落地场景。', sourceIds: [media.id] }
      ],
      timeline: [
        { label: '官方发布 Agent SDK 更新。', at: '2026-04-21T08:00:00.000Z', sourceIds: [official.id] },
        { label: '媒体跟进开发者反应和使用场景。', at: '2026-04-21T09:00:00.000Z', sourceIds: [media.id] }
      ],
      sourceMix: [
        { sourceId: official.id, sourceName: 'OpenAI News', role: 'official' },
        { sourceId: media.id, sourceName: 'Tech Media', role: 'media' }
      ],
      nextWatch: '继续关注官方迁移指南、示例项目和企业采用反馈。',
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
  assert.match(updated.aiBrief, /资讯信号/);
  assert.equal(updated.keyPoints.length, 2);
  assert.equal(updated.timeline.length, 2);
  assert.equal(updated.sourceMix.length, 2);
  assert.match(updated.nextWatch, /继续关注/);
  assert.deepEqual(updated.relatedSignalIds, []);
  assert.equal(updated.enrichmentError, undefined);
});

test('enrichment repairs short provider briefs before completing detail output', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: 'OpenAI News',
    family: 'company_announcement',
    trustScore: 0.95,
    usagePolicy: restrictedUsagePolicy
  });
  const article = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_short_brief',
    sourceId: source.id,
    title: 'OpenAI launches Agent SDK controls',
    excerpt: 'OpenAI launches Agent SDK controls for enterprise developers.',
    textForAI: 'OpenAI launches Agent SDK controls for enterprise developers with deployment, governance, and workflow details.',
    contentHash: '7'.repeat(64)
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
        aiBrief: '太短摘要。',
        keyPoints: [{ text: '官方来源确认了产品更新和开发者能力变化。', sourceIds: [source.id] }],
        timeline: [{ label: '官方发布了相关产品更新。', sourceIds: [source.id] }],
        sourceMix: [{ sourceId: source.id, sourceName: source.name, role: 'official' }],
        nextWatch: '继续关注官方说明、迁移路径和开发者反馈。',
        relatedSignalIds: []
      })
    })
  });
  const updated = runtime.signalRepository.getSignal(signal.id);

  assert.equal(summary.completed, 1);
  assert.equal(updated.enrichmentStatus, 'completed');
  assert.ok(chineseCharCount(updated.aiBrief) >= 100);
  assert.match(updated.aiBrief, /太短摘要/);
  assert.match(updated.aiBrief, /OpenAI launches Agent SDK controls/);
  assert.match(updated.aiBrief, /产品更新/);
  assert.doesNotMatch(updated.aiBrief, /后端处理流程|后台已保留/);
});

test('enrichment validation rejects copied restricted full text and preserves failed status', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: 'Restricted Source',
    family: 'technology_media',
    trustScore: 0.7,
    usagePolicy: restrictedUsagePolicy
  });
  const copiedSentence = 'OpenAI 发布新的 Agent SDK，面向开发者提供工具调用、工作流自动化和企业系统集成能力。';
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
        keyPoints: [{ text: '输出复制了受限来源中的原文句子。', sourceIds: [source.id] }],
        timeline: [{ label: '来源发布了相关报道。', sourceIds: [source.id] }],
        sourceMix: [{ sourceId: source.id, sourceName: source.name, role: 'media' }],
        nextWatch: '继续关注后续报道和官方确认。',
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
  assert.match(updated.aiBrief, /基础来源信息/);
  assert.doesNotMatch(updated.aiBrief, /企业系统集成能力/);
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
        aiBrief: '这'.repeat(260),
        keyPoints: [{ text: '这个要点没有任何来源引用。', sourceIds: [] }],
        timeline: [],
        sourceMix: [],
        nextWatch: '继续关注独立复现实验。',
        relatedSignalIds: []
      })
    })
  });
  const updated = runtime.signalRepository.getSignal(signal.id);

  assert.equal(summary.failed, 1);
  assert.equal(updated.enrichmentStatus, 'failed');
  assert.match(updated.enrichmentError, /AI brief is too long|source mix is required|source references/i);
  assert.match(updated.aiBrief, /基础来源信息/);
});

test('enrichment falls back safely when provider is unavailable', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: 'OpenAI News',
    family: 'company_announcement',
    trustScore: 0.95,
    usagePolicy: restrictedUsagePolicy
  });
  const article = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_fallback',
    sourceId: source.id,
    title: 'OpenAI introduces Agent SDK fallback coverage',
    excerpt: 'A source excerpt suitable for fallback summary.',
    textForAI: 'This backend-only sentence should never be exposed in fallback output because full text display is restricted.',
    contentHash: 'f'.repeat(64)
  });
  const signal = createSignal(runtime, {
    title: article.title,
    articles: [article]
  });
  runtime.queue.enqueue('enrichment', { signalId: signal.id }, { jobKey: `enrichment:${signal.id}` });

  const summary = await processEnrichmentJobs({
    queue: runtime.queue,
    handler: createHandler(runtime, undefined)
  });
  const updated = runtime.signalRepository.getSignal(signal.id);

  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 0);
  assert.equal(updated.enrichmentStatus, 'fallback');
  assert.equal(updated.enrichmentMeta.errorCategory, 'provider_unavailable');
  assert.match(updated.aiBrief, /基础来源信息/);
  assert.ok(chineseCharCount(updated.aiBrief) >= 100);
  assert.equal(updated.sourceMix[0].sourceId, source.id);
  assert.doesNotMatch(updated.aiBrief, /backend-only sentence/);
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
        aiBrief: 'OpenAI 发布了模型路由更新，重点影响开发者 API 的调用和迁移节奏。',
        keyPoints: [{ text: '这次更新会影响开发者 API 的路由方式。', sourceIds: [source.id] }],
        timeline: [{ label: '官方发布模型路由更新。', sourceIds: [source.id] }],
        sourceMix: [{ sourceId: source.id, sourceName: source.name, role: 'official' }],
        nextWatch: '继续关注迁移说明和开发者反馈。',
        relatedSignalIds: []
      })
    })
  });

  const summary = await worker.runEnrichmentJobs();

  assert.equal(summary.completed, 1);
  assert.equal(runtime.signalRepository.getSignal(signal.id).enrichmentStatus, 'completed');
});

function chineseCharCount(value) {
  return Array.from(String(value || '')).filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
}
