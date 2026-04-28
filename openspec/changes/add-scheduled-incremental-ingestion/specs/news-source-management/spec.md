## ADDED Requirements

### Requirement: Source ingestion cursor state
The system SHALL persist per-source ingestion cursor state that can be used to identify newly observed source items across process restarts.

#### Scenario: Source fetch succeeds with records
- **WHEN** a source fetch succeeds and produces one or more source records
- **THEN** the system SHALL update that source's cursor state with the latest reliable published timestamp, the fetch completion time, and a bounded set of recently seen external IDs

#### Scenario: Source fetch succeeds with no records
- **WHEN** a source fetch succeeds and produces no source records
- **THEN** the system SHALL update the source's successful fetch time without moving the last-seen published timestamp backwards

#### Scenario: Source fetch fails
- **WHEN** a source fetch fails
- **THEN** the system SHALL preserve the previous source cursor state and update source health failure metadata

#### Scenario: Runtime snapshot is restored
- **WHEN** the live runtime restores a persisted snapshot
- **THEN** the system SHALL restore source cursor state so future scheduled runs can continue incrementally

### Requirement: Source fetch scheduling state
The system SHALL maintain source scheduling state for both configured fetch intervals and the live ingestion scheduler.

#### Scenario: Scheduled run processes source successfully
- **WHEN** a scheduled ingestion run processes a source successfully
- **THEN** the system SHALL record the source's next eligible fetch time according to its fetch interval

#### Scenario: Scheduled run evaluates source before next eligible time
- **WHEN** a scheduled ingestion run evaluates a source whose next eligible fetch time is in the future
- **THEN** the system SHALL skip that source and report a safe skipped reason

#### Scenario: Operator forces manual run
- **WHEN** an operator runs a manual ingestion command with force or full-window configuration
- **THEN** the system SHALL allow the run to evaluate sources without permanently corrupting their cursor state
