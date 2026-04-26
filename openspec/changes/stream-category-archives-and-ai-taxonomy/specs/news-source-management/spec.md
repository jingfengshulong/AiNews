## ADDED Requirements

### Requirement: Product-facing source type navigation
The system SHALL expose source type as a primary product navigation dimension and SHALL keep individual source names out of primary browse navigation.

#### Scenario: Frontend requests source type categories
- **WHEN** the frontend loads category navigation for source browsing
- **THEN** it SHALL receive source type categories with counts and previews, not individual source feed pages

#### Scenario: Detail page displays source evidence
- **WHEN** a signal detail page displays supporting evidence
- **THEN** it SHALL show individual source names and original URLs as attribution rather than as navigation categories

## MODIFIED Requirements

### Requirement: Source type classification
The system SHALL classify each source into one of the product source types: technology media, research, funding, policy, community, product launch, or company announcement.

#### Scenario: Source appears in source archive
- **WHEN** a source is classified as research
- **THEN** articles and signals derived from that source SHALL be available under the research source type category

#### Scenario: Source name is used for attribution
- **WHEN** a signal includes articles from an individual source such as MIT Technology Review RSS
- **THEN** the source name SHALL remain available in source mix and original link attribution without creating a primary browse category for that exact source
