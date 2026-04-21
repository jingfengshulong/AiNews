import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, loadConfigFromEnvFile, parseDotEnv, redactConfig } from '../src/config/env.ts';
import { loadRuntimeConfig } from '../src/config/runtime-config.ts';

test('loads backend configuration with secret values kept separate from public references', () => {
  const config = loadConfig({
    DATABASE_URL: 'postgres://news:news@localhost:5432/ai_news',
    REDIS_URL: 'redis://localhost:6379/0',
    RUNTIME_MODE: 'test',
    NEWSAPI_KEY: 'newsapi-secret',
    PRODUCT_HUNT_TOKEN: 'product-hunt-secret',
    AI_ENRICHMENT_API_KEY: 'llm-secret'
  });

  assert.equal(config.runtimeMode, 'test');
  assert.equal(config.databaseUrl, 'postgres://news:news@localhost:5432/ai_news');
  assert.equal(config.redisUrl, 'redis://localhost:6379/0');
  assert.equal(config.sourceSecretRefs.newsapi, 'NEWSAPI_KEY');
  assert.equal(config.enrichmentSecretRef, 'AI_ENRICHMENT_API_KEY');
  assert.equal(config.secrets.newsapi, 'newsapi-secret');

  const publicConfig = redactConfig(config);
  const serialized = JSON.stringify(publicConfig);
  assert.equal(publicConfig.sourceSecretRefs.newsapi, 'NEWSAPI_KEY');
  assert.ok(!serialized.includes('newsapi-secret'));
  assert.ok(!serialized.includes('product-hunt-secret'));
  assert.ok(!serialized.includes('llm-secret'));
});

test('rejects unsupported runtime modes', () => {
  assert.throws(
    () => loadConfig({ RUNTIME_MODE: 'prod-ish' }),
    /runtime mode/i
  );
});

test('loads backend configuration from .env file values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-news-env-'));
  const envPath = join(dir, '.env');
  await writeFile(envPath, [
    'RUNTIME_MODE=test',
    'NEWSAPI_KEY=newsapi-from-env-file',
    'PRODUCT_HUNT_TOKEN="product hunt token"',
    'SEMANTIC_SCHOLAR_API_KEY=semantic-scholar-secret',
    'CROSSREF_CONTACT_EMAIL=ai-news@example.com',
    'AI_ENRICHMENT_API_KEY=llm-from-env-file'
  ].join('\n'));

  try {
    const config = await loadConfigFromEnvFile({ envPath, baseEnv: { REDIS_URL: 'redis://test:6379/0' } });

    assert.equal(config.runtimeMode, 'test');
    assert.equal(config.redisUrl, 'redis://test:6379/0');
    assert.equal(config.secrets.newsapi, 'newsapi-from-env-file');
    assert.equal(config.secrets.productHunt, 'product hunt token');
    assert.equal(config.secrets.semanticScholar, 'semantic-scholar-secret');
    assert.equal(config.crossrefContactEmail, 'ai-news@example.com');
    assert.equal(config.secrets.enrichment, 'llm-from-env-file');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('parses .env values with comments, quotes, and existing environment precedence', () => {
  const values = parseDotEnv([
    '# local secrets',
    'NEWSAPI_KEY="quoted-secret"',
    'PRODUCT_HUNT_TOKEN=product-hunt-secret # inline note',
    'EMPTY_VALUE=',
    'MALFORMED_LINE'
  ].join('\n'));

  const config = loadConfig({
    ...values,
    RUNTIME_MODE: 'test',
    NEWSAPI_KEY: 'process-env-wins'
  });

  assert.equal(values.PRODUCT_HUNT_TOKEN, 'product-hunt-secret');
  assert.equal(values.EMPTY_VALUE, '');
  assert.equal(config.secrets.newsapi, 'process-env-wins');
  assert.equal(config.secrets.productHunt, 'product-hunt-secret');
});

test('runtime config loads .env from the project root by default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-news-runtime-env-'));
  await writeFile(join(dir, '.env'), [
    'RUNTIME_MODE=test',
    'NEWSAPI_KEY=runtime-env-file-secret'
  ].join('\n'));

  try {
    const config = await loadRuntimeConfig({ cwd: dir, baseEnv: {} });

    assert.equal(config.runtimeMode, 'test');
    assert.equal(config.secrets.newsapi, 'runtime-env-file-secret');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
