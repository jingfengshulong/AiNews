# RSS/Atom Source Inventory

This inventory records the first RSS/Atom sources for stage 5. Sources are grouped by whether they can be fetched by the generic RSS/Atom adapter now.

## Enabled RSS Sources

| Source | Feed URL | Family | Notes |
| --- | --- | --- | --- |
| OpenAI News RSS | `https://openai.com/news/rss.xml` | company announcement | Official OpenAI news feed entry is linked from the OpenAI News footer as RSS. |
| Google AI Blog RSS | `https://blog.google/innovation-and-ai/technology/ai/rss/` | company announcement | Official Google AI topic feed. |
| Google Research RSS | `https://research.google/blog/rss/` | research | Official Google Research blog RSS. |
| NVIDIA Blog RSS | `https://blogs.nvidia.com/feed/` | technology media | Official NVIDIA blog feed. |
| NVIDIA Developer Blog RSS | `https://developer.nvidia.com/blog/feed/` | technology media | Official NVIDIA developer blog feed. |
| Hugging Face Blog RSS | `https://huggingface.co/blog/feed.xml` | product launch | Official Hugging Face blog feed. |
| MIT Technology Review RSS | `https://www.technologyreview.com/feed/` | technology media | High-signal media source, not a company source. |

## Not Enabled Yet

| Source | URL | Reason |
| --- | --- | --- |
| Anthropic Newsroom | `https://www.anthropic.com/news` | Official newsroom exists, but no confirmed official RSS feed was found. Keep disabled until an HTML/newsroom adapter or confirmed feed is added. |
| arXiv AI Recent | `https://export.arxiv.org/api/query?...` | Atom-like source, but needs the dedicated arXiv adapter so we preserve arXiv ID, authors, categories, abstracts, and paper links correctly. |
| NewsAPI, Semantic Scholar, Product Hunt, Crossref | API endpoints | Require authenticated or source-specific adapters, not the generic RSS/Atom adapter. |
