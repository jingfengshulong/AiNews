## Why

The current product can display backend-generated demo data, but it still cannot run a real source ingestion pass and serve the resulting live signals to the frontend. We need a controlled live-fetching path now so the UI can move from deterministic fixtures to current AI news data without exposing third-party secrets or bypassing attribution rules.

## What Changes

- Add a live runtime path that seeds enabled sources, fetches real RSS/API data, processes raw items, clusters signals, scores them, enriches them, and serves the resulting API data.
- Add one-shot live ingestion and live API startup scripts separate from the deterministic demo scripts.
- Start the live API promptly and refresh live data in the background so the local frontend is reachable while external sources respond.
- Add source readiness checks so authenticated sources are skipped or reported clearly when required credentials are missing.
- Add freshness and run metadata so API responses and logs distinguish live data from demo fixture data.
- Keep demo fixtures as the deterministic fallback for tests and local visual verification.
- Do not build broad web crawling, browser automation crawling, or scraping beyond configured source URLs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `news-ingestion`: Add live one-shot ingestion and continuous runtime behavior for enabled real sources.
- `news-source-management`: Add source readiness rules for live runs, including credential availability and live source inclusion/exclusion.
- `news-signal-processing`: Ensure newly fetched live items flow through deduplication, clustering, topic assignment, scoring, and enrichment without manual fixture wiring.
- `news-serving-api`: Expose freshness/run metadata so the frontend can tell whether data is live, stale, or fixture-backed.

## Impact

- Adds live runtime orchestration around existing adapters, queues, processors, scoring, enrichment, and serving APIs.
- Adds local scripts for `live:once` and `live` API startup, with startup refresh running after the server begins listening.
- Adds tests that mock live source HTTP responses without hitting external services.
- Touches API response metadata and frontend display status.
- Uses existing `.env` keys for NewsAPI, Product Hunt, Semantic Scholar, Crossref contact, and AI enrichment; no new browser-exposed secrets.
