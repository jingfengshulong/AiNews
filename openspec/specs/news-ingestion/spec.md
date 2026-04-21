# news-ingestion Specification

## Purpose
TBD - created by archiving change add-news-data-backend. Update Purpose after archive.
## Requirements
### Requirement: Scheduled source fetching
The system SHALL create fetch jobs for enabled sources according to each source's configured fetch interval and source type.

#### Scenario: Enabled source reaches fetch interval
- **WHEN** an enabled source's next fetch time is due
- **THEN** the system SHALL enqueue a fetch job for that source

#### Scenario: Disabled source reaches fetch interval
- **WHEN** a disabled source's next fetch time is due
- **THEN** the system SHALL NOT enqueue a fetch job for that source

### Requirement: Source-specific adapters
The system SHALL support source adapters for RSS/Atom, NewsAPI, arXiv, Semantic Scholar, Hacker News, Product Hunt, and Crossref in the backend ingestion layer.

#### Scenario: RSS feed is fetched
- **WHEN** the RSS/Atom adapter fetches a valid feed
- **THEN** the adapter SHALL extract feed items with external ID, title, URL, published time, author when available, summary when available, and raw payload

#### Scenario: arXiv query is fetched
- **WHEN** the arXiv adapter fetches query results
- **THEN** the adapter SHALL parse Atom entries into normalized raw records with arXiv ID, title, abstract, authors, categories, published time, updated time, and source links

#### Scenario: NewsAPI query is fetched
- **WHEN** the NewsAPI adapter fetches authenticated query results
- **THEN** the adapter SHALL use a server-side credential reference and extract source name, author, title, description, URL, image URL, published time, truncated content, and raw payload

#### Scenario: Hacker News stories are fetched
- **WHEN** the Hacker News adapter fetches story IDs and item records from the official Firebase API
- **THEN** the adapter SHALL extract HN ID, title, URL, author, published time, score, comments count, discussion URL, and raw payload

#### Scenario: Semantic Scholar query is fetched
- **WHEN** the Semantic Scholar adapter fetches paper search results with or without an API key
- **THEN** the adapter SHALL extract paper ID, external IDs, title, abstract, URL, authors, publication date, fields of study, citation metrics, open access PDF metadata, TLDR, and raw payload

#### Scenario: Crossref works query is fetched
- **WHEN** the Crossref adapter fetches works metadata
- **THEN** the adapter SHALL include polite contact metadata when configured and extract DOI, title, abstract, URL, authors, subjects, publication date, citation count, venue metadata, and raw payload

#### Scenario: Product Hunt launches are fetched
- **WHEN** the Product Hunt adapter fetches GraphQL posts with a server-side bearer token
- **THEN** the adapter SHALL extract post ID, name, tagline, description, Product Hunt URL, website URL, launch time, votes, comments, rank, topics, makers, media, and raw payload

### Requirement: Raw payload preservation
The system SHALL persist raw source payloads before normalization, including source ID, external ID, fetched time, content hash, and original response metadata.

#### Scenario: New raw item is received
- **WHEN** an adapter returns a source item that has not been seen before
- **THEN** the system SHALL store a `RawItem` record with the original payload and ingestion metadata

#### Scenario: Duplicate raw item is received
- **WHEN** an adapter returns a source item with the same source ID and external ID as an existing raw item
- **THEN** the system SHALL avoid creating a duplicate raw item and SHALL update fetch metadata if needed

### Requirement: Normalized item creation
The system SHALL transform raw items into normalized article candidates with canonical URL, title, source ID, published time, language, excerpt, and source type.

#### Scenario: Raw item has a canonical URL
- **WHEN** a raw item contains a resolvable article URL
- **THEN** the normalized article candidate SHALL use the canonical URL for deduplication and linking

#### Scenario: Raw feed item links to article page
- **WHEN** a raw RSS or Atom item contains an article URL
- **THEN** the system SHALL fetch the article page server-side, extract canonical URL, title, publication metadata, readable text for backend AI processing, excerpt, language, and content hash

#### Scenario: Raw research item contains abstract metadata
- **WHEN** a raw arXiv, Semantic Scholar, or Crossref item contains title, abstract, author, category, DOI, or source link metadata
- **THEN** the system SHALL create a research-backed Article candidate for downstream deduplication, clustering, and AI enrichment without fetching article HTML

#### Scenario: Raw product launch item contains launch metadata
- **WHEN** a raw Product Hunt item contains product name, tagline, description, maker, topic, vote, comment, rank, URL, or website metadata
- **THEN** the system SHALL create a product-launch Article candidate for downstream deduplication, clustering, scoring, and AI enrichment without fetching article HTML

#### Scenario: Source policy forbids full text display
- **WHEN** an article page is extracted from a source whose usage policy forbids full text display
- **THEN** the system SHALL retain extracted text as backend-only processing material and SHALL mark the normalized article candidate so product-facing APIs do not expose full copied text

### Requirement: Process job handling
The system SHALL process queued raw item jobs through a shared process job handler that routes each raw item to the appropriate normalizer for its source type.

#### Scenario: RSS raw item process job is handled
- **WHEN** a process job references a raw RSS item and source
- **THEN** the system SHALL fetch the linked article page, create an Article candidate, and mark the process job as completed

#### Scenario: Research raw item process job is handled
- **WHEN** a process job references a raw arXiv, Semantic Scholar, or Crossref item and source
- **THEN** the system SHALL create a research-backed Article candidate from preserved raw metadata and mark the process job as completed

#### Scenario: Product Hunt raw item process job is handled
- **WHEN** a process job references a raw Product Hunt item and source
- **THEN** the system SHALL create a product-launch Article candidate from preserved raw metadata and mark the process job as completed

#### Scenario: Unsupported source type reaches process handler
- **WHEN** a process job references a source type whose normalizer is not implemented
- **THEN** the system SHALL mark the process job as failed with an unsupported source type category and SHALL NOT create a normalized candidate

### Requirement: Rate limiting and retry policy
The system SHALL enforce per-source rate limits and retry transient failures with bounded exponential backoff.

#### Scenario: Source returns rate limit response
- **WHEN** a source returns a rate-limit response or equivalent throttling signal
- **THEN** the system SHALL delay further fetches for that source according to its rate-limit policy and SHALL NOT retry in a tight loop

#### Scenario: Source returns transient failure
- **WHEN** a source returns a retryable transient failure such as an upstream 5xx response
- **THEN** the system SHALL requeue the fetch job with bounded exponential backoff until the configured attempt limit is reached

#### Scenario: Source returns permanent error
- **WHEN** a source returns a permanent configuration error such as invalid credentials or malformed URL
- **THEN** the system SHALL mark the fetch job as failed with a non-retryable error category

