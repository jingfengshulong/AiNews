## Context

The product currently has a deterministic demo runtime that can seed sample data, run the existing ingestion and signal-processing pipeline, and serve API responses to the frontend. The backend already contains source adapters, article extraction, raw item preservation, normalization, deduplication, clustering, scoring, AI enrichment, and API serving components.

The missing piece is an operator-safe live runtime that can fetch configured real sources, skip unavailable authenticated sources cleanly, push fetched items through the shared pipeline, and expose enough metadata for the frontend and logs to distinguish live data from demo fixtures.

## Goals / Non-Goals

**Goals:**

- Provide a one-shot live ingestion path for local verification and manual refreshes.
- Provide a live API startup path that runs an initial live ingestion pass before serving the frontend.
- Reuse existing adapters, source registry, queues, processors, scoring, enrichment, and serving APIs.
- Report per-source readiness, fetched item counts, processed item counts, signal counts, failures, and data freshness.
- Keep third-party API keys server-side and skip credential-gated sources when required keys are absent.
- Keep deterministic demo scripts and tests intact.

**Non-Goals:**

- Build broad web crawling or browser automation crawling.
- Replace the current storage architecture with a production database.
- Guarantee true streaming updates; this change implements controlled one-shot and startup refresh behavior, with later polling possible on the same runtime.
- Expose full copied article text through product APIs.

## Decisions

1. Implement a dedicated live runtime orchestrator.

   The runtime will seed the MVP source registry, evaluate source readiness, enqueue/fetch eligible sources, process raw items, deduplicate articles, cluster and score signals, optionally enrich them, and return a structured run report. This keeps live behavior separate from demo fixtures while sharing the same production pipeline. The alternative was adding ad hoc live logic to the demo runtime, but that would blur fixture behavior with real-source behavior and make tests harder to reason about.

2. Use source readiness instead of all-or-nothing configuration.

   Each live run will classify sources as ready, skipped, or failed. RSS, arXiv, Hacker News, Crossref, and public Semantic Scholar paths can run without paid credentials where supported. NewsAPI and Product Hunt require server-side credentials and will be skipped with an explicit reason when missing. The alternative was failing the entire live run when any credential was absent, but that would make local development brittle.

3. Keep live fetching bounded.

   The runtime will use existing source fetch intervals, adapter limits, request timeouts, and per-source failure handling. It will process a bounded number of items per source in a run so local verification remains fast and accidental API overuse is less likely. The alternative was continuous polling inside the first implementation, but one-shot refreshes are easier to test and safer to operate.

4. Add run and freshness metadata at the serving boundary.

   API responses will include metadata such as data mode, last live fetch time, stale state, source counts, and run ID when available. This gives the frontend a simple signal to show whether it is displaying live, stale-live, or fixture-backed data. The alternative was relying on logs only, which would leave the UI unable to communicate data state.

5. Make AI enrichment opportunistic.

   If the configured OpenAI-compatible model credentials are available, live runs can use the real enrichment provider. If not, the runtime must still produce usable signals from article metadata and extractive summaries. This keeps data acquisition independent from AI provider availability while preserving the path for richer summaries.

## Risks / Trade-offs

- Credential-gated sources may be skipped in local runs -> report skipped sources clearly and keep public sources usable.
- External source schemas and rate limits can change -> isolate parsing in adapters and test live runtime with mocked HTTP responses.
- Live article pages can be slow or extraction may return partial text -> keep timeouts bounded and use source metadata/excerpts as fallback processing material.
- In-memory runtime data will reset on process restart -> treat this as acceptable for the current development phase and leave durable persistence for a later change.
- AI enrichment can fail independently of ingestion -> preserve raw signals and mark enrichment failures without blocking API serving.

## Migration Plan

1. Add live runtime tests with mocked adapters/HTTP responses.
2. Implement source readiness and run reporting.
3. Add one-shot live ingestion and live API startup scripts.
4. Add API/frontend freshness metadata display.
5. Verify with mocked tests first, then run a real local live ingestion pass using configured `.env` credentials.

Rollback is to continue using the existing demo scripts and API runtime. The new live scripts are additive.

## Open Questions

- How often should continuous polling run in production once durable storage exists?
- Which source families should be prioritized when external APIs are rate limited?
- Should future live runs write audit reports to disk for operator review?
