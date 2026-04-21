const attributionOnly = {
  allowFullText: false,
  allowSummary: true,
  commercialUseNeedsReview: true,
  attributionRequired: true
};

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
    })
  ];
}
