# Data Source Adapters

This document records the non-RSS source adapters currently implemented for ingestion.

## arXiv

- Official API: `https://export.arxiv.org/api/query`
- Format: Atom XML
- Adapter: `ArxivAdapter`
- Raw item external ID: arXiv id, for example `2604.12345v1`
- Preserved fields: title, abstract, authors, categories, published/updated timestamps, abstract URL, PDF URL, and raw Atom entry
- Processing note: arXiv uses the research normalizer. It creates a `research_article` candidate from preserved metadata and does not fetch article HTML.

## Research Normalization

- Source types: `arxiv`, `semantic_scholar`, and `crossref`
- Normalizer: `normalizeRawItemToResearchArticleCandidate`
- Output: Article candidate with `normalizedType: research_article` from the process job result
- Backend AI text: built from source type, source name, title, authors, publication time, categories, DOI, arXiv ID, PDF link, canonical URL, citation count, and abstract when available
- Product policy: `textForAI` remains backend processing material. Full-text display still follows source usage policy.
- Downstream behavior: research-backed candidates can enter the same deduplication, signal clustering, scoring, and AI enrichment flow as article-page candidates.

## NewsAPI

- Official endpoint: `https://newsapi.org/v2/everything`
- Format: JSON
- Adapter: `NewsApiAdapter`
- Credential: source `credentialRef` such as `NEWSAPI_KEY`, resolved server-side
- Preserved fields: source name, author, title, description, URL, image URL, published timestamp, truncated content, and raw article object
- Processing note: API keys are never exposed to browser-facing APIs.

## Hacker News

- Official API: `https://hacker-news.firebaseio.com/v0/...`
- Format: JSON
- Adapter: `HackerNewsAdapter`
- Current list endpoint: `newstories.json`
- Preserved fields: HN id, title, URL, author, score, comments count, discussion URL, timestamp, and raw item object
- Processing note: HN records are community signals. If a story URL is present, the shared process handler can fetch the linked article page.

## Semantic Scholar

- Official endpoint: `https://api.semanticscholar.org/graph/v1/paper/search`
- Format: JSON
- Adapter: `SemanticScholarAdapter`
- Credential: optional `SEMANTIC_SCHOLAR_API_KEY`; the adapter works without it and adds `x-api-key` only when a configured key is available
- Preserved fields: paper ID, external IDs, URL, title, abstract, year, publication date, authors, venue, fields of study, citation metrics, open access PDF metadata, publication type, journal, TLDR, and raw paper object
- Processing note: Semantic Scholar records use the research normalizer and do not fetch article HTML.

## Crossref

- Official endpoint: `https://api.crossref.org/works`
- Format: JSON
- Adapter: `CrossrefAdapter`
- Credential: none; optional `CROSSREF_CONTACT_EMAIL` is sent as `mailto` and in the User-Agent for Crossref polite pool behavior
- Preserved fields: DOI, URL, title, abstract, authors, subjects, venue, work type, citation count, publication date, created timestamp, and raw work object
- Processing note: Crossref records use the research normalizer and do not fetch article HTML.

## Product Hunt

- Official endpoint: `https://api.producthunt.com/v2/api/graphql`
- Format: GraphQL over JSON
- Adapter: `ProductHuntAdapter`
- Credential: required `PRODUCT_HUNT_TOKEN`, sent server-side as `Authorization: Bearer ...`
- Preserved fields: post ID, name, tagline, description, slug, Product Hunt URL, website URL, created/featured timestamps, vote/comment/review counts, rank, thumbnail, topics, makers, product links, and raw post object
- Processing note: Product Hunt records use the product launch normalizer. It creates a `product_launch_article` candidate from preserved launch metadata and does not fetch article HTML.
