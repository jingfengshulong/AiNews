import test from 'node:test';
import assert from 'node:assert/strict';

import { ArticleRepository } from '../src/ingestion/article-repository.ts';
import { ArticleDedupeService } from '../src/signal-processing/article-dedupe-service.ts';
import { SourceRelationRepository } from '../src/signal-processing/source-relation-repository.ts';
import { InMemoryStore } from '../src/db/in-memory-store.ts';

function createArticle(repository, patch = {}) {
  return repository.upsertArticleCandidate({
    rawItemId: patch.rawItemId,
    sourceId: patch.sourceId,
    canonicalUrl: patch.canonicalUrl,
    title: patch.title,
    language: 'en',
    excerpt: patch.excerpt || 'Short excerpt for the article.',
    publishedAt: patch.publishedAt || '2026-04-21T08:00:00.000Z',
    author: patch.author || 'Example Author',
    textForAI: patch.textForAI || 'Backend-only text for AI processing.',
    fullTextDisplayAllowed: false,
    contentHash: patch.contentHash,
    extractionMeta: patch.extractionMeta || {}
  });
}

test('article dedupe confirms canonical URL matches and preserves duplicate support for scoring', () => {
  const store = new InMemoryStore();
  const articles = new ArticleRepository(store);
  const relations = new SourceRelationRepository(store);
  const service = new ArticleDedupeService({ articleRepository: articles, sourceRelationRepository: relations });

  const lead = createArticle(articles, {
    rawItemId: 'raw_1',
    sourceId: 'src_official',
    canonicalUrl: 'https://openai.com/news/example-agent',
    title: 'OpenAI introduces Example Agent',
    contentHash: 'a'.repeat(64)
  });
  const duplicate = createArticle(articles, {
    rawItemId: 'raw_2',
    sourceId: 'src_media',
    canonicalUrl: 'https://openai.com/news/example-agent',
    title: 'OpenAI introduces Example Agent for enterprise teams',
    contentHash: 'b'.repeat(64)
  });

  const result = service.dedupeArticles();
  const updated = articles.listArticles();
  const relation = relations.listRelations()[0];

  assert.equal(result.confirmedDuplicates, 1);
  assert.equal(result.possibleDuplicates, 0);
  assert.equal(updated.find((article) => article.id === lead.id).dedupeStatus, 'canonical');
  assert.equal(updated.find((article) => article.id === duplicate.id).dedupeStatus, 'duplicate');
  assert.equal(relation.relationType, 'duplicate_confirmed');
  assert.equal(relation.articleId, duplicate.id);
  assert.equal(relation.sourceId, duplicate.sourceId);
  assert.equal(relation.evidence.targetArticleId, lead.id);
  assert.deepEqual(relation.evidence.reasons, ['canonical_url']);
  assert.equal(relation.evidence.scoreImpact.duplicateSupport, true);
  assert.ok(relation.evidence.scoreImpact.heatBoost > 0);
  assert.ok(relation.evidence.scoreImpact.credibilityBoost > 0);
});

test('article dedupe confirms exact content hash matches even when canonical URLs differ', () => {
  const store = new InMemoryStore();
  const articles = new ArticleRepository(store);
  const relations = new SourceRelationRepository(store);
  const service = new ArticleDedupeService({ articleRepository: articles, sourceRelationRepository: relations });

  const sharedHash = 'c'.repeat(64);
  const lead = createArticle(articles, {
    rawItemId: 'raw_1',
    sourceId: 'src_wire',
    canonicalUrl: 'https://wire.example.com/ai/model-release',
    title: 'AI startup releases compact video model',
    contentHash: sharedHash
  });
  const duplicate = createArticle(articles, {
    rawItemId: 'raw_2',
    sourceId: 'src_partner',
    canonicalUrl: 'https://partner.example.com/story/compact-video-model',
    title: 'AI startup releases compact video model',
    contentHash: sharedHash
  });

  const result = service.dedupeArticles();
  const updated = articles.listArticles();
  const relation = relations.listRelations()[0];

  assert.equal(result.confirmedDuplicates, 1);
  assert.equal(updated.find((article) => article.id === lead.id).dedupeStatus, 'canonical');
  assert.equal(updated.find((article) => article.id === duplicate.id).dedupeStatus, 'duplicate');
  assert.deepEqual(relation.evidence.reasons, ['content_hash']);
});

