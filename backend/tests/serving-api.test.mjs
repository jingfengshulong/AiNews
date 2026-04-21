import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiServer } from '../src/api/server.ts';
import { createNewsServingService } from '../src/api/news-serving-service.ts';
import { loadConfig } from '../src/config/env.ts';
import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { ArticleRepository } from '../src/ingestion/article-repository.ts';
import { createMemoryLogger } from '../src/logging/logger.ts';
import { ScoreComponentRepository } from '../src/signal-processing/score-component-repository.ts';
import { SignalRepository } from '../src/signal-processing/signal-repository.ts';
import { TopicRepository } from '../src/signal-processing/topic-repository.ts';
import { SourceRepository } from '../src/sources/source-repository.ts';
import { SourceService } from '../src/sources/source-service.ts';

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
  const topicRepository = new TopicRepository(store);
  topicRepository.seedDefaultTopics();
  return {
    store,
    sourceService,
    articleRepository: new ArticleRepository(store),
    signalRepository: new SignalRepository(store),
    topicRepository,
    scoreComponentRepository: new ScoreComponentRepository(store)
  };
}

function createSource(sourceService, input) {
  return sourceService.createSource({
    name: input.name,
    sourceType: input.sourceType || 'rss',
    family: input.family,
    feedUrl: input.feedUrl || 'https://example.com/feed.xml',
    apiEndpoint: input.apiEndpoint,
    language: input.language || 'en',
    fetchIntervalMinutes: 60,
    trustScore: input.trustScore,
    credentialRef: input.credentialRef,
    usagePolicy: input.usagePolicy || restrictedUsagePolicy
  });
}

function createArticle(repository, patch) {
  return repository.upsertArticleCandidate({
    rawItemId: patch.rawItemId,
    sourceId: patch.sourceId,
    canonicalUrl: patch.canonicalUrl || `https://example.com/${patch.rawItemId}`,
    title: patch.title,
    language: patch.language || 'en',
    excerpt: patch.excerpt,
    publishedAt: patch.publishedAt,
    author: patch.author || 'Example Author',
    textForAI: patch.textForAI,
    fullTextDisplayAllowed: patch.fullTextDisplayAllowed === true,
    contentHash: patch.contentHash,
    extractionMeta: patch.extractionMeta || {}
  });
}

function createSignal(runtime, input) {
  const signal = runtime.signalRepository.createSignal({
    title: input.title,
    summary: input.summary,
    primaryPublishedAt: input.primaryPublishedAt,
    status: input.status || 'active',
    heatScore: input.heatScore,
    signalScore: input.signalScore,
    enrichmentStatus: input.enrichmentStatus || 'completed',
    aiBrief: input.aiBrief,
    keyPoints: input.keyPoints,
    timeline: input.timeline,
    sourceMix: input.sourceMix,
    nextWatch: input.nextWatch,
    relatedSignalIds: input.relatedSignalIds
  });
  input.articles.forEach((article, index) => {
    runtime.signalRepository.linkArticle({
      signalId: signal.id,
      articleId: article.id,
      role: index === 0 ? 'lead' : 'supporting'
    });
  });
  for (const topic of input.topics || []) {
    runtime.topicRepository.upsertSignalTopic({
      signalId: signal.id,
      topicSlug: topic.slug,
      method: 'rule',
      confidence: topic.confidence || 0.8,
      reason: topic.reason || 'Test topic assignment.',
      evidence: { matchedBy: 'test' }
    });
  }
  for (const component of input.scoreComponents || []) {
    runtime.scoreComponentRepository.upsertScoreComponent({
      signalId: signal.id,
      component: component.component,
      value: component.value,
      weight: component.weight,
      contribution: component.contribution
    });
  }
  return signal;
}

