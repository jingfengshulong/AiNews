## ADDED Requirements

### Requirement: Live data freshness metadata
The system SHALL expose data mode and freshness metadata in product-facing API responses that are backed by live ingestion runs.

#### Scenario: Homepage is backed by live data
- **WHEN** the homepage API returns data produced by a live ingestion run
- **THEN** the response SHALL include metadata indicating live mode, last live fetch time, run ID when available, source outcome counts, and whether the data is stale

#### Scenario: Homepage falls back to fixture data
- **WHEN** the homepage API returns deterministic fixture-backed data
- **THEN** the response SHALL include metadata indicating fixture or demo mode so the frontend can distinguish it from live data

### Requirement: Frontend live status display
The system SHALL allow the frontend to display live data status without exposing secrets or backend-only article text.

#### Scenario: Frontend receives live metadata
- **WHEN** the frontend loads homepage data with live freshness metadata
- **THEN** it SHALL render a concise data status using safe metadata fields only

#### Scenario: Frontend receives stale metadata
- **WHEN** the frontend loads homepage data whose freshness metadata indicates stale live data
- **THEN** it SHALL render a stale-live status while continuing to show the available signals
