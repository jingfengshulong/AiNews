## ADDED Requirements

### Requirement: Category stream pagination
The system SHALL expose a shared paginated stream shape for source type, date, and topic archive detail APIs.

#### Scenario: First category stream page is requested
- **WHEN** a client requests the first page of a category stream with a limit
- **THEN** the API SHALL return visible signal summaries ordered by category-specific ranking and freshness, plus page metadata containing `limit`, `nextCursor`, and `hasMore`

#### Scenario: Final category stream page is requested
- **WHEN** a client requests a category stream page after all matching items have been returned
- **THEN** the API SHALL return no additional items and SHALL set `hasMore` to false

## MODIFIED Requirements

### Requirement: Source archive API
The system SHALL expose product-facing source type archive APIs that list visible signals by source type while keeping individual sources for attribution and original-link display only.

#### Scenario: Source family archive is requested
- **WHEN** a client requests the research source type archive
- **THEN** the API SHALL return visible signals associated with research-type sources, ordered by ranking and freshness, without exposing individual source archives as primary navigation

#### Scenario: Source type landing page is requested
- **WHEN** a client requests source type summaries
- **THEN** the API SHALL return source type categories with counts and preview signals, not a raw list of individual source feeds

### Requirement: Date archive API
The system SHALL expose date archive APIs that list visible signals by date range and support paginated archive detail streams.

#### Scenario: Today archive is requested
- **WHEN** a client requests signals for today's date window
- **THEN** the API SHALL return visible signals whose primary published time or signal activity falls within that window

#### Scenario: Date detail stream is requested
- **WHEN** a client requests a date archive with cursor and limit parameters
- **THEN** the API SHALL return the matching page of visible signals and page metadata indicating whether more results are available

### Requirement: Topic archive API
The system SHALL expose topic APIs that list controlled product topics and paginated visible signals assigned to each topic.

#### Scenario: Topic signals are requested
- **WHEN** a client requests signals for the AI Agent topic
- **THEN** the API SHALL return visible signals assigned to that topic with summary metadata, heat scores, and page metadata

#### Scenario: Topic landing page is requested
- **WHEN** a client requests topic summaries
- **THEN** the API SHALL return all controlled product topics with counts and preview signals

### Requirement: Search API
The system SHALL expose a search API that searches signals by query text, topic, source type, and date range.

#### Scenario: Keyword search is requested
- **WHEN** a client searches for "AI Agent 企业采购"
- **THEN** the API SHALL return matching visible signals ordered by relevance, freshness, and product ranking

#### Scenario: Search filter is applied
- **WHEN** a client filters search by source type and date range
- **THEN** the API SHALL return only matching visible signal results within those filters
