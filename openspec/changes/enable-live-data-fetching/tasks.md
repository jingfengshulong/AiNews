## 1. Test Coverage

- [ ] 1.1 Add mocked live source readiness tests for public, credential-gated, skipped, and failed sources
- [ ] 1.2 Add mocked live runtime tests that verify raw items flow into visible ranked signals
- [ ] 1.3 Add API/frontend tests for live, stale-live, and fixture data status metadata

## 2. Live Runtime

- [ ] 2.1 Implement live source readiness evaluation and safe per-source run reporting
- [ ] 2.2 Implement one-shot live ingestion orchestration using existing adapters, queues, processors, scoring, and enrichment
- [ ] 2.3 Add bounded live run configuration for item limits, source inclusion, request timeout, and fallback behavior

## 3. API And Frontend Integration

- [ ] 3.1 Extend serving responses with data mode, freshness, run ID, stale state, and source outcome counts
- [ ] 3.2 Update the frontend homepage to render concise live data status from safe metadata fields

## 4. Operator Scripts

- [ ] 4.1 Add a live one-shot ingestion script and package command
- [ ] 4.2 Add a live API startup script and package command that runs an initial refresh before serving
- [ ] 4.3 Add a live smoke command that verifies the API returns live metadata and visible signals

## 5. Verification

- [ ] 5.1 Run backend tests and OpenSpec validation
- [ ] 5.2 Run a real local live ingestion pass using configured `.env` credentials and report the visible data result
