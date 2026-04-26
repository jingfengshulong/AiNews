const attributionOnly = {
  allowFullText: false,
  allowSummary: true,
  commercialUseNeedsReview: true,
  attributionRequired: true
};

const aiKeywords = [
  'AI', '人工智能', '大模型', '机器学习', '深度学习',
  'LLM', 'GPT', 'Claude', 'DeepSeek', 'Gemini',
  'transformer', '神经网络', '自然语言', '计算机视觉',
  'AIGC', '生成式', '智能体', 'Agent', 'RAG',
  '多模态', 'diffusion', 'embedding', '向量',
  'OpenAI', 'Anthropic', '百度', '文心', '通义',
  'Kimi', '豆包', '混元', '智谱', 'ChatGPT',
  'Copilot', 'Sora', 'Midjourney', 'Stable Diffusion',
  '芯片', 'GPU', '算力', '训练', '推理'
];

export function seedMvpSources(sourceService) {
  return [
    sourceService.createSource({
      name: 'OpenAI News RSS',
      sourceType: 'rss',
      family: 'company_announcement',
      feedUrl: 'https://openai.com/news/rss.xml',
      language: 'en',
      fetchIntervalMinutes: 60,
      trustScore: 0.95,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'Google AI Blog RSS',
      sourceType: 'rss',
      family: 'company_announcement',
      feedUrl: 'https://blog.google/innovation-and-ai/technology/ai/rss/',
      language: 'en',
      fetchIntervalMinutes: 120,
      trustScore: 0.9,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'Google Research RSS',
      sourceType: 'rss',
      family: 'research',
      feedUrl: 'https://research.google/blog/rss/',
      language: 'en',
      fetchIntervalMinutes: 180,
      trustScore: 0.9,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'NVIDIA Blog RSS',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://blogs.nvidia.com/feed/',
      language: 'en',
      fetchIntervalMinutes: 120,
      trustScore: 0.86,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'NVIDIA Developer Blog RSS',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://developer.nvidia.com/blog/feed/',
      language: 'en',
      fetchIntervalMinutes: 180,
      trustScore: 0.84,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'Hugging Face Blog RSS',
      sourceType: 'rss',
      family: 'product_launch',
      feedUrl: 'https://huggingface.co/blog/feed.xml',
      language: 'en',
      fetchIntervalMinutes: 180,
      trustScore: 0.82,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'MIT Technology Review RSS',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://www.technologyreview.com/feed/',
      language: 'en',
      fetchIntervalMinutes: 120,
      trustScore: 0.78,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'arXiv AI Recent',
      sourceType: 'arxiv',
      family: 'research',
      apiEndpoint: 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending',
      language: 'en',
      fetchIntervalMinutes: 180,
      trustScore: 0.9,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'NewsAPI AI Query',
      sourceType: 'newsapi',
      family: 'technology_media',
      apiEndpoint: 'https://newsapi.org/v2/everything?q=artificial%20intelligence',
      language: 'en',
      fetchIntervalMinutes: 60,
      trustScore: 0.68,
      credentialRef: 'NEWSAPI_KEY',
      usagePolicy: attributionOnly,
      enabled: false
    }),
    sourceService.createSource({
      name: 'Semantic Scholar AI Papers',
      sourceType: 'semantic_scholar',
      family: 'research',
      apiEndpoint: 'https://api.semanticscholar.org/graph/v1/paper/search',
      query: 'artificial intelligence agents',
      fetchLimit: 10,
      language: 'en',
      fetchIntervalMinutes: 240,
      trustScore: 0.84,
      credentialRef: 'SEMANTIC_SCHOLAR_API_KEY',
      usagePolicy: attributionOnly,
      enabled: false
    }),
    sourceService.createSource({
      name: 'Hacker News AI Search',
      sourceType: 'hacker_news',
      family: 'community',
      apiEndpoint: 'https://hacker-news.firebaseio.com/v0/newstories.json',
      query: 'AI',
      fetchLimit: 30,
      language: 'en',
      fetchIntervalMinutes: 30,
      trustScore: 0.58,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'Anthropic Newsroom',
      sourceType: 'rss',
      family: 'company_announcement',
      feedUrl: 'https://www.anthropic.com/news',
      language: 'en',
      fetchIntervalMinutes: 120,
      trustScore: 0.92,
      usagePolicy: attributionOnly,
      enabled: false
    }),
    sourceService.createSource({
      name: 'Product Hunt AI Launches',
      sourceType: 'product_hunt',
      family: 'product_launch',
      apiEndpoint: 'https://api.producthunt.com/v2/api/graphql',
      query: 'artificial-intelligence',
      fetchLimit: 10,
      language: 'en',
      fetchIntervalMinutes: 720,
      trustScore: 0.62,
      credentialRef: 'PRODUCT_HUNT_TOKEN',
      usagePolicy: attributionOnly,
      enabled: false
    }),
    sourceService.createSource({
      name: 'Crossref AI Works',
      sourceType: 'crossref',
      family: 'research',
      apiEndpoint: 'https://api.crossref.org/works?query=artificial%20intelligence',
      language: 'en',
      fetchIntervalMinutes: 720,
      trustScore: 0.76,
      usagePolicy: attributionOnly,
      enabled: false
    }),
    // ── Chinese sources ──────────────────────────────────────────────
    sourceService.createSource({
      name: '量子位 QbitAI',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://www.qbitai.com/feed',
      language: 'zh-CN',
      fetchIntervalMinutes: 60,
      trustScore: 0.82,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'InfoQ China',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://www.infoq.cn/feed',
      language: 'zh-CN',
      fetchIntervalMinutes: 120,
      trustScore: 0.78,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: '36氪 36Kr',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://36kr.com/feed',
      language: 'zh-CN',
      fetchIntervalMinutes: 60,
      trustScore: 0.76,
      filterKeywords: aiKeywords,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: '雷峰网 Leiphone',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://www.leiphone.com/feed',
      language: 'zh-CN',
      fetchIntervalMinutes: 120,
      trustScore: 0.74,
      filterKeywords: aiKeywords,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: '钛媒体 TMTPost',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://www.tmtpost.com/feed',
      language: 'zh-CN',
      fetchIntervalMinutes: 120,
      trustScore: 0.72,
      filterKeywords: aiKeywords,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: '爱范儿 ifanr',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://www.ifanr.com/feed',
      language: 'zh-CN',
      fetchIntervalMinutes: 120,
      trustScore: 0.7,
      filterKeywords: aiKeywords,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'FreeBuf',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://www.freebuf.com/feed',
      language: 'zh-CN',
      fetchIntervalMinutes: 120,
      trustScore: 0.68,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: '开源中国 OSChina',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://www.oschina.net/news/rss',
      language: 'zh-CN',
      fetchIntervalMinutes: 120,
      trustScore: 0.66,
      filterKeywords: aiKeywords,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: '少数派 SSPai',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://sspai.com/feed',
      language: 'zh-CN',
      fetchIntervalMinutes: 180,
      trustScore: 0.64,
      filterKeywords: aiKeywords,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: '阮一峰科技爱好者周刊',
      sourceType: 'atom',
      family: 'technology_media',
      feedUrl: 'https://www.ruanyifeng.com/blog/atom.xml',
      language: 'zh-CN',
      fetchIntervalMinutes: 1440,
      trustScore: 0.72,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'Solidot 奇客',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://www.solidot.org/index.rss',
      language: 'zh-CN',
      fetchIntervalMinutes: 120,
      trustScore: 0.6,
      filterKeywords: aiKeywords,
      usagePolicy: attributionOnly
    }),
    sourceService.createSource({
      name: 'cnBeta',
      sourceType: 'rss',
      family: 'technology_media',
      feedUrl: 'https://www.cnbeta.com.tw/backend.php',
      language: 'zh-CN',
      fetchIntervalMinutes: 60,
      trustScore: 0.58,
      filterKeywords: aiKeywords,
      usagePolicy: attributionOnly
    })
  ];
}
