# AiNews

AI news intelligence dashboard for collecting, clustering, scoring, and summarizing AI-related news from RSS feeds, research APIs, product sources, community feeds, and media sources.

The project currently runs as a Node.js backend plus a static frontend. It is designed for a server/VPS deployment where a long-running process can keep a runtime snapshot on disk.

## Features

- Static IT-style frontend pages for home, detail, search, source type archives, date archives, and topic archives.
- Live ingestion from RSS/Atom, NewsAPI, arXiv, Semantic Scholar, Hacker News, Product Hunt, and Crossref.
- Article extraction with backend-only full text for AI processing.
- Deduplication, clustering, topic classification, scoring, and AI enrichment.
- Backfill workflow for reprocessing old or low-quality AI summaries.
- Runtime snapshot persistence through `.data/news-runtime.json`.

## Requirements

- Node.js 20+
- npm
- AI enrichment API compatible with OpenAI chat completions

## Install

```bash
npm install
```

Create `.env` from the example:

```bash
cp .env.example .env
```

Fill the values you need:

```env
RUNTIME_MODE=production
DATABASE_URL=postgres://news:news@localhost:5432/ai_news
REDIS_URL=redis://localhost:6379/0

NEWSAPI_KEY=
SEMANTIC_SCHOLAR_API_KEY=
PRODUCT_HUNT_TOKEN=
CROSSREF_CONTACT_EMAIL=

AI_ENRICHMENT_API_KEY=
AI_ENRICHMENT_MODEL=mimo-v2.5
AI_ENRICHMENT_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
```

`SEMANTIC_SCHOLAR_API_KEY` can be empty because public access is supported. `DATABASE_URL` and `REDIS_URL` are reserved for future production storage/queue work; the current runtime uses the local snapshot file.

## Local Development

Start the live API and frontend:

```bash
npm run backend:live
```

Open:

```text
http://localhost:4100/
```

Run tests:

```bash
npm run backend:test
```

## Live Data

Run one ingestion pass:

```bash
npm run backend:ingest:live
```

Run AI enrichment backfill for old or low-quality summaries:

```bash
npm run backend:enrichment:backfill -- --dry-run --stale-only --limit 50
npm run backend:enrichment:backfill -- --stale-only --limit 50 --process-limit 50
```

Retry failed enrichment records:

```bash
npm run backend:enrichment:backfill -- --status=failed --limit 20 --process-limit 20
```

## Runtime Snapshot

The live backend stores runtime data in:

```text
.data/news-runtime.json
```

This file is ignored by Git because it may contain raw source payloads and backend-only article text. Do not commit it to a public repository.

To move current data to a server, copy it separately:

```bash
scp .data/news-runtime.json user@your-server:/path/to/AiNews/.data/news-runtime.json
```

If you do not copy the snapshot, the server can rebuild data by running:

```bash
npm run backend:ingest:live
```

## Live Refresh Behavior

`npm run backend:live` starts the API, runs a startup catch-up refresh for the previous 24 hours, then keeps refreshing every 30 minutes while the process is alive.

Useful environment variables:

```env
LIVE_STARTUP_REFRESH_ENABLED=1
LIVE_STARTUP_LOOKBACK_HOURS=24
LIVE_SCHEDULED_INGESTION_ENABLED=1
LIVE_INGESTION_INTERVAL_MINUTES=30
LIVE_RUNTIME_SNAPSHOT_PATH=.data/news-runtime.json
LIVE_REQUEST_TIMEOUT_MS=15000
LIVE_SOURCE_NAMES=
```

Startup and scheduled ingestion do not use a project-side item-count cap. RSS/Atom sources ingest every item currently exposed by the feed and then apply the 24-hour or cursor filter. API-backed sources use provider pagination/page-size parameters where needed, but the project treats those as page size, not as a total run limit.

Manual one-shot options:

```bash
npm run backend:ingest:live -- --mode=manual --incremental
npm run backend:ingest:live -- --mode=manual --recovery --lookback-hours=48 --force
```

## Server Deployment

On your server:

```bash
git clone https://github.com/jingfengshulong/AiNews.git
cd AiNews
npm install
cp .env.example .env
```

Fill `.env`, then start:

```bash
npm run backend:live
```

For a long-running process, use `pm2`:

```bash
npm install -g pm2
pm2 start "npm run backend:live" --name ainews
pm2 save
```

Optional Nginx reverse proxy:

```nginx
server {
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:4100;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Useful Scripts

```bash
npm run backend:live
npm run backend:ingest:live
npm run backend:enrichment:backfill
npm run backend:test
```

## Notes

- Keep `.env` private.
- Keep `.data/news-runtime.json` out of Git.
- For production-grade persistence, the next step is replacing the local runtime snapshot with PostgreSQL or another durable database.
