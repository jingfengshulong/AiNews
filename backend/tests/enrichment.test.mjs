import test from 'node:test';
import assert from 'node:assert/strict';

import { ArticleRepository } from '../src/ingestion/article-repository.ts';
import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { InMemoryQueue } from '../src/queue/in-memory-queue.ts';
import { enqueuePendingEnrichmentJobs, createEnrichmentJobHandler, processEnrichmentJobs, createFallbackEnrichmentOutput } from '../src/signal-processing/enrichment-job-handler.ts';
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

test('fallback enrichment is only re-enqueued when retrying fallback output is enabled', () => {
  const runtime = createRuntime();
  const pending = runtime.signalRepository.createSignal({
    title: 'Pending signal',
    primaryPublishedAt: '2026-04-21T08:00:00.000Z',
    status: 'candidate',
    enrichmentStatus: 'pending'
  });
  const fallback = runtime.signalRepository.createSignal({
    title: 'Fallback signal',
    primaryPublishedAt: '2026-04-21T08:00:00.000Z',
    status: 'candidate',
    enrichmentStatus: 'fallback'
  });
  const failedWithFallback = runtime.signalRepository.createSignal({
    title: 'Failed validation signal',
    primaryPublishedAt: '2026-04-21T08:00:00.000Z',
    status: 'candidate',
    enrichmentStatus: 'failed',
    enrichmentMeta: {
      errorCategory: 'enrichment_validation_failed',
      fallbackGenerated: true
    }
  });
  const oldFallbackJob = runtime.queue.enqueue('enrichment', { signalId: fallback.id }, {
    jobKey: `enrichment:${fallback.id}`,
    runAfter: new Date('2026-04-21T08:00:00.000Z')
  });
  runtime.queue.complete(oldFallbackJob.id, { fallback: true });

  const defaultJobs = enqueuePendingEnrichmentJobs({
    signalRepository: runtime.signalRepository,
    queue: runtime.queue,
    now: new Date('2026-04-21T09:00:00.000Z')
  });
  const retryJobs = enqueuePendingEnrichmentJobs({
    signalRepository: runtime.signalRepository,
    queue: runtime.queue,
    now: new Date('2026-04-21T10:00:00.000Z'),
    retryFallback: true
  });

  assert.deepEqual(defaultJobs.map((job) => job.payload.signalId), [pending.id]);
  assert.ok(retryJobs.some((job) => job.payload.signalId === fallback.id && job.status === 'queued'));
  assert.ok(retryJobs.find((job) => job.payload.signalId === fallback.id).jobKey.includes(':fallback-retry:'));
  assert.ok(retryJobs.some((job) => job.payload.signalId === failedWithFallback.id && job.status === 'queued'));
  assert.ok(retryJobs.find((job) => job.payload.signalId === failedWithFallback.id).jobKey.includes(':failed-retry:'));
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
  assert.doesNotMatch(updated.aiBrief, /来源归因显示|页面只展示/);
});

test('enrichment repairs missing provider structure before validation', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: 'arXiv AI Recent',
    sourceType: 'arxiv',
    family: 'research',
    trustScore: 0.9,
    usagePolicy: restrictedUsagePolicy
  });
  const article = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_repair_structure',
    sourceId: source.id,
    title: 'Seeing Fast and Slow: Learning the Flow of Time in Videos',
    excerpt: 'A paper studies time flow in videos.',
    textForAI: 'A paper studies how models perceive and control time in videos.',
    contentHash: '9'.repeat(64)
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
        aiBrief: '这条信号围绕模型如何理解视频中的时间流动展开，来源摘要显示研究关注快放慢放识别、生成速度控制和视频时序建模。它对视频生成、编辑工具和评测方法都有参考价值，后续需要观察论文复现、开源代码和社区实验反馈。',
        keyPoints: [],
        timeline: [],
        sourceMix: [],
        nextWatch: 'watch replication and code release',
        relatedSignalIds: []
      })
    })
  });
  const updated = runtime.signalRepository.getSignal(signal.id);

  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 0);
  assert.equal(updated.enrichmentStatus, 'completed');
  assert.ok(updated.keyPoints.length >= 1);
  assert.equal(updated.sourceMix[0].sourceId, source.id);
  assert.match(updated.nextWatch, /继续关注/);
});

