import test from 'node:test';
import assert from 'node:assert/strict';

import { ArticleRepository } from '../src/ingestion/article-repository.ts';
import { ArticleDedupeService } from '../src/signal-processing/article-dedupe-service.ts';
import { SignalClusterService } from '../src/signal-processing/signal-cluster-service.ts';
import { SignalRepository } from '../src/signal-processing/signal-repository.ts';
import { SourceRelationRepository } from '../src/signal-processing/source-relation-repository.ts';
import { InMemoryStore } from '../src/db/in-memory-store.ts';
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
  const articleRepository = new ArticleRepository(store);
  const sourceRelationRepository = new SourceRelationRepository(store);
  return {
    store,
    sourceService,
    articleRepository,
    sourceRelationRepository,
    signalRepository: new SignalRepository(store)
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
    canonicalUrl: patch.canonicalUrl,
    title: patch.title,
    language: 'en',
    excerpt: patch.excerpt || 'Short excerpt for clustering.',
    publishedAt: patch.publishedAt,
    author: patch.author || 'Example Author',
    textForAI: patch.textForAI || 'Backend-only text for AI signal processing.',
    fullTextDisplayAllowed: false,
    contentHash: patch.contentHash,
    extractionMeta: patch.extractionMeta || {}
  });
}

test('signal clustering creates one signal from confirmed duplicate evidence and preserves support links', () => {
  const runtime = createRuntime();
  const official = createSource(runtime.sourceService, {
    name: 'OpenAI News',
    family: 'company_announcement',
    trustScore: 0.95
  });
  const media = createSource(runtime.sourceService, {
    name: 'Tech Media',
    family: 'technology_media',
    trustScore: 0.68
  });
  const lead = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_1',
    sourceId: official.id,
    canonicalUrl: 'https://openai.com/news/example-agent-sdk',
    title: 'OpenAI introduces Example Agent SDK',
    publishedAt: '2026-04-21T08:00:00.000Z',
    contentHash: 'a'.repeat(64)
  });
  const duplicate = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_2',
    sourceId: media.id,
    canonicalUrl: 'https://openai.com/news/example-agent-sdk',
    title: 'OpenAI introduces Example Agent SDK for developers',
    publishedAt: '2026-04-21T09:15:00.000Z',
    contentHash: 'b'.repeat(64)
  });

  new ArticleDedupeService({
    articleRepository: runtime.articleRepository,
    sourceRelationRepository: runtime.sourceRelationRepository
  }).dedupeArticles();

  const result = new SignalClusterService({
    articleRepository: runtime.articleRepository,
    signalRepository: runtime.signalRepository,
    sourceRelationRepository: runtime.sourceRelationRepository,
    sourceService: runtime.sourceService
  }).clusterArticles();
  const signals = runtime.signalRepository.listSignals();
  const links = runtime.signalRepository.listSignalArticles(signals[0].id);
  const supportRelations = runtime.sourceRelationRepository.listRelations()
    .filter((relation) => relation.relationType === 'signal_support');

  assert.equal(result.createdSignals, 1);
  assert.equal(result.linkedArticles, 2);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].title, lead.title);
  assert.equal(signals[0].status, 'candidate');
  assert.equal(signals[0].enrichmentStatus, 'pending');
  assert.equal(links.find((link) => link.articleId === lead.id).role, 'lead');
  assert.equal(links.find((link) => link.articleId === duplicate.id).role, 'supporting');
  assert.equal(supportRelations.length, 2);
  assert.ok(supportRelations.some((relation) => relation.articleId === duplicate.id && relation.evidence.reasons.includes('duplicate_confirmed')));
  assert.ok(supportRelations.every((relation) => relation.evidence.clusterScore >= 0.9));
});

