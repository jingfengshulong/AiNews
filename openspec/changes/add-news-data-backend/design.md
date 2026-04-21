## Context

The project currently has a static frontend for an AI news product. The UI already implies backend concepts such as hot stories, signal scores, source categories, date archives, topic lanes, search results, and signal detail pages with AI summaries and source timelines.

The backend must turn multiple raw external items into product-ready information signals. A single homepage story may represent several source articles, papers, product posts, or community discussions. The first implementation should be small enough to ship, but the architecture must leave room for more source types and better ranking later.

Primary constraints:

- The frontend should not depend on third-party APIs directly.
- External source terms, rate limits, and attribution requirements must be respected.
- The MVP should avoid broad web crawling and avoid displaying copyrighted full text.
- Raw payloads should be retained so normalization, clustering, and AI enrichment can be rerun.

## Goals / Non-Goals

**Goals:**

- Provide a backend data model and pipeline for source ingestion, raw storage, normalized articles, clustered signals, topics, rankings, and serving APIs.
- Support initial source families: RSS/Atom, NewsAPI, arXiv, Semantic Scholar, Hacker News, Product Hunt, and Crossref.
- Serve the current frontend surfaces: homepage, signal detail, source archive, date archive, topic archive, and search.
- Keep all product-facing records attributable to their original sources.
- Make ranking and signal scoring explainable and adjustable.

**Non-Goals:**

- Do not build a large-scale crawler in the MVP.
- Do not implement user accounts, payments, personalization, comments, or editorial admin workflows.
- Do not expose third-party source API keys to the browser.
- Do not display full copied article text unless a source license explicitly permits it.
- Do not require real-time streaming for the first version; scheduled freshness is enough.

## Decisions

### Decision 1: Treat product content as `Signal`, not raw articles

The product should serve `Signal` records as the primary content unit. A `Signal` is a clustered, ranked, enriched story built from one or more normalized `Article` records and raw source items.

Rationale:

- The frontend headline, score, source mix, AI brief, and timeline describe a synthesized signal, not a single scraped article.
- This model supports "今日热点" and "爆款资讯" better than a flat feed.
- It keeps the product distinct from a generic RSS reader.

Alternative considered: Serve raw articles directly. This is simpler, but it cannot naturally support source timelines, source mix, or cross-source heat scoring.

### Decision 2: Preserve raw payloads separately from normalized records

The ingestion layer should store source responses as `RawItem` records before normalization. Normalized `Article` and `Signal` records should be derived from these raw records.

Rationale:

- Source parsers and enrichment prompts will evolve.
- Raw storage allows reprocessing without refetching rate-limited APIs.
- Debugging ranking and deduplication is much easier when the original payload is available.

Alternative considered: Only store normalized data. This saves storage, but loses auditability and makes parser changes expensive.

### Decision 2a: Treat RSS/Atom as discovery, then fetch article pages for AI processing

RSS/Atom feeds are discovery sources. Many official feeds provide only title, link, category, publication time, and a short description, not the full article text. After a `RawItem` is stored, the normalization step should fetch the original article URL, extract canonical metadata and readable article text, and create an `Article` candidate.

The extracted article text is backend processing material for deduplication, clustering, and AI enrichment. Product-facing APIs must continue to respect source usage policy and must not expose full copied text when a source forbids it.

Rationale:

- AI enrichment needs more context than many RSS summaries provide.
- The original article URL remains the attribution anchor.
- Separating feed discovery from article extraction keeps source adapters small and makes extraction policy easier to audit.

Alternative considered: Use only RSS descriptions for AI enrichment. This is safe and simple, but summaries are often too short to support useful key points, timelines, or source comparison.

### Decision 2b: Route all raw items through a process job handler before deeper processing

Raw source adapters should stop at `RawItem` persistence and enqueue a `process` job. The process job handler is responsible for selecting the correct normalizer for each source type and producing normalized candidates such as `Article` candidates.

Rationale:

- Keeps source adapters small and source-specific.
- Gives all sources a shared processing lifecycle with job status, completion, and failure metadata.
- Lets unsupported source types fail explicitly until their normalizers are implemented.
- Creates a stable boundary before deduplication, signal clustering, scoring, and AI enrichment.

Alternative considered: Let each adapter normalize and enrich its own records immediately. This is faster for one source type, but it fragments behavior as NewsAPI, arXiv, Hacker News, Product Hunt, and research APIs are added.

