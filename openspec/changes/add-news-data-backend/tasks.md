## 1. Backend Foundation

- [x] 1.1 Scaffold a TypeScript backend service and worker process without changing the existing static frontend behavior.
- [x] 1.2 Add environment configuration for database URL, Redis URL, source API secrets, enrichment provider secrets, and runtime mode.
- [x] 1.3 Add PostgreSQL migration tooling and create initial tables for sources, raw items, articles, signals, topics, score components, source relations, and job metadata.
- [x] 1.4 Add a Redis-backed queue abstraction for fetch jobs, processing jobs, and AI enrichment jobs.
- [x] 1.5 Add baseline health endpoints and structured logging for API and worker processes.

## 2. Source Management

- [x] 2.1 Implement source registry persistence with fields required by `news-source-management`.
- [x] 2.2 Implement source repository/service methods for create, update, enable, disable, list, and health update operations.
- [x] 2.3 Seed initial MVP source definitions for RSS/Atom feeds and placeholder API-backed sources.
- [x] 2.4 Add validation for source type, fetch interval, language, trust score, credential reference, and usage policy.
- [x] 2.5 Add tests covering enabled/disabled source behavior, usage policy storage, and source health updates.

## 3. Ingestion Pipeline

- [x] 3.1 Implement scheduled fetch job creation for enabled sources whose next fetch time is due.
- [x] 3.2 Implement RSS/Atom adapter that extracts external ID, title, URL, published time, author, summary, and raw payload.
- [x] 3.3 Implement NewsAPI adapter contract and mocked integration tests for authenticated API fetching.
- [x] 3.4 Implement arXiv adapter that parses Atom entries into raw records with arXiv metadata.
- [x] 3.5 Implement adapter contracts for Semantic Scholar, Product Hunt, and Crossref with mocked response fixtures.
- [x] 3.6 Persist raw payloads before normalization and enforce source ID plus external ID deduplication.
- [x] 3.7 Implement normalized article candidate creation from raw items.
- [x] 3.10 Implement shared process job handler that routes RawItems to source-type normalizers and records job completion/failure.
- [x] 3.11 Implement Hacker News adapter contract with official Firebase API story fetching and mocked fixtures.
- [x] 3.12 Implement research-source normalization for arXiv, Semantic Scholar, and Crossref raw items.
- [x] 3.13 Implement product launch normalization for Product Hunt raw items.
- [x] 3.8 Implement per-source rate limit handling, transient retries with bounded backoff, and non-retryable configuration failures.
- [x] 3.9 Add tests covering successful fetch, duplicate raw item handling, retryable failure, rate limit response, and permanent failure.

## 4. Signal Processing

- [x] 4.1 Implement article deduplication using canonical URL, content hash, and title similarity evidence.
- [x] 4.2 Implement conservative deduplication candidate handling for low-confidence matches.
- [x] 4.3 Implement signal clustering from related articles using topic, time window, source evidence, and title similarity.
- [x] 4.4 Implement topic assignment for AI Agent, large model products, AI video, edge models, policy, research, funding, and company announcements.
- [x] 4.5 Implement explainable heat score and signal score calculation with persisted score components.
- [x] 4.6 Implement asynchronous enrichment job model for AI brief, key points, timeline, source mix, next-watch text, and related signals.
- [x] 4.7 Add validation that enrichment output is short, attributable, and does not expose full copied article text when source policy forbids it.
- [x] 4.8 Add tests covering article dedupe, signal clustering, score component persistence, enrichment success, and enrichment failure.

## 5. Serving APIs

- [x] 5.1 Implement `GET /api/home` with lead signal, ranked signals, stats, source summaries, date summaries, and ticker items.
- [x] 5.2 Implement `GET /api/signals/:id` with full detail data, supporting sources, source timeline, source mix, and related signals.
- [x] 5.3 Implement source archive endpoints for source families and individual sources.
- [x] 5.4 Implement date archive endpoints for today, yesterday, weekly, and arbitrary date range queries.
- [x] 5.5 Implement topic list and topic detail endpoints.
- [x] 5.6 Implement search endpoint with query text, source family, topic, and date range filters.
- [x] 5.7 Ensure product-facing API responses include attribution and original links while excluding disallowed full text.
- [x] 5.8 Add API tests covering homepage, detail, source archive, date archive, topic archive, search, not-found, and attribution scenarios.

## 6. Operational Verification

- [x] 6.1 Add local development scripts for database migration, worker startup, API startup, and one-shot ingestion.
- [x] 6.2 Add deterministic fixtures for RSS, arXiv, NewsAPI, Hacker News, Product Hunt, Semantic Scholar, and Crossref adapters.
- [x] 6.3 Add an end-to-end development flow that seeds sources, ingests fixtures, processes signals, and serves API responses.
- [x] 6.4 Document source onboarding rules, usage policy handling, and attribution expectations.
- [x] 6.5 Run OpenSpec validation and the backend test suite before marking the change implementation complete.