test('article dedupe does not confirm same-source content hash matches across different URLs', () => {
  const store = new InMemoryStore();
  const articles = new ArticleRepository(store);
  const relations = new SourceRelationRepository(store);
  const service = new ArticleDedupeService({ articleRepository: articles, sourceRelationRepository: relations });

  const sharedHash = 'c'.repeat(64);
  createArticle(articles, {
    rawItemId: 'raw_1',
    sourceId: 'src_oschina',
    canonicalUrl: 'https://www.oschina.net/news/437468/rspack-2-0-released',
    title: 'OSCHINA - Open Source AI Developer Community',
    contentHash: sharedHash
  });
  createArticle(articles, {
    rawItemId: 'raw_2',
    sourceId: 'src_oschina',
    canonicalUrl: 'https://www.oschina.net/news/437474',
    title: 'OSCHINA - Open Source AI Developer Community',
    contentHash: sharedHash
  });

  const result = service.dedupeArticles();

  assert.equal(result.confirmedDuplicates, 0);
  assert.equal(relations.listRelations().filter((relation) => relation.relationType === 'duplicate_confirmed').length, 0);
});

test('article dedupe does not confirm same-source canonical matches without corroborating evidence', () => {
  const store = new InMemoryStore();
  const articles = new ArticleRepository(store);
  const relations = new SourceRelationRepository(store);
  const service = new ArticleDedupeService({ articleRepository: articles, sourceRelationRepository: relations });

  const first = createArticle(articles, {
    rawItemId: 'raw_1',
    sourceId: 'src_solidot',
    canonicalUrl: 'https://www.solidot.org/',
    title: 'Solidot reports Linux maintainers remove stale kernel code',
    publishedAt: '2026-04-24T08:00:00.000Z',
    contentHash: '1'.repeat(64)
  });
  const second = createArticle(articles, {
    rawItemId: 'raw_2',
    sourceId: 'src_solidot',
    canonicalUrl: 'https://www.solidot.org/',
    title: 'Ubuntu 26.04 LTS is released with desktop updates',
    publishedAt: '2026-04-24T08:20:00.000Z',
    contentHash: '2'.repeat(64)
  });

  const result = service.dedupeArticles();
  const updated = articles.listArticles();

  assert.equal(result.confirmedDuplicates, 0);
  assert.equal(result.possibleDuplicates, 0);
  assert.equal(updated.find((article) => article.id === first.id).dedupeStatus, 'candidate');
  assert.equal(updated.find((article) => article.id === second.id).dedupeStatus, 'candidate');
  assert.equal(relations.listRelations().filter((relation) => relation.relationType === 'duplicate_confirmed').length, 0);
});

