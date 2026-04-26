## 1. Serving API Contracts

- [x] 1.1 Add failing tests for paginated source type, date, and topic archive stream responses.
- [x] 1.2 Implement shared archive pagination metadata with `limit`, `nextCursor`, and `hasMore`.
- [x] 1.3 Add product-facing source type archive responses that hide individual source feeds from primary navigation.
- [x] 1.4 Update search filtering language and behavior to use source type rather than raw source browsing.

## 2. Signal Processing and Taxonomy

- [x] 2.1 Add failing tests for controlled topic classification fallback and invalid AI topic rejection.
- [x] 2.2 Implement controlled topic taxonomy normalization with AI suggestions when available and deterministic fallback otherwise.
- [x] 2.3 Add failing tests for minimum 100-Chinese-character AI briefs in provider and fallback enrichment paths.
- [x] 2.4 Enforce and generate substantive AI briefs for completed signal detail enrichment.

## 3. Frontend Category Experience

- [x] 3.1 Update navigation and labels so primary category browsing uses source type, date, and topic only.
- [x] 3.2 Convert source type, date, and topic landing pages into category previews with clickable category buttons.
- [x] 3.3 Implement stream detail views with load-more-on-scroll behavior for each category dimension.
- [x] 3.4 Keep individual source names and original URLs visible only in attribution/source evidence areas.

## 4. Verification and Versioning

- [x] 4.1 Run backend tests for serving API, taxonomy, and enrichment validation.
- [x] 4.2 Smoke-test the frontend pages in the browser and check long-title/list layout remains stable.
- [x] 4.3 Commit the OpenSpec artifacts and implementation changes with git.