test('signal clustering groups related articles by title, publication window, and source diversity', () => {
  const runtime = createRuntime();
  const official = createSource(runtime.sourceService, {
    name: 'OpenAI News',
    family: 'company_announcement',
    trustScore: 0.95
  });
  const media = createSource(runtime.sourceService, {
    name: 'Developer Daily',
    family: 'technology_media',
    trustScore: 0.7
  });
  const research = createSource(runtime.sourceService, {
    name: 'Research Feed',
    sourceType: 'arxiv',
    family: 'research',
    apiEndpoint: 'https://export.arxiv.org/api/query?search_query=cat:cs.AI',
    trustScore: 0.86
  });

  const mediaArticle = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_1',
    sourceId: media.id,
    canonicalUrl: 'https://media.example.com/openai-agent-sdk',
    title: 'OpenAI launches Agent SDK for developers',
    publishedAt: '2026-04-21T08:00:00.000Z',
    contentHash: 'c'.repeat(64)
  });
  const officialArticle = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_2',
    sourceId: official.id,
    canonicalUrl: 'https://openai.com/news/agent-sdk-developers',
    title: 'OpenAI releases Agent SDK tools for developers',
    publishedAt: '2026-04-21T09:00:00.000Z',
    contentHash: 'd'.repeat(64)
  });
  const separateArticle = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_3',
    sourceId: research.id,
    canonicalUrl: 'https://arxiv.org/abs/2604.00001',
    title: 'New benchmark evaluates multimodal video generation',
    publishedAt: '2026-04-21T10:00:00.000Z',
    contentHash: 'e'.repeat(64)
  });

  const result = new SignalClusterService({
    articleRepository: runtime.articleRepository,
    signalRepository: runtime.signalRepository,
    sourceRelationRepository: runtime.sourceRelationRepository,
    sourceService: runtime.sourceService
  }).clusterArticles();
  const signals = runtime.signalRepository.listSignals();
  const groupedSignal = signals.find((signal) => signal.title === officialArticle.title);
  const separateSignal = signals.find((signal) => signal.title === separateArticle.title);
  const groupedLinks = runtime.signalRepository.listSignalArticles(groupedSignal.id);
  const supportRelation = runtime.sourceRelationRepository.listRelations()
    .find((relation) => relation.relationType === 'signal_support' && relation.articleId === mediaArticle.id);

  assert.equal(result.createdSignals, 2);
  assert.equal(result.linkedArticles, 3);
  assert.equal(signals.length, 2);
  assert.equal(groupedLinks.length, 2);
  assert.equal(groupedLinks.find((link) => link.articleId === officialArticle.id).role, 'lead');
  assert.equal(groupedLinks.find((link) => link.articleId === mediaArticle.id).role, 'supporting');
  assert.ok(separateSignal);
  assert.ok(supportRelation.evidence.reasons.includes('title_similarity'));
  assert.ok(supportRelation.evidence.reasons.includes('time_window'));
  assert.ok(supportRelation.evidence.reasons.includes('source_diversity'));
});

test('signal clustering keeps similar titles separate when the publication window is too wide', () => {
  const runtime = createRuntime();
  const firstSource = createSource(runtime.sourceService, {
    name: 'First Source',
    family: 'technology_media',
    trustScore: 0.7
  });
  const secondSource = createSource(runtime.sourceService, {
    name: 'Second Source',
    family: 'technology_media',
    trustScore: 0.72
  });

  createArticle(runtime.articleRepository, {
    rawItemId: 'raw_1',
    sourceId: firstSource.id,
    canonicalUrl: 'https://first.example.com/openai-agent-sdk',
    title: 'OpenAI launches Agent SDK for developers',
    publishedAt: '2026-04-01T08:00:00.000Z',
    contentHash: 'f'.repeat(64)
  });
  createArticle(runtime.articleRepository, {
    rawItemId: 'raw_2',
    sourceId: secondSource.id,
    canonicalUrl: 'https://second.example.com/openai-agent-sdk-followup',
    title: 'OpenAI releases Agent SDK tools for developers',
    publishedAt: '2026-04-21T08:00:00.000Z',
    contentHash: '1'.repeat(64)
  });

  const result = new SignalClusterService({
    articleRepository: runtime.articleRepository,
    signalRepository: runtime.signalRepository,
    sourceRelationRepository: runtime.sourceRelationRepository,
    sourceService: runtime.sourceService
  }).clusterArticles();

  assert.equal(result.createdSignals, 2);
  assert.equal(result.linkedArticles, 2);
  assert.equal(runtime.signalRepository.listSignals().length, 2);
  assert.equal(runtime.sourceRelationRepository.listRelations().filter((relation) => relation.relationType === 'signal_support').length, 2);
});

