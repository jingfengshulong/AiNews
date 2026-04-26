## Context

The frontend now has a strong homepage and detail-page direction, but category browsing still exposes too many raw source concepts. The product needs a cleaner editorial information architecture: source type, date, and topic are browsing dimensions; individual source names are attribution evidence.

The backend already has signal, article, topic, date, and source family APIs. This change keeps the existing data model mostly intact and adds a shared archive stream pattern so each category detail page can use the same frontend interaction.

## Goals / Non-Goals

**Goals:**
- Treat source type, date, and topic as the only primary category browsing dimensions.
- Keep individual source names visible in attribution, source mix, original links, and health diagnostics.
- Provide cursor-style paginated archive responses for category detail pages.
- Make topic assignment use a controlled taxonomy with AI suggestions when configured and deterministic fallback when AI is unavailable.
- Ensure enriched detail-page AI briefs are substantive enough for the reader, with a minimum of 100 Chinese characters.

**Non-Goals:**
- Add a new database or search engine.
- Display full copied article text in product pages.
- Remove source registry or source health internals.
- Guarantee perfect AI taxonomy accuracy in this phase; the taxonomy will be explainable and bounded, not final.

## Decisions

1. Use source type as the product-facing label for existing source family values.

   The existing source family field already captures the right grouping level. Renaming it in API/UI language is lower risk than introducing a parallel taxonomy. Individual source names remain in attribution payloads.

2. Use offset cursors for archive streams.

   Archive lists are currently generated from in-memory/service-layer collections. Numeric offset cursors keep implementation small and allow the frontend to load more without reworking storage. A later database-backed version can map the same `nextCursor` contract to opaque cursors.

3. Share one stream response shape across source type, date, and topic archives.

   Category pages should not care whether they are showing `product_launch`, `yesterday`, or `ai_agent`. A common `{ items, pageInfo }` contract reduces UI branching and makes tests straightforward.

4. Add AI-assisted topic classification behind the existing enrichment/provider boundary with deterministic fallback.

   The user wants AI classification, but ingestion must not stop when model credentials or provider calls fail. The fallback taxonomy preserves availability and creates a measurable baseline that can be improved later.

5. Enforce AI brief length at validation and fallback generation.

   Prompt wording alone is not enough. The output validator and fallback builder will reject or expand summaries shorter than 100 Chinese characters for detail display.

## Risks / Trade-offs

- Short initial datasets can make infinite scroll feel sparse -> expose `hasMore` and category counts so the UI can clearly stop at the end.
- AI taxonomy can be inconsistent across models -> restrict output to controlled topic slugs and ignore unknown labels.
- Offset cursors can shift if data mutates during browsing -> acceptable for this phase because archive lists are small and freshness matters more than exact replay.
- Longer AI briefs can become padded -> validator should enforce minimum length, while prompt asks for concrete context, impact, and next watch rather than filler.
