## ADDED Requirements

### Requirement: Signal quality visibility
The system SHALL prevent stale or low-quality article candidates from becoming visible ranked signals while preserving the underlying source evidence.

#### Scenario: Signal contains only stale evidence
- **WHEN** all articles linked to a candidate signal are outside their freshness windows
- **THEN** the system SHALL keep the signal hidden from latest-news surfaces and preserve the linked evidence for archive or audit use

#### Scenario: Signal has fresh supporting evidence
- **WHEN** a candidate signal has at least one quality-approved fresh article
- **THEN** the system SHALL allow scoring and visibility decisions to use that fresh evidence

### Requirement: Product-grade AI enrichment
The system SHALL enrich visible signals with concise Chinese editorial fields grounded in supporting source evidence.

#### Scenario: AI enrichment succeeds
- **WHEN** the configured AI enrichment provider returns valid structured output
- **THEN** the system SHALL store a Chinese AI brief, key points, source-grounded timeline entries, source mix roles, next-watch text, and related signal suggestions that satisfy length and attribution constraints

#### Scenario: AI enrichment is unavailable or invalid
- **WHEN** the enrichment provider is missing, fails, or returns invalid output
- **THEN** the system SHALL preserve the signal, mark enrichment status accurately, and serve a basic fallback summary without exposing backend-only full article text

### Requirement: Evidence-aware score adjustment
The system SHALL adjust product ranking using source diversity, duplicate evidence, freshness, and quality status.

#### Scenario: Multiple credible sources support one signal
- **WHEN** multiple quality-approved sources cluster into the same signal
- **THEN** the system SHALL increase evidence and heat components while exposing deduplicated article references

#### Scenario: Signal has weak or single-source evidence
- **WHEN** a signal has only one low-diversity source or weak quality indicators
- **THEN** the system SHALL rank it conservatively and expose the limited evidence state to serving APIs