test('signal clustering reuses existing signal when the same cluster is processed again', () => {
  const runtime = createRuntime();
  const official = createSource(runtime.sourceService, {
    name: 'OpenAI News',
    family: 'company_announcement',
    trustScore: 0.95
  });
  const media = createSource(runtime.sourceService, {
    name: 'Tech Media',
    family: 'technology_media',
    trustScore: 0.68
  });

  createArticle(runtime.articleRepository, {
    rawItemId: 'raw_1',
    sourceId: official.id,
    canonicalUrl: 'https://openai.com/news/example-agent-sdk',
    title: 'OpenAI launches Agent SDK for developers',
    publishedAt: '2026-04-21T08:00:00.000Z',
    contentHash: '2'.repeat(64)
  });
  createArticle(runtime.articleRepository, {
    rawItemId: 'raw_2',
    sourceId: media.id,
    canonicalUrl: 'https://media.example.com/openai-agent-sdk',
    title: 'OpenAI releases Agent SDK tools for developers',
    publishedAt: '2026-04-21T09:00:00.000Z',
    contentHash: '3'.repeat(64)
  });

  const service = new SignalClusterService({
    articleRepository: runtime.articleRepository,
    signalRepository: runtime.signalRepository,
    sourceRelationRepository: runtime.sourceRelationRepository,
    sourceService: runtime.sourceService
  });

  const first = service.clusterArticles();
  const second = service.clusterArticles();

  assert.equal(first.createdSignals, 1);
  assert.equal(second.createdSignals, 0);
  assert.equal(second.updatedSignals, 1);
  assert.equal(runtime.signalRepository.listSignals().length, 1);
  assert.equal(runtime.signalRepository.listSignalArticles().length, 2);
});

test('signal clustering replaces stale support links when an existing lead signal is reclustered', () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: 'Solidot',
    family: 'technology_media',
    trustScore: 0.68
  });

  const lead = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_1',
    sourceId: source.id,
    canonicalUrl: 'https://www.solidot.org/story?sid=84135',
    title: 'Solidot reports Linux maintainers remove stale kernel code',
    publishedAt: '2026-04-24T08:00:00.000Z',
    contentHash: '4'.repeat(64)
  });
  const unrelated = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_2',
    sourceId: source.id,
    canonicalUrl: 'https://www.solidot.org/story?sid=84136',
    title: 'Ubuntu 26.04 LTS is released with desktop updates',
    publishedAt: '2026-04-24T08:20:00.000Z',
    contentHash: '5'.repeat(64)
  });
  const pollutedSignal = runtime.signalRepository.createSignal({
    title: lead.title,
    primaryPublishedAt: lead.publishedAt,
    status: 'candidate',
    enrichmentStatus: 'completed'
  });
  runtime.signalRepository.linkArticle({ signalId: pollutedSignal.id, articleId: lead.id, role: 'lead' });
  runtime.signalRepository.linkArticle({ signalId: pollutedSignal.id, articleId: unrelated.id, role: 'supporting' });
  runtime.sourceRelationRepository.upsertRelation({
    sourceId: unrelated.sourceId,
    articleId: unrelated.id,
    signalId: pollutedSignal.id,
    relationType: 'signal_support',
    evidence: {
      clusterScore: 0.98,
      titleSimilarity: 0.2,
      reasons: ['duplicate_confirmed'],
      role: 'supporting'
    }
  });

  const result = new SignalClusterService({
    articleRepository: runtime.articleRepository,
    signalRepository: runtime.signalRepository,
    sourceRelationRepository: runtime.sourceRelationRepository,
    sourceService: runtime.sourceService
  }).clusterArticles();
  const pollutedLinks = runtime.signalRepository.listSignalArticles(pollutedSignal.id);
  const staleSupportRelations = runtime.sourceRelationRepository.listRelations()
    .filter((relation) => relation.relationType === 'signal_support' && relation.signalId === pollutedSignal.id && relation.articleId === unrelated.id);

  assert.equal(result.createdSignals, 1);
  assert.equal(result.updatedSignals, 1);
  assert.deepEqual(pollutedLinks.map((link) => link.articleId), [lead.id]);
  assert.equal(staleSupportRelations.length, 0);
});

