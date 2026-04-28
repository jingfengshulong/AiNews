## Why

The live server currently performs a single refresh on startup and then stops, which makes cloud-server deployment drift stale unless an external cron is configured. The ingestion behavior also scans the latest source window each time rather than expressing a product contract for startup catch-up and ongoing incremental refresh.

## What Changes

- Add an application-managed scheduler that runs live ingestion every 30 minutes while the API server is running.
- Make startup ingestion default to a 24-hour catch-up window, so a fresh server can populate all available recent news without attempting historical backfill.
- Make scheduled runs incremental by adding every newly observed source item since the last successful source fetch, while preserving existing raw-item, article, and signal deduplication.
- Remove count-based ingestion caps from startup and scheduled runs; time windows, source cursors, source availability, and upstream throttling are the only intended boundaries.
- Persist enough per-source ingestion cursor state to avoid reprocessing already-seen source items across process restarts.
- Keep duplicate handling conservative: repeated source items update fetch metadata but do not create duplicate raw items, articles, signals, or enrichment jobs.
- Add operational controls to disable startup refresh, configure the interval, configure the startup lookback window, and run one-shot ingestion as before.

## Capabilities

### New Capabilities

- `live-ingestion-scheduler`: Covers the built-in scheduler, startup catch-up window, interval execution, incremental cursor behavior, and operator controls for live ingestion.

### Modified Capabilities

- `news-ingestion`: Clarifies live ingestion requirements so startup refresh, scheduled refresh, and duplicate handling behave as a first-class product contract rather than one-shot-only execution.
- `news-source-management`: Adds per-source cursor/fetch-state requirements used by incremental ingestion.

## Impact

- Affects `backend/scripts/start-live-api.mjs`, `backend/scripts/run-live-ingestion.mjs`, and `backend/src/live/live-runtime.ts`.
- Affects source persistence models and repositories that track `nextFetchAt`, last successful fetch metadata, and newly introduced cursor state.
- Affects source adapters where publication-time or external-id filtering must be applied after fetching source windows; paginated adapters should continue until they leave the requested window, exhaust available pages, or hit upstream throttling.
- Affects tests for live runtime startup behavior, scheduler behavior, source readiness, raw-item dedupe, and repeated ingestion runs.
- No frontend API contract change is required; the UI should continue reading the latest persisted snapshot through existing serving APIs.
