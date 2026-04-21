import test from 'node:test';
import assert from 'node:assert/strict';

import { ArticleRepository } from '../src/ingestion/article-repository.ts';
import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { ScoreComponentRepository } from '../src/signal-processing/score-component-repository.ts';
import { SignalRepository } from '../src/signal-processing/signal-repository.ts';
import { SignalScoringService } from '../src/signal-processing/signal-scoring-service.ts';
import { SourceRelationRepository } from '../src/signal-processing/source-relation-repository.ts';
import { TopicRepository } from '../src/signal-processing/topic-repository.ts';
import { SourceRepository } from '../src/sources/source-repository.ts';
import { SourceService } from '../src/sources/source-service.ts';

const usagePolicy = {
  allowFullText: false,
  allowSummary: true,
  commercialUseNeedsReview: true,
  attributionRequired: true
};

function createRuntime() {
  const store = new InMemoryStore();
  const sourceService = new SourceService(new SourceRepository(store));
  return {
    store,
    sourceService,
    articleRepository: new ArticleRepository(store),
    signalRepository: new SignalRepository(store),
    sourceRelationRepository: new SourceRelationRepository(store),
    topicRepository: new TopicRepository(store),
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
    language: 'en',
    fetchIntervalMinutes: 60,
    trustScore: input.trustScore,
    usagePolicy
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
    publishedAt: patch.publishedAt,
    author: patch.author || 'Example Author',
    textForAI: patch.textForAI,
    fullTextDisplayAllowed: false,
    contentHash: patch.contentHash,
    extractionMeta: patch.extractionMeta || {}
  });
}

function createSignal(runtime, { title, publishedAt, articles, topics = [] }) {
  const signal = runtime.signalRepository.createSignal({
    title,
    primaryPublishedAt: publishedAt,
    status: 'candidate',
    enrichmentStatus: 'pending'
  });

  articles.forEach((article, index) => {
    runtime.signalRepository.linkArticle({
      signalId: signal.id,
      articleId: article.id,
      role: index === 0 ? 'lead' : 'supporting'
    });
    runtime.sourceRelationRepository.upsertRelation({
      sourceId: article.sourceId,
      articleId: article.id,
      signalId: signal.id,
      relationType: 'signal_support',
      evidence: {
        clusterScore: index === 0 ? 1 : 0.82,
        reasons: index === 0 ? ['lead_article'] : ['title_similarity', 'time_window', 'source_diversity']
      }
    });
  });

  runtime.topicRepository.seedDefaultTopics();
  for (const topic of topics) {
    runtime.topicRepository.upsertSignalTopic({
      signalId: signal.id,
      topicSlug: topic.slug,
      method: topic.method || 'rule',
      confidence: topic.confidence,
      reason: topic.reason || 'Test topic assignment.',
      evidence: { matchedBy: 'test' }
    });
  }

  return signal;
}

function createScoringService(runtime, now = '2026-04-21T12:00:00.000Z') {
  return new SignalScoringService({
    signalRepository: runtime.signalRepository,
    articleRepository: runtime.articleRepository,
    sourceService: runtime.sourceService,
    sourceRelationRepository: runtime.sourceRelationRepository,
    topicRepository: runtime.topicRepository,
    scoreComponentRepository: runtime.scoreComponentRepository,
    now: () => new Date(now)
  });
}

