## ADDED Requirements

### Requirement: Incremental live refresh
The system SHALL use persisted ingestion state to refresh live sources incrementally instead of treating each process start as a brand-new corpus.

#### Scenario: Already seen source item is fetched again
- **WHEN** a live source returns an item whose source ID and external ID already exist in persisted raw item indexes
- **THEN** the system SHALL avoid creating a duplicate raw item and SHALL update safe fetch metadata for freshness tracking

#### Scenario: Live runtime restarts
- **WHEN** the live runtime starts after a previous successful live run
- **THEN** the system SHALL reuse persisted raw item, article, source health, queue, and counter state before fetching new source items

### Requirement: Product freshness filtering
The system SHALL apply source-family freshness windows before making newly processed content visible in latest news surfaces.

#### Scenario: Catalog or research item is too old for latest news
- **WHEN** a research or catalog-style source returns an item older than its configured freshness window
- **THEN** the system SHALL preserve the raw item and normalized article but SHALL NOT allow it to become a visible latest-news signal

#### Scenario: Company announcement is fresh
- **WHEN** a company announcement source returns an item inside its configured freshness window
- **THEN** the system SHALL allow the item to proceed through normal deduplication, clustering, scoring, and serving

### Requirement: Article quality gate
The system SHALL classify normalized article candidates by basic product quality before they can contribute to visible signals.

#### Scenario: Article candidate lacks minimum fields
- **WHEN** a normalized candidate lacks a title, usable URL, publication time, or meaningful excerpt/text metadata
- **THEN** the system SHALL preserve it for audit but exclude it from visible signal clustering

#### Scenario: Article candidate passes quality checks
- **WHEN** a normalized candidate has required metadata and satisfies source policy constraints
- **THEN** the system SHALL allow it to contribute to deduplication and signal clustering

