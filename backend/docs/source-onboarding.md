# Source Onboarding and Attribution

This backend treats external sources as discovery and evidence inputs for product-facing `Signal` records. A source should be added only when its access method, rate limits, attribution requirements, and display rights are understood.

## Onboarding Checklist

1. Choose the source family:
   - `company_announcement` for official company blogs, release notes, and newsroom posts.
   - `technology_media` for press and industry coverage.
   - `research` for arXiv, Semantic Scholar, Crossref, papers, and benchmarks.
   - `community` for Hacker News or similar discussion signals.
   - `product_launch` for Product Hunt and launch directories.
   - `funding` for investment and acquisition feeds.
   - `policy` for regulation, governance, and compliance sources.
2. Choose the source type:
   - `rss`, `atom`, `newsapi`, `arxiv`, `semantic_scholar`, `hacker_news`, `product_hunt`, or `crossref`.
3. Set a conservative `fetchIntervalMinutes`.
4. Set `trustScore` based on editorial reliability, source authority, and directness of evidence.
5. Add `credentialRef` only as an environment variable name. Never store secret values in source records.
6. Record the usage policy before enabling the source.

## Usage Policy Fields

Every source stores:

- `allowFullText`: whether the product may display full copied article text.
- `allowSummary`: whether short summaries may be displayed.
- `commercialUseNeedsReview`: whether commercial deployment needs another review.
- `attributionRequired`: whether responses must include source names and original links.

The MVP defaults to `allowFullText: false`. Article text extracted from RSS-linked pages is backend-only material for deduplication, clustering, scoring, and AI enrichment.

## Attribution Rules

Product-facing APIs must include:

- source name
- source family/type
- original article or item URL
- supporting source references for AI brief, key points, and timeline items

Product-facing APIs must not include:

- source API keys
- raw payloads
- backend-only `textForAI`
- copied long article passages from restricted sources

## Development Fixtures

The demo flow uses deterministic fixture records for RSS, NewsAPI, Hacker News, arXiv, Semantic Scholar, Product Hunt, and Crossref. These fixtures exercise the same raw item, process job, signal, scoring, enrichment, and serving API layers without calling external networks.

Run:

```bash
npm run backend:ingest:demo
npm run backend:demo:smoke
npm run backend:demo
```

Then open `http://localhost:4100/` to view the frontend with backend-generated demo data.