test('signal clustering also prunes duplicate historical signals with the same lead article', () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: 'Solidot',
    family: 'technology_media',
    trustScore: 0.68
  });

  const lead = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_1',
    sourceId: source.id,
    canonicalUrl: 'https://www.solidot.org/story?sid=84135',
    title: 'Solidot reports Linux maintainers remove stale kernel code',
    publishedAt: '2026-04-24T08:00:00.000Z',
    contentHash: '8'.repeat(64)
  });
  const unrelated = createArticle(runtime.articleRepository, {
    rawItemId: 'raw_2',
    sourceId: source.id,
    canonicalUrl: 'https://www.solidot.org/story?sid=84136',
    title: 'Ubuntu 26.04 LTS is released with desktop updates',
    publishedAt: '2026-04-24T08:20:00.000Z',
    contentHash: '9'.repeat(64)
  });
  const cleanSignal = runtime.signalRepository.createSignal({
    title: lead.title,
    primaryPublishedAt: lead.publishedAt,
    status: 'candidate'
  });
  const historicalSignal = runtime.signalRepository.createSignal({
    title: lead.title,
    primaryPublishedAt: lead.publishedAt,
    status: 'candidate'
  });
  runtime.signalRepository.linkArticle({ signalId: cleanSignal.id, articleId: lead.id, role: 'lead' });
  runtime.signalRepository.linkArticle({ signalId: historicalSignal.id, articleId: lead.id, role: 'lead' });
  runtime.signalRepository.linkArticle({ signalId: historicalSignal.id, articleId: unrelated.id, role: 'supporting' });

  new SignalClusterService({
    articleRepository: runtime.articleRepository,
    signalRepository: runtime.signalRepository,
    sourceRelationRepository: runtime.sourceRelationRepository,
    sourceService: runtime.sourceService
  }).clusterArticles();

  assert.deepEqual(
    runtime.signalRepository.listSignalArticles(historicalSignal.id).map((link) => link.articleId),
    [lead.id]
  );
});

test('signal clustering keeps same-source title-only matches separate without duplicate evidence', () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, {
    name: 'OSChina',
    family: 'technology_media',
    trustScore: 0.66
  });

  createArticle(runtime.articleRepository, {
    rawItemId: 'raw_1',
    sourceId: source.id,
    canonicalUrl: 'https://www.oschina.net/news/437468/rspack-2-0-released',
    title: 'OSCHINA - Open Source AI Developer Community',
    publishedAt: '2026-04-27T08:00:00.000Z',
    contentHash: '6'.repeat(64)
  });
  createArticle(runtime.articleRepository, {
    rawItemId: 'raw_2',
    sourceId: source.id,
    canonicalUrl: 'https://www.oschina.net/news/437474',
    title: 'OSCHINA - Open Source AI Developer Community',
    publishedAt: '2026-04-27T08:10:00.000Z',
    contentHash: '7'.repeat(64)
  });

  const result = new SignalClusterService({
    articleRepository: runtime.articleRepository,
    signalRepository: runtime.signalRepository,
    sourceRelationRepository: runtime.sourceRelationRepository,
    sourceService: runtime.sourceService
  }).clusterArticles();

  assert.equal(result.createdSignals, 2);
  assert.equal(runtime.signalRepository.listSignals().length, 2);
  assert.equal(runtime.signalRepository.listSignalArticles().length, 2);
});