function seedServingFixture() {
  const runtime = createRuntime();
  const official = createSource(runtime.sourceService, {
    name: 'OpenAI News',
    family: 'company_announcement',
    trustScore: 0.95
  });
  const media = createSource(runtime.sourceService, {
    name: 'AI Media',
    sourceType: 'newsapi',
    family: 'technology_media',
    apiEndpoint: 'https://newsapi.example/v2/everything',
    credentialRef: 'NEWSAPI_KEY',
    trustScore: 0.7
  });
  const research = createSource(runtime.sourceService, {
    name: 'arXiv AI',
    sourceType: 'arxiv',
    family: 'research',
    apiEndpoint: 'https://export.arxiv.org/api/query',
    trustScore: 0.9,
    usagePolicy: permissiveUsagePolicy
  });

  const officialArticle = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_official',
    sourceId: official.id,
    title: 'OpenAI releases Agent SDK for enterprise developers',
    excerpt: 'OpenAI announces Agent SDK updates for enterprise developers.',
    publishedAt: '2026-04-21T08:00:00.000Z',
    textForAI: 'OpenAI announces Agent SDK updates with workflow orchestration and enterprise developer tooling.',
    contentHash: 'a'.repeat(64)
  });
  const mediaArticle = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_media',
    sourceId: media.id,
    title: 'Developers discuss OpenAI Agent SDK adoption',
    excerpt: 'Developer coverage adds adoption context.',
    publishedAt: '2026-04-21T09:30:00.000Z',
    textForAI: 'Developers discuss adoption questions around debugging, cost control, and integration for the Agent SDK.',
    contentHash: 'b'.repeat(64)
  });
  const researchArticle = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_research',
    sourceId: research.id,
    title: 'Benchmark paper evaluates AI agent reliability',
    excerpt: 'A benchmark evaluates agent reliability and tool use.',
    publishedAt: '2026-04-20T10:00:00.000Z',
    textForAI: 'A research benchmark evaluates AI agent reliability, tool use, and production failure modes.',
    fullTextDisplayAllowed: true,
    contentHash: 'c'.repeat(64)
  });
  const hiddenArticle = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_hidden',
    sourceId: media.id,
    title: 'Hidden policy story',
    excerpt: 'Hidden story.',
    publishedAt: '2026-04-21T11:00:00.000Z',
    textForAI: 'Hidden story should not appear in visible APIs.',
    contentHash: 'd'.repeat(64)
  });

  const leadSignal = createSignal(runtime, {
    title: officialArticle.title,
    summary: 'OpenAI Agent SDK updates are drawing developer attention.',
    primaryPublishedAt: '2026-04-21T08:00:00.000Z',
    heatScore: 94,
    signalScore: 88,
    aiBrief: 'OpenAI 的 Agent SDK 更新正在引发开发者关注，官方发布与媒体跟进共同支撑该信号。',
    keyPoints: [
      { text: '官方来源确认了 Agent SDK 更新。', sourceIds: [official.id] },
      { text: '媒体来源补充了开发者采用背景。', sourceIds: [media.id] }
    ],
    timeline: [
      { label: '官方发布 Agent SDK 更新。', at: '2026-04-21T08:00:00.000Z', sourceIds: [official.id] },
      { label: '媒体报道开发者采用问题。', at: '2026-04-21T09:30:00.000Z', sourceIds: [media.id] }
    ],
    sourceMix: [
      { sourceId: official.id, sourceName: official.name, role: 'official' },
      { sourceId: media.id, sourceName: media.name, role: 'media' }
    ],
    nextWatch: '关注迁移指南、示例项目和企业落地反馈。',
    articles: [officialArticle, mediaArticle],
    topics: [
      { slug: 'ai-agent', confidence: 0.92 },
      { slug: 'company-announcements', confidence: 0.86 }
    ],
    scoreComponents: [
      { component: 'heat_freshness', value: 1, weight: 25, contribution: 25 },
      { component: 'signal_source_trust', value: 0.82, weight: 30, contribution: 24.6 }
    ]
  });
  const researchSignal = createSignal(runtime, {
    title: researchArticle.title,
    summary: 'A benchmark paper evaluates agent reliability.',
    primaryPublishedAt: '2026-04-20T10:00:00.000Z',
    heatScore: 76,
    signalScore: 84,
    aiBrief: '研究信号聚焦 AI agent 可靠性评估。',
    keyPoints: [{ text: '研究来源提供了可靠性 benchmark。', sourceIds: [research.id] }],
    timeline: [{ label: '研究论文发布。', at: '2026-04-20T10:00:00.000Z', sourceIds: [research.id] }],
    sourceMix: [{ sourceId: research.id, sourceName: research.name, role: 'research' }],
    nextWatch: '关注复现实验和后续引用。',
    relatedSignalIds: [leadSignal.id],
    articles: [researchArticle],
    topics: [{ slug: 'research', confidence: 0.9 }]
  });
  createSignal(runtime, {
    title: hiddenArticle.title,
    summary: 'Hidden signal.',
    primaryPublishedAt: '2026-04-21T11:00:00.000Z',
    status: 'hidden',
    heatScore: 99,
    signalScore: 99,
    aiBrief: 'Hidden brief.',
    articles: [hiddenArticle],
    topics: [{ slug: 'policy', confidence: 0.75 }]
  });
  runtime.signalRepository.updateEnrichmentSuccess(leadSignal.id, {
    aiBrief: 'OpenAI 的 Agent SDK 更新正在引发开发者关注，官方发布与媒体跟进共同支撑该信号。',
    keyPoints: [
      { text: '官方来源确认了 Agent SDK 更新。', sourceIds: [official.id] },
      { text: '媒体来源补充了开发者采用背景。', sourceIds: [media.id] }
    ],
    timeline: [
      { label: '官方发布 Agent SDK 更新。', at: '2026-04-21T08:00:00.000Z', sourceIds: [official.id] },
      { label: '媒体报道开发者采用问题。', at: '2026-04-21T09:30:00.000Z', sourceIds: [media.id] }
    ],
    sourceMix: [
      { sourceId: official.id, sourceName: official.name, role: 'official' },
      { sourceId: media.id, sourceName: media.name, role: 'media' }
    ],
    nextWatch: '关注迁移指南、示例项目和企业落地反馈。',
    relatedSignalIds: [researchSignal.id]
  });

  const servingService = createNewsServingService({
    signalRepository: runtime.signalRepository,
    articleRepository: runtime.articleRepository,
    sourceService: runtime.sourceService,
    topicRepository: runtime.topicRepository,
    scoreComponentRepository: runtime.scoreComponentRepository,
    dataStatus: {
      mode: 'demo',
      stale: false,
      lastUpdatedAt: '2026-04-21T12:00:00.000Z',
      sourceOutcomeCounts: {
        ready: 0,
        skipped: 0,
        succeeded: 0,
        failed: 0
      }
    },
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });
  return {
    runtime,
    servingService,
    leadSignal,
    researchSignal,
    official,
    media,
    research
  };
}

