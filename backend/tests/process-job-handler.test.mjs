import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { ArticleFetcher } from '../src/ingestion/article-fetcher.ts';
import { ArticleRepository } from '../src/ingestion/article-repository.ts';
import { RawItemRepository } from '../src/ingestion/raw-item-repository.ts';
import { createProcessJobHandler, processQueuedJobs } from '../src/ingestion/process-job-handler.ts';
import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { InMemoryQueue } from '../src/queue/in-memory-queue.ts';
import { SourceRepository } from '../src/sources/source-repository.ts';
import { SourceService } from '../src/sources/source-service.ts';
import { createWorker } from '../src/worker/worker.ts';
import { createMemoryLogger } from '../src/logging/logger.ts';

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
    rawItemRepository: new RawItemRepository(store),
    articleRepository: new ArticleRepository(store),
    queue: new InMemoryQueue(store)
  };
}

test('process job processing can target current live run without claiming stale process jobs', async () => {
  const runtime = createRuntime();
  runtime.queue.enqueue('process', { rawItemId: 'raw_old', sourceId: 'src_1', runId: 'old-run' }, {
    jobKey: 'process:old',
    runAfter: new Date('2026-04-21T08:59:00.000Z')
  });
  const current = runtime.queue.enqueue('process', { rawItemId: 'raw_current', sourceId: 'src_1', runId: 'current-run' }, {
    jobKey: 'process:current',
    runAfter: new Date('2026-04-21T08:59:00.000Z')
  });

  const summary = await processQueuedJobs({
    queue: runtime.queue,
    lane: 'process',
    handler: async (job) => ({ rawItemId: job.payload.rawItemId }),
    limit: 1,
    now: new Date('2026-04-21T09:00:00.000Z'),
    filter: (job) => job.payload?.runId === 'current-run'
  });
  const oldJob = runtime.queue.list('process').find((job) => job.payload.runId === 'old-run');
  const currentJob = runtime.queue.list('process').find((job) => job.id === current.id);

  assert.equal(summary.completed, 1);
  assert.equal(oldJob.status, 'queued');
  assert.equal(currentJob.status, 'completed');
});

test('process job handler turns RSS raw items into article candidates and marks jobs complete', async () => {
  const html = await readFile(new URL('./fixtures/sample-article.html', import.meta.url), 'utf8');
  const runtime = createRuntime();
  const source = runtime.sourceService.createSource({
    name: 'Example RSS',
    sourceType: 'rss',
    family: 'company_announcement',
    feedUrl: 'https://example.com/feed.xml',
    language: 'en',
    fetchIntervalMinutes: 60,
    trustScore: 0.9,
    usagePolicy
  });
  const rawItem = runtime.rawItemRepository.upsertRawItem({
    sourceId: source.id,
    externalId: 'example-agent-2',
    fetchedAt: new Date('2026-04-21T08:30:00.000Z'),
    payload: {
      title: 'RSS Title',
      url: 'https://example.com/news/example-agent-2',
      publishedAt: '2026-04-21T08:15:00.000Z',
      summary: 'RSS summary is short.'
    },
    responseMeta: { feedFormat: 'rss', sourceLanguage: 'en' }
  });
  runtime.queue.enqueue('process', { rawItemId: rawItem.id, sourceId: source.id }, { jobKey: `process:${rawItem.id}` });

  const handler = createProcessJobHandler({
    rawItemRepository: runtime.rawItemRepository,
    sourceService: runtime.sourceService,
    articleFetcher: new ArticleFetcher({
      fetchImpl: async () => ({
        status: 200,
        headers: new Map([['content-type', 'text/html; charset=utf-8']]),
        text: async () => html
      })
    }),
    articleRepository: runtime.articleRepository
  });

  const summary = await processQueuedJobs({ queue: runtime.queue, lane: 'process', handler });
  const jobs = runtime.queue.list('process');
  const articles = runtime.articleRepository.listArticles();

  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 0);
  assert.equal(jobs[0].status, 'completed');
  assert.equal(jobs[0].result.normalizedType, 'article');
  assert.equal(articles.length, 1);
  assert.equal(articles[0].rawItemId, rawItem.id);
  assert.equal(articles[0].sourceId, source.id);
  assert.match(articles[0].textForAI, /policy-aware summarization/);
});

