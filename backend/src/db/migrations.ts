export const requiredInitialTables = [
  'sources',
  'raw_items',
  'articles',
  'signals',
  'topics',
  'score_components',
  'source_relations',
  'job_metadata'
];

export const initialNewsDataSql = `
create table if not exists sources (
  id text primary key,
  name text not null,
  source_type text not null,
  family text not null,
  feed_url text,
  api_endpoint text,
  language text not null,
  fetch_interval_minutes integer not null,
  trust_score numeric(4, 3) not null,
  credential_ref text,
  usage_policy jsonb not null,
  enabled boolean not null default true,
  next_fetch_at timestamptz,
  health jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists raw_items (
  id text primary key,
  source_id text not null references sources(id),
  external_id text not null,
  content_hash text not null,
  payload jsonb not null,
  response_meta jsonb not null default '{}'::jsonb,
  first_fetched_at timestamptz not null,
  last_fetched_at timestamptz not null,
  duplicate_fetch_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create table if not exists articles (
  id text primary key,
  raw_item_id text not null references raw_items(id),
  source_id text not null references sources(id),
  canonical_url text,
  title text not null,
  language text not null,
  excerpt text,
  published_at timestamptz,
  author text,
  text_for_ai text,
  full_text_display_allowed boolean not null default false,
  content_hash text,
  extraction_meta jsonb not null default '{}'::jsonb,
  dedupe_status text not null default 'candidate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists signals (
  id text primary key,
  slug text unique,
  title text not null,
  summary text,
  heat_score numeric(6, 2) not null default 0,
  signal_score numeric(6, 2) not null default 0,
  status text not null default 'candidate',
  primary_published_at timestamptz,
  enrichment_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists topics (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text
);

create table if not exists signal_articles (
  signal_id text not null references signals(id),
  article_id text not null references articles(id),
  role text not null default 'supporting',
  primary key (signal_id, article_id)
);

create table if not exists signal_topics (
  signal_id text not null references signals(id),
  topic_id text not null references topics(id),
  primary key (signal_id, topic_id)
);

create table if not exists score_components (
  id text primary key,
  signal_id text not null references signals(id),
  component text not null,
  value numeric(8, 3) not null,
  weight numeric(8, 3) not null,
  contribution numeric(8, 3) not null,
  created_at timestamptz not null default now()
);

create table if not exists source_relations (
  id text primary key,
  source_id text not null references sources(id),
  article_id text references articles(id),
  signal_id text references signals(id),
  relation_type text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists job_metadata (
  id text primary key,
  lane text not null,
  job_key text not null,
  status text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  run_after timestamptz not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lane, job_key)
);
`;

export const migrations = [
  {
    id: '001_initial_news_data',
    sql: initialNewsDataSql
  }
];

export function createMigrationPlan(appliedMigrationIds = []) {
  const applied = new Set(appliedMigrationIds);
  return migrations.filter((migration) => !applied.has(migration.id));
}

export async function runMigrations(client, appliedMigrationIds = []) {
  const plan = createMigrationPlan(appliedMigrationIds);
  for (const migration of plan) {
    await client.query(migration.sql);
  }
  return plan.map((migration) => migration.id);
}
