import { persistAdapterRecords } from './adapter-record-ingestion.ts';
import { classifyFetchError, SourceFetchError } from './source-fetch-error.ts';
import { filterSourceRecordsForRun, lookbackWindowStart } from './source-record-filter.ts';

export function createFetchJobHandler({
  sourceService,
  rawItemRepository,
  queue,
  adapters,
  maxAttempts = 3,
  baseBackoffMs = 60_000,
  maxBackoffMs = 60 * 60_000
}) {
  const handler = async function handleFetchJob(job, { now = new Date() } = {}) {
    if (job.lane !== 'fetch') {
      throw new SourceFetchError(`Unsupported job lane for fetch handler: ${job.lane}`, {
        category: 'configuration_error',
        retryable: false
      });
    }

    const sourceId = job.payload?.sourceId;
    if (!sourceId) {
      throw new SourceFetchError('Fetch job requires sourceId', {
        category: 'configuration_error',
        retryable: false
      });
    }

    const source = sourceService.getSource(sourceId);
    const adapter = adapters[source.sourceType];
    if (!adapter) {
      throw new SourceFetchError(`No fetch adapter for source type: ${source.sourceType}`, {
        category: 'configuration_error',
        retryable: false
      });
    }

    const runOptions = job.payload?.runOptions || {};
    const records = await adapter.fetchSource(source, {
      ...runOptions,
      cursor: source.ingestionCursor,
      lookbackWindowStart: lookbackWindowStart({
        lookbackHours: runOptions.lookbackHours,
        now
      }),
      now
    });
    const filtered = filterSourceRecordsForRun({
      records,
      source,
      mode: runOptions.mode,
      incremental: runOptions.incremental,
      force: runOptions.force,
      lookbackHours: runOptions.lookbackHours,
      now
    });
    const result = persistAdapterRecords({
      source,
      records: filtered.records,
      rawItemRepository,
      queue,
      fetchedAt: now,
      runId: job.payload?.runId
    });
    sourceService.updateHealth(source.id, { ok: true, at: now });
    sourceService.updateIngestionCursor(source.id, {
      records: filtered.records,
      fetchedAt: now
    });
    if (source.fetchIntervalMinutes) {
      sourceService.markFetchScheduled(source.id, new Date(new Date(now).getTime() + source.fetchIntervalMinutes * 60_000));
    }

    return {
      sourceId: source.id,
      sourceType: source.sourceType,
      fetched: result.fetched,
      received: asArray(records).length,
      filtered: filtered.stats,
      created: result.created.length,
      duplicates: result.duplicates.length
    };
  };

  handler.sourceService = sourceService;
  handler.maxAttempts = maxAttempts;
  handler.baseBackoffMs = baseBackoffMs;
  handler.maxBackoffMs = maxBackoffMs;
  return handler;
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export async function processFetchJobs({ queue, handler, limit = 25, now = new Date(), filter } = {}) {
  const results = [];
  let completed = 0;
  let retried = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const job = await queue.claimNext('fetch', { now, filter });
    if (!job) {
      break;
    }

    try {
      const result = await handler(job, { now });
      await queue.complete(job.id, result);
      completed += 1;
      results.push({ jobId: job.id, status: 'completed', result });
    } catch (error) {
      const classified = classifyFetchError(error);
      const sourceId = job.payload?.sourceId;
      if (sourceId && handler.sourceService) {
        handler.sourceService.updateHealth(sourceId, {
          ok: false,
          at: now,
          errorCategory: classified.category
        });
      }

      if (classified.category === 'rate_limited' && sourceId && handler.sourceService) {
        handler.sourceService.markFetchScheduled(sourceId, retryTime({ error: classified, job, handler, now }));
      }

      if (classified.retryable && job.attempts < handler.maxAttempts) {
        const runAfter = retryTime({ error: classified, job, handler, now });
        await queue.retry(job.id, {
          message: classified.message,
          errorCategory: classified.category,
          runAfter
        });
        retried += 1;
        results.push({ jobId: job.id, status: 'retried', errorCategory: classified.category, runAfter: runAfter.toISOString() });
        continue;
      }

      await queue.fail(job.id, {
        message: classified.message,
        errorCategory: classified.category
      });
      failed += 1;
      results.push({ jobId: job.id, status: 'failed', errorCategory: classified.category, error: classified.message });
    }
  }

  return {
    completed,
    retried,
    failed,
    results
  };
}

function retryTime({ error, job, handler, now }) {
  if (error.retryAfter) {
    const retryAfter = error.retryAfter instanceof Date ? error.retryAfter : new Date(error.retryAfter);
    if (!Number.isNaN(retryAfter.getTime())) {
      return retryAfter;
    }
  }

  const delayMs = Math.min(handler.baseBackoffMs * (2 ** job.attempts), handler.maxBackoffMs);
  return new Date(new Date(now).getTime() + delayMs);
}
