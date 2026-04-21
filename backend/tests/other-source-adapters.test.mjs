import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { ArxivAdapter, parseArxivFeed } from '../src/ingestion/arxiv-adapter.ts';
import { CrossrefAdapter } from '../src/ingestion/crossref-adapter.ts';
import { HackerNewsAdapter } from '../src/ingestion/hacker-news-adapter.ts';
import { NewsApiAdapter } from '../src/ingestion/newsapi-adapter.ts';
import { ProductHuntAdapter } from '../src/ingestion/product-hunt-adapter.ts';
import { SemanticScholarAdapter } from '../src/ingestion/semantic-scholar-adapter.ts';
import { SourceFetchError } from '../src/ingestion/source-fetch-error.ts';
import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { InMemoryQueue } from '../src/queue/in-memory-queue.ts';
import { RawItemRepository } from '../src/ingestion/raw-item-repository.ts';
import { persistAdapterRecords } from '../src/ingestion/adapter-record-ingestion.ts';

test('arXiv adapter parses Atom entries into raw research records with paper metadata', async () => {
  const xml = await readFile(new URL('./fixtures/sample-arxiv.atom', import.meta.url), 'utf8');
  const records = parseArxivFeed({
    xml,
    source: { id: 'src_arxiv', sourceType: 'arxiv', language: 'en', apiEndpoint: 'https://export.arxiv.org/api/query?search_query=cat:cs.AI' },
    fetchedAt: new Date('2026-04-21T10:30:00.000Z'),
    responseMeta: { status: 200 }
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, '2604.12345v1');
  assert.equal(records[0].title, 'Agentic Retrieval for Enterprise AI Systems');
  assert.equal(records[0].url, 'http://arxiv.org/abs/2604.12345v1');
  assert.equal(records[0].publishedAt, '2026-04-20T18:30:00.000Z');
  assert.equal(records[0].updatedAt, '2026-04-21T09:00:00.000Z');
  assert.equal(records[0].summary.startsWith('We introduce an agentic retrieval method'), true);
  assert.deepEqual(records[0].authors, ['Ada Example', 'Ben Researcher']);
  assert.deepEqual(records[0].categories, ['cs.AI', 'cs.CL']);
  assert.equal(records[0].rawPayload.pdfUrl, 'http://arxiv.org/pdf/2604.12345v1');
  assert.equal(records[0].responseMeta.adapter, 'arxiv');
});

test('arXiv adapter fetches API endpoint with Atom accept header', async () => {
  const xml = await readFile(new URL('./fixtures/sample-arxiv.atom', import.meta.url), 'utf8');
  const requests = [];
  const adapter = new ArxivAdapter({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        status: 200,
        headers: new Map([['content-type', 'application/atom+xml']]),
        text: async () => xml
      };
    },
    now: () => new Date('2026-04-21T10:30:00.000Z')
  });

  const records = await adapter.fetchSource({
    id: 'src_arxiv',
    sourceType: 'arxiv',
    language: 'en',
    apiEndpoint: 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=1'
  });

  assert.equal(records.length, 1);
  assert.equal(requests[0].url, 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=1');
  assert.match(requests[0].options.headers.Accept, /application\/atom\+xml/);
});

test('NewsAPI adapter uses credential reference and maps response articles to raw records', async () => {
  const body = await readFile(new URL('./fixtures/sample-newsapi.json', import.meta.url), 'utf8');
  const requests = [];
  const adapter = new NewsApiAdapter({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => JSON.parse(body)
      };
    },
    getSecret: (name) => (name === 'NEWSAPI_KEY' ? 'test-newsapi-key' : undefined),
    now: () => new Date('2026-04-21T10:30:00.000Z')
  });

  const records = await adapter.fetchSource({
    id: 'src_newsapi',
    sourceType: 'newsapi',
    language: 'en',
    apiEndpoint: 'https://newsapi.org/v2/everything?q=artificial%20intelligence&pageSize=1',
    credentialRef: 'NEWSAPI_KEY'
  });

  assert.equal(records.length, 1);
  assert.equal(requests[0].options.headers['X-Api-Key'], 'test-newsapi-key');
  assert.equal(records[0].externalId, 'https://techcrunch.com/2026/04/21/ai-agent-startup-enterprise-workflow/');
  assert.equal(records[0].title, 'AI agent startup launches enterprise workflow tool');
  assert.equal(records[0].author, 'Jane Reporter');
  assert.equal(records[0].summary, 'The startup says its new agent product can automate multi-step enterprise workflows.');
  assert.equal(records[0].responseMeta.totalResults, 1);
});

