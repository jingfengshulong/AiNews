## ADDED Requirements

### Requirement: Live signal processing orchestration
The system SHALL process newly fetched live article candidates through deduplication, clustering, topic assignment, scoring, and enrichment without manual fixture wiring.

#### Scenario: Live articles are processed into signals
- **WHEN** a live ingestion run creates normalized article candidates
- **THEN** the system SHALL run deduplication, clustering, topic assignment, scoring, and enrichment steps needed to make visible signals available to serving APIs

#### Scenario: AI enrichment is unavailable
- **WHEN** live article candidates are processed but the configured AI enrichment provider is unavailable
- **THEN** the system SHALL still create visible basic signals and SHALL mark enrichment status without blocking signal serving

### Requirement: Live duplicate evidence scoring
The system SHALL preserve duplicate or overlapping live evidence as a credibility and heat signal while avoiding duplicate article display.

#### Scenario: Multiple sources cover the same story
- **WHEN** live ingestion finds multiple source items that cluster into the same signal
- **THEN** the system SHALL increase the signal's source evidence count and scoring components while exposing deduplicated article/source references

#### Scenario: Same item is fetched twice
- **WHEN** a live run fetches an item that was already ingested from the same source and external ID
- **THEN** the system SHALL avoid creating duplicate raw or article records while preserving fetch metadata for freshness calculations
