import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { InMemoryQueue } from '../src/queue/in-memory-queue.ts';
import { RawItemRepository } from '../src/ingestion/raw-item-repository.ts';
import { SourceFetchError } from '../src/ingestion/source-fetch-error.ts';
import { createFetchJobHandler, processFetchJobs } from '../src/ingestion/fetch-job-handler.ts';
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
const dueBeforeTestNow = new Date('2026-04-21T08:59:00.000Z');

function createRuntime() {
  const store = new InMemoryStore();
  const sourceService = new SourceService(new SourceRepository(store));
  return {
    store,
    sourceService,
    rawItemRepository: new RawItemRepository(store),
    queue: new InMemoryQueue(store)
  };
}

function createSource(sourceService, patch = {}) {
  return sourceService.createSource({
    name: 'Fetch Test RSS',
    sourceType: 'rss',
    family: 'technology_media',
    feedUrl: 'https://example.com/feed.xml',
    language: 'en',
    fetchIntervalMinutes: 60,
    trustScore: 0.8,
    usagePolicy,
    ...patch
  });
}

test('fetch job handler persists adapter records, enqueues process jobs, and marks source healthy', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService);
  runtime.queue.enqueue('fetch', { sourceId: source.id, sourceType: source.sourceType }, { jobKey: `fetch:${source.id}`, runAfter: dueBeforeTestNow });

  const handler = createFetchJobHandler({
    sourceService: runtime.sourceService,
    rawItemRepository: runtime.rawItemRepository,
    queue: runtime.queue,
    adapters: {
      rss: {
        fetchSource: async () => [{
          externalId: 'item-1',
          title: 'A new AI system ships',
          url: 'https://example.com/item-1',
          publishedAt: '2026-04-21T08:00:00.000Z',
          summary: 'A short summary.',
          rawPayload: { guid: 'item-1' },
          responseMeta: { adapter: 'test' }
        }]
      }
    }
  });

  const summary = await processFetchJobs({ queue: runtime.queue, handler, now: new Date('2026-04-21T09:00:00.000Z') });

  assert.equal(summary.completed, 1);
  assert.equal(summary.retried, 0);
  assert.equal(summary.failed, 0);
  assert.equal(runtime.rawItemRepository.listRawItems().length, 1);
  assert.equal(runtime.queue.list('process').length, 1);
  assert.equal(runtime.queue.list('fetch')[0].status, 'completed');
  assert.equal(runtime.sourceService.getSource(source.id).health.failureCount, 0);
  assert.equal(runtime.sourceService.getSource(source.id).health.lastSuccessfulAt, '2026-04-21T09:00:00.000Z');
});

test('fetch job processing can target the current live run without claiming stale queued jobs', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService);
  runtime.queue.enqueue('fetch', { sourceId: source.id, sourceType: source.sourceType, runId: 'old-run' }, {
    jobKey: `fetch:${source.id}:old`,
    runAfter: dueBeforeTestNow
  });
  runtime.queue.enqueue('fetch', { sourceId: source.id, sourceType: source.sourceType, runId: 'current-run' }, {
    jobKey: `fetch:${source.id}:current`,
    runAfter: dueBeforeTestNow
  });

  const handler = createFetchJobHandler({
    sourceService: runtime.sourceService,
    rawItemRepository: runtime.rawItemRepository,
    queue: runtime.queue,
    adapters: {
      rss: {
        fetchSource: async () => [{
          externalId: 'current-item',
          title: 'Current run AI item',
          url: 'https://example.com/current-item',
          publishedAt: '2026-04-21T08:00:00.000Z',
          summary: 'A short summary.',
          rawPayload: { guid: 'current-item' },
          responseMeta: { adapter: 'test' }
        }]
      }
    }
  });

  const summary = await processFetchJobs({
    queue: runtime.queue,
    handler,
    limit: 1,
    now: new Date('2026-04-21T09:00:00.000Z'),
    filter: (job) => job.payload?.runId === 'current-run'
  });
  const oldJob = runtime.queue.list('fetch').find((job) => job.payload.runId === 'old-run');
  const currentJob = runtime.queue.list('fetch').find((job) => job.payload.runId === 'current-run');

  assert.equal(summary.completed, 1);
  assert.equal(oldJob.status, 'queued');
  assert.equal(currentJob.status, 'completed');
  assert.equal(runtime.rawItemRepository.listRawItems().length, 1);
  assert.equal(runtime.queue.list('process')[0].payload.runId, 'current-run');
});

