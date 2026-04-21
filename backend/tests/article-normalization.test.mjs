import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { ArticleFetcher } from '../src/ingestion/article-fetcher.ts';
import { ArticleRepository } from '../src/ingestion/article-repository.ts';
import { normalizeRawItemToArticleCandidate } from '../src/ingestion/article-normalizer.ts';
import { InMemoryStore } from '../src/db/in-memory-store.ts';

const source = {
  id: 'src_1',
  sourceType: 'rss',
  family: 'company_announcement',
  language: 'en',
  usagePolicy: {
    allowFullText: false,
    allowSummary: true,
    commercialUseNeedsReview: true,
    attributionRequired: true
  }
};

const rawItem = {
  id: 'raw_1',
  sourceId: 'src_1',
  externalId: 'https://example.com/news/example-agent-2',
  payload: {
    title: 'RSS Title',
    url: 'https://example.com/news/example-agent-2?utm_source=rss',
    publishedAt: '2026-04-21T08:15:00.000Z',
    summary: 'RSS summary is short.'
  },
  responseMeta: {
    feedFormat: 'rss',
    sourceLanguage: 'en'
  }
};

test('article fetcher extracts canonical metadata and backend-only text for AI processing', async () => {
  const html = await readFile(new URL('./fixtures/sample-article.html', import.meta.url), 'utf8');
  const requests = [];
  const fetcher = new ArticleFetcher({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        status: 200,
        headers: new Map([['content-type', 'text/html; charset=utf-8']]),
        text: async () => html
      };
    }
  });

  const article = await fetcher.fetchArticle({
    url: rawItem.payload.url,
    rawItem,
    source
  });

  assert.equal(requests[0].url, rawItem.payload.url);
  assert.match(requests[0].options.headers.Accept, /text\/html/);
  assert.equal(article.canonicalUrl, 'https://example.com/news/example-agent-2');
  assert.equal(article.title, 'Introducing Example Agent 2');
  assert.equal(article.author, 'Example Research');
  assert.equal(article.publishedAt, '2026-04-21T08:15:00.000Z');
  assert.match(article.textForAI, /multi-step enterprise workflows/);
  assert.match(article.textForAI, /policy-aware summarization/);
  assert.equal(article.excerpt, 'Example Agent 2 improves multi-step enterprise workflows.');
  assert.equal(article.fullTextDisplayAllowed, false);
  assert.match(article.contentHash, /^[a-f0-9]{64}$/);
});

test('article candidate repository deduplicates raw item normalization and preserves backend policy markers', async () => {
  const repository = new ArticleRepository(new InMemoryStore());
  const candidate = {
    rawItemId: rawItem.id,
    sourceId: source.id,
    canonicalUrl: 'https://example.com/news/example-agent-2',
    title: 'Introducing Example Agent 2',
    language: 'en',
    excerpt: 'Example Agent 2 improves multi-step enterprise workflows.',
    publishedAt: '2026-04-21T08:15:00.000Z',
    author: 'Example Research',
    textForAI: 'Backend-only article text for AI processing.',
    fullTextDisplayAllowed: false,
    contentHash: 'a'.repeat(64),
    extractionMeta: { extractor: 'readability', status: 200 }
  };

  const first = repository.upsertArticleCandidate(candidate);
  const duplicate = repository.upsertArticleCandidate(candidate);

  assert.equal(first.id, duplicate.id);
  assert.equal(repository.listArticles().length, 1);
  assert.equal(first.textForAI, 'Backend-only article text for AI processing.');
  assert.equal(first.fullTextDisplayAllowed, false);
  assert.equal(first.dedupeStatus, 'candidate');
});

test('normalizer fetches article page from raw item URL and creates an article candidate', async () => {
  const html = await readFile(new URL('./fixtures/sample-article.html', import.meta.url), 'utf8');
  const store = new InMemoryStore();
  const repository = new ArticleRepository(store);
  const fetcher = new ArticleFetcher({
    fetchImpl: async () => ({
      status: 200,
      headers: new Map([['content-type', 'text/html; charset=utf-8']]),
      text: async () => html
    })
  });

  const article = await normalizeRawItemToArticleCandidate({
    rawItem,
    source,
    fetcher,
    articleRepository: repository
  });

  assert.equal(article.rawItemId, rawItem.id);
  assert.equal(article.sourceId, source.id);
  assert.equal(article.canonicalUrl, 'https://example.com/news/example-agent-2');
  assert.equal(article.language, 'en');
  assert.equal(repository.listArticles().length, 1);
});
