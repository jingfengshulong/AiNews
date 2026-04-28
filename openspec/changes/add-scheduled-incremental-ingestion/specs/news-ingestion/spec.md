## MODIFIED Requirements

### Requirement: Live API startup refresh
The system SHALL provide a live API startup path that starts serving promptly and, unless disabled, runs an initial 24-hour catch-up ingestion pass in the background.

#### Scenario: Live API server starts
- **WHEN** the live API startup script is executed
- **THEN** the system SHALL start the API server before waiting on external source fetches and SHALL refresh live data in the background

#### Scenario: Live startup has no eligible source data
- **WHEN** the initial live ingestion pass produces no visible signals
- **THEN** the system SHALL start the API server with an explicit empty or fallback data state instead of crashing

#### Scenario: Startup refresh uses lookback window
- **WHEN** startup refresh is enabled and no custom lookback is configured
- **THEN** the system SHALL treat the startup refresh as a catch-up run for source items published within the previous 24 hours

#### Scenario: Startup refresh avoids duplicates
- **WHEN** the startup refresh receives items that already exist in the runtime snapshot
- **THEN** the system SHALL update fetch metadata as needed and SHALL NOT create duplicate raw items, article candidates, signals, or enrichment jobs

## ADDED Requirements

### Requirement: Incremental live ingestion runs
The system SHALL support incremental live ingestion runs that use persisted source cursor state and raw-item deduplication to add only newly observed items.

#### Scenario: Incremental run has existing cursor
- **WHEN** a live ingestion run is marked incremental and a source has persisted cursor state
- **THEN** the system SHALL filter fetched source items using the cursor before downstream processing when reliable item metadata is available

#### Scenario: Incremental run has no cursor
- **WHEN** a live ingestion run is marked incremental and a source has no persisted cursor state
- **THEN** the system SHALL process the bounded fetched source window and initialize cursor state after successful processing

#### Scenario: Manual one-shot run
- **WHEN** an operator runs the live one-shot ingestion command manually
- **THEN** the system SHALL continue to support a bounded live ingestion run and SHALL allow configuration to use incremental filtering or a full current-window scan

### Requirement: Source window filtering
The system SHALL support run-level time windows for fetched source records before raw-item persistence.

#### Scenario: Startup catch-up filters by published time
- **WHEN** a startup catch-up run receives an item with a reliable published timestamp older than the configured lookback window
- **THEN** the system SHALL skip that item before article extraction and downstream processing

#### Scenario: Item lacks reliable published time
- **WHEN** a fetched item lacks a reliable published timestamp
- **THEN** the system SHALL keep the item eligible for raw-item deduplication within the bounded source window rather than dropping it solely because the timestamp is missing

#### Scenario: Source returns more than run limit
- **WHEN** a source adapter returns more records than the configured run item limit
- **THEN** the system SHALL apply the source or run item limit before processing and SHALL report the bounded count in run metadata
