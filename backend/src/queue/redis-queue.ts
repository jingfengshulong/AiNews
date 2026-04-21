import { createJobRecord, defaultJobKey, ensureQueueLane, toIso } from './job.ts';

export class RedisQueue {
  constructor(client, options = {}) {
    this.client = client;
    this.namespace = options.namespace || 'ai-news';
  }

  async enqueue(lane, payload, options = {}) {
    ensureQueueLane(lane);
    const now = new Date();
    const runAfter = toIso(options.runAfter || now);
    const jobKey = options.jobKey || defaultJobKey(lane, payload, runAfter);
    const uniqueKey = this.redisKey('job-key', lane, jobKey);

    const existingId = await this.client.get(uniqueKey);
    if (existingId) {
      return this.readJob(lane, existingId);
    }

    const id = `job_${String(await this.client.incr(this.redisKey('ids'))).padStart(4, '0')}`;
    const claim = await this.client.set(uniqueKey, id, { NX: true });
    if (!claim) {
      return this.readJob(lane, await this.client.get(uniqueKey));
    }

    const job = createJobRecord({
      id,
      lane,
      payload,
      jobKey,
      runAfter,
      attempts: options.attempts || 0,
      now
    });

    await this.client.set(this.redisKey('job', lane, id), JSON.stringify(job));
    await this.client.rPush(this.redisKey('lane', lane), id);
    return structuredClone(job);
  }

  async list(lane) {
    ensureQueueLane(lane);
    const ids = await this.client.lRange(this.redisKey('lane', lane), 0, -1);
    const jobs = [];
    for (const id of ids) {
      jobs.push(await this.readJob(lane, id));
    }
    return jobs;
  }

  async claimNext(lane, { now = new Date() } = {}) {
    ensureQueueLane(lane);
    const ids = await this.client.lRange(this.redisKey('lane', lane), 0, -1);
    const currentTime = new Date(now).getTime();
    for (const id of ids) {
      const job = await this.readJob(lane, id);
      if (job.status !== 'queued') {
        continue;
      }
      if (new Date(job.runAfter).getTime() > currentTime) {
        continue;
      }

      const updated = {
        ...job,
        status: 'active',
        attempts: job.attempts + 1,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await this.writeJob(lane, updated);
      return structuredClone(updated);
    }
    return undefined;
  }

  async complete(jobId, result = {}) {
    return this.updateJob(jobId, (job) => ({
      ...job,
      status: 'completed',
      result: structuredClone(result),
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  async fail(jobId, { message, errorCategory = 'job_failed' } = {}) {
    return this.updateJob(jobId, (job) => ({
      ...job,
      status: 'failed',
      lastError: message,
      lastErrorCategory: errorCategory,
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  async retry(jobId, { message, errorCategory = 'job_retry', runAfter = new Date() } = {}) {
    return this.updateJob(jobId, (job) => ({
      ...job,
      status: 'queued',
      runAfter: toIso(runAfter),
      lastError: message,
      lastErrorCategory: errorCategory,
      updatedAt: new Date().toISOString()
    }));
  }

  async readJob(lane, id) {
    const serialized = await this.client.get(this.redisKey('job', lane, id));
    if (!serialized) {
      throw new Error(`Queued job not found: ${id}`);
    }
    return JSON.parse(serialized);
  }

  async updateJob(jobId, updater) {
    for (const lane of ['fetch', 'process', 'enrichment']) {
      const ids = await this.client.lRange(this.redisKey('lane', lane), 0, -1);
      if (!ids.includes(jobId)) {
        continue;
      }
      const existing = await this.readJob(lane, jobId);
      const updated = updater(structuredClone(existing));
      await this.writeJob(lane, updated);
      return structuredClone(updated);
    }
    throw new Error(`Queued job not found: ${jobId}`);
  }

  async writeJob(lane, job) {
    await this.client.set(this.redisKey('job', lane, job.id), JSON.stringify(job));
  }

  redisKey(...parts) {
    return [this.namespace, 'queue', ...parts].join(':');
  }
}
