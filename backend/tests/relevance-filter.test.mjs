import test from 'node:test';
import assert from 'node:assert/strict';

import { createRelevanceFilter } from '../src/ai/relevance-filter.ts';

test('createRelevanceFilter returns null when config is missing', () => {
  assert.equal(createRelevanceFilter({}), null);
  assert.equal(createRelevanceFilter({ apiKey: 'key' }), null);
  assert.equal(createRelevanceFilter({ apiKey: 'key', model: 'm' }), null);
});

test('createRelevanceFilter returns filter when config is complete', () => {
  const filter = createRelevanceFilter({
    apiKey: 'test-key',
    model: 'test-model',
    baseUrl: 'https://api.test.com/v1'
  });
  assert.ok(filter);
  assert.equal(typeof filter.filterArticles, 'function');
});

test('filterArticles returns empty array for empty input', async () => {
  const filter = createRelevanceFilter({
    apiKey: 'test-key',
    model: 'test-model',
    baseUrl: 'https://api.test.com/v1',
    fetchImpl: async () => ({ ok: true, json: async () => ({}) })
  });
  const result = await filter.filterArticles([]);
  assert.deepEqual(result, []);
});

test('filterArticles treats all as relevant when API fails', async () => {
  const filter = createRelevanceFilter({
    apiKey: 'test-key',
    model: 'test-model',
    baseUrl: 'https://api.test.com/v1',
    fetchImpl: async () => { throw new Error('network error'); }
  });
  const articles = [
    { title: 'Article 1', summary: 'About AI' },
    { title: 'Article 2', summary: 'About sports' }
  ];
  const result = await filter.filterArticles(articles);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'Article 1');
  assert.equal(result[1].title, 'Article 2');
});

test('filterArticles parses boolean array from API response', async () => {
  const filter = createRelevanceFilter({
    apiKey: 'test-key',
    model: 'test-model',
    baseUrl: 'https://api.test.com/v1',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[true, false, true]' } }]
      })
    })
  });
  const articles = [
    { title: 'AI article', summary: 'About artificial intelligence' },
    { title: 'Sports article', summary: 'About football' },
    { title: 'ML article', summary: 'About machine learning' }
  ];
  const result = await filter.filterArticles(articles);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'AI article');
  assert.equal(result[1].title, 'ML article');
});

test('filterArticles batches articles into groups', async () => {
  let callCount = 0;
  const filter = createRelevanceFilter({
    apiKey: 'test-key',
    model: 'test-model',
    baseUrl: 'https://api.test.com/v1',
    batchSize: 3,
    fetchImpl: async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '[true, true, true]' } }]
        })
      };
    }
  });
  const articles = Array.from({ length: 7 }, (_, i) => ({ title: `Article ${i}`, summary: '' }));
  await filter.filterArticles(articles);
  assert.equal(callCount, 3); // 7 articles / batch size 3 = 3 batches
});

test('filterArticles treats all as relevant when response is malformed', async () => {
  const filter = createRelevanceFilter({
    apiKey: 'test-key',
    model: 'test-model',
    baseUrl: 'https://api.test.com/v1',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not valid json' } }]
      })
    })
  });
  const articles = [{ title: 'A', summary: '' }, { title: 'B', summary: '' }];
  const result = await filter.filterArticles(articles);
  assert.equal(result.length, 2);
});