test('fetch job handler delays rate-limited jobs and source next fetch time', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService);
  runtime.queue.enqueue('fetch', { sourceId: source.id, sourceType: source.sourceType }, { jobKey: `fetch:${source.id}`, runAfter: dueBeforeTestNow });
  const retryAt = new Date('2026-04-21T09:15:00.000Z');

  const handler = createFetchJobHandler({
    sourceService: runtime.sourceService,
    rawItemRepository: runtime.rawItemRepository,
    queue: runtime.queue,
    adapters: {
      rss: {
        fetchSource: async () => {
          throw new SourceFetchError('rate limited', {
            category: 'rate_limited',
            retryable: true,
            retryAfter: retryAt
          });
        }
      }
    },
    maxAttempts: 3
  });

  const summary = await processFetchJobs({ queue: runtime.queue, handler, now: new Date('2026-04-21T09:00:00.000Z') });
  const job = runtime.queue.list('fetch')[0];
  const updatedSource = runtime.sourceService.getSource(source.id);

  assert.equal(summary.completed, 0);
  assert.equal(summary.retried, 1);
  assert.equal(summary.failed, 0);
  assert.equal(job.status, 'queued');
  assert.equal(job.runAfter, '2026-04-21T09:15:00.000Z');
  assert.equal(job.lastErrorCategory, 'rate_limited');
  assert.equal(updatedSource.nextFetchAt, '2026-04-21T09:15:00.000Z');
  assert.equal(updatedSource.health.failureCount, 1);
  assert.equal(updatedSource.health.lastErrorCategory, 'rate_limited');
});

test('fetch job handler retries transient failures with bounded exponential backoff', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService);
  runtime.queue.enqueue('fetch', { sourceId: source.id, sourceType: source.sourceType }, { jobKey: `fetch:${source.id}`, runAfter: dueBeforeTestNow });

  const handler = createFetchJobHandler({
    sourceService: runtime.sourceService,
    rawItemRepository: runtime.rawItemRepository,
    queue: runtime.queue,
    adapters: {
      rss: {
        fetchSource: async () => {
          throw new SourceFetchError('upstream unavailable', {
            category: 'transient_failure',
            retryable: true
          });
        }
      }
    },
    maxAttempts: 3,
    baseBackoffMs: 60_000
  });

  const summary = await processFetchJobs({ queue: runtime.queue, handler, now: new Date('2026-04-21T09:00:00.000Z') });
  const job = runtime.queue.list('fetch')[0];

  assert.equal(summary.retried, 1);
  assert.equal(job.status, 'queued');
  assert.equal(job.attempts, 1);
  assert.equal(job.runAfter, '2026-04-21T09:02:00.000Z');
  assert.equal(job.lastErrorCategory, 'transient_failure');
});

test('fetch job handler fails non-retryable configuration errors without retrying', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService, { sourceType: 'newsapi', apiEndpoint: 'https://newsapi.org/v2/everything?q=ai', credentialRef: 'NEWSAPI_KEY', feedUrl: undefined });
  runtime.queue.enqueue('fetch', { sourceId: source.id, sourceType: source.sourceType }, { jobKey: `fetch:${source.id}`, runAfter: dueBeforeTestNow });

  const handler = createFetchJobHandler({
    sourceService: runtime.sourceService,
    rawItemRepository: runtime.rawItemRepository,
    queue: runtime.queue,
    adapters: {
      newsapi: {
        fetchSource: async () => {
          throw new SourceFetchError('missing credential', {
            category: 'configuration_error',
            retryable: false
          });
        }
      }
    },
    maxAttempts: 3
  });

  const summary = await processFetchJobs({ queue: runtime.queue, handler, now: new Date('2026-04-21T09:00:00.000Z') });
  const job = runtime.queue.list('fetch')[0];
  const updatedSource = runtime.sourceService.getSource(source.id);

  assert.equal(summary.completed, 0);
  assert.equal(summary.retried, 0);
  assert.equal(summary.failed, 1);
  assert.equal(job.status, 'failed');
  assert.equal(job.lastErrorCategory, 'configuration_error');
  assert.equal(updatedSource.health.failureCount, 1);
  assert.equal(updatedSource.health.lastErrorCategory, 'configuration_error');
});

test('worker can run queued fetch jobs through the configured fetch handler', async () => {
  const runtime = createRuntime();
  const source = createSource(runtime.sourceService);
  runtime.queue.enqueue('fetch', { sourceId: source.id, sourceType: source.sourceType }, { jobKey: `fetch:${source.id}`, runAfter: dueBeforeTestNow });
  const fetchJobHandler = createFetchJobHandler({
    sourceService: runtime.sourceService,
    rawItemRepository: runtime.rawItemRepository,
    queue: runtime.queue,
    adapters: {
      rss: {
        fetchSource: async () => [{
          externalId: 'worker-item-1',
          title: 'Worker fetched item',
          url: 'https://example.com/worker-item-1',
          summary: 'Fetched from worker.',
          rawPayload: { guid: 'worker-item-1' },
          responseMeta: { adapter: 'test' }
        }]
      }
    }
  });
  const worker = createWorker({
    config: { runtimeMode: 'test', databaseUrl: 'memory', redisUrl: 'memory' },
    queue: runtime.queue,
    logger: createMemoryLogger(),
    fetchJobHandler
  });

  const summary = await worker.runFetchJobs();

  assert.equal(summary.completed, 1);
  assert.equal(runtime.rawItemRepository.listRawItems().length, 1);
  assert.equal(runtime.queue.list('fetch')[0].status, 'completed');
});