test('fallback enrichment uses article context instead of generic source boilerplate', () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: 'InfoQ China',
    family: 'technology_media',
    trustScore: 0.78,
    usagePolicy: restrictedUsagePolicy
  });
  const article = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_aicon_agent',
    sourceId: source.id,
    title: '阿里云智能集团高级技术专家刘少伟已确认出席AICon上海站，并分享如何构建企业 Agent 的自动化行动架构',
    excerpt: '深入探讨 Agent 从原型到量产的工程挑战、数据与记忆的基础设施底座、安全可信的落地保障。',
    textForAI: '阿里云智能集团高级技术专家刘少伟将在 AICon 上海站分享企业 Agent 的自动化行动架构，讨论 WinNexO、数据到行动断层、多模态数据集成、语义模型、Agent Runtime、权限控制和行业实践。',
    contentHash: '8'.repeat(64)
  });
  const signal = createSignal(runtime, {
    title: article.title,
    articles: [article]
  });
  const fallback = createFallbackEnrichmentOutput({
    signal,
    articles: [{ ...article, role: 'lead' }],
    sources: [source]
  });
  const pointText = fallback.keyPoints.map((point) => point.text).join(' ');

  assert.match(fallback.aiBrief, /企业 Agent|自动化行动架构|AICon/);
  assert.match(fallback.aiBrief, /工程挑战|数据|记忆|安全可信|落地/);
  assert.doesNotMatch(fallback.aiBrief, /基础来源信息|相关来源标题|页面只展示/);
  assert.ok(fallback.keyPoints.length >= 3);
  assert.match(pointText, /WinNexO|多模态|语义模型|Agent Runtime/);
});

test('fallback enrichment extracts concrete model release details from article text', () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: '雷峰网 Leiphone',
    family: 'technology_media',
    trustScore: 0.74,
    usagePolicy: restrictedUsagePolicy
  });
  const article = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_sensenova_u1',
    sourceId: source.id,
    title: '全面开源！商汤日日新SenseNova U1发布，迈向模型理解生成统一时代',
    excerpt: '商汤开源 SenseNova U1，开启多模态新范式。',
    textForAI: [
      '今天，商汤科技正式发布并开源日日新SenseNova U1 系列原生理解生成统一模型。',
      '它基于 NEO-unify 架构，在单一模型架构上统一了多模态理解、推理与生成，并重新构建统一表征空间。',
      '本次开源发布的是 SenseNova U1 Lite，包含 SenseNova-U1-8B-MoT 和 SenseNova-U1-A3B-MoT 两个规格。',
      '项目提供 GitHub 和 Hugging Face 开源入口，并宣称在图像理解、图像生成与视觉推理基准上达到同量级开源 SOTA。',
      'SenseNova U1 还强调连续性图文创作输出，用单次单模型调用保持图文交错内容的一致上下文。'
    ].join(' '),
    contentHash: '9'.repeat(64)
  });
  const signal = createSignal(runtime, {
    title: article.title,
    articles: [article]
  });
  const fallback = createFallbackEnrichmentOutput({
    signal,
    articles: [{ ...article, role: 'lead' }],
    sources: [source]
  });
  const combined = [fallback.aiBrief, ...fallback.keyPoints.map((point) => point.text)].join(' ');

  assert.match(combined, /SenseNova U1|NEO-unify|统一表征空间/);
  assert.match(combined, /8B-MoT|A3B-MoT|GitHub|Hugging Face|SOTA/);
  assert.doesNotMatch(fallback.aiBrief, /主题线索仍有限/);
  assert.doesNotMatch(fallback.aiBrief, /架构弱。$/);
  assert.doesNotMatch(fallback.aiBrief, /；$/);
  assert.ok(fallback.keyPoints.length >= 3);
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
  assert.match(updated.aiBrief, /这条资讯聚焦|来源摘要显示/);
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
        aiBrief: '这'.repeat(320),
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
  assert.match(updated.aiBrief, /这条资讯聚焦|来源摘要显示/);
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
  assert.match(updated.aiBrief, /这条资讯聚焦|来源摘要显示/);
  assert.doesNotMatch(updated.aiBrief, /AI 精炼暂不可用/);
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
