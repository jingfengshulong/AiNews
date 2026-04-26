## Source Selection

12 Chinese RSS sources were verified on 2026-04-26 by fetching their feed URLs:

- **AI-focused (3):** 量子位 QbitAI, InfoQ China, FreeBuf — pure AI or strong AI coverage, no filtering needed.
- **Tech media (4):** 36氪, 雷峰网, 钛媒体, 爱范儿 — broad tech coverage, need keyword + AI filtering.
- **Developer/general (5):** 开源中国, 少数派, 阮一峰周刊, Solidot, cnBeta — mixed content, need filtering.

Sources investigated but unavailable: 机器之心 (no RSS), 新智元 (connection refused), 虎嗅 (timeout), PingWest (404), AIHub (feed closed), RSSHub public (403).

## Keyword Filtering Design

The existing `source.query` field is a single string used by Hacker News and API adapters. Rather than repurposing it, a new `filterKeywords` array field was added to the source schema. This allows multi-keyword OR matching with both Chinese and English terms.

The filter runs in the RSS/Atom adapter after parsing, before returning records. Items whose title or summary match none of the keywords are excluded. Sources without `filterKeywords` pass all items through unchanged.

## AI Relevance Filter Design

The AI filter runs as a separate pipeline step in `runLiveOnce()`, between article processing and quality classification. It only activates when:
1. The AI provider is configured (API key, model, base URL)
2. The source has `filterKeywords` set (indicating it's a general tech source)

Articles are batched (15 per batch) and sent to the AI model in a single prompt. The model returns a JSON boolean array indicating which articles are AI-related. Irrelevant articles are marked as `low_quality` with reason `irrelevant_to_topic`.

The design is fail-open: if the AI provider is unavailable or returns malformed output, all articles are treated as relevant. This ensures the pipeline never blocks on the relevance filter.

## Pipeline Integration

```
fetch → process → [AI relevance filter] → quality → dedup → cluster → score → enrich
```

The filter is positioned after processing (so we have clean article text) and before quality classification (so irrelevant articles are excluded from clustering and enrichment).
