## 1. Runtime Configuration

- [ ] 1.1 Add live scheduler environment parsing for interval minutes, startup refresh enabled, startup lookback hours, scheduled ingestion enabled, and manual force/full-window options.
- [ ] 1.2 Update README and `.env.example` with the new scheduler and incremental ingestion configuration variables.

## 2. Source Cursor State

- [ ] 2.1 Extend source records to persist ingestion cursor state including last successful fetch time, last seen published timestamp, and seen external IDs needed for duplicate avoidance.
- [ ] 2.2 Restore cursor defaults safely for existing runtime snapshots that do not contain cursor fields.
- [ ] 2.3 Update source repository/service helpers to read and update cursor state after successful fetches while preserving cursor state after failures.

## 3. Incremental Filtering

- [ ] 3.1 Add a source-record filtering utility that applies startup lookback windows, incremental cursor checks, and external-ID checks without imposing project-side item-count caps.
- [ ] 3.2 Ensure paginated adapters keep reading within the time/cursor scope until records leave scope, pages are exhausted, or upstream throttling prevents further reads.
- [ ] 3.3 Integrate filtering into live ingestion before raw-item persistence and article extraction.
- [ ] 3.4 Preserve existing raw-item, article, and signal deduplication as the final duplicate safety net.

## 4. Scheduler Runtime

- [ ] 4.1 Add an in-process scheduler module that runs live ingestion every 30 minutes by default.
- [ ] 4.2 Add single-flight protection so startup, scheduled, and manual runs cannot overlap inside one live API process.
- [ ] 4.3 Update `start-live-api.mjs` so startup refresh runs as a 24-hour catch-up pass by default and scheduled runs continue at the configured interval.
- [ ] 4.4 Ensure scheduled run reports include run mode, interval metadata, skipped overlap count, source outcomes, and persisted snapshot metadata.

## 5. One-Shot Commands

- [ ] 5.1 Update `run-live-ingestion.mjs` to support incremental, recovery, force, and lookback options without breaking existing usage.
- [ ] 5.2 Ensure manual one-shot runs can be used safely for recovery without corrupting source cursor state.

## 6. Tests and Verification

- [ ] 6.1 Add tests proving startup refresh only processes items within the default 24-hour lookback when timestamps are reliable.
- [ ] 6.2 Add tests proving scheduled runs skip already-seen items and add new items incrementally.
- [ ] 6.3 Add tests proving repeated runs do not create duplicate raw items, articles, signals, or enrichment jobs.
- [ ] 6.4 Add tests proving source cursor state persists through runtime snapshot save/restore.
- [ ] 6.5 Add tests proving the scheduler interval and single-flight overlap guard work.
- [ ] 6.6 Run `npm run backend:test` and a live scheduler/ingestion smoke check before marking the change complete.
