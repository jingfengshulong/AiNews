## 1. Persistence Foundation

- [x] 1.1 Add serialization and restore tests for the runtime store maps, indexes, counters, queues, and latest run metadata
- [x] 1.2 Implement store snapshot serialization/deserialization with version metadata and safe defaults
- [x] 1.3 Implement atomic file-backed snapshot load/save utilities using only built-in Node APIs
- [x] 1.4 Wire optional snapshot path configuration into live runtime creation and scripts
- [x] 1.5 Verify a live run can restart and retain prior sources, raw items, articles, signals, and counters

## 2. Incremental Refresh And Source Health

- [x] 2.1 Add tests for repeated live runs avoiding duplicate raw items and article candidates
- [x] 2.2 Persist source health fields and next eligible fetch metadata across restarts
- [x] 2.3 Make live refresh reuse persisted source/raw/article indexes before fetching and processing
- [x] 2.4 Add operator run metadata for pending, partial, empty, successful, and failed live refresh states

## 3. Data Quality And Freshness

- [x] 3.1 Add tests for source-family freshness windows, including stale Crossref/research records excluded from latest news
- [x] 3.2 Add article quality classification for missing title, URL, publication time, excerpt/text, language, and policy constraints
- [x] 3.3 Prevent stale or low-quality candidates from contributing to visible latest-news signals while preserving raw/article records
- [x] 3.4 Adjust scoring inputs so fresh multi-source evidence is rewarded and weak single-source evidence is ranked conservatively

## 4. AI Enrichment Quality

- [x] 4.1 Add tests for product-grade Chinese enrichment output shape and validation limits
- [x] 4.2 Tighten the enrichment prompt/normalizer for AI brief, key points, timeline, source mix, next-watch text, and related signals
- [x] 4.3 Preserve fallback summaries and accurate enrichment status when AI credentials are missing or provider output is invalid

## 5. Serving API And Frontend States

- [x] 5.1 Extend homepage/detail API metadata for loading, empty, live, partial-live, stale-live, and demo states
- [x] 5.2 Update frontend hydration to render explicit loading, empty, partial, stale, and API-unavailable states
- [x] 5.3 Remove misleading static fixture copy from hydrated live failure paths while keeping demo preview support
- [x] 5.4 Verify home, detail, sources, dates, topics, and search pages with persisted live data

## 6. Verification And Version Management

- [x] 6.1 Run backend tests and OpenSpec strict validation
- [x] 6.2 Run a real bounded live refresh, restart the live server, and verify persisted data remains visible
- [x] 6.3 Commit implementation in coherent stage-based commits and leave the change ready for archive