test('signal scoring rewards fresh multi-source confirmed duplicate evidence', () => {
  const runtime = createRuntime();
  const official = createSource(runtime.sourceService, {
    name: 'OpenAI News',
    family: 'company_announcement',
    trustScore: 0.95
  });
  const media = createSource(runtime.sourceService, {
    name: 'Tech Media',
    family: 'technology_media',
    trustScore: 0.7
  });
  const community = createSource(runtime.sourceService, {
    name: 'Hacker News AI',
    sourceType: 'hacker_news',
    family: 'community',
    apiEndpoint: 'https://hacker-news.firebaseio.com/v0/newstories.json',
    trustScore: 0.58
  });

  const hotLead = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_hot_1',
    sourceId: official.id,
    title: 'OpenAI launches Agent SDK for developers',
    excerpt: 'OpenAI launches an Agent SDK.',
    publishedAt: '2026-04-21T10:00:00.000Z',
    textForAI: 'OpenAI launches a new Agent SDK for developers with tool use and workflow automation.',
    contentHash: 'a'.repeat(64)
  });
  const hotMedia = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_hot_2',
    sourceId: media.id,
    title: 'OpenAI releases Agent SDK tools for developers',
    excerpt: 'Developers get new agent tools.',
    publishedAt: '2026-04-21T10:30:00.000Z',
    textForAI: 'Coverage of the OpenAI Agent SDK launch with developer tools and integrations.',
    contentHash: 'b'.repeat(64)
  });
  const hotCommunity = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_hot_3',
    sourceId: community.id,
    title: 'OpenAI Agent SDK discussion',
    excerpt: 'HN discussion about OpenAI Agent SDK.',
    publishedAt: '2026-04-21T11:00:00.000Z',
    textForAI: 'Community discussion with questions about the OpenAI Agent SDK.',
    contentHash: 'c'.repeat(64),
    extractionMeta: {
      community: {
        score: 180,
        commentsCount: 64
      }
    }
  });

  const hotSignal = createSignal(runtime, {
    title: hotLead.title,
    publishedAt: hotLead.publishedAt,
    articles: [hotLead, hotMedia, hotCommunity],
    topics: [
      { slug: 'ai-agent', confidence: 0.9 },
      { slug: 'company-announcements', confidence: 0.86 }
    ]
  });
  runtime.sourceRelationRepository.upsertRelation({
    sourceId: hotMedia.sourceId,
    articleId: hotMedia.id,
    relationType: 'duplicate_confirmed',
    evidence: {
      targetArticleId: hotLead.id,
      confidence: 0.98,
      scoreImpact: {
        duplicateSupport: true,
        heatBoost: 0.196,
        credibilityBoost: 0.118
      }
    }
  });

  const lowSource = createSource(runtime.sourceService, {
    name: 'Low Trust Blog',
    family: 'technology_media',
    trustScore: 0.4
  });
  const coldArticle = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_cold',
    sourceId: lowSource.id,
    title: 'Old AI tooling roundup',
    excerpt: 'A short old roundup.',
    publishedAt: '2026-04-01T09:00:00.000Z',
    textForAI: 'Short roundup.',
    contentHash: 'd'.repeat(64)
  });
  const coldSignal = createSignal(runtime, {
    title: coldArticle.title,
    publishedAt: coldArticle.publishedAt,
    articles: [coldArticle],
    topics: [{ slug: 'large-model-products', confidence: 0.58 }]
  });

  const result = createScoringService(runtime).scoreSignals();
  const scoredHot = runtime.signalRepository.getSignal(hotSignal.id);
  const scoredCold = runtime.signalRepository.getSignal(coldSignal.id);
  const hotComponents = runtime.scoreComponentRepository.listScoreComponents(hotSignal.id);

  assert.equal(result.scoredSignals, 2);
  assert.ok(scoredHot.heatScore > scoredCold.heatScore + 30);
  assert.ok(scoredHot.signalScore > scoredCold.signalScore + 20);
  assert.ok(scoredHot.heatScore <= 100);
  assert.ok(scoredHot.signalScore <= 100);
  assert.ok(hotComponents.some((component) => component.component === 'heat_duplicate_support' && component.value > 0));
  assert.ok(hotComponents.some((component) => component.component === 'heat_community_activity' && component.value > 0));
  assert.ok(hotComponents.some((component) => component.component === 'signal_source_trust' && component.value > 0.7));
});

test('signal scoring persists score components idempotently', () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: 'OpenAI News',
    family: 'company_announcement',
    trustScore: 0.95
  });
  const article = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_repeat',
    sourceId: source.id,
    title: 'OpenAI introduces model routing updates',
    excerpt: 'A model routing update.',
    publishedAt: '2026-04-21T08:00:00.000Z',
    textForAI: 'OpenAI introduces model routing updates for developer APIs.',
    contentHash: 'e'.repeat(64)
  });
  const signal = createSignal(runtime, {
    title: article.title,
    publishedAt: article.publishedAt,
    articles: [article],
    topics: [{ slug: 'large-model-products', confidence: 0.8 }]
  });
  const service = createScoringService(runtime);

  service.scoreSignals();
  const firstComponents = runtime.scoreComponentRepository.listScoreComponents(signal.id);
  service.scoreSignals();
  const secondComponents = runtime.scoreComponentRepository.listScoreComponents(signal.id);

  assert.ok(firstComponents.length >= 10);
  assert.equal(secondComponents.length, firstComponents.length);
  assert.deepEqual(
    secondComponents.map((component) => component.component).sort(),
    firstComponents.map((component) => component.component).sort()
  );
  assert.equal(new Set(secondComponents.map((component) => component.component)).size, secondComponents.length);
});

test('signal scoring treats possible duplicate evidence conservatively', () => {
  const runtime = createRuntime();
  const media = createSource(runtime.sourceService, {
    name: 'Tech Media',
    family: 'technology_media',
    trustScore: 0.7
  });
  const first = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_possible_1',
    sourceId: media.id,
    title: 'Agent benchmark results raise tool use questions',
    excerpt: 'Benchmark discussion.',
    publishedAt: '2026-04-21T08:00:00.000Z',
    textForAI: 'Benchmark discussion with possible relation to another story.',
    contentHash: 'f'.repeat(64)
  });
  const second = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_possible_2',
    sourceId: media.id,
    title: 'New agent benchmark evaluates tool use',
    excerpt: 'A related benchmark.',
    publishedAt: '2026-04-21T09:00:00.000Z',
    textForAI: 'Related but not confirmed duplicate agent benchmark story.',
    contentHash: '1'.repeat(64)
  });
  const signal = createSignal(runtime, {
    title: first.title,
    publishedAt: first.publishedAt,
    articles: [first, second],
    topics: [{ slug: 'ai-agent', confidence: 0.74 }]
  });
  runtime.sourceRelationRepository.upsertRelation({
    sourceId: second.sourceId,
    articleId: second.id,
    relationType: 'duplicate_candidate',
    evidence: {
      targetArticleId: first.id,
      confidence: 0.6,
      scoreImpact: {
        duplicateSupport: false,
        heatBoost: 0,
        credibilityBoost: 0
      }
    }
  });

  createScoringService(runtime).scoreSignal(signal.id);
  const components = runtime.scoreComponentRepository.listScoreComponents(signal.id);

  assert.equal(components.find((component) => component.component === 'heat_duplicate_support').value, 0);
  assert.equal(components.find((component) => component.component === 'signal_duplicate_confidence').value, 0);
});
