import test from 'node:test';
import assert from 'node:assert/strict';

import { createMigrationPlan, requiredInitialTables, migrations } from '../src/db/migrations.ts';

test('initial migration defines the core news data tables', () => {
  const firstMigration = migrations[0];

  assert.equal(firstMigration.id, '001_initial_news_data');
  for (const tableName of requiredInitialTables) {
    assert.match(firstMigration.sql, new RegExp(`create table if not exists ${tableName}`, 'i'));
  }
  assert.match(firstMigration.sql, /text_for_ai text/i);
  assert.match(firstMigration.sql, /full_text_display_allowed boolean/i);
  assert.match(firstMigration.sql, /extraction_meta jsonb/i);
});

test('migration plan excludes migrations already applied', () => {
  const plan = createMigrationPlan(['001_initial_news_data']);

  assert.deepEqual(plan, []);
});