test('article dedupe removes stale confirmed duplicate relations when canonical URLs diverge', () => {
  const store = new InMemoryStore();
  const articles = new ArticleRepository(store);
  const relations = new SourceRelationRepository(store);
  const service = new ArticleDedupeService({ articleRepository: articles, sourceRelationRepository: relations });

  const lead = createArticle(articles, {
    rawItemId: 'raw_1',
    sourceId: 'src_solidot',
    canonicalUrl: 'https://www.solidot.org/story?sid=84135',
    title: 'Solidot reports Linux maintainers remove stale kernel code',
    publishedAt: '2026-04-24T08:00:00.000Z',
    contentHash: '3'.repeat(64)
  });
  const unrelated = createArticle(articles, {
    rawItemId: 'raw_2',
    sourceId: 'src_solidot',
    canonicalUrl: 'https://www.solidot.org/story?sid=84136',
    title: 'Ubuntu 26.04 LTS is released with desktop updates',
    publishedAt: '2026-04-24T08:20:00.000Z',
    contentHash: '4'.repeat(64)
  });

  relations.upsertRelation({
    sourceId: unrelated.sourceId,
    articleId: unrelated.id,
    relationType: 'duplicate_confirmed',
    evidence: {
      confidence: 0.98,
      titleSimilarity: 0.2,
      hoursApart: 0.33,
      reasons: ['canonical_url'],
      targetArticleId: lead.id,
      scoreImpact: {
        duplicateSupport: true,
        heatBoost: 0.196,
        credibilityBoost: 0.118
      },
      detectedAt: '2026-04-24T08:30:00.000Z'
    }
  });

  service.dedupeArticles();

  assert.equal(relations.listRelations().filter((relation) => relation.relationType === 'duplicate_confirmed').length, 0);
});

test('article dedupe does not confirm same-source title-only matches', () => {
  const store = new InMemoryStore();
  const articles = new ArticleRepository(store);
  const relations = new SourceRelationRepository(store);
  const service = new ArticleDedupeService({ articleRepository: articles, sourceRelationRepository: relations });

  createArticle(articles, {
    rawItemId: 'raw_1',
    sourceId: 'src_oschina',
    canonicalUrl: 'https://www.oschina.net/news/437468/rspack-2-0-released',
    title: 'OSCHINA - Open Source AI Developer Community',
    publishedAt: '2026-04-27T08:00:00.000Z',
    contentHash: '5'.repeat(64)
  });
  createArticle(articles, {
    rawItemId: 'raw_2',
    sourceId: 'src_oschina',
    canonicalUrl: 'https://www.oschina.net/news/437474',
    title: 'OSCHINA - Open Source AI Developer Community',
    publishedAt: '2026-04-27T08:10:00.000Z',
    contentHash: '6'.repeat(64)
  });

  const result = service.dedupeArticles();

  assert.equal(result.confirmedDuplicates, 0);
  assert.equal(relations.listRelations().filter((relation) => relation.relationType === 'duplicate_confirmed').length, 0);
});

test('article dedupe keeps low-confidence title matches as conservative candidates', () => {
  const store = new InMemoryStore();
  const articles = new ArticleRepository(store);
  const relations = new SourceRelationRepository(store);
  const service = new ArticleDedupeService({ articleRepository: articles, sourceRelationRepository: relations });

  const first = createArticle(articles, {
    rawItemId: 'raw_1',
    sourceId: 'src_research',
    canonicalUrl: 'https://example.com/research/agent-benchmark',
    title: 'New agent benchmark evaluates tool use',
    contentHash: 'd'.repeat(64)
  });
  const second = createArticle(articles, {
    rawItemId: 'raw_2',
    sourceId: 'src_media',
    canonicalUrl: 'https://example.net/news/agent-benchmark-analysis',
    title: 'Agent benchmark results raise tool use questions',
    contentHash: 'e'.repeat(64)
  });

  const result = service.dedupeArticles();
  const updated = articles.listArticles();
  const relation = relations.listRelations()[0];

  assert.equal(result.confirmedDuplicates, 0);
  assert.equal(result.possibleDuplicates, 1);
  assert.equal(updated.find((article) => article.id === first.id).dedupeStatus, 'candidate');
  assert.equal(updated.find((article) => article.id === second.id).dedupeStatus, 'possible_duplicate');
  assert.equal(relation.relationType, 'duplicate_candidate');
  assert.equal(relation.articleId, second.id);
  assert.equal(relation.evidence.targetArticleId, first.id);
  assert.equal(relation.evidence.scoreImpact.duplicateSupport, false);
  assert.ok(relation.evidence.titleSimilarity >= 0.5);
  assert.ok(relation.evidence.titleSimilarity < 0.82);
});