test('process job handler turns arXiv raw items into research-backed article candidates without fetching HTML', async () => {
  const runtime = createRuntime();
  const source = runtime.sourceService.createSource({
    name: 'arXiv AI Recent',
    sourceType: 'arxiv',
    family: 'research',
    apiEndpoint: 'https://export.arxiv.org/api/query?search_query=cat:cs.AI',
    language: 'en',
    fetchIntervalMinutes: 180,
    trustScore: 0.9,
    usagePolicy
  });
  const rawItem = runtime.rawItemRepository.upsertRawItem({
    sourceId: source.id,
    externalId: '2604.12345v1',
    fetchedAt: new Date('2026-04-21T10:30:00.000Z'),
    payload: {
      title: 'Agentic Retrieval for Enterprise AI Systems',
      url: 'http://arxiv.org/abs/2604.12345v1',
      publishedAt: '2026-04-20T18:30:00.000Z',
      updatedAt: '2026-04-21T09:00:00.000Z',
      author: 'Ada Example, Ben Researcher',
      authors: ['Ada Example', 'Ben Researcher'],
      summary: 'We introduce an agentic retrieval method for enterprise AI systems.',
      categories: ['cs.AI', 'cs.CL'],
      rawPayload: {
        arxivId: '2604.12345v1',
        abstract: 'We introduce an agentic retrieval method for enterprise AI systems.',
        pdfUrl: 'http://arxiv.org/pdf/2604.12345v1'
      }
    },
    responseMeta: { adapter: 'arxiv', sourceLanguage: 'en' }
  });
  runtime.queue.enqueue('process', { rawItemId: rawItem.id, sourceId: source.id }, { jobKey: `process:${rawItem.id}` });

  const handler = createProcessJobHandler({
    rawItemRepository: runtime.rawItemRepository,
    sourceService: runtime.sourceService,
    articleFetcher: new ArticleFetcher({
      fetchImpl: async () => {
        throw new Error('research normalization should not fetch HTML');
      }
    }),
    articleRepository: runtime.articleRepository
  });

  const summary = await processQueuedJobs({ queue: runtime.queue, lane: 'process', handler });
  const jobs = runtime.queue.list('process');
  const articles = runtime.articleRepository.listArticles();

  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 0);
  assert.equal(jobs[0].status, 'completed');
  assert.equal(jobs[0].result.normalizedType, 'research_article');
  assert.equal(articles.length, 1);
  assert.equal(articles[0].rawItemId, rawItem.id);
  assert.equal(articles[0].canonicalUrl, 'http://arxiv.org/abs/2604.12345v1');
  assert.match(articles[0].textForAI, /Source type: arxiv/);
  assert.match(articles[0].textForAI, /Agentic Retrieval for Enterprise AI Systems/);
  assert.match(articles[0].textForAI, /We introduce an agentic retrieval method/);
  assert.deepEqual(articles[0].extractionMeta.categories, ['cs.AI', 'cs.CL']);
  assert.equal(articles[0].fullTextDisplayAllowed, false);
});

test('process job handler turns Semantic Scholar raw items into research-backed article candidates', async () => {
  const runtime = createRuntime();
  const source = runtime.sourceService.createSource({
    name: 'Semantic Scholar AI Papers',
    sourceType: 'semantic_scholar',
    family: 'research',
    apiEndpoint: 'https://api.semanticscholar.org/graph/v1/paper/search',
    credentialRef: 'SEMANTIC_SCHOLAR_API_KEY',
    language: 'en',
    fetchIntervalMinutes: 240,
    trustScore: 0.84,
    usagePolicy
  });
  const rawItem = runtime.rawItemRepository.upsertRawItem({
    sourceId: source.id,
    externalId: 'ss-paper-1',
    fetchedAt: new Date('2026-04-21T10:30:00.000Z'),
    payload: {
      title: 'Benchmarks for Tool-Using Language Agents',
      url: 'https://www.semanticscholar.org/paper/ss-paper-1',
      publishedAt: '2026-04-19T00:00:00.000Z',
      authors: ['Chen Example', 'Dia Researcher'],
      summary: 'This paper evaluates tool-using language agents on multi-step research tasks.',
      rawPayload: {
        paperId: 'ss-paper-1',
        abstract: 'This paper evaluates tool-using language agents on multi-step research tasks.',
        fieldsOfStudy: ['Computer Science'],
        citationCount: 42,
        externalIds: { DOI: '10.0000/example.1' }
      }
    },
    responseMeta: { adapter: 'semantic_scholar', sourceLanguage: 'en' }
  });
  runtime.queue.enqueue('process', { rawItemId: rawItem.id, sourceId: source.id }, { jobKey: `process:${rawItem.id}` });

  const handler = createProcessJobHandler({
    rawItemRepository: runtime.rawItemRepository,
    sourceService: runtime.sourceService,
    articleFetcher: new ArticleFetcher({
      fetchImpl: async () => {
        throw new Error('research normalization should not fetch HTML');
      }
    }),
    articleRepository: runtime.articleRepository
  });

  const summary = await processQueuedJobs({ queue: runtime.queue, lane: 'process', handler });
  const articles = runtime.articleRepository.listArticles();

  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 0);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].canonicalUrl, 'https://www.semanticscholar.org/paper/ss-paper-1');
  assert.match(articles[0].textForAI, /Source type: semantic_scholar/);
  assert.match(articles[0].textForAI, /DOI: 10.0000\/example.1/);
  assert.match(articles[0].textForAI, /tool-using language agents/);
  assert.deepEqual(articles[0].extractionMeta.externalIds, { DOI: '10.0000/example.1' });
});