test('NewsAPI adapter fails fast when credential is missing', async () => {
  const adapter = new NewsApiAdapter({ getSecret: () => undefined });

  await assert.rejects(
    () => adapter.fetchSource({
      id: 'src_newsapi',
      sourceType: 'newsapi',
      language: 'en',
      apiEndpoint: 'https://newsapi.org/v2/everything?q=ai',
      credentialRef: 'NEWSAPI_KEY'
    }),
    /Missing NewsAPI credential/
  );
});

test('Hacker News adapter fetches story ids, filters by query, and maps community metadata', async () => {
  const responses = new Map([
    ['https://hacker-news.firebaseio.com/v0/newstories.json', [101, 102]],
    ['https://hacker-news.firebaseio.com/v0/item/101.json', {
      id: 101,
      type: 'story',
      by: 'pg',
      time: 1776765600,
      title: 'Show HN: AI agent for reading research papers',
      url: 'https://example.com/ai-agent-research',
      score: 120,
      descendants: 45
    }],
    ['https://hacker-news.firebaseio.com/v0/item/102.json', {
      id: 102,
      type: 'story',
      by: 'hnuser',
      time: 1776765601,
      title: 'A database release with durable storage notes',
      url: 'https://example.com/database',
      score: 5,
      descendants: 2
    }]
  ]);
  const adapter = new HackerNewsAdapter({
    fetchImpl: async (url) => ({
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => responses.get(url)
    }),
    now: () => new Date('2026-04-21T10:30:00.000Z')
  });

  const records = await adapter.fetchSource({
    id: 'src_hn',
    sourceType: 'hacker_news',
    language: 'en',
    apiEndpoint: 'https://hacker-news.firebaseio.com/v0/newstories.json',
    query: 'AI',
    fetchLimit: 2
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, '101');
  assert.equal(records[0].title, 'Show HN: AI agent for reading research papers');
  assert.equal(records[0].url, 'https://example.com/ai-agent-research');
  assert.equal(records[0].author, 'pg');
  assert.equal(records[0].publishedAt, '2026-04-21T10:00:00.000Z');
  assert.equal(records[0].rawPayload.score, 120);
  assert.equal(records[0].rawPayload.commentsCount, 45);
  assert.equal(records[0].rawPayload.discussionUrl, 'https://news.ycombinator.com/item?id=101');
});

test('Semantic Scholar adapter supports public access and maps paper metadata to raw records', async () => {
  const body = await readFile(new URL('./fixtures/sample-semantic-scholar.json', import.meta.url), 'utf8');
  const requests = [];
  const adapter = new SemanticScholarAdapter({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => JSON.parse(body)
      };
    },
    getSecret: () => undefined,
    now: () => new Date('2026-04-21T10:30:00.000Z')
  });

  const records = await adapter.fetchSource({
    id: 'src_semantic',
    sourceType: 'semantic_scholar',
    language: 'en',
    apiEndpoint: 'https://api.semanticscholar.org/graph/v1/paper/search',
    query: 'artificial intelligence agents',
    fetchLimit: 1
  });

  const requestedUrl = new URL(requests[0].url);
  assert.equal(requestedUrl.origin + requestedUrl.pathname, 'https://api.semanticscholar.org/graph/v1/paper/search');
  assert.equal(requestedUrl.searchParams.get('query'), 'artificial intelligence agents');
  assert.match(requestedUrl.searchParams.get('fields'), /paperId/);
  assert.equal(requestedUrl.searchParams.get('limit'), '1');
  assert.equal(requests[0].options.headers['x-api-key'], undefined);
  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, 'ss-paper-1');
  assert.equal(records[0].title, 'Benchmarks for Tool-Using Language Agents');
  assert.equal(records[0].url, 'https://www.semanticscholar.org/paper/ss-paper-1');
  assert.equal(records[0].publishedAt, '2026-04-19T00:00:00.000Z');
  assert.deepEqual(records[0].authors, ['Chen Example', 'Dia Researcher']);
  assert.deepEqual(records[0].categories, ['Computer Science', 'Artificial Intelligence']);
  assert.equal(records[0].rawPayload.openAccessPdf.url, 'https://example.com/ss-paper-1.pdf');
  assert.equal(records[0].responseMeta.adapter, 'semantic_scholar');
  assert.equal(records[0].responseMeta.totalResults, 1);
});

