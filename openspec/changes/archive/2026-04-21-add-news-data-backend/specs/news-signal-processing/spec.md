## ADDED Requirements

### Requirement: Article deduplication
The system SHALL deduplicate normalized article candidates into canonical `Article` records using canonical URL, source external ID, title similarity, and content hash signals.

#### Scenario: Same URL appears from multiple fetches
- **WHEN** two normalized article candidates have the same canonical URL
- **THEN** the system SHALL link them to the same canonical `Article` record

#### Scenario: Different URLs describe same wire story
- **WHEN** multiple article candidates have different URLs but highly similar titles and publication windows
- **THEN** the system SHALL mark them as deduplication candidates without automatically merging if confidence is below the configured threshold

### Requirement: Signal clustering
The system SHALL cluster related articles into `Signal` records that represent product-facing hot stories.

#### Scenario: Multiple articles describe same trend
- **WHEN** several articles share topic, time window, title similarity, and source evidence above the clustering threshold
- **THEN** the system SHALL create or update a `Signal` that links those articles as supporting sources

#### Scenario: Article does not match existing signal
- **WHEN** an article does not match any existing active signal above the clustering threshold
- **THEN** the system SHALL create a new candidate signal or leave the article unclustered according to the configured policy

### Requirement: Explainable scoring
The system SHALL calculate `heat_score` and `signal_score` from explainable components including freshness, source count, source trust, source type mix, topic velocity, community activity when available, and manual boost when present.

#### Scenario: Signal score is calculated
- **WHEN** a signal is ranked
- **THEN** the system SHALL persist both the final scores and the score components used to calculate them

#### Scenario: Homepage ranking is requested
- **WHEN** the homepage API requests top signals
- **THEN** signals SHALL be ordered by product ranking derived from heat score, signal score, freshness, and editorial visibility flags

### Requirement: AI enrichment
The system SHALL enrich signals asynchronously with AI brief, key points, source timeline, source mix, next-watch text, and related signal suggestions.

#### Scenario: Signal has enough source evidence
- **WHEN** a signal has sufficient linked article evidence for enrichment
- **THEN** the system SHALL enqueue an enrichment job and store the generated fields after successful completion

#### Scenario: Enrichment fails
- **WHEN** an enrichment job fails due to provider, prompt, or validation error
- **THEN** the system SHALL preserve the signal and mark enrichment status as failed without blocking raw ingestion or serving basic signal data

### Requirement: Attribution-safe summaries
The system SHALL generate summaries that are short, transformative, and attributable to supporting sources, and MUST NOT expose copied full article text unless the source policy allows it.

#### Scenario: Detail API returns enriched signal
- **WHEN** a signal detail response includes AI brief and key points
- **THEN** the response SHALL also include supporting source references and original URLs for attribution

### Requirement: Topic assignment
The system SHALL assign each signal to one or more topics used by the product, including AI Agent, large model products, AI video, edge models, policy, research, funding, and company announcements.

#### Scenario: Signal topic is assigned
- **WHEN** a signal is assigned to the AI Agent topic
- **THEN** it SHALL be retrievable through the topic archive API for AI Agent
