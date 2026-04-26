## Why

The current category experience still treats individual sources as a primary browsing dimension, which makes the product feel noisy and blurs the difference between where an item came from and what it is about. Users need cleaner archive paths for source type, date, and topic, plus longer AI briefs on detail pages so each signal feels complete enough for reading and downstream analysis.

## What Changes

- Replace primary "source" browsing with "source type" browsing, using source families such as technology media, research, community, product launch, policy, funding, and company announcements.
- Keep specific source names only for attribution, source mix, health, and original-link display.
- Add paginated stream archive responses for source type, date, and topic detail pages so the frontend can load more items while scrolling until the category is exhausted.
- Update topic archive behavior around a controlled product taxonomy and AI-assisted per-signal topic assignment, with deterministic fallback when AI classification is unavailable.
- Require detail-page AI briefs to be substantive, with at least 100 Chinese characters for enriched summaries.
- Update the frontend category pages so category landing views show previews, while clicking a source type, date bucket, or topic opens a focused stream page.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `news-serving-api`: source type archive APIs, category stream pagination, date/topic/source-type detail archives, and response fields for source type/topic category pages.
- `news-signal-processing`: AI-assisted controlled topic classification and minimum length requirements for enriched AI briefs.
- `news-source-management`: product-facing distinction between source type browsing and individual source attribution.

## Impact

- Backend serving service and HTTP routes for source type, date, and topic archives.
- Signal processing/enrichment validation for AI brief length and topic assignment metadata.
- Frontend pages for source type, date, and topic archives, including infinite loading behavior.
- Tests covering API pagination, source type naming, topic assignment fallback, and AI brief minimum length.