test('Semantic Scholar adapter sends API key when a configured credential is available', async () => {
  const adapter = new SemanticScholarAdapter({
    fetchImpl: async (_url, options) => ({
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ data: [], total: 0, offset: 0, requestHeaders: options.headers })
    }),
    getSecret: (name) => (name === 'SEMANTIC_SCHOLAR_API_KEY' ? 'semantic-key' : undefined)
  });

  await adapter.fetchSource({
    id: 'src_semantic',
    sourceType: 'semantic_scholar',
    language: 'en',
    apiEndpoint: 'https://api.semanticscholar.org/graph/v1/paper/search',
    credentialRef: 'SEMANTIC_SCHOLAR_API_KEY'
  });

  assert.equal(adapter.lastRequestHeaders['x-api-key'], 'semantic-key');
});

test('Semantic Scholar adapter classifies HTTP 429 as retryable rate limit', async () => {
  const adapter = new SemanticScholarAdapter({
    fetchImpl: async () => ({
      status: 429,
      headers: new Map([['retry-after', '120']]),
      json: async () => ({})
    })
  });

  await assert.rejects(
    () => adapter.fetchSource({
      id: 'src_semantic',
      sourceType: 'semantic_scholar',
      language: 'en',
      apiEndpoint: 'https://api.semanticscholar.org/graph/v1/paper/search'
    }),
    (error) => error instanceof SourceFetchError
      && error.category === 'rate_limited'
      && error.retryable === true
      && error.status === 429
  );
});

test('Crossref adapter adds polite mailto and maps work metadata to raw records', async () => {
  const body = await readFile(new URL('./fixtures/sample-crossref.json', import.meta.url), 'utf8');
  const requests = [];
  const adapter = new CrossrefAdapter({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => JSON.parse(body)
      };
    },
    contactEmail: 'ai-news@example.com',
    now: () => new Date('2026-04-21T10:30:00.000Z')
  });

  const records = await adapter.fetchSource({
    id: 'src_crossref',
    sourceType: 'crossref',
    language: 'en',
    apiEndpoint: 'https://api.crossref.org/works?query=artificial%20intelligence',
    fetchLimit: 1
  });

  const requestedUrl = new URL(requests[0].url);
  assert.equal(requestedUrl.searchParams.get('mailto'), 'ai-news@example.com');
  assert.equal(requestedUrl.searchParams.get('rows'), '1');
  assert.match(requests[0].options.headers['User-Agent'], /mailto:ai-news@example.com/);
  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, '10.0000/example.crossref');
  assert.equal(records[0].title, 'A Survey of Agent Evaluation Methods');
  assert.equal(records[0].url, 'https://doi.org/10.0000/example.crossref');
  assert.equal(records[0].publishedAt, '2026-04-18T00:00:00.000Z');
  assert.deepEqual(records[0].authors, ['Eve Scholar']);
  assert.deepEqual(records[0].categories, ['Artificial Intelligence', 'Evaluation']);
  assert.match(records[0].summary, /autonomous AI agents/);
  assert.equal(records[0].rawPayload.DOI, '10.0000/example.crossref');
  assert.equal(records[0].responseMeta.adapter, 'crossref');
});

