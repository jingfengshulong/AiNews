import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { RawItemRepository } from '../src/ingestion/raw-item-repository.ts';

test('persists raw payloads and deduplicates by source id plus external id', () => {
  const repository = new RawItemRepository(new InMemoryStore());

  const first = repository.upsertRawItem({
    sourceId: 'src_1',
    externalId: 'item-42',
    fetchedAt: new Date('2026-04-20T08:00:00.000Z'),
    payload: { title: 'First Payload', url: 'https://example.com/first' },
    responseMeta: { status: 200, adapter: 'rss' }
  });

  const duplicate = repository.upsertRawItem({
    sourceId: 'src_1',
    externalId: 'item-42',
    fetchedAt: new Date('2026-04-20T08:10:00.000Z'),
    payload: { title: 'Changed Payload', url: 'https://example.com/first' },
    responseMeta: { status: 200, adapter: 'rss' }
  });

  assert.equal(duplicate.id, first.id);
  assert.equal(repository.listRawItems().length, 1);
  assert.equal(duplicate.firstFetchedAt, '2026-04-20T08:00:00.000Z');
  assert.equal(duplicate.lastFetchedAt, '2026-04-20T08:10:00.000Z');
  assert.equal(duplicate.payload.title, 'First Payload');
  assert.equal(duplicate.duplicateFetchCount, 1);
  assert.match(duplicate.contentHash, /^[a-f0-9]{64}$/);
});
