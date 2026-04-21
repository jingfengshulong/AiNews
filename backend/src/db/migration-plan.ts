import { createMigrationPlan } from './migrations.ts';

const pending = createMigrationPlan([]);
console.log(JSON.stringify({ pending: pending.map((migration) => migration.id) }, null, 2));
