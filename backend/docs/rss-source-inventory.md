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

## Chinese RSS Sources

Verified 2026-04-26. All feeds are valid RSS 2.0 (阮一峰 is Atom) and publicly accessible without authentication.

### AI-focused

| Source | Feed URL | Family | Notes |
| --- | --- | --- | --- |
| 量子位 QbitAI | `https://www.qbitai.com/feed` | technology media | Pure AI media — highest Chinese AI signal. Covers models, products, research, industry. |
| InfoQ China | `https://www.infoq.cn/feed` | technology media | Developer-focused tech media with strong AI engineering and architecture coverage. |
| FreeBuf | `https://www.freebuf.com/feed` | technology media | Cybersecurity portal with AI security, deepfake, and adversarial ML coverage. |

### Tech media with strong AI coverage

| Source | Feed URL | Family | Notes |
| --- | --- | --- | --- |
| 36氪 36Kr | `https://36kr.com/feed` | technology media | Major Chinese tech/venture media. Broad AI startup and funding coverage. |
| 雷峰网 Leiphone | `https://www.leiphone.com/feed` | technology media | Tech media with AI, robotics, and autonomous driving coverage. |
| 钛媒体 TMTPost | `https://www.tmtpost.com/feed` | technology media | Tech business media covering AI industry, companies, and strategy. |
| 爱范儿 ifanr | `https://www.ifanr.com/feed` | technology media | Consumer tech media with AI product and gadget coverage. |

### Developer and general tech

| Source | Feed URL | Family | Notes |
| --- | --- | --- | --- |
| 开源中国 OSChina | `https://www.oschina.net/news/rss` | technology media | Open-source community with AI dev tools and framework coverage. |
| 少数派 SSPai | `https://sspai.com/feed` | technology media | Tech/app recommendations with AI productivity tool coverage. |
| 阮一峰科技爱好者周刊 | `https://www.ruanyifeng.com/blog/atom.xml` | technology media | Weekly tech roundup by Ruanyifeng. Atom feed, published weekly. |
| Solidot 奇客 | `https://www.solidot.org/index.rss` | technology media | Slashdot-style Chinese tech news aggregator. |
| cnBeta | `https://www.cnbeta.com.tw/backend.php` | technology media | General Chinese tech news aggregator. High volume, lower AI signal density. |

### Sources investigated but not available

| Source | URL | Reason |
| --- | --- | --- |
| 机器之心 Jiqizhixin | `jiqizhixin.com` | No RSS feed available. Site returns HTML for /rss, /feed, /rss.xml. |
| 新智元 AI Era | `xinzhiyuan.com` | Connection refused / socket closed. |
| 虎嗅 Huxiu | `huxiu.com/rss/0.xml` | Request timeout. |
| PingWest 品玩 | `pingwest.com/feed` | Returns 404. |
| AIHub | `aihub.cn/feed` | Feed explicitly closed ("Feed已经关闭"). |
| 极客公园 GeekPark | `geekpark.net/rss` | Request timeout. |
| RSSHub (public) | `rsshub.app` | Returns 403. Self-hosted instance required. |