test('process job handler turns Crossref raw items into research-backed article candidates', async () => {
  const runtime = createRuntime();
  const source = runtime.sourceService.createSource({
    name: 'Crossref AI Works',
    sourceType: 'crossref',
    family: 'research',
    apiEndpoint: 'https://api.crossref.org/works?query=artificial%20intelligence',
    language: 'en',
    fetchIntervalMinutes: 720,
    trustScore: 0.76,
    usagePolicy
  });
  const rawItem = runtime.rawItemRepository.upsertRawItem({
    sourceId: source.id,
    externalId: '10.0000/example.crossref',
    fetchedAt: new Date('2026-04-21T10:30:00.000Z'),
    payload: {
      title: 'A Survey of Agent Evaluation Methods',
      url: 'https://doi.org/10.0000/example.crossref',
      publishedAt: '2026-04-18T00:00:00.000Z',
      rawPayload: {
        DOI: '10.0000/example.crossref',
        abstract: 'This survey compares evaluation methods for autonomous AI agents.',
        author: [{ name: 'Eve Scholar' }],
        subject: ['Artificial Intelligence', 'Evaluation']
      }
    },
    responseMeta: { adapter: 'crossref', sourceLanguage: 'en' }
  });
  runtime.queue.enqueue('process', { rawItemId: rawItem.id, sourceId: source.id }, { jobKey: `process:${rawItem.id}` });

  const handler = createProcessJobHandler({
    rawItemRepository: runtime.rawItemRepository,
    sourceService: runtime.sourceService,
    articleFetcher: new ArticleFetcher({
      fetchImpl: async () => {
        throw new Error('research normalization should not fetch HTML');
      }
    }),
    articleRepository: runtime.articleRepository
  });

  const summary = await processQueuedJobs({ queue: runtime.queue, lane: 'process', handler });
  const articles = runtime.articleRepository.listArticles();

  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 0);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].canonicalUrl, 'https://doi.org/10.0000/example.crossref');
  assert.match(articles[0].textForAI, /Source type: crossref/);
  assert.match(articles[0].textForAI, /DOI: 10.0000\/example.crossref/);
  assert.match(articles[0].textForAI, /This survey compares evaluation methods/);
  assert.deepEqual(articles[0].extractionMeta.categories, ['Artificial Intelligence', 'Evaluation']);
});

test('process job handler turns Product Hunt raw items into product launch candidates without fetching HTML', async () => {
  const runtime = createRuntime();
  const source = runtime.sourceService.createSource({
    name: 'Product Hunt AI Launches',
    sourceType: 'product_hunt',
    family: 'product_launch',
    apiEndpoint: 'https://api.producthunt.com/v2/api/graphql',
    credentialRef: 'PRODUCT_HUNT_TOKEN',
    language: 'en',
    fetchIntervalMinutes: 720,
    trustScore: 0.62,
    usagePolicy
  });
  const rawItem = runtime.rawItemRepository.upsertRawItem({
    sourceId: source.id,
    externalId: 'ph-post-1',
    fetchedAt: new Date('2026-04-21T10:30:00.000Z'),
    payload: {
      title: 'AgentOps AI',
      url: 'https://www.producthunt.com/posts/agentops-ai',
      publishedAt: '2026-04-21T09:00:00.000Z',
      summary: 'Observability for production AI agents',
      categories: ['Artificial Intelligence', 'Developer Tools'],
      authors: ['Pat Maker'],
      rawPayload: {
        id: 'ph-post-1',
        name: 'AgentOps AI',
        tagline: 'Observability for production AI agents',
        description: 'AgentOps AI helps teams monitor multi-step AI agents in production.',
        website: 'https://example.com/agentops-ai',
        votesCount: 420,
        commentsCount: 38,
        dailyRank: 2
      }
    },
    responseMeta: { adapter: 'product_hunt', sourceLanguage: 'en' }
  });
  runtime.queue.enqueue('process', { rawItemId: rawItem.id, sourceId: source.id }, { jobKey: `process:${rawItem.id}` });

  const handler = createProcessJobHandler({
    rawItemRepository: runtime.rawItemRepository,
    sourceService: runtime.sourceService,
    articleFetcher: new ArticleFetcher({
      fetchImpl: async () => {
        throw new Error('product launch normalization should not fetch HTML');
      }
    }),
    articleRepository: runtime.articleRepository
  });

  const summary = await processQueuedJobs({ queue: runtime.queue, lane: 'process', handler });
  const articles = runtime.articleRepository.listArticles();

  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 0);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].canonicalUrl, 'https://www.producthunt.com/posts/agentops-ai');
  assert.equal(summary.results[0].result.normalizedType, 'product_launch_article');
  assert.match(articles[0].textForAI, /Source type: product_hunt/);
  assert.match(articles[0].textForAI, /Votes: 420/);
  assert.match(articles[0].textForAI, /AgentOps AI helps teams/);
  assert.deepEqual(articles[0].extractionMeta.categories, ['Artificial Intelligence', 'Developer Tools']);
});

