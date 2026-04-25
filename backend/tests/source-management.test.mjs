import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { SourceRepository } from '../src/sources/source-repository.ts';
import { SourceService } from '../src/sources/source-service.ts';
import { seedMvpSources } from '../src/sources/seed-sources.ts';

const usagePolicy = {
  allowFullText: false,
  allowSummary: true,
  commercialUseNeedsReview: true,
  attributionRequired: true
};

test('creates, disables, lists, and updates health for sources', () => {
  const service = new SourceService(new SourceRepository(new InMemoryStore()));
  const source = service.createSource({
    name: 'AI Frontier Daily',
    sourceType: 'rss',
    family: 'technology_media',
    feedUrl: 'https://example.com/ai.xml',
    language: 'zh-CN',
    fetchIntervalMinutes: 30,
    trustScore: 0.82,
    usagePolicy
  });

  assert.equal(source.enabled, true);
  assert.equal(service.listEnabledSources().length, 1);

  const disabled = service.disableSource(source.id);
  assert.equal(disabled.enabled, false);
  assert.equal(service.listEnabledSources().length, 0);

  const updated = service.updateHealth(source.id, {
    ok: false,
    at: new Date('2026-04-20T08:00:00.000Z'),
    errorCategory: 'rate_limited'
  });

  assert.equal(updated.health.failureCount, 1);
  assert.equal(updated.health.lastErrorCategory, 'rate_limited');
  assert.equal(updated.health.lastFailureAt, '2026-04-20T08:00:00.000Z');
});

test('validates source type, cadence, language, trust score, credential reference, and usage policy', () => {
  const service = new SourceService(new SourceRepository(new InMemoryStore()));

  assert.throws(
    () => service.createSource({
      name: 'Bad Cadence',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://example.com/feed.xml',
      language: 'zh-CN',
      fetchIntervalMinutes: 0,
      trustScore: 0.5,
      usagePolicy
    }),
    /fetch interval/i
  );

  assert.throws(
    () => service.createSource({
      name: 'Missing Secret Ref',
      sourceType: 'newsapi',
      family: 'technology_media',
      language: 'en',
      fetchIntervalMinutes: 60,
      trustScore: 0.7,
      usagePolicy
    }),
    /credential reference/i
  );

  const publicSemanticScholar = service.createSource({
    name: 'Public Semantic Scholar',
    sourceType: 'semantic_scholar',
    family: 'research',
    apiEndpoint: 'https://api.semanticscholar.org/graph/v1/paper/search',
    language: 'en',
    fetchIntervalMinutes: 240,
    trustScore: 0.84,
    usagePolicy
  });
  assert.equal(publicSemanticScholar.credentialRef, undefined);

  assert.throws(
    () => service.createSource({
      name: 'Bad Trust',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://example.com/feed.xml',
      language: 'zh-CN',
      fetchIntervalMinutes: 30,
      trustScore: 1.7,
      usagePolicy
    }),
    /trust score/i
  );
});

test('persists optional source freshness windows for latest-news eligibility', () => {
  const service = new SourceService(new SourceRepository(new InMemoryStore()));
  const source = service.createSource({
    name: 'Fast Moving Community Feed',
    sourceType: 'hacker_news',
    family: 'community',
    apiEndpoint: 'https://hacker-news.firebaseio.com/v0/newstories.json',
    language: 'en',
    fetchIntervalMinutes: 30,
    trustScore: 0.64,
    freshnessWindowHours: 12,
    usagePolicy
  });

  assert.equal(source.freshnessWindowHours, 12);

  const updated = service.updateSource(source.id, { freshnessWindowHours: 24 });
  assert.equal(updated.freshnessWindowHours, 24);

  assert.throws(
    () => service.updateSource(source.id, { freshnessWindowHours: 0 }),
    /freshness window/i
  );
});

test('seeds RSS/Atom sources and placeholder API-backed sources', () => {
  const service = new SourceService(new SourceRepository(new InMemoryStore()));
  const seeded = seedMvpSources(service);

  assert.ok(seeded.some((source) => source.sourceType === 'rss'));
  assert.ok(seeded.some((source) => source.sourceType === 'hacker_news'));
  assert.ok(seeded.some((source) => source.sourceType === 'newsapi'));
  assert.ok(seeded.some((source) => source.sourceType === 'arxiv'));
  assert.ok(seeded.every((source) => source.usagePolicy.attributionRequired));
  assert.ok(seeded.some((source) => source.name === 'OpenAI News RSS' && source.enabled));
  assert.ok(seeded.some((source) => source.name === 'Google AI Blog RSS' && source.enabled));
  assert.ok(seeded.some((source) => source.name === 'Hacker News AI Search' && source.apiEndpoint?.includes('hacker-news.firebaseio.com')));
  assert.ok(seeded.some((source) => source.name === 'Semantic Scholar AI Papers' && source.query === 'artificial intelligence agents' && source.fetchLimit === 10));
  assert.ok(seeded.some((source) => source.name === 'Product Hunt AI Launches' && source.query === 'artificial-intelligence' && source.fetchLimit === 10));
  assert.ok(seeded.some((source) => source.name === 'Anthropic Newsroom' && !source.enabled));
  assert.equal(seeded.some((source) => source.feedUrl?.includes('example.com')), false);
});