test('Product Hunt adapter classifies HTTP auth failure as non-retryable configuration error', async () => {
  const adapter = new ProductHuntAdapter({
    fetchImpl: async () => ({
      status: 401,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({})
    }),
    getSecret: () => 'bad-token'
  });

  await assert.rejects(
    () => adapter.fetchSource({
      id: 'src_producthunt',
      sourceType: 'product_hunt',
      language: 'en',
      apiEndpoint: 'https://api.producthunt.com/v2/api/graphql',
      credentialRef: 'PRODUCT_HUNT_TOKEN'
    }),
    (error) => error instanceof SourceFetchError
      && error.category === 'configuration_error'
      && error.retryable === false
      && error.status === 401
  );
});

test('Product Hunt adapter uses bearer token and maps launch posts to raw records', async () => {
  const body = await readFile(new URL('./fixtures/sample-product-hunt.json', import.meta.url), 'utf8');
  const requests = [];
  const adapter = new ProductHuntAdapter({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => JSON.parse(body)
      };
    },
    getSecret: (name) => (name === 'PRODUCT_HUNT_TOKEN' ? 'product-hunt-token' : undefined),
    now: () => new Date('2026-04-21T10:30:00.000Z')
  });

  const records = await adapter.fetchSource({
    id: 'src_producthunt',
    sourceType: 'product_hunt',
    language: 'en',
    apiEndpoint: 'https://api.producthunt.com/v2/api/graphql',
    credentialRef: 'PRODUCT_HUNT_TOKEN',
    query: 'artificial-intelligence',
    fetchLimit: 1
  });

  assert.equal(requests[0].url, 'https://api.producthunt.com/v2/api/graphql');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer product-hunt-token');
  assert.match(JSON.parse(requests[0].options.body).query, /posts/);
  assert.equal(JSON.parse(requests[0].options.body).variables.topic, 'artificial-intelligence');
  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, 'ph-post-1');
  assert.equal(records[0].title, 'AgentOps AI');
  assert.equal(records[0].url, 'https://www.producthunt.com/posts/agentops-ai');
  assert.equal(records[0].publishedAt, '2026-04-21T09:00:00.000Z');
  assert.equal(records[0].summary, 'Observability for production AI agents');
  assert.deepEqual(records[0].categories, ['Artificial Intelligence', 'Developer Tools']);
  assert.equal(records[0].rawPayload.website, 'https://example.com/agentops-ai');
  assert.equal(records[0].rawPayload.votesCount, 420);
  assert.equal(records[0].responseMeta.adapter, 'product_hunt');
});

test('Product Hunt adapter fails fast when credential is missing', async () => {
  const adapter = new ProductHuntAdapter({ getSecret: () => undefined });

  await assert.rejects(
    () => adapter.fetchSource({
      id: 'src_producthunt',
      sourceType: 'product_hunt',
      language: 'en',
      apiEndpoint: 'https://api.producthunt.com/v2/api/graphql',
      credentialRef: 'PRODUCT_HUNT_TOKEN'
    }),
    /Missing Product Hunt credential/
  );
});

test('adapter records persist to RawItem and enqueue process jobs', async () => {
  const store = new InMemoryStore();
  const rawItemRepository = new RawItemRepository(store);
  const queue = new InMemoryQueue(store);
  const result = persistAdapterRecords({
    source: { id: 'src_arxiv' },
    records: [{
      externalId: '2604.12345v1',
      title: 'Agentic Retrieval for Enterprise AI Systems',
      url: 'http://arxiv.org/abs/2604.12345v1',
      publishedAt: '2026-04-20T18:30:00.000Z',
      summary: 'We introduce an agentic retrieval method.',
      rawPayload: { arxivId: '2604.12345v1' },
      responseMeta: { adapter: 'arxiv' }
    }],
    rawItemRepository,
    queue,
    fetchedAt: new Date('2026-04-21T10:30:00.000Z')
  });

  assert.equal(result.created.length, 1);
  assert.equal(rawItemRepository.listRawItems().length, 1);
  assert.equal(queue.list('process').length, 1);
  assert.equal(queue.list('process')[0].payload.rawItemId, result.created[0].id);
});
