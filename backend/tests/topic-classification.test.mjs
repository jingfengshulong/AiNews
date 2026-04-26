import test from 'node:test';
import assert from 'node:assert/strict';

import { ArticleRepository } from '../src/ingestion/article-repository.ts';
import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { SignalRepository } from '../src/signal-processing/signal-repository.ts';
import { TopicClassifier } from '../src/signal-processing/topic-classifier.ts';
import { TopicRepository, defaultTopics } from '../src/signal-processing/topic-repository.ts';
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
    topicRepository: new TopicRepository(store)
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
    credentialRef: input.credentialRef,
    usagePolicy
  });
}

function createArticle(repository, patch) {
  return repository.upsertArticleCandidate({
    rawItemId: patch.rawItemId,
    sourceId: patch.sourceId,
    canonicalUrl: patch.canonicalUrl,
    title: patch.title,
    language: 'en',
    excerpt: patch.excerpt || patch.title,
    publishedAt: patch.publishedAt || '2026-04-21T08:00:00.000Z',
    author: patch.author || 'Example Author',
    textForAI: patch.textForAI || patch.title,
    fullTextDisplayAllowed: false,
    contentHash: patch.contentHash,
    extractionMeta: patch.extractionMeta || {}
  });
}

function createSignalWithArticle(runtime, { source, title, textForAI, rawItemId, contentHash }) {
  const article = createArticle(runtime.articleRepository, {
    rawItemId,
    sourceId: source.id,
    canonicalUrl: `https://example.com/${rawItemId}`,
    title,
    textForAI,
    contentHash
  });
  const signal = runtime.signalRepository.createSignal({
    title,
    primaryPublishedAt: article.publishedAt,
    status: 'candidate',
    enrichmentStatus: 'pending'
  });
  runtime.signalRepository.linkArticle({
    signalId: signal.id,
    articleId: article.id,
    role: 'lead'
  });
  return { signal, article };
}

test('topic repository seeds the default product topics', () => {
  const repository = new TopicRepository(new InMemoryStore());

  const seeded = repository.seedDefaultTopics();
  const slugs = seeded.map((topic) => topic.slug).sort();

  assert.deepEqual(slugs, defaultTopics.map((topic) => topic.slug).sort());
  assert.deepEqual(slugs, [
    'ai-agent',
    'ai-video',
    'company-announcements',
    'edge-models',
    'funding',
    'large-model-products',
    'policy',
    'research'
  ]);
});

test('topic classifier assigns multiple explainable rule topics to a signal', async () => {
  const runtime = createRuntime();
  const official = createSource(runtime.sourceService, {
    name: 'OpenAI News',
    family: 'company_announcement',
    trustScore: 0.95
  });
  const { signal } = createSignalWithArticle(runtime, {
    source: official,
    rawItemId: 'raw_agent',
    title: 'OpenAI releases Agent SDK tools for developers',
    textForAI: 'OpenAI announces an Agent SDK for tool use, autonomous workflow automation, and developer integrations.',
    contentHash: 'a'.repeat(64)
  });

  const result = await new TopicClassifier({
    topicRepository: runtime.topicRepository,
    signalRepository: runtime.signalRepository,
    articleRepository: runtime.articleRepository,
    sourceService: runtime.sourceService
  }).classifySignals();
  const assignments = runtime.topicRepository.listSignalTopics(signal.id);
  const slugs = assignments.map((assignment) => assignment.topicSlug).sort();

  assert.equal(result.classifiedSignals, 1);
  assert.ok(slugs.includes('ai-agent'));
  assert.ok(slugs.includes('company-announcements'));
  assert.ok(assignments.every((assignment) => assignment.method === 'rule'));
  assert.ok(assignments.every((assignment) => assignment.confidence >= 0.7));
  assert.ok(assignments.every((assignment) => assignment.reason));
  assert.ok(assignments.every((assignment) => assignment.evidence.matchedBy));
});

