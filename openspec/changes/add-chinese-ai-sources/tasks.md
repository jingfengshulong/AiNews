## 1. Chinese Source Registration

- [x] 1.1 Add 12 Chinese RSS sources to `seed-sources.ts` with appropriate family, trust score, and fetch intervals.
- [x] 1.2 Define `aiKeywords` array with 40+ Chinese and English AI-related terms.
- [x] 1.3 Add `filterKeywords: aiKeywords` to 8 general tech sources that need topic filtering.
- [x] 1.4 Update RSS source inventory documentation with Chinese sources section.

## 2. RSS Keyword Filtering

- [x] 2.1 Add `filterKeywords` field to source schema in `source-service.ts`.
- [x] 2.2 Implement `matchesFilterKeywords()` function in `rss-atom-adapter.ts`.
- [x] 2.3 Apply keyword filtering in both `parseRssItems()` and `parseAtomEntries()`.
- [x] 2.4 Add tests for keyword matching (Chinese, English, case-insensitive, multi-keyword OR logic).

## 3. AI Relevance Filter

- [x] 3.1 Create `backend/src/ai/relevance-filter.ts` with batched AI judgment.
- [x] 3.2 Wire relevance filter into `live-runtime.ts` between process and quality steps.
- [x] 3.3 Only run filter for sources with `filterKeywords` and when AI provider is available.
- [x] 3.4 Mark irrelevant articles as `low_quality` with reason `irrelevant_to_topic`.
- [x] 3.5 Add tests covering fail-open behavior, batch parsing, and malformed response handling.

## 4. Verification

- [x] 4.1 Run all backend tests — 130 pass, 0 fail.
- [x] 4.2 Verify Chinese sources appear in seed list.
- [x] 4.3 Verify keyword filtering excludes non-AI articles from general tech sources.
