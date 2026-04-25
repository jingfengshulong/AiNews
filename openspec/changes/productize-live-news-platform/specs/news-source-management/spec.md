## ADDED Requirements

### Requirement: Source freshness policy
The system SHALL maintain freshness policy metadata for source families and use it during live refresh and ranking.

#### Scenario: Source family has default freshness
- **WHEN** a source does not define a custom freshness window
- **THEN** the system SHALL use the source family's default freshness window for latest-news eligibility

#### Scenario: Source has custom freshness
- **WHEN** a source defines a custom freshness window
- **THEN** the system SHALL use the source-specific freshness window instead of the family default

### Requirement: Persistent source health
The system SHALL persist source health across local runtime restarts.

#### Scenario: Source previously failed
- **WHEN** the runtime restarts after a source failure was recorded
- **THEN** the system SHALL retain the source failure count, last failure time, last error category, and next eligible fetch time

#### Scenario: Source later succeeds
- **WHEN** a source with prior failures completes a later live fetch successfully
- **THEN** the system SHALL update last successful fetch time and reduce or clear active failure state according to the source health policy

