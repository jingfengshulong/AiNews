# AI News Backend

This backend is the first implementation slice for the OpenSpec change `add-news-data-backend`.

## Phase 0 Decisions

- Backend code lives under `backend/` so the static frontend can keep working unchanged.
- The MVP backend and worker are TypeScript files executed in development with a tiny local `.ts` ESM loader. The source avoids runtime-only dependencies until the project is ready to install a normal TypeScript toolchain.
- RSS/Atom parsing uses `fast-xml-parser` so feed XML is handled through a structured parser rather than hand-written string parsing.
- Article normalization uses `jsdom` and Mozilla Readability to fetch article pages, extract canonical metadata, and store backend-only text for AI processing.
- PostgreSQL is the persistence target. The first migration defines the core product tables, and the migration planner is dependency-free for now.
- Redis remains the production queue target. This slice introduces the queue lanes and idempotent job semantics through an in-memory adapter so scheduling and tests can move before wiring a Redis client.
- Source secrets are stored as environment variables and referenced by name from source configuration. Product-facing config redacts secret values.

## Scripts

- `npm run backend:test` runs backend unit tests.
- `npm run backend:api` starts the health-only API skeleton.
- `npm run backend:worker` starts the worker skeleton.
- `npm run backend:migrate:plan` prints pending migration ids for local inspection.
- `npm run backend:enrichment:smoke` calls the configured AI enrichment provider with one fixture signal and validates the structured output.
- `npm run backend:ingest:demo` builds a deterministic in-memory demo ingestion flow and prints the generated summary.
- `npm run backend:demo:smoke` starts the demo API on a random port, verifies `/api/home`, and verifies the static homepage is served.
- `npm run backend:demo` starts the local demo API and static frontend at `http://localhost:4100/`.

## Local Configuration

Runtime commands load project-root `.env` values before falling back to the process environment. Keep real secrets in `.env`; use `.env.example` as the shareable template.

Current source and enrichment variables:

- `NEWSAPI_KEY`
- `SEMANTIC_SCHOLAR_API_KEY`
- `PRODUCT_HUNT_TOKEN`
- `CROSSREF_CONTACT_EMAIL`
- `AI_ENRICHMENT_API_KEY`
- `AI_ENRICHMENT_MODEL`
- `AI_ENRICHMENT_BASE_URL`

## Source Notes

The current RSS/Atom source inventory is documented in [docs/rss-source-inventory.md](docs/rss-source-inventory.md). Official AI company pages do not all expose RSS; sources without a confirmed feed remain disabled until a dedicated adapter is implemented.

Non-RSS source adapters are documented in [docs/data-source-adapters.md](docs/data-source-adapters.md).

Source onboarding, usage policy, and attribution rules are documented in [docs/source-onboarding.md](docs/source-onboarding.md).

## Article Normalization

RSS/Atom feeds are treated as discovery sources. Feed items often contain only a title, link, category, publication time, and short description. When a raw item contains an article URL, the normalization step fetches the server-side article page and creates an article candidate with:

- canonical URL
- title, author, publication time, language, and excerpt
- `textForAI`, retained for backend processing
- `fullTextDisplayAllowed`, derived from source usage policy
- content hash and extraction metadata

Product-facing APIs must not expose `textForAI` unless the source policy explicitly allows full text display.

## Research Normalization

arXiv, Semantic Scholar, and Crossref raw items are metadata-backed research sources. They do not need article HTML fetching to become useful downstream candidates. The research normalizer creates a `research_article` candidate from preserved title, abstract, author, category, DOI/arXiv ID, PDF, citation, and canonical link metadata.

This keeps research records compatible with the later deduplication, clustering, scoring, and AI enrichment pipeline while preserving source attribution.

## Process Jobs

Source adapters should persist `RawItem` records and enqueue `process` jobs. The process job handler routes raw items to the correct normalizer for the source type. RSS, Atom, NewsAPI, and Hacker News currently use the article-page normalizer when a URL is available. arXiv, Semantic Scholar, and Crossref use research metadata normalization. Unsupported source types fail explicitly until their dedicated normalizers are added.

## Fetch Retries

Fetch adapters throw structured `SourceFetchError` values for upstream failures. The fetch job handler uses those categories to decide what happens next:

- `rate_limited`: requeues the fetch job for `Retry-After` when available, updates source health, and delays the source's next fetch time.
- `transient_failure`: requeues with bounded exponential backoff.
- `configuration_error` and other non-retryable failures: marks the job failed and updates source health.

Successful fetch jobs persist raw records, enqueue process jobs for new raw items, and mark the source healthy.

## AI Enrichment

Signal enrichment runs asynchronously through the `enrichment` queue lane. The current implementation uses a provider interface, so tests can run with a deterministic provider while production can use an OpenAI-compatible chat completions endpoint.

When a real provider is wired, configure these project-root `.env` values:

- `AI_ENRICHMENT_API_KEY`: provider credential kept server-side.
- `AI_ENRICHMENT_MODEL`: model name selected for brief/key point/timeline generation.
- `AI_ENRICHMENT_BASE_URL`: provider API base URL when using a custom or compatible endpoint.

Generated enrichment output is validated before it is stored. It must stay short, include source attribution, and must not expose copied full article text from sources whose policy forbids full-text display.

Run `npm run backend:enrichment:smoke` after configuring those variables to verify provider connectivity and output shape. The script prints the generated structured enrichment result but never prints the API key.

## Serving APIs

The API server can expose product-facing data through a first-party serving service. Current MVP routes:

- `GET /api/home`
- `GET /api/signals/:id`
- `GET /api/sources`
- `GET /api/sources/:family`
- `GET /api/sources/:family/:sourceId`
- `GET /api/dates/today`
- `GET /api/dates/yesterday`
- `GET /api/dates/week`
- `GET /api/dates?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/topics`
- `GET /api/topics/:slug`
- `GET /api/search?q=&topic=&sourceFamily=&from=&to=`

Product-facing responses include source attribution and original URLs. They exclude backend-only `textForAI` and do not expose copied full article text from restricted sources.

For local visual verification, run `npm run backend:demo` and open `http://localhost:4100/`. The static frontend will call the first-party APIs and render backend-generated demo `Signal` data.
