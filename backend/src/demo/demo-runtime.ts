import { createHash } from 'node:crypto';

import { createNewsServingService } from '../api/news-serving-service.ts';
import { InMemoryStore } from '../db/in-memory-store.ts';
import { persistAdapterRecords } from '../ingestion/adapter-record-ingestion.ts';
import { ArticleRepository } from '../ingestion/article-repository.ts';
import { createProcessJobHandler, processQueuedJobs } from '../ingestion/process-job-handler.ts';
import { RawItemRepository } from '../ingestion/raw-item-repository.ts';
import { InMemoryQueue } from '../queue/in-memory-queue.ts';
import { ArticleDedupeService } from '../signal-processing/article-dedupe-service.ts';
import { createEnrichmentJobHandler, enqueuePendingEnrichmentJobs, processEnrichmentJobs } from '../signal-processing/enrichment-job-handler.ts';
import { ScoreComponentRepository } from '../signal-processing/score-component-repository.ts';
import { SignalClusterService } from '../signal-processing/signal-cluster-service.ts';
import { SignalRepository } from '../signal-processing/signal-repository.ts';
import { SignalScoringService } from '../signal-processing/signal-scoring-service.ts';
import { SourceRelationRepository } from '../signal-processing/source-relation-repository.ts';
import { TopicClassifier } from '../signal-processing/topic-classifier.ts';
import { TopicRepository } from '../signal-processing/topic-repository.ts';
import { SourceRepository } from '../sources/source-repository.ts';
import { SourceService } from '../sources/source-service.ts';

const nowIso = '2026-04-21T12:00:00.000Z';

const restrictedUsagePolicy = {
  allowFullText: false,
  allowSummary: true,
  commercialUseNeedsReview: true,
  attributionRequired: true
};

const permissiveUsagePolicy = {
  allowFullText: true,
  allowSummary: true,
  commercialUseNeedsReview: false,
  attributionRequired: true
};

export async function createDemoRuntime({ now = () => new Date(nowIso) } = {}) {
  const store = new InMemoryStore();
  const queue = new InMemoryQueue(store);
  const sourceService = new SourceService(new SourceRepository(store));
  const rawItemRepository = new RawItemRepository(store);
  const articleRepository = new ArticleRepository(store);
  const sourceRelationRepository = new SourceRelationRepository(store);
  const signalRepository = new SignalRepository(store);
  const topicRepository = new TopicRepository(store);
  const scoreComponentRepository = new ScoreComponentRepository(store);
  topicRepository.seedDefaultTopics();

  const sources = createDemoSources(sourceService);
  for (const fixture of demoAdapterFixtures(sources)) {
    persistAdapterRecords({
      source: fixture.source,
      records: fixture.records,
      rawItemRepository,
      queue,
      fetchedAt: now()
    });
  }

  const processSummary = await processQueuedJobs({
    queue,
    handler: createProcessJobHandler({
      rawItemRepository,
      sourceService,
      articleFetcher: createFixtureArticleFetcher(),
      articleRepository
    }),
    limit: 50,
    now: now()
  });

  const dedupeSummary = new ArticleDedupeService({
    articleRepository,
    sourceRelationRepository,
    now
  }).dedupeArticles();

  const clusterSummary = new SignalClusterService({
    articleRepository,
    signalRepository,
    sourceRelationRepository,
    sourceService,
    now
  }).clusterArticles();

  const topicSummary = await new TopicClassifier({
    topicRepository,
    signalRepository,
    articleRepository,
    sourceService,
    now
  }).classifySignals();

  const scoringSummary = new SignalScoringService({
    signalRepository,
    articleRepository,
    sourceService,
    sourceRelationRepository,
    topicRepository,
    scoreComponentRepository,
    now
  }).scoreSignals();

  enqueuePendingEnrichmentJobs({
    signalRepository,
    queue,
    now: now()
  });
  const enrichmentSummary = await processEnrichmentJobs({
    queue,
    handler: createEnrichmentJobHandler({
      signalRepository,
      articleRepository,
      sourceService,
      provider: createFixtureEnrichmentProvider()
    }),
    limit: 50,
    now: now()
  });

  const servingService = createNewsServingService({
    signalRepository,
    articleRepository,
    sourceService,
    topicRepository,
    scoreComponentRepository,
    dataStatus: {
      mode: 'demo',
      stale: false,
      lastUpdatedAt: now().toISOString(),
      sourceOutcomeCounts: {
        ready: 0,
        skipped: 0,
        succeeded: 0,
        failed: 0,
        fetched: rawItemRepository.listRawItems().length,
        processed: articleRepository.listArticles().length
      }
    },
    now
  });

  return {
    store,
    queue,
    sourceService,
    rawItemRepository,
    articleRepository,
    sourceRelationRepository,
    signalRepository,
    topicRepository,
    scoreComponentRepository,
    servingService,
    summary: {
      sources: sources.length,
      rawItems: rawItemRepository.listRawItems().length,
      articles: articleRepository.listArticles().length,
      signals: signalRepository.listSignals().length,
      process: processSummary,
      dedupe: dedupeSummary,
      cluster: clusterSummary,
      topics: topicSummary,
      scoring: scoringSummary,
      enrichment: enrichmentSummary
    }
  };
}

