import test from 'node:test';
import assert from 'node:assert/strict';

import { RedisQueue } from '../src/queue/redis-queue.ts';

class FakeRedisClient {
  constructor() {
    this.values = new Map();
    this.lists = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async set(key, value, options = {}) {
    if (options.NX && this.values.has(key)) {
      return null;
    }
    this.values.set(key, value);
    return 'OK';
  }

  async incr(key) {
    const next = Number(this.values.get(key) || 0) + 1;
    this.values.set(key, String(next));
    return next;
  }

  async rPush(key, value) {
    const list = this.lists.get(key) || [];
    list.push(value);
    this.lists.set(key, list);
    return list.length;
  }

  async lRange(key, start, stop) {
    const list = this.lists.get(key) || [];
    const normalizedStop = stop === -1 ? list.length : stop + 1;
    return list.slice(start, normalizedStop);
  }
}

test('Redis queue adapter stores jobs by lane and reuses stable job keys', async () => {
  const queue = new RedisQueue(new FakeRedisClient(), { namespace: 'test-news' });

  const first = await queue.enqueue('fetch', { sourceId: 'src_1' }, { jobKey: 'fetch:src_1:due' });
  const duplicate = await queue.enqueue('fetch', { sourceId: 'src_1' }, { jobKey: 'fetch:src_1:due' });
  const jobs = await queue.list('fetch');

  assert.equal(first.id, duplicate.id);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].payload.sourceId, 'src_1');
});
