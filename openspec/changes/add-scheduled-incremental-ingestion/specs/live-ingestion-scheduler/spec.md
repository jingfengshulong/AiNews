## ADDED Requirements

### Requirement: Built-in live ingestion scheduler
The system SHALL run live ingestion on a built-in schedule while the live API process is running, with a default interval of 30 minutes.

#### Scenario: Scheduler starts with live API
- **WHEN** the live API server starts successfully
- **THEN** the system SHALL start a live ingestion scheduler using the configured interval or the 30-minute default

#### Scenario: Scheduler reaches interval
- **WHEN** the configured ingestion interval elapses
- **THEN** the system SHALL run one scheduled live ingestion pass and persist the resulting runtime snapshot

#### Scenario: Scheduler is disabled
- **WHEN** an operator disables scheduled ingestion through configuration
- **THEN** the system SHALL serve existing data without starting interval-based ingestion

### Requirement: Scheduler single-flight execution
The system SHALL prevent overlapping live ingestion runs within the same live API process.

#### Scenario: Scheduled tick occurs during active run
- **WHEN** a scheduled ingestion tick occurs while another live ingestion pass is still running
- **THEN** the system SHALL skip or defer that tick and SHALL NOT start a second concurrent ingestion pass

#### Scenario: Active run completes
- **WHEN** the active ingestion pass completes
- **THEN** the system SHALL allow a later scheduled tick or manual trigger to start another ingestion pass

### Requirement: Startup catch-up window
The system SHALL run a startup catch-up ingestion pass by default using a 24-hour lookback window.

#### Scenario: Live API starts with startup refresh enabled
- **WHEN** the live API startup script is executed
- **THEN** the system SHALL start serving promptly and run a background catch-up ingestion pass for source items published within the configured lookback window or the 24-hour default

#### Scenario: Startup refresh is disabled
- **WHEN** an operator disables startup refresh through configuration
- **THEN** the system SHALL start serving from the persisted snapshot without running the startup catch-up pass

#### Scenario: Startup lookback is configured
- **WHEN** an operator configures a startup lookback duration
- **THEN** the startup catch-up pass SHALL use that duration instead of the 24-hour default

### Requirement: Incremental scheduled ingestion
The system SHALL treat scheduled ingestion runs as incremental runs that add new source items without reprocessing already-seen items.

#### Scenario: Source returns previously seen item
- **WHEN** a scheduled ingestion run receives a source item whose source ID and external ID have already been persisted
- **THEN** the system SHALL avoid creating duplicate raw items, article candidates, signals, or enrichment jobs

#### Scenario: Source returns new item after cursor
- **WHEN** a scheduled ingestion run receives source items newer than the source cursor or not present in the external-ID cursor
- **THEN** the system SHALL persist and process every eligible item through the normal ingestion pipeline without applying a project-side item-count cap

#### Scenario: Source returns old item before cursor
- **WHEN** a scheduled ingestion run receives a source item older than the source cursor and already represented in recent external IDs
- **THEN** the system SHALL skip downstream processing for that item

### Requirement: Scheduler observability
The system SHALL report scheduler run state and outcomes through logs and persisted runtime metadata.

#### Scenario: Scheduled run completes
- **WHEN** a scheduled ingestion run completes
- **THEN** the system SHALL record run mode, start time, completion time, fetched count, processed count, source outcomes, and skipped overlap count when applicable

#### Scenario: Scheduled run fails
- **WHEN** a scheduled ingestion run fails
- **THEN** the system SHALL log the failure and preserve the previously serving snapshot instead of crashing the API server
