## Context

The live API currently starts the HTTP server and immediately runs one live ingestion pass in the background. That pass fetches the latest bounded window from every ready source, deduplicates by `sourceId + externalId`, processes newly seen raw items, reclusters signals, enriches pending signals, and persists `.data/news-runtime.json`.

This is enough for local testing, but it leaves server deployments with two rough edges: data becomes stale after startup unless an external cron is configured, and startup refresh does not express a clear 24-hour catch-up policy. The existing raw-item and article indexes already prevent most duplicate records, so the change should extend the runtime orchestration instead of replacing the ingestion pipeline.

## Goals / Non-Goals

**Goals:**

- Add a built-in scheduler that runs live ingestion every 30 minutes by default.
- Keep startup serving fast while running a bounded 24-hour catch-up ingestion in the background by default.
- Make recurring refreshes incremental by using per-source cursor state and existing dedupe indexes.
- Persist cursor state in the runtime snapshot so restarts do not lose incremental position.
- Provide environment controls for interval, startup refresh, startup lookback, and manual one-shot behavior.

**Non-Goals:**

- Do not replace `.data/news-runtime.json` with PostgreSQL in this change.
- Do not implement deep historical backfill or arbitrary pagination for every source.
- Do not change frontend API response shapes.
- Do not make AI enrichment run forever in a separate worker; enrichment remains part of the bounded ingestion pass.

## Decisions

### Use an in-process scheduler for the live API

The live API process will own a scheduler that starts after the server listens. It will run at a configurable interval, defaulting to 30 minutes. This keeps single-server deployment simple and avoids requiring operators to configure system cron before the product can stay fresh.

Alternative considered: rely only on Linux cron. Cron remains a useful operational fallback, but it does not satisfy the requirement that the project has its own timed execution capability.

### Keep startup refresh asynchronous and bounded to 24 hours

Startup should still start serving before waiting on network calls. The startup pass will be classified as a catch-up run with a default 24-hour lookback window. Sources should filter fetched items to those published within the window when reliable published timestamps exist; items without reliable timestamps can still pass through dedupe, but should be bounded by per-source item limits.

Alternative considered: disable startup refresh by default and require the scheduler to wait 30 minutes. That makes first boot look stale and does not meet the startup catch-up requirement.

### Track source cursors using published time and recent external IDs

Each source will persist cursor state containing at least `lastSuccessfulFetchAt`, `lastSeenPublishedAt`, and a bounded set of recent `externalId` values. Scheduled runs use that state to process only items newer than the cursor or not previously seen. Existing raw-item dedupe remains the final safety net.

Alternative considered: only rely on raw-item dedupe. That prevents duplicate records, but still wastes fetch, article extraction, and API time by repeatedly processing old feed windows.

### Preserve one-shot ingestion but add run modes

`runOnce` will accept a run mode such as `startup`, `scheduled`, or `manual`, and options for lookback and incremental filtering. The existing `backend:ingest:live` command should remain available and default to a manual run that can be used for operations.

Alternative considered: create a separate scheduler pipeline. That would duplicate fetch/process/cluster/enrich behavior and make bugs harder to reason about.

## Risks / Trade-offs

- Some feeds omit reliable publication times -> Use recent external-ID cursors plus raw-item dedupe as fallback.
- In-process scheduling can overlap if a run takes longer than 30 minutes -> Use a single-flight guard so the next tick is skipped while a run is active.
- Startup refresh plus scheduler tick can double-run -> Start scheduler timing after startup run is scheduled and use the same single-flight guard.
- Server restarts may happen during a write -> Continue using atomic snapshot writes and update cursor state only after source outcomes are known.
- Filtering too aggressively could miss corrected items -> Treat cursor filtering as an optimization before processing, not a replacement for raw-item dedupe; allow manual full-window runs for recovery.

## Migration Plan

1. Add source cursor fields with safe defaults for existing sources restored from snapshots.
2. Add scheduler options and environment parsing without changing existing command names.
3. Make startup refresh use the default 24-hour lookback.
4. Make scheduled runs use incremental filtering and update cursor state after successful fetch/process.
5. Add tests for repeated runs, startup catch-up, scheduler interval, duplicate avoidance, and single-flight behavior.
6. Deploy normally; existing snapshots should continue to load, and sources without cursor state should behave as first-run sources.
