## Why

The project now has a working frontend, source adapters, article extraction, live fetching, scoring, enrichment plumbing, and serving APIs, but the product still behaves like a prototype because live data is in-memory, thin, and easy to lose on restart. We need to turn the current live demo into a repeatable local product runtime that preserves data, refreshes incrementally, filters weak or stale items, and tells the frontend the truth about data state.

## What Changes

- Add a durable local runtime store that can save and reload sources, raw items, articles, source relations, signals, topics, score components, queue jobs, counters, and latest live run metadata without adding a new external database dependency in this change.
- Add incremental live refresh behavior that reuses persisted state, respects source next-fetch and failure metadata, and avoids reprocessing already ingested source items.
- Add source freshness and quality rules so old research/catalog records, empty articles, unsupported language items, and low-signal content do not pollute "latest" news views.
- Upgrade live AI enrichment output quality so product-facing summaries are useful Chinese editorial briefs with key points, timeline, source mix, and next-watch text when model credentials are configured.
- Improve serving/frontend state handling for loading, empty, partial live data, stale live data, and failed source outcomes so the UI does not fall back silently to misleading fixture copy.
- Keep existing deterministic demo behavior available for tests and design previews.

## Capabilities

### New Capabilities

- `news-runtime-persistence`: Durable local storage and restore behavior for the product runtime, including safe snapshots of ingestion, processing, and serving state.

### Modified Capabilities

- `news-ingestion`: Add incremental refresh behavior, persistent run metadata, and freshness/quality filtering before articles become visible product signals.
- `news-source-management`: Add source freshness windows and operator-facing source health rules used by live refresh scheduling.
- `news-signal-processing`: Improve AI enrichment expectations and require low-quality/stale inputs to be downgraded or hidden before ranking.
- `news-serving-api`: Add explicit product data states for loading, empty, partial, stale, and live data, with safe source outcome details for the frontend.

## Impact

- Adds local persistence infrastructure under the backend runtime without introducing a new installed database dependency.
- Touches live runtime startup, one-shot ingestion, queue state, source health, article/signal repositories, enrichment validation, and serving APIs.
- Updates frontend rendering so real API states are visible and fixture copy is not mistaken for live data.
- Adds tests for persistence round trips, incremental refresh behavior, data quality filtering, AI enrichment output shape, and frontend/API state rendering.
- Keeps API keys and backend-only article text server-side.