function createDemoSources(sourceService) {
  const create = (input) => sourceService.createSource({
    language: 'en',
    fetchIntervalMinutes: 60,
    usagePolicy: restrictedUsagePolicy,
    ...input
  });

  return {
    openai: create({
      name: 'OpenAI News RSS',
      sourceType: 'rss',
      family: 'company_announcement',
      feedUrl: 'https://openai.com/news/rss.xml',
      trustScore: 0.95
    }),
    newsapi: create({
      name: 'NewsAPI AI Coverage',
      sourceType: 'newsapi',
      family: 'technology_media',
      apiEndpoint: 'https://newsapi.org/v2/everything?q=artificial%20intelligence',
      credentialRef: 'NEWSAPI_KEY',
      trustScore: 0.7
    }),
    hackerNews: create({
      name: 'Hacker News AI Search',
      sourceType: 'hacker_news',
      family: 'community',
      apiEndpoint: 'https://hacker-news.firebaseio.com/v0/newstories.json',
      query: 'AI',
      fetchLimit: 30,
      trustScore: 0.58
    }),
    arxiv: create({
      name: 'arXiv AI Recent',
      sourceType: 'arxiv',
      family: 'research',
      apiEndpoint: 'https://export.arxiv.org/api/query?search_query=cat:cs.AI',
      trustScore: 0.9,
      usagePolicy: permissiveUsagePolicy
    }),
    semanticScholar: create({
      name: 'Semantic Scholar AI Papers',
      sourceType: 'semantic_scholar',
      family: 'research',
      apiEndpoint: 'https://api.semanticscholar.org/graph/v1/paper/search',
      query: 'artificial intelligence agents',
      fetchLimit: 10,
      trustScore: 0.84,
      usagePolicy: permissiveUsagePolicy
    }),
    productHunt: create({
      name: 'Product Hunt AI Launches',
      sourceType: 'product_hunt',
      family: 'product_launch',
      apiEndpoint: 'https://api.producthunt.com/v2/api/graphql',
      query: 'artificial-intelligence',
      fetchLimit: 10,
      credentialRef: 'PRODUCT_HUNT_TOKEN',
      trustScore: 0.62
    }),
    crossref: create({
      name: 'Crossref AI Works',
      sourceType: 'crossref',
      family: 'research',
      apiEndpoint: 'https://api.crossref.org/works?query=artificial%20intelligence',
      trustScore: 0.76,
      usagePolicy: permissiveUsagePolicy
    })
  };
}

