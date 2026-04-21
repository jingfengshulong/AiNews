import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiServer } from '../src/api/server.ts';
import { loadConfig } from '../src/config/env.ts';
import { createHealthSnapshot } from '../src/health.ts';
import { createMemoryLogger } from '../src/logging/logger.ts';

test('health snapshot reports runtime, database, and queue readiness', () => {
  const config = loadConfig({ RUNTIME_MODE: 'test' });
  const snapshot = createHealthSnapshot({
    service: 'worker',
    config,
    checks: { database: true, queue: true }
  });

  assert.equal(snapshot.status, 'ok');
  assert.equal(snapshot.service, 'worker');
  assert.equal(snapshot.runtimeMode, 'test');
  assert.equal(snapshot.checks.database, 'ok');
  assert.equal(snapshot.checks.queue, 'ok');
});

test('API server exposes a health endpoint without requiring frontend changes', async () => {
  const config = loadConfig({ RUNTIME_MODE: 'test' });
  const logger = createMemoryLogger();
  const server = createApiServer({ config, logger });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'api');
    assert.equal(logger.entries.some((entry) => entry.event === 'http_request'), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
