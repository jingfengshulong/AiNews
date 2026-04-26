## ADDED Requirements

### Requirement: Substantive AI briefs
The system SHALL store enriched AI briefs that are long enough to support the detail page reading experience while remaining transformative and attributable.

#### Scenario: AI enrichment returns a short brief
- **WHEN** an enrichment provider returns an AI brief shorter than 100 Chinese characters
- **THEN** the system SHALL reject or repair the enrichment output before marking the signal enrichment as completed

#### Scenario: Fallback enrichment is used
- **WHEN** AI enrichment is unavailable and the system builds fallback detail copy
- **THEN** the fallback AI brief SHALL be at least 100 Chinese characters and SHALL be based only on available signal/article metadata

## MODIFIED Requirements

### Requirement: AI enrichment
The system SHALL enrich signals asynchronously with AI brief, key points, source timeline, source mix, next-watch text, related signal suggestions, and controlled topic suggestions when configured.

#### Scenario: Signal has enough source evidence
- **WHEN** a signal has sufficient linked article evidence for enrichment
- **THEN** the system SHALL enqueue an enrichment job and store the generated fields after successful validation

#### Scenario: Enrichment fails
- **WHEN** an enrichment job fails due to provider, prompt, or validation error
- **THEN** the system SHALL preserve the signal and mark enrichment status as failed without blocking raw ingestion or serving basic signal data

### Requirement: Topic assignment
The system SHALL assign each signal to one or more controlled product topics used by the product, including AI Agent, large model products, AI video, edge models, policy, research, funding, and company announcements, using AI suggestions when available and deterministic fallback rules otherwise.

#### Scenario: Signal topic is assigned
- **WHEN** a signal is assigned to the AI Agent topic
- **THEN** it SHALL be retrievable through the topic archive API for AI Agent

#### Scenario: AI topic suggestion is unavailable
- **WHEN** the configured AI provider is unavailable or returns invalid topic labels
- **THEN** the system SHALL assign topics using deterministic taxonomy rules and SHALL ignore unknown topic labels

#### Scenario: Multiple topics are suggested
- **WHEN** AI and fallback rules suggest multiple topics for a signal
- **THEN** the system SHALL keep only controlled topic slugs and SHALL expose the primary topic plus bounded secondary topics for navigation
