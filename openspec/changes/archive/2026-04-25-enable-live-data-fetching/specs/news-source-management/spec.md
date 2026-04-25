## ADDED Requirements

### Requirement: Live source readiness
The system SHALL evaluate source readiness before live ingestion using enabled status, source type support, required credential references, and required endpoint configuration.

#### Scenario: Public source is ready
- **WHEN** an enabled public RSS, arXiv, Hacker News, Crossref, or public Semantic Scholar source has the required endpoint configuration
- **THEN** the source SHALL be eligible for a live ingestion run

#### Scenario: Credential source is missing secret
- **WHEN** an enabled NewsAPI, Product Hunt, or other credential-gated source lacks its required server-side secret
- **THEN** the source SHALL be skipped for the live run with a credential-missing reason and the secret value SHALL NOT be exposed in logs or API responses

### Requirement: Live source run reporting
The system SHALL report live source outcomes with source identity, readiness state, fetched count, processed count, failure category, and last successful fetch time when available.

#### Scenario: Source succeeds in live run
- **WHEN** a live source fetch and processing pass succeeds
- **THEN** the run report SHALL include the source ID, source name, fetched item count, processed item count, and success status

#### Scenario: Source is skipped in live run
- **WHEN** a source is not eligible for live ingestion
- **THEN** the run report SHALL include the source ID, source name, skipped status, and safe reason category