function demoAdapterFixtures(sources) {
  return [
    {
      source: sources.openai,
      records: [
        record({
          adapter: 'rss',
          feedFormat: 'rss',
          externalId: 'openai-agent-sdk-2026-04-21',
          title: 'OpenAI introduces Agent SDK updates for enterprise developers',
          url: 'https://openai.example/news/agent-sdk-enterprise',
          publishedAt: '2026-04-21T08:00:00.000Z',
          author: 'OpenAI',
          summary: 'OpenAI announces Agent SDK updates for workflow orchestration, tool calling, and enterprise integration.',
          categories: ['Agents', 'Product']
        })
      ]
    },
    {
      source: sources.newsapi,
      records: [
        record({
          adapter: 'newsapi',
          externalId: 'https://tech.example/ai/openai-agent-sdk-enterprise',
          title: 'OpenAI Agent SDK updates draw enterprise developer interest',
          url: 'https://tech.example/ai/openai-agent-sdk-enterprise',
          publishedAt: '2026-04-21T09:10:00.000Z',
          author: 'Jane Reporter',
          summary: 'Developers are watching cost control, debugging, and integration questions around the updated Agent SDK.',
          categories: ['Artificial Intelligence', 'Enterprise']
        })
      ]
    },
    {
      source: sources.hackerNews,
      records: [
        record({
          adapter: 'hacker_news',
          externalId: 'hn-101',
          title: 'Show HN: OpenAI Agent SDK updates for enterprise workflows',
          url: 'https://community.example/openai-agent-sdk-workflows',
          publishedAt: '2026-04-21T09:45:00.000Z',
          author: 'pg',
          summary: 'Hacker News discussion focuses on production use, debugging, and agent workflow safety.',
          categories: ['AI', 'Developer Tools'],
          rawPayload: {
            score: 180,
            commentsCount: 64,
            discussionUrl: 'https://news.ycombinator.com/item?id=101'
          }
        })
      ]
    },
    {
      source: sources.arxiv,
      records: [
        record({
          adapter: 'arxiv',
          externalId: '2604.12345v1',
          title: 'Benchmarking Tool-Using AI Agents for Enterprise Workflows',
          url: 'http://arxiv.org/abs/2604.12345v1',
          publishedAt: '2026-04-20T18:30:00.000Z',
          updatedAt: '2026-04-21T09:00:00.000Z',
          authors: ['Ada Example', 'Ben Researcher'],
          summary: 'We introduce a benchmark for tool-using AI agents in enterprise workflows, measuring reliability, recovery, and auditability.',
          categories: ['cs.AI', 'cs.CL'],
          rawPayload: {
            arxivId: '2604.12345v1',
            pdfUrl: 'http://arxiv.org/pdf/2604.12345v1',
            abstract: 'We introduce a benchmark for tool-using AI agents in enterprise workflows, measuring reliability, recovery, and auditability.'
          }
        })
      ]
    },
    {
      source: sources.semanticScholar,
      records: [
        record({
          adapter: 'semantic_scholar',
          externalId: 'ss-paper-1',
          title: 'Evaluation Methods for Tool-Using Language Agents',
          url: 'https://www.semanticscholar.org/paper/ss-paper-1',
          publishedAt: '2026-04-19T00:00:00.000Z',
          authors: ['Chen Example', 'Dia Researcher'],
          summary: 'A survey of evaluation methods for tool-using language agents and agentic retrieval systems.',
          categories: ['Computer Science', 'Artificial Intelligence'],
          rawPayload: {
            paperId: 'ss-paper-1',
            abstract: 'A survey of evaluation methods for tool-using language agents and agentic retrieval systems.',
            openAccessPdf: { url: 'https://example.com/ss-paper-1.pdf' },
            citationCount: 42
          }
        })
      ]
    },
    {
      source: sources.productHunt,
      records: [
        record({
          adapter: 'product_hunt',
          externalId: 'ph-post-1',
          title: 'AgentOps AI',
          url: 'https://www.producthunt.com/posts/agentops-ai',
          publishedAt: '2026-04-21T07:30:00.000Z',
          summary: 'Observability for production AI agents',
          categories: ['Artificial Intelligence', 'Developer Tools'],
          rawPayload: {
            name: 'AgentOps AI',
            tagline: 'Observability for production AI agents',
            description: 'AgentOps AI helps teams monitor tool calls, cost, latency, and failure recovery for production agent workflows.',
            website: 'https://example.com/agentops-ai',
            votesCount: 420,
            commentsCount: 51,
            dailyRank: 3,
            topics: [{ name: 'Artificial Intelligence' }, { name: 'Developer Tools' }]
          }
        })
      ]
    },
    {
      source: sources.crossref,
      records: [
        record({
          adapter: 'crossref',
          externalId: '10.0000/example.crossref',
          title: 'A Survey of Agent Evaluation Methods',
          url: 'https://doi.org/10.0000/example.crossref',
          publishedAt: '2026-04-18T00:00:00.000Z',
          authors: ['Eve Scholar'],
          summary: 'A survey article covering evaluation methods for autonomous AI agents and tool-use reliability.',
          categories: ['Artificial Intelligence', 'Evaluation'],
          rawPayload: {
            DOI: '10.0000/example.crossref',
            abstract: 'A survey article covering evaluation methods for autonomous AI agents and tool-use reliability.',
            subject: ['Artificial Intelligence', 'Evaluation'],
            year: 2026
          }
        })
      ]
    }
  ];
}

function record(input) {
  return {
    externalId: input.externalId,
    title: input.title,
    url: input.url,
    publishedAt: input.publishedAt,
    updatedAt: input.updatedAt,
    author: input.author,
    authors: input.authors,
    summary: input.summary,
    categories: input.categories,
    rawPayload: {
      title: input.title,
      url: input.url,
      publishedAt: input.publishedAt,
      summary: input.summary,
      categories: input.categories,
      ...input.rawPayload
    },
    responseMeta: {
      adapter: input.adapter,
      feedFormat: input.feedFormat,
      fixture: 'demo',
      fetchedAt: nowIso
    }
  };
}