### Decision 3: Start with scheduled polling, not event streaming

The MVP should use scheduled fetch jobs with per-source cadence and retry policy. Real-time listeners can be added later for sources that support them.

Rationale:

- RSS/Atom, NewsAPI, arXiv, Semantic Scholar, Product Hunt, and Crossref fit scheduled polling.
- Scheduled polling is easier to rate-limit, monitor, and debug.
- The current product language can tolerate minute-level or hourly freshness.

Alternative considered: Build a real-time ingestion system first. It adds operational complexity before the ranking and enrichment model is proven.

### Decision 4: Use explainable scoring before advanced ML ranking

The first `heat_score` and `signal_score` should be computed from transparent weighted factors such as freshness, source count, source trust, source type mix, community activity, topic velocity, and manual boost.

Rationale:

- Editors and developers need to understand why a story is hot.
- Early product tuning will be faster with visible knobs.
- More advanced models can later consume the same normalized features.

Alternative considered: Use embedding or LLM ranking as the primary ranking mechanism. This can improve quality later, but is harder to debug and more expensive at MVP stage.

### Decision 5: Keep AI enrichment asynchronous and attributable

AI summaries, key points, timelines, related signals, and source mix explanations should be generated after ingestion and clustering, not during request handling.

Rationale:

- The API can stay fast and predictable.
- Enrichment can be retried, versioned, and inspected.
- The product can show cached summaries with source attribution.

Alternative considered: Generate summaries on demand per request. This would increase latency, cost, and failure surface.

### Decision 6: Serve the frontend through first-party APIs

The browser should call project-owned APIs only. Third-party API calls, source secrets, crawling logic, and AI calls remain server-side.

Rationale:

- Prevents leaking API keys and source integration details.
- Lets the backend enforce caching, attribution, filtering, and policy rules.
- Keeps the frontend simple and stable.

Alternative considered: Let frontend call third-party APIs directly for speed. This creates security, CORS, rate-limit, and product consistency problems.

### Decision 7: Use TypeScript for the MVP backend and worker

The MVP should use a TypeScript backend service and TypeScript worker process, with PostgreSQL for persistence and a Redis-backed queue abstraction for scheduled and asynchronous jobs.

Rationale:

- The current frontend is plain web code, and a TypeScript backend keeps the application stack approachable.
- Most source integrations are HTTP/JSON/XML tasks that TypeScript handles well.
- A Redis-backed queue model supports fetch jobs, retry policy, and AI enrichment jobs without introducing a second runtime immediately.
- A Python worker can be added later if clustering or NLP work becomes heavy enough to justify it.

Alternative considered: Use Python for the whole backend. This is attractive for NLP, but adds less value during the MVP because the first implementation is mostly source fetching, persistence, and API serving.

## Risks / Trade-offs

- Source terms and commercial restrictions may block some integrations -> Start with RSS/Atom and permissive APIs; record license and usage policy per source.
- AI summaries may accidentally over-copy source text -> Keep summaries short, generated from multiple sources where possible, and always expose source attribution.
- Duplicate detection may merge unrelated stories -> Store cluster evidence, allow conservative thresholds, and keep lead article/source links inspectable.
- Ranking may feel wrong early -> Use explainable scoring weights and persist score components for tuning.
- External APIs may fail or rate-limit -> Implement backoff, retries, source health, and stale-but-valid responses.
- Storage can grow quickly if all raw payloads are retained -> Add retention policy and payload compression once volume is known.
- Product Hunt and social/community APIs may have commercial limitations -> Treat them as optional sources until usage rights are confirmed.

## Migration Plan

1. Add backend service, worker, and database schema without changing the static frontend.
2. Seed a small source registry with RSS/Atom feeds and a few API sources.
3. Run ingestion manually in development and verify raw and normalized records.
4. Enable scheduled ingestion in development.
5. Generate `Signal` records and expose first-party API endpoints.
6. Wire the frontend to first-party APIs in a later change.

Rollback strategy:

- Disable scheduled workers.
- Continue serving the existing static frontend or cached API responses.
- Preserve raw payloads for debugging unless storage or legal policy requires deletion.

## Open Questions

- Which LLM provider and model should be used for AI enrichment?
- Which exact RSS/API sources should be included in the initial seed list?
- What is the expected freshness target for the homepage: 5 minutes, 15 minutes, hourly, or daily?
- Do we need an editorial review step before AI-generated summaries are published?