async function withServer(servingService, callback) {
  const server = createApiServer({
    config: loadConfig({ RUNTIME_MODE: 'test' }),
    logger: createMemoryLogger(),
    servingService
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();

  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.json();
  return { response, body };
}

test('GET /api/home returns lead signal, ranked signals, stats, archives, and ticker items', async () => {
  const { servingService, leadSignal } = seedServingFixture();

  await withServer(servingService, async (baseUrl) => {
    const { response, body } = await getJson(baseUrl, '/api/home');

    assert.equal(response.status, 200);
    assert.equal(body.leadSignal.id, leadSignal.id);
    assert.equal(body.rankedSignals.length, 1);
    assert.ok(body.stats.visibleSignals >= 2);
    assert.ok(body.sourceSummaries.some((item) => item.family === 'company_announcement' && item.signalCount === 1));
    assert.ok(body.dateSummaries.some((item) => item.date === '2026-04-21'));
    assert.ok(body.tickerItems.some((item) => item.signalId === leadSignal.id && item.text.includes('OpenAI')));
    assert.equal(body.dataWindow.includesToday, true);
    assert.equal(body.dataStatus.mode, 'demo');
  });
});

test('GET /api/home exposes live and stale freshness metadata without secrets', async () => {
  const { runtime, leadSignal } = seedServingFixture();
  const servingService = createNewsServingService({
    signalRepository: runtime.signalRepository,
    articleRepository: runtime.articleRepository,
    sourceService: runtime.sourceService,
    topicRepository: runtime.topicRepository,
    scoreComponentRepository: runtime.scoreComponentRepository,
    dataStatus: () => ({
      mode: 'live',
      runId: 'live_20260421_120000',
      lastLiveFetchAt: '2026-04-21T11:00:00.000Z',
      stale: true,
      sourceOutcomeCounts: {
        ready: 4,
        skipped: 2,
        succeeded: 3,
        failed: 1,
        fetched: 12,
        processed: 10
      },
      skippedReasons: {
        credential_missing: 2
      }
    }),
    now: () => new Date('2026-04-21T12:00:00.000Z')
  });

  await withServer(servingService, async (baseUrl) => {
    const { response, body } = await getJson(baseUrl, '/api/home');
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 200);
    assert.equal(body.leadSignal.id, leadSignal.id);
    assert.equal(body.dataStatus.mode, 'live');
    assert.equal(body.dataStatus.stale, true);
    assert.equal(body.dataStatus.sourceOutcomeCounts.succeeded, 3);
    assert.equal(body.dataStatus.skippedReasons.credential_missing, 2);
    assert.doesNotMatch(serialized, /NEWSAPI_KEY|PRODUCT_HUNT_TOKEN|secret/i);
  });
});

test('GET /api/signals/:id returns attributable detail and never exposes restricted full text', async () => {
  const { servingService, leadSignal, official } = seedServingFixture();

  await withServer(servingService, async (baseUrl) => {
    const { response, body } = await getJson(baseUrl, `/api/signals/${leadSignal.id}`);
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 200);
    assert.equal(body.signal.id, leadSignal.id);
    assert.equal(body.keyPoints.length, 2);
    assert.equal(body.supportingSources[0].sourceId, official.id);
    assert.ok(body.supportingArticles.every((article) => article.originalUrl));
    assert.ok(body.attribution.originalLinks.length >= 2);
    assert.doesNotMatch(serialized, /textForAI/);
    assert.doesNotMatch(serialized, /workflow orchestration and enterprise developer tooling/);
    assert.ok(body.relatedSignals.some((signal) => signal.title.includes('Benchmark paper')));
    assert.ok(body.scoreComponents.some((component) => component.component === 'heat_freshness'));
  });
});

