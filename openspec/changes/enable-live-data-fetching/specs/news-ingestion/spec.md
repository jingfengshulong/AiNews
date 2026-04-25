## ADDED Requirements

### Requirement: Live one-shot ingestion runtime
The system SHALL provide a live one-shot ingestion runtime that fetches eligible configured sources and processes the resulting items through the shared ingestion pipeline.

#### Scenario: Live run fetches ready sources
- **WHEN** an operator starts a live one-shot ingestion run
- **THEN** the system SHALL seed configured live sources, fetch each ready enabled source, preserve raw payloads, create normalized article candidates, and return a run report with per-source outcomes

#### Scenario: Live run encounters source failure
- **WHEN** one source fails during a live one-shot ingestion run
- **THEN** the system SHALL record that source failure in the run report and SHALL continue processing other eligible sources

### Requirement: Live API startup refresh
The system SHALL provide a live API startup path that starts serving promptly and runs an initial live ingestion pass in the background.

#### Scenario: Live API server starts
- **WHEN** the live API startup script is executed
- **THEN** the system SHALL start the API server before waiting on external source fetches and SHALL refresh live data in the background

#### Scenario: Live startup has no eligible source data
- **WHEN** the initial live ingestion pass produces no visible signals
- **THEN** the system SHALL start the API server with an explicit empty or fallback data state instead of crashing

### Requirement: Bounded live fetch execution
The system SHALL bound live fetching by configured source eligibility, item limits, request timeouts, and retry policy.

#### Scenario: Source returns more items than the run limit
- **WHEN** a live source adapter returns more items than the configured per-source limit
- **THEN** the system SHALL process only the bounded subset for that run and record the bounded count in run metadata

#### Scenario: Source request times out
- **WHEN** a live source request exceeds the configured timeout
- **THEN** the system SHALL mark that source attempt as failed or retryable according to the existing retry policy without blocking the whole run
