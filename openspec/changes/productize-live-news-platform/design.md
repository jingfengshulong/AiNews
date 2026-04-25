## Context

The current product can fetch live sources and serve the resulting signals to the frontend, but the live runtime is still process-local. It creates a fresh in-memory store on startup, so source health, raw item dedupe, article candidates, signal history, score components, enrichment output, and run metadata disappear when the process exits. The frontend can render live data, but sparse or failed runs still make the product feel like a prototype.

The next step is to make the local runtime behave like a small real product: preserve state between runs, refresh incrementally, filter weak inputs before they reach ranking, improve AI-authored editorial fields, and expose honest product data states to the UI.

## Goals / Non-Goals

**Goals:**

- Persist the local runtime state to disk and reload it on future `backend:live` and `backend:ingest:live` runs.
- Reuse persisted source health, raw item indexes, article indexes, signal data, queue state, counters, and latest live run metadata.
- Run live refreshes incrementally so already-seen source items are not duplicated or reprocessed unnecessarily.
- Add source freshness windows and content quality gates before items become visible ranked news.
- Improve live AI enrichment output so summaries, key points, timeline, source mix, and next-watch text read like useful Chinese AI news briefs.
- Make frontend/API data states explicit: loading, empty, live, partial live, stale live, and demo.
- Keep deterministic demo tests intact.

**Non-Goals:**

- Introducing a production database, installing a new database package, or requiring Redis/Postgres to run the local product.
- Building a crawler beyond configured sources.
- Building admin UI for source management.
- Guaranteeing continuous background polling beyond bounded startup/manual refreshes.
- Exposing backend-only article full text to client APIs.

## Decisions

1. Use a file-backed store for this change.

   The existing repositories already operate on a shared `InMemoryStore` with Maps and stable indexes. A file-backed snapshot layer can serialize and restore that store without rewriting every repository or adding an external dependency. This is the smallest useful step from ephemeral prototype to repeatable local runtime.

   Alternative considered: add SQLite now. SQLite is a good later target, but the project currently has no SQLite dependency and installing one would slow the current productization loop. The file-backed store keeps the interface simple while preserving the option to add a database adapter later.

2. Persist complete runtime state, not only final signals.

   Raw items, article indexes, queue jobs, source health, and counters are part of correctness. Persisting only signals would make dedupe and incremental fetch unreliable. The snapshot will include all store maps plus latest live run metadata.

3. Keep persistence explicit at runtime boundaries.

   The live runtime will load persisted state during creation, run the existing pipeline, then save after meaningful mutations such as live refresh completion. Repositories stay simple, and tests can use temporary files to verify round trips.

4. Add quality gates before ranking, not after rendering.

   The serving layer should not have to guess whether a signal is too stale or too weak. Ingestion/signal processing will mark or exclude items based on source family freshness windows, missing title/URL/content, unsupported language, and excessive age. This prevents old catalog metadata from appearing as "latest" news.

5. Make AI enrichment structured and validation-aware.

   The existing OpenAI-compatible provider already accepts structured JSON. This change tightens the requested output shape around Chinese product summaries, short key points, source-grounded timeline entries, source mix roles, and next-watch text. If the AI provider is unavailable, the system still serves basic signals with explicit enrichment status.

6. Treat data state as a first-class API contract.

   The frontend needs to know whether it is rendering fresh live data, stale live data, partial results, empty results, or demo data. The API will expose safe counts and status fields, not secrets or backend-only article text. The UI will render those states directly instead of leaving fixture copy in place.

## Risks / Trade-offs

- File snapshots can become large as sources grow -> keep this as a local product runtime and define a later database change when scale requires it.
- Snapshot writes can be interrupted -> write atomically through a temporary file and rename after successful serialization.
- Persisted schemas can evolve -> include a snapshot version and tolerate missing optional fields on restore.
- Quality gates can hide useful older research -> use per-source-family freshness windows and preserve raw/articles even when signals are hidden from "latest".
- AI output can be generic or invalid -> validate required fields, cap lengths, preserve attribution, and fall back to extractive summaries without blocking serving.
- Frontend empty states can feel sparse -> use honest but polished states that explain source coverage and refresh status without showing fake news.

## Migration Plan

1. Add persistence serialization tests and file-backed store round-trip behavior.
2. Wire persistence into live runtime scripts with an environment-configurable data path.
3. Add incremental refresh tests using persisted raw item indexes and source health.
4. Add source freshness and article quality gates with tests for stale Crossref/research records.
5. Tighten AI enrichment output and validation tests.
6. Update serving API and frontend rendering for product data states.
7. Run backend tests, OpenSpec validation, and a real live run that survives process restart.

Rollback is to run the existing demo runtime or delete the local runtime snapshot file; source credentials remain in `.env` and are not persisted.

## Open Questions

- What should the default local snapshot path be for long-running development: `.data/news-runtime.json` or a path controlled only by env?
- How aggressive should freshness windows be for research sources versus company announcements?
- Should the later database change target SQLite first or move directly to Postgres-compatible repositories?
