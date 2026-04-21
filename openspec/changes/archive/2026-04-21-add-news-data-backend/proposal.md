## Why

The current frontend is a polished static prototype, but it has no backend contract for real AI news data. We need a backend data system that can collect sources, turn raw items into ranked information signals, and serve the homepage, archives, search, and detail pages through stable APIs.

This should be designed now because the frontend already implies concrete data needs: daily hot stories, source/date/topic browsing, signal statistics, AI summaries, source timelines, and article detail pages.

## What Changes

- Add a configurable source management capability for RSS/Atom feeds and API-based sources.
- Add an ingestion pipeline that fetches raw news, research, product, and community items on a schedule.
- Add normalization, deduplication, clustering, ranking, and AI enrichment to produce product-ready `Signal` records from raw source items.
- Add serving APIs for the existing frontend surfaces: homepage, signal detail, sources, dates, topics, and search.
- Store raw payloads and normalized entities separately so enrichment logic can be rerun without refetching everything.
- Prioritize RSS/Atom, NewsAPI, arXiv, Semantic Scholar, Hacker News, Product Hunt, and Crossref as initial source families.
- Keep large-scale crawling, user accounts, paid subscriptions, and editorial admin workflows out of the MVP.

## Capabilities

### New Capabilities

- `news-source-management`: Manage source definitions, source types, fetch cadence, trust scores, auth requirements, and enabled/disabled status.
- `news-ingestion`: Fetch RSS/Atom and API sources on a schedule, preserve raw payloads, normalize items, handle rate limits, and retry failures safely.
- `news-signal-processing`: Convert normalized items into deduplicated articles and clustered signals with heat scores, signal scores, summaries, source timelines, and related signals.
- `news-serving-api`: Expose product APIs for homepage, signal detail, source archive, date archive, topic archive, and search.

### Modified Capabilities

None.

## Impact

- Adds backend application code, worker/scheduler code, and persistence schema in future implementation.
- Adds external data source integrations and secret/config management for API keys.
- Adds database requirements for `Source`, `RawItem`, `Article`, `Signal`, `Topic`, and supporting relation tables.
- Adds a serving API contract that the existing static frontend can later consume.
- Adds operational concerns: fetch scheduling, rate limiting, retry policy, source attribution, content rights, AI enrichment cost, and monitoring.
