import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { RawItemRepository } from '../src/ingestion/raw-item-repository.ts';
import { parseRssAtomFeed, RssAtomAdapter } from '../src/ingestion/rss-atom-adapter.ts';
import { ingestRssAtomSource } from '../src/ingestion/rss-atom-ingestion.ts';
import { InMemoryQueue } from '../src/queue/in-memory-queue.ts';

const fetchedAt = new Date('2026-04-21T08:30:00.000Z');

test('RSS parser extracts stable item fields and preserves raw payload', async () => {
  const xml = await readFile(new URL('./fixtures/sample-rss.xml', import.meta.url), 'utf8');
  const records = parseRssAtomFeed({
    xml,
    source: { id: 'src_rss', sourceType: 'rss', feedUrl: 'https://example.com/feed.xml', language: 'en' },
    fetchedAt,
    responseMeta: { status: 200, feedUrl: 'https://example.com/feed.xml' }
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, 'release-2026-04-21');
  assert.equal(records[0].title, 'Introducing Example Agent 2');
  assert.equal(records[0].url, 'https://example.com/news/example-agent-2');
  assert.equal(records[0].publishedAt, '2026-04-21T08:15:00.000Z');
  assert.equal(records[0].author, 'Example Research');
  assert.deepEqual(records[0].categories, ['Agents', 'Product']);
  assert.equal(records[0].summary, 'A short product update for Example Agent 2.');
  assert.equal(records[0].rawPayload.title, 'Introducing Example Agent 2');
  assert.equal(records[0].responseMeta.feedFormat, 'rss');
});

test('Atom parser extracts alternate link, author, categories, and dates', async () => {
  const xml = await readFile(new URL('./fixtures/sample-atom.xml', import.meta.url), 'utf8');
  const records = parseRssAtomFeed({
    xml,
    source: { id: 'src_atom', sourceType: 'atom', feedUrl: 'https://example.com/feed.atom', language: 'en' },
    fetchedAt,
    responseMeta: { status: 200, feedUrl: 'https://example.com/feed.atom' }
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, 'tag:example.com,2026:research-42');
  assert.equal(records[0].title, 'New multimodal benchmark');
  assert.equal(records[0].url, 'https://example.com/research/multimodal-benchmark');
  assert.equal(records[0].publishedAt, '2026-04-21T06:45:00.000Z');
  assert.equal(records[0].updatedAt, '2026-04-21T07:00:00.000Z');
  assert.equal(records[0].author, 'Example Lab');
  assert.deepEqual(records[0].categories, ['Research']);
});

test('adapter fetches feed XML with RSS/Atom headers and maps HTTP metadata', async () => {
  const xml = await readFile(new URL('./fixtures/sample-rss.xml', import.meta.url), 'utf8');
  const requests = [];
  const adapter = new RssAtomAdapter({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        status: 200,
        headers: new Map([['content-type', 'application/rss+xml']]),
        text: async () => xml
      };
    },
    now: () => fetchedAt
  });

  const records = await adapter.fetchSource({
    id: 'src_rss',
    sourceType: 'rss',
    feedUrl: 'https://example.com/feed.xml',
    language: 'en'
  });

  assert.equal(records.length, 1);
  assert.equal(requests[0].url, 'https://example.com/feed.xml');
  assert.match(requests[0].options.headers.Accept, /application\/rss\+xml/);
  assert.match(requests[0].options.headers['User-Agent'], /AI-News/);
  assert.equal(records[0].responseMeta.status, 200);
});

test('RSS/Atom ingestion persists raw items and enqueues processing for new records only', async () => {
  const xml = await readFile(new URL('./fixtures/sample-rss.xml', import.meta.url), 'utf8');
  const store = new InMemoryStore();
  const rawItemRepository = new RawItemRepository(store);
  const queue = new InMemoryQueue(store);
  const adapter = new RssAtomAdapter({
    fetchImpl: async () => ({
      status: 200,
      headers: new Map([['content-type', 'application/rss+xml']]),
      text: async () => xml
    }),
    now: () => fetchedAt
  });
  const source = {
    id: 'src_rss',
    sourceType: 'rss',
    feedUrl: 'https://example.com/feed.xml',
    language: 'en'
  };

  const first = await ingestRssAtomSource({ source, adapter, rawItemRepository, queue, fetchedAt });
  const second = await ingestRssAtomSource({ source, adapter, rawItemRepository, queue, fetchedAt });

  assert.equal(first.created.length, 1);
  assert.equal(first.duplicates.length, 0);
  assert.equal(second.created.length, 0);
  assert.equal(second.duplicates.length, 1);
  assert.equal(rawItemRepository.listRawItems().length, 1);
  assert.equal(queue.list('process').length, 1);
  assert.equal(queue.list('process')[0].payload.rawItemId, first.created[0].id);
});
