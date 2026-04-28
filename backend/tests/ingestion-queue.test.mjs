import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { InMemoryQueue } from '../src/queue/in-memory-queue.ts';
import { SourceRepository } from '../src/sources/source-repository.ts';
import { SourceService } from '../src/sources/source-service.ts';
import { createDueFetchJobs } from '../src/ingestion/scheduler.ts';

const usagePolicy = {
  allowFullText: false,
  allowSummary: true,
  commercialUseNeedsReview: false,
  attributionRequired: true
};

function createSourceService() {
  return new SourceService(new SourceRepository(new InMemoryStore()));
}

test('queue supports fetch, processing, and enrichment job lanes with stable job keys', () => {
  const queue = new InMemoryQueue();

  const fetchJob = queue.enqueue('fetch', { sourceId: 'src_1' }, { jobKey: 'fetch:src_1:2026-04-20T08:00:00.000Z' });
  const duplicateFetchJob = queue.enqueue('fetch', { sourceId: 'src_1' }, { jobKey: 'fetch:src_1:2026-04-20T08:00:00.000Z' });
  const processJob = queue.enqueue('process', { rawItemId: 'raw_1' }, { jobKey: 'process:raw_1' });
  const enrichmentJob = queue.enqueue('enrichment', { signalId: 'sig_1' }, { jobKey: 'enrichment:sig_1' });

  assert.equal(fetchJob.id, duplicateFetchJob.id);
  assert.equal(queue.list('fetch').length, 1);
  assert.equal(queue.list('process')[0].id, processJob.id);
  assert.equal(queue.list('enrichment')[0].id, enrichmentJob.id);
});

test('queue claimNext can skip due jobs that do not match a filter', () => {
  const queue = new InMemoryQueue();
  const dueAt = new Date('2026-04-21T08:59:00.000Z');
  queue.enqueue('fetch', { runId: 'old-run', sourceId: 'src_1' }, { jobKey: 'fetch:old', runAfter: dueAt });
  const current = queue.enqueue('fetch', { runId: 'current-run', sourceId: 'src_1' }, { jobKey: 'fetch:current', runAfter: dueAt });

  const claimed = queue.claimNext('fetch', {
    now: new Date('2026-04-21T09:00:00.000Z'),
    filter: (job) => job.payload.runId === 'current-run'
  });

  assert.equal(claimed.id, current.id);
  assert.equal(queue.list('fetch').find((job) => job.payload.runId === 'old-run').status, 'queued');
});

test('scheduler enqueues fetch jobs only for enabled sources whose next fetch time is due', () => {
  const service = createSourceService();
  const queue = new InMemoryQueue();
  const now = new Date('2026-04-20T08:00:00.000Z');

  const dueSource = service.createSource({
    name: 'Due Feed',
    sourceType: 'rss',
    family: 'technology_media',
    feedUrl: 'https://example.com/due.xml',
    language: 'zh-CN',
    fetchIntervalMinutes: 30,
    trustScore: 0.8,
    usagePolicy,
    nextFetchAt: '2026-04-20T07:59:00.000Z'
  });

  service.createSource({
    name: 'Future Feed',
    sourceType: 'rss',
    family: 'technology_media',
    feedUrl: 'https://example.com/future.xml',
    language: 'zh-CN',
    fetchIntervalMinutes: 30,
    trustScore: 0.8,
    usagePolicy,
    nextFetchAt: '2026-04-20T08:30:00.000Z'
  });

  const disabledSource = service.createSource({
    name: 'Disabled Feed',
    sourceType: 'rss',
    family: 'technology_media',
    feedUrl: 'https://example.com/disabled.xml',
    language: 'zh-CN',
    fetchIntervalMinutes: 30,
    trustScore: 0.8,
    usagePolicy,
    nextFetchAt: '2026-04-20T07:00:00.000Z'
  });
  service.disableSource(disabledSource.id);

  const jobs = createDueFetchJobs({ sourceService: service, queue, now });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].payload.sourceId, dueSource.id);
  assert.equal(queue.list('fetch').length, 1);
  assert.equal(service.getSource(dueSource.id).nextFetchAt, '2026-04-20T08:30:00.000Z');
});