test('process job handler marks unsupported source types as failed without creating articles', async () => {
  const runtime = createRuntime();
  const source = {
    id: 'src_unsupported',
    sourceType: 'unsupported_api'
  };
  const rawItem = runtime.rawItemRepository.upsertRawItem({
    sourceId: source.id,
    externalId: 'launch-1',
    fetchedAt: new Date('2026-04-21T08:30:00.000Z'),
    payload: {
      title: 'AI Launch',
      url: 'https://example.com/product/ai-launch'
    },
    responseMeta: { adapter: 'product_hunt' }
  });
  runtime.sourceService.getSource = () => source;
  runtime.queue.enqueue('process', { rawItemId: rawItem.id, sourceId: source.id }, { jobKey: `process:${rawItem.id}` });

  const handler = createProcessJobHandler({
    rawItemRepository: runtime.rawItemRepository,
    sourceService: runtime.sourceService,
    articleFetcher: new ArticleFetcher({
      fetchImpl: async () => {
        throw new Error('should not fetch unsupported source');
      }
    }),
    articleRepository: runtime.articleRepository
  });

  const summary = await processQueuedJobs({ queue: runtime.queue, lane: 'process', handler });
  const jobs = runtime.queue.list('process');

  assert.equal(summary.completed, 0);
  assert.equal(summary.failed, 1);
  assert.equal(jobs[0].status, 'failed');
  assert.equal(jobs[0].lastErrorCategory, 'unsupported_source_type');
  assert.match(jobs[0].lastError, /No process normalizer/);
  assert.equal(runtime.articleRepository.listArticles().length, 0);
});

test('worker can run queued process jobs through the configured process handler', async () => {
  const html = await readFile(new URL('./fixtures/sample-article.html', import.meta.url), 'utf8');
  const runtime = createRuntime();
  const source = runtime.sourceService.createSource({
    name: 'Example RSS',
    sourceType: 'rss',
    family: 'company_announcement',
    feedUrl: 'https://example.com/feed.xml',
    language: 'en',
    fetchIntervalMinutes: 60,
    trustScore: 0.9,
    usagePolicy
  });
  const rawItem = runtime.rawItemRepository.upsertRawItem({
    sourceId: source.id,
    externalId: 'example-agent-worker',
    fetchedAt: new Date('2026-04-21T08:30:00.000Z'),
    payload: {
      title: 'RSS Title',
      url: 'https://example.com/news/example-agent-2',
      publishedAt: '2026-04-21T08:15:00.000Z',
      summary: 'RSS summary is short.'
    },
    responseMeta: { feedFormat: 'rss', sourceLanguage: 'en' }
  });
  runtime.queue.enqueue('process', { rawItemId: rawItem.id, sourceId: source.id }, { jobKey: `process:${rawItem.id}` });
  const handler = createProcessJobHandler({
    rawItemRepository: runtime.rawItemRepository,
    sourceService: runtime.sourceService,
    articleFetcher: new ArticleFetcher({
      fetchImpl: async () => ({
        status: 200,
        headers: new Map([['content-type', 'text/html; charset=utf-8']]),
        text: async () => html
      })
    }),
    articleRepository: runtime.articleRepository
  });
  const worker = createWorker({
    config: { runtimeMode: 'test', databaseUrl: 'memory', redisUrl: 'memory' },
    queue: runtime.queue,
    logger: createMemoryLogger(),
    processJobHandler: handler
  });

  const summary = await worker.runProcessJobs();

  assert.equal(summary.completed, 1);
  assert.equal(runtime.queue.list('process')[0].status, 'completed');
  assert.equal(runtime.articleRepository.listArticles().length, 1);
});
