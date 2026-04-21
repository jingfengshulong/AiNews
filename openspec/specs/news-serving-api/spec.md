# news-serving-api Specification

## Purpose
TBD - created by archiving change add-news-data-backend. Update Purpose after archive.
## Requirements
### Requirement: Homepage API
The system SHALL expose a homepage API that returns the lead signal, ranked hot signals, statistics, source category summaries, date archive summaries, and ticker items.

#### Scenario: Homepage is requested
- **WHEN** a client requests the homepage data
- **THEN** the API SHALL return one lead signal, a ranked list of supporting hot signals, daily stats, source category counts, date archive counts, and ticker text

#### Scenario: No fresh signals exist
- **WHEN** no signals exist for the current day
- **THEN** the homepage API SHALL return the freshest available visible signals and include metadata indicating the data window

### Requirement: Signal detail API
The system SHALL expose a signal detail API that returns a complete detail record for a signal, including metadata, summary, scores, key points, source timeline, source mix, next-watch text, related signals, and supporting source links.

#### Scenario: Existing signal detail is requested
- **WHEN** a client requests detail for an existing visible signal ID
- **THEN** the API SHALL return the signal detail record with supporting sources and related signals

#### Scenario: Missing signal detail is requested
- **WHEN** a client requests detail for a signal ID that does not exist or is not visible
- **THEN** the API SHALL return a not-found response without exposing hidden or deleted signal data

### Requirement: Source archive API
The system SHALL expose source archive APIs that list signals and articles by source family and source.

#### Scenario: Source family archive is requested
- **WHEN** a client requests the research source family archive
- **THEN** the API SHALL return visible signals and articles associated with research sources, ordered by ranking and freshness

### Requirement: Date archive API
The system SHALL expose date archive APIs that list visible signals by date range.

#### Scenario: Today archive is requested
- **WHEN** a client requests signals for today's date window
- **THEN** the API SHALL return visible signals whose primary published time or signal activity falls within that window

### Requirement: Topic archive API
The system SHALL expose topic APIs that list topics and signals assigned to a topic.

#### Scenario: Topic signals are requested
- **WHEN** a client requests signals for the AI Agent topic
- **THEN** the API SHALL return visible signals assigned to that topic with summary metadata and heat scores

### Requirement: Search API
The system SHALL expose a search API that searches signals and articles by query text, topic, source family, and date range.

#### Scenario: Keyword search is requested
- **WHEN** a client searches for "AI Agent 企业采购"
- **THEN** the API SHALL return matching visible signals and articles ordered by relevance, freshness, and product ranking

#### Scenario: Search filter is applied
- **WHEN** a client filters search by source family and date range
- **THEN** the API SHALL return only matching visible results within those filters

### Requirement: Attribution and rights in API responses
The system SHALL include source attribution and original links in product-facing responses and MUST NOT include full copied article text unless allowed by source policy.

#### Scenario: Detail response includes source-derived content
- **WHEN** an API response includes a summary, excerpt, or timeline item derived from source material
- **THEN** the response SHALL include supporting source names and original URLs