function createFixtureArticleFetcher() {
  return {
    async fetchArticle({ url, rawItem, source }) {
      const payload = rawItem.payload || {};
      const textForAI = fixtureArticleText(url, payload);
      return {
        rawItemId: rawItem.id,
        sourceId: source.id,
        canonicalUrl: url,
        title: payload.title,
        language: source.language || 'en',
        excerpt: payload.summary,
        publishedAt: payload.publishedAt,
        author: payload.author,
        textForAI,
        fullTextDisplayAllowed: source.usagePolicy?.allowFullText === true,
        contentHash: createHash('sha256').update(textForAI).digest('hex'),
        extractionMeta: {
          extractor: 'demo-fixture',
          sourceType: source.sourceType,
          sourceFamily: source.family,
          fetchedUrl: url,
          textLength: textForAI.length,
          community: payload.rawPayload?.score ? {
            score: payload.rawPayload.score,
            commentsCount: payload.rawPayload.commentsCount
          } : undefined
        }
      };
    }
  };
}

function fixtureArticleText(url, payload) {
  const articleBodies = {
    'https://openai.example/news/agent-sdk-enterprise': [
      'OpenAI announced Agent SDK updates focused on enterprise developers.',
      'The update emphasizes workflow orchestration, tool calling, observability hooks, and integration patterns for production AI applications.',
      'The release positions agent infrastructure as a bridge between prototype assistants and maintained business workflows.'
    ],
    'https://tech.example/ai/openai-agent-sdk-enterprise': [
      'Developers are comparing the Agent SDK update with existing orchestration frameworks.',
      'Coverage highlights debugging, cost control, permission boundaries, and deployment safety as enterprise adoption questions.',
      'Several teams are waiting for migration examples and clearer operational guidance before broad rollout.'
    ],
    'https://community.example/openai-agent-sdk-workflows': [
      'Community discussion around the Agent SDK update focuses on production workflow safety.',
      'Participants ask how tool calls are audited, how failures are recovered, and how teams should control latency and cost.',
      'The discussion adds a practical developer signal beyond the official announcement.'
    ]
  };
  return (articleBodies[url] || [payload.title, payload.summary, 'Demo article text used for local development.'])
    .filter(Boolean)
    .join(' ');
}

function createFixtureEnrichmentProvider() {
  return {
    name: 'fixture-enrichment',
    async generate(context) {
      const sources = context.sources.slice(0, 4);
      const leadSource = sources[0];
      const mediaSource = sources[1] || sources[0];
      const leadArticle = context.articles[0];
      return {
        aiBrief: `${context.signal.title} 已形成可展示的后端资讯信号，来源覆盖 ${sources.map((source) => source.name).join('、')}。这条信号适合放在首页，因为它同时具备官方发布、媒体跟进或社区/研究支撑。`,
        keyPoints: [
          { text: `${leadSource.name} 提供了该信号的主要事实基础。`, sourceIds: [leadSource.id] },
          { text: `${mediaSource.name} 补充了采用、评估或行业反馈视角。`, sourceIds: [mediaSource.id] },
          { text: '后端已保留来源链接和归因信息，前端只展示摘要与可公开字段。', sourceIds: [leadSource.id] }
        ],
        timeline: context.articles.slice(0, 4).map((article) => ({
          label: `${sourceName(context, article.sourceId)} 发布或记录了相关信号。`,
          at: article.publishedAt,
          sourceIds: [article.sourceId]
        })),
        sourceMix: sources.map((source) => ({
          sourceId: source.id,
          sourceName: source.name,
          role: roleForSource(source, leadArticle?.sourceId)
        })),
        nextWatch: '继续观察是否出现更多官方案例、独立评测、企业部署反馈和社区讨论。',
        relatedSignalIds: []
      };
    }
  };
}

function sourceName(context, sourceId) {
  return context.sources.find((source) => source.id === sourceId)?.name || 'Source';
}

function roleForSource(source, leadSourceId) {
  if (source.id === leadSourceId) {
    return 'lead';
  }
  if (source.family === 'company_announcement') {
    return 'official';
  }
  if (source.family === 'research') {
    return 'research';
  }
  if (source.family === 'community') {
    return 'community';
  }
  if (source.family === 'product_launch') {
    return 'product';
  }
  return 'media';
}
