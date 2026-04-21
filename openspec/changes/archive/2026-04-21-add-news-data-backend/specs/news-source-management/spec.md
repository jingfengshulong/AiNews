## ADDED Requirements

### Requirement: Source registry
The system SHALL maintain a registry of external data sources with source identity, source type, fetch configuration, language, trust score, usage policy, and enabled status.

#### Scenario: Register RSS source
- **WHEN** an operator registers an RSS or Atom source with name, feed URL, source type, language, fetch interval, trust score, and usage policy
- **THEN** the system SHALL store the source as enabled and make it eligible for scheduled ingestion

#### Scenario: Disable source
- **WHEN** an operator disables a source
- **THEN** the system SHALL exclude that source from future scheduled ingestion without deleting previously ingested records

### Requirement: Source type classification
The system SHALL classify each source into one of the product source families: technology media, research, funding, policy, community, product launch, or company announcement.

#### Scenario: Source appears in source archive
- **WHEN** a source is classified as research
- **THEN** articles and signals derived from that source SHALL be available under the research source category

### Requirement: Source credentials and secrets
The system SHALL store only references to source credentials in source configuration and MUST NOT expose third-party API keys to client-facing API responses.

#### Scenario: API source requires token
- **WHEN** a NewsAPI, Product Hunt, or other authenticated source is configured
- **THEN** the source configuration SHALL reference a server-side secret name instead of storing the secret in product-facing data

### Requirement: Source health tracking
The system SHALL track source health including last successful fetch time, last failure time, failure count, and last error category.

#### Scenario: Source fetch fails
- **WHEN** a source fetch job fails
- **THEN** the system SHALL update that source's failure metadata while preserving its previous successful ingestion state

### Requirement: Source usage policy
The system SHALL record usage policy metadata for each source, including whether full text display is allowed, whether summaries are allowed, whether commercial use needs review, and attribution requirements.

#### Scenario: Source forbids full text display
- **WHEN** a source policy does not allow full text display
- **THEN** product APIs SHALL expose only metadata, short excerpts, generated summaries, and links back to the original source