test('topic classifier does not treat community release wording as company announcements', async () => {
  const runtime = createRuntime();
  const community = createSource(runtime.sourceService, {
    name: 'Hacker News AI Search',
    sourceType: 'hacker_news',
    family: 'community',
    trustScore: 0.58
  });
  const { signal } = createSignalWithArticle(runtime, {
    source: community,
    rawItemId: 'raw_community_release',
    title: 'Show HN: ctxbrew releases LLM-friendly package context for agents',
    textForAI: 'ctxbrew releases LLM-friendly package context for AI agents and library maintainers.',
    contentHash: '5'.repeat(64)
  });

  await new TopicClassifier({
    topicRepository: runtime.topicRepository,
    signalRepository: runtime.signalRepository,
    articleRepository: runtime.articleRepository,
    sourceService: runtime.sourceService,
    topicSuggestionProvider: {
      suggestTopics: async () => ({
        topics: [
          { topicSlug: 'company-announcements', confidence: 0.99 },
          { topicSlug: 'ai-agent', confidence: 0.91 }
        ]
      })
    }
  }).classifySignals();
  const slugs = runtime.topicRepository.listSignalTopics(signal.id).map((assignment) => assignment.topicSlug);

  assert.ok(slugs.includes('ai-agent'));
  assert.ok(slugs.includes('large-model-products'));
  assert.equal(slugs.includes('company-announcements'), false);
});

test('topic classifier covers research, video, edge, policy, funding, and model product topics', async () => {
  const runtime = createRuntime();
  const research = createSource(runtime.sourceService, {
    name: 'arXiv AI Recent',
    sourceType: 'arxiv',
    family: 'research',
    apiEndpoint: 'https://export.arxiv.org/api/query?search_query=cat:cs.AI',
    trustScore: 0.9
  });
  const media = createSource(runtime.sourceService, {
    name: 'Tech Media',
    family: 'technology_media',
    trustScore: 0.7
  });
  const policy = createSource(runtime.sourceService, {
    name: 'Policy Watch',
    family: 'policy',
    trustScore: 0.72
  });
  const funding = createSource(runtime.sourceService, {
    name: 'Funding Wire',
    family: 'funding',
    trustScore: 0.66
  });
  const product = createSource(runtime.sourceService, {
    name: 'Product Launches',
    sourceType: 'product_hunt',
    family: 'product_launch',
    apiEndpoint: 'https://api.producthunt.com/v2/api/graphql',
    trustScore: 0.62,
    credentialRef: 'PRODUCT_HUNT_TOKEN'
  });

  const cases = [
    {
      expected: 'research',
      source: research,
      rawItemId: 'raw_research',
      title: 'New benchmark paper evaluates reasoning agents',
      textForAI: 'arXiv paper with benchmark, dataset, and evaluation results for AI systems.',
      contentHash: 'b'.repeat(64)
    },
    {
      expected: 'ai-video',
      source: media,
      rawItemId: 'raw_video',
      title: 'Google Veo update improves text-to-video generation',
      textForAI: 'The video generation model improves image-to-video editing and cinematic outputs.',
      contentHash: 'c'.repeat(64)
    },
    {
      expected: 'edge-models',
      source: media,
      rawItemId: 'raw_edge',
      title: 'On-device edge model runs local inference on mobile NPUs',
      textForAI: 'The compact model targets edge AI, on-device inference, mobile deployment, and NPU acceleration.',
      contentHash: 'd'.repeat(64)
    },
    {
      expected: 'policy',
      source: policy,
      rawItemId: 'raw_policy',
      title: 'EU AI Act guidance adds new model safety regulation',
      textForAI: 'Regulators publish policy guidance for compliance, safety reporting, and AI governance.',
      contentHash: 'e'.repeat(64)
    },
    {
      expected: 'funding',
      source: funding,
      rawItemId: 'raw_funding',
      title: 'AI startup raises Series A funding for enterprise agents',
      textForAI: 'The company raised new funding from investors at a higher valuation.',
      contentHash: 'f'.repeat(64)
    },
    {
      expected: 'large-model-products',
      source: product,
      rawItemId: 'raw_model',
      title: 'New LLM product launches GPT-style model workspace',
      textForAI: 'A large language model product launch with chat, model workspace, and developer API.',
      contentHash: '1'.repeat(64)
    }
  ];

  for (const item of cases) {
    createSignalWithArticle(runtime, item);
  }

  await new TopicClassifier({
    topicRepository: runtime.topicRepository,
    signalRepository: runtime.signalRepository,
    articleRepository: runtime.articleRepository,
    sourceService: runtime.sourceService
  }).classifySignals();

  for (const item of cases) {
    const signal = runtime.signalRepository.listSignals().find((candidate) => candidate.title === item.title);
    const slugs = runtime.topicRepository.listSignalTopics(signal.id).map((assignment) => assignment.topicSlug);
    assert.ok(slugs.includes(item.expected), `${item.title} should include ${item.expected}`);
  }
});

