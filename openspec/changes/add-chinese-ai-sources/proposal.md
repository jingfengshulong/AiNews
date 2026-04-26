## Why

Signal Daily is a Chinese-language AI intelligence product, but all existing sources are English-only. Chinese readers need coverage of AI news from Chinese tech media outlets. Additionally, general tech sources publish content across all topics, so a relevance filter is needed to ensure only AI-related articles enter the pipeline.

## What Changes

- Add 12 verified Chinese RSS sources covering AI-specific media (量子位, InfoQ China, FreeBuf), major tech media (36氪, 雷峰网, 钛媒体, 爱范儿), and developer/general tech outlets (开源中国, 少数派, 阮一峰, Solidot, cnBeta).
- Add keyword-based filtering to the RSS/Atom adapter so general tech sources only pass through AI-related articles. Uses a `filterKeywords` field on the source schema with 40+ Chinese and English AI terms.
- Add an AI-based relevance filter as a pipeline step between article processing and quality classification. Batches article summaries and sends them to the AI model for semantic relevance judgment.
- The filtering strategy is hybrid: keyword pre-filter (fast, free) followed by AI judge (accurate, low cost due to batching).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `news-source-management`: 12 new Chinese RSS sources with `filterKeywords` field for topic-based filtering.
- `news-ingestion`: RSS/Atom adapter now supports `filterKeywords` multi-keyword matching against title and summary.
- `news-signal-processing`: New AI relevance filter step in the live pipeline that marks irrelevant articles as `low_quality`.

## Impact

- Seed source list grows from 14 to 26 sources (12 new Chinese sources).
- RSS adapter filters items at fetch time, reducing downstream processing load.
- Live runtime pipeline gains an AI relevance filter step for general tech sources.
- Tests cover keyword matching, batch filtering, fail-open behavior, and integration.
