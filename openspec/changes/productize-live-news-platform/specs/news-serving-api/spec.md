## ADDED Requirements

### Requirement: Product data state metadata
The system SHALL expose product data state metadata in serving API responses so the frontend can render honest live-data states.

#### Scenario: Live refresh is still pending
- **WHEN** the API is serving before the first live refresh has completed
- **THEN** homepage metadata SHALL indicate a loading or pending live state without exposing fixture content as live news

#### Scenario: Live refresh has partial failures
- **WHEN** at least one source succeeds and at least one source fails or is skipped
- **THEN** homepage metadata SHALL indicate partial live data with safe source outcome counts and reason categories

#### Scenario: Live refresh has no visible signals
- **WHEN** a live refresh completes but no quality-approved visible signals exist
- **THEN** homepage metadata SHALL indicate an empty live state and provide safe source/run context for the frontend

### Requirement: Frontend state rendering
The frontend SHALL render loading, empty, partial, stale, and live data states without relying on static fixture copy after API hydration begins.

#### Scenario: Homepage receives empty live state
- **WHEN** the homepage API reports an empty live state
- **THEN** the frontend SHALL show polished empty-state content and source refresh context instead of stale sample headlines

#### Scenario: Homepage receives partial live state
- **WHEN** the homepage API reports partial live data
- **THEN** the frontend SHALL show available live signals and a concise status line indicating source successes and failures

#### Scenario: API request fails
- **WHEN** frontend API hydration fails
- **THEN** the frontend SHALL show an explicit API unavailable state and SHALL NOT imply that static fixture content is current live news