test('topic classifier uses controlled AI suggestions and ignores invalid topic labels', async () => {
  const runtime = createRuntime();
  const media = createSource(runtime.sourceService, {
    name: 'Creative Tools Daily',
    family: 'technology_media',
    trustScore: 0.7
  });
  const { signal } = createSignalWithArticle(runtime, {
    source: media,
    rawItemId: 'raw_ai_suggestion',
    title: 'Creative studio update adds multimodal timeline controls',
    textForAI: 'Creative studio update adds multimodal timeline controls for production teams.',
    contentHash: '3'.repeat(64)
  });
  const calls = [];

  const result = await new TopicClassifier({
    topicRepository: runtime.topicRepository,
    signalRepository: runtime.signalRepository,
    articleRepository: runtime.articleRepository,
    sourceService: runtime.sourceService,
    topicSuggestionProvider: {
      suggestTopics: async (context) => {
        calls.push(context.allowedTopics.map((topic) => topic.slug));
        return [
          { topicSlug: 'ai-video', confidence: 0.91, reason: 'AI matched this to production-oriented video tooling.' },
          { topicSlug: 'uncontrolled-label', confidence: 0.99, reason: 'This label is not part of the taxonomy.' }
        ];
      }
    }
  }).classifySignals();
  const assignments = runtime.topicRepository.listSignalTopics(signal.id);
  const slugs = assignments.map((assignment) => assignment.topicSlug);
  const aiVideo = assignments.find((assignment) => assignment.topicSlug === 'ai-video');

  assert.equal(result.classifiedSignals, 1);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('ai-video'));
  assert.ok(slugs.includes('ai-video'));
  assert.equal(slugs.includes('uncontrolled-label'), false);
  assert.equal(aiVideo.method, 'ai');
  assert.equal(aiVideo.evidence.matchedBy, 'ai_topic_provider');
});

test('topic classifier falls back to deterministic rules when AI suggestions are invalid', async () => {
  const runtime = createRuntime();
  const media = createSource(runtime.sourceService, {
    name: 'Developer Daily',
    family: 'technology_media',
    trustScore: 0.7
  });
  const { signal } = createSignalWithArticle(runtime, {
    source: media,
    rawItemId: 'raw_ai_fallback',
    title: 'OpenAI launches Agent SDK for developers',
    textForAI: 'Agent SDK for workflow automation and tool use.',
    contentHash: '4'.repeat(64)
  });

  await new TopicClassifier({
    topicRepository: runtime.topicRepository,
    signalRepository: runtime.signalRepository,
    articleRepository: runtime.articleRepository,
    sourceService: runtime.sourceService,
    topicSuggestionProvider: {
      suggestTopics: async () => [
        { topicSlug: 'not-in-taxonomy', confidence: 0.97, reason: 'Invalid label.' }
      ]
    }
  }).classifySignals();
  const assignments = runtime.topicRepository.listSignalTopics(signal.id);
  const slugs = assignments.map((assignment) => assignment.topicSlug);

  assert.ok(slugs.includes('ai-agent'));
  assert.equal(slugs.includes('not-in-taxonomy'), false);
  assert.equal(assignments.find((assignment) => assignment.topicSlug === 'ai-agent').method, 'rule');
});

test('topic classifier is idempotent when the same signal is classified again', async () => {
  const runtime = createRuntime();
  const media = createSource(runtime.sourceService, {
    name: 'Developer Daily',
    family: 'technology_media',
    trustScore: 0.7
  });
  const { signal } = createSignalWithArticle(runtime, {
    source: media,
    rawItemId: 'raw_repeat',
    title: 'OpenAI launches Agent SDK for developers',
    textForAI: 'Agent SDK for workflow automation and tool use.',
    contentHash: '2'.repeat(64)
  });
  const classifier = new TopicClassifier({
    topicRepository: runtime.topicRepository,
    signalRepository: runtime.signalRepository,
    articleRepository: runtime.articleRepository,
    sourceService: runtime.sourceService
  });

  await classifier.classifySignals();
  await classifier.classifySignals();

  const assignments = runtime.topicRepository.listSignalTopics(signal.id);

  assert.equal(assignments.filter((assignment) => assignment.topicSlug === 'ai-agent').length, 1);
});