test('GET /api/signals/:id returns not found for missing or hidden signals', async () => {
  const { servingService, runtime } = seedServingFixture();
  const hidden = runtime.signalRepository.listSignals().find((signal) => signal.status === 'hidden');

  await withServer(servingService, async (baseUrl) => {
    const missing = await getJson(baseUrl, '/api/signals/does-not-exist');
    const hiddenResponse = await getJson(baseUrl, `/api/signals/${hidden.id}`);

    assert.equal(missing.response.status, 404);
    assert.equal(missing.body.error, 'not_found');
    assert.equal(hiddenResponse.response.status, 404);
    assert.equal(hiddenResponse.body.error, 'not_found');
  });
});

test('source archive endpoints return family and source-specific signal lists', async () => {
  const { servingService, research } = seedServingFixture();

  await withServer(servingService, async (baseUrl) => {
    const families = await getJson(baseUrl, '/api/sources');
    const familyArchive = await getJson(baseUrl, '/api/sources/research');
    const sourceArchive = await getJson(baseUrl, `/api/sources/research/${research.id}`);

    assert.equal(families.response.status, 200);
    assert.ok(families.body.families.some((item) => item.family === 'research'));
    assert.equal(familyArchive.response.status, 200);
    assert.equal(familyArchive.body.family, 'research');
    assert.ok(familyArchive.body.signals.every((signal) => signal.sourceFamilies.includes('research')));
    assert.equal(sourceArchive.response.status, 200);
    assert.equal(sourceArchive.body.source.id, research.id);
    assert.ok(sourceArchive.body.signals.some((signal) => signal.title.includes('Benchmark paper')));
  });
});

test('date archive endpoints return visible signals for today, week, and arbitrary ranges', async () => {
  const { servingService } = seedServingFixture();

  await withServer(servingService, async (baseUrl) => {
    const today = await getJson(baseUrl, '/api/dates/today');
    const week = await getJson(baseUrl, '/api/dates/week');
    const range = await getJson(baseUrl, '/api/dates?from=2026-04-20&to=2026-04-20');

    assert.equal(today.response.status, 200);
    assert.equal(today.body.range.label, 'today');
    assert.ok(today.body.signals.every((signal) => signal.primaryPublishedAt.startsWith('2026-04-21')));
    assert.equal(week.response.status, 200);
    assert.ok(week.body.signals.length >= today.body.signals.length);
    assert.equal(range.response.status, 200);
    assert.deepEqual(range.body.signals.map((signal) => signal.primaryPublishedAt.slice(0, 10)), ['2026-04-20']);
  });
});

test('topic endpoints list topics and return topic-specific signals', async () => {
  const { servingService } = seedServingFixture();

  await withServer(servingService, async (baseUrl) => {
    const topics = await getJson(baseUrl, '/api/topics');
    const agent = await getJson(baseUrl, '/api/topics/ai-agent');

    assert.equal(topics.response.status, 200);
    assert.ok(topics.body.topics.some((topic) => topic.slug === 'ai-agent' && topic.signalCount === 1));
    assert.equal(agent.response.status, 200);
    assert.equal(agent.body.topic.slug, 'ai-agent');
    assert.ok(agent.body.signals.every((signal) => signal.topics.some((topic) => topic.slug === 'ai-agent')));
  });
});

test('GET /api/search searches text and applies topic, source family, and date filters', async () => {
  const { servingService } = seedServingFixture();

  await withServer(servingService, async (baseUrl) => {
    const keyword = await getJson(baseUrl, '/api/search?q=enterprise%20Agent');
    const filtered = await getJson(baseUrl, '/api/search?q=agent&topic=research&sourceFamily=research&from=2026-04-20&to=2026-04-20');

    assert.equal(keyword.response.status, 200);
    assert.equal(keyword.body.query.q, 'enterprise Agent');
    assert.ok(keyword.body.results.some((result) => result.type === 'signal' && result.title.includes('Agent SDK')));
    assert.ok(keyword.body.results.some((result) => result.type === 'article' && result.title.includes('enterprise')));
    assert.equal(filtered.response.status, 200);
    assert.ok(filtered.body.results.length > 0);
    assert.ok(filtered.body.results.every((result) => result.sourceFamilies.includes('research')));
    assert.ok(filtered.body.results.every((result) => result.primaryPublishedAt.startsWith('2026-04-20')));
  });
});
