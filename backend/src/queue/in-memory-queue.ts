import { cloneRecord, InMemoryStore } from '../db/in-memory-store.ts';
import { createJobRecord, defaultJobKey, ensureQueueLane, toIso } from './job.ts';

export class InMemoryQueue {
  constructor(store = new InMemoryStore()) {
    this.store = store;
  }

  enqueue(lane, payload, options = {}) {
    ensureQueueLane(lane);
    const now = new Date();
    const runAfter = toIso(options.runAfter || now);
    const jobKey = options.jobKey || defaultJobKey(lane, payload, runAfter);
    const keyIndex = this.store.jobKeyIndex.get(lane);
    const existingId = keyIndex.get(jobKey);
    if (existingId) {
      return cloneRecord(this.store.jobs.get(lane).get(existingId));
    }

    const id = this.store.nextId('job');
    const job = createJobRecord({
      id,
      lane,
      payload,
      jobKey,
      attempts: options.attempts || 0,
      runAfter,
      now
    });

    this.store.jobs.get(lane).set(id, job);
    keyIndex.set(jobKey, id);
    return cloneRecord(job);
  }

  list(lane) {
    ensureQueueLane(lane);
    return Array.from(this.store.jobs.get(lane).values()).map(cloneRecord);
  }

  claimNext(lane, { now = new Date(), filter } = {}) {
    ensureQueueLane(lane);
    const currentTime = new Date(now).getTime();
    for (const job of this.store.jobs.get(lane).values()) {
      if (job.status !== 'queued') {
        continue;
      }
      if (new Date(job.runAfter).getTime() > currentTime) {
        continue;
      }
      if (filter && !filter(cloneRecord(job))) {
        continue;
      }

      const updated = {
        ...job,
        status: 'active',
        attempts: job.attempts + 1,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.store.jobs.get(lane).set(job.id, updated);
      return cloneRecord(updated);
    }

    return undefined;
  }

  complete(jobId, result = {}) {
    return this.updateJob(jobId, (job) => ({
      ...job,
      status: 'completed',
      result: cloneRecord(result),
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  fail(jobId, { message, errorCategory = 'job_failed' } = {}) {
    return this.updateJob(jobId, (job) => ({
      ...job,
      status: 'failed',
      lastError: message,
      lastErrorCategory: errorCategory,
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  retry(jobId, { message, errorCategory = 'job_retry', runAfter = new Date() } = {}) {
    return this.updateJob(jobId, (job) => ({
      ...job,
      status: 'queued',
      runAfter: toIso(runAfter),
      lastError: message,
      lastErrorCategory: errorCategory,
      updatedAt: new Date().toISOString()
    }));
  }

  updateJob(jobId, updater) {
    for (const jobs of this.store.jobs.values()) {
      const existing = jobs.get(jobId);
      if (existing) {
        const updated = updater(cloneRecord(existing));
        jobs.set(jobId, updated);
        return cloneRecord(updated);
      }
    }
    throw new Error(`Queued job not found: ${jobId}`);
  }
}
