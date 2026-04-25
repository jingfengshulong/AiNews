## ADDED Requirements

### Requirement: Durable local runtime snapshot
The system SHALL persist the local product runtime state to a durable snapshot file that can be restored by later live runs.

#### Scenario: Runtime state is saved
- **WHEN** a live refresh completes successfully or partially
- **THEN** the system SHALL save sources, raw items, raw item indexes, articles, article indexes, source relations, signals, signal links, topics, topic links, score components, queue jobs, counters, and latest run metadata to the configured local snapshot path

#### Scenario: Runtime state is restored
- **WHEN** the live runtime starts and a valid snapshot exists
- **THEN** the system SHALL restore persisted runtime state before seeding sources or fetching new data

### Requirement: Atomic snapshot writes
The system SHALL write runtime snapshots atomically to avoid corrupting the durable state on interrupted writes.

#### Scenario: Snapshot write succeeds
- **WHEN** the runtime saves state
- **THEN** it SHALL write a temporary snapshot and replace the target snapshot only after serialization succeeds

#### Scenario: Snapshot file is missing
- **WHEN** the runtime starts and no snapshot exists
- **THEN** it SHALL start with an empty store and continue normal source seeding

### Requirement: Snapshot version tolerance
The system SHALL include snapshot version metadata and tolerate missing optional fields during restore.

#### Scenario: Snapshot has older optional fields
- **WHEN** the runtime restores a snapshot that lacks optional metadata introduced later
- **THEN** it SHALL restore the supported fields and use safe defaults for missing optional fields

#### Scenario: Snapshot is invalid
- **WHEN** the configured snapshot cannot be parsed as a supported runtime state
- **THEN** the runtime SHALL fail with an operator-visible error instead of silently discarding persisted data

