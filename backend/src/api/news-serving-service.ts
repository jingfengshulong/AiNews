const hiddenStatuses = new Set(['hidden', 'deleted']);
const familyLabels = {
  technology_media: 'Technology Media',
  research: 'Research',
  funding: 'Funding',
  policy: 'Policy',
  community: 'Community',
  product_launch: 'Product Launch',
  company_announcement: 'Company Announcement'
};

const productDataStates = new Set(['loading', 'empty_live', 'live', 'partial_live', 'stale_live', 'demo', 'api_unavailable', 'unknown']);
const dataStateLabels = {
  loading: 'Loading live data',
  empty_live: 'Empty live data',
  live: 'Live data',
  partial_live: 'Partial live data',
  stale_live: 'Stale live data',
  demo: 'Demo data',
  api_unavailable: 'API unavailable',
  unknown: 'Unknown data state'
};

export function createNewsServingService({
  signalRepository,
  articleRepository,
  sourceService,
  topicRepository,
  scoreComponentRepository,
  dataStatus,
  now = () => new Date()
} = {}) {
  const service = {
    getHome({ limit = 8 } = {}) {
      const visible = rankedVisibleSignals();
      const today = dateKey(now());
      const todaySignals = visible.filter((signal) => dateKey(signal.primaryPublishedAt) === today);
      const selected = todaySignals.length > 0 ? todaySignals : visible;
      const leadSignal = selected[0] ? signalSummary(selected[0]) : undefined;
      const rankedSignals = visible.filter((signal) => signal.id !== leadSignal?.id).slice(0, Math.max(0, limit - 1)).map(signalSummary);

      return {
        dataStatus: resolveDataStatus({ visibleCount: visible.length }),
        dataWindow: {
          label: todaySignals.length > 0 ? 'today' : 'latest',
          date: today,
          includesToday: todaySignals.length > 0,
          from: selected.at(-1)?.primaryPublishedAt,
          to: selected[0]?.primaryPublishedAt
        },
        leadSignal,
        rankedSignals,
        stats: buildStats(visible),
        sourceSummaries: buildSourceSummaries(visible),
        dateSummaries: buildDateSummaries(visible),
        tickerItems: selected.slice(0, 6).map((signal) => ({
          signalId: signal.id,
          text: `${signal.title} · ${sourceContextForSignal(signal).sources.length} sources · heat ${round(signal.heatScore || 0)}`,
          heatScore: signal.heatScore || 0,
          primaryPublishedAt: signal.primaryPublishedAt
        }))
      };
    },

    getSignalDetail(id) {
      const signal = signalRepository.getSignal(id);
      if (!isVisibleSignal(signal)) {
        return undefined;
      }

      const context = sourceContextForSignal(signal);
      const topics = topicsForSignal(signal.id);

      return {
        dataStatus: resolveDataStatus({ visibleCount: rankedVisibleSignals().length }),
        signal: signalSummary(signal),
        keyPoints: asArray(signal.keyPoints).map((point) => ({
          text: point.text,
          sources: sourceRefs(point.sourceIds, context.sources)
        })),
        timeline: asArray(signal.timeline).map((item) => ({
          label: item.label,
          at: item.at,
          sources: sourceRefs(item.sourceIds, context.sources)
        })),
        sourceMix: asArray(signal.sourceMix).map((item) => ({
          sourceId: item.sourceId,
          sourceName: item.sourceName || context.sources.find((source) => source.id === item.sourceId)?.name,
          role: item.role || 'supporting',
          originalUrl: context.articles.find((article) => article.sourceId === item.sourceId)?.canonicalUrl
        })),
        nextWatch: signal.nextWatch,
        relatedSignals: asArray(signal.relatedSignalIds)
          .map((relatedId) => signalRepository.getSignal(relatedId))
          .filter(isVisibleSignal)
          .map(signalSummary),
        supportingSources: context.sources.map((source) => sourceRef(source, context.articles)),
        supportingArticles: context.articles.map(articleSummary),
        scoreComponents: scoreComponentRepository?.listScoreComponents(signal.id) || [],
        topics,
        attribution: {
          required: context.sources.some((source) => source.usagePolicy?.attributionRequired !== false),
          sourceNames: context.sources.map((source) => source.name),
          originalLinks: context.articles.map((article) => ({
            articleId: article.id,
            sourceId: article.sourceId,
            title: article.title,
            url: article.canonicalUrl
          }))
        }
      };
    },

    listSources() {
      const visible = rankedVisibleSignals();
      const familyCounts = countByFamily(visible);
      const sources = sourceService.listSources().map((source) => ({
        id: source.id,
        name: source.name,
        family: source.family,
        sourceType: source.sourceType,
        enabled: source.enabled,
        trustScore: source.trustScore,
        signalCount: signalsForSource(source.id, visible).length,
        articleCount: articlesForSource(source.id).length
      }));

      return {
        families: Object.entries(familyCounts).map(([family, signalCount]) => ({
          family,
          label: familyLabels[family] || family,
          signalCount,
          sourceCount: sources.filter((source) => source.family === family).length
        })).sort((a, b) => b.signalCount - a.signalCount || a.family.localeCompare(b.family)),
        sources
      };
    },

    getSourceFamilyArchive(family) {
      const familySources = sourceService.listSources().filter((source) => source.family === family);
      if (familySources.length === 0) {
        return undefined;
      }
      const sourceIds = new Set(familySources.map((source) => source.id));
      const signals = rankedVisibleSignals().filter((signal) => sourceContextForSignal(signal).sources.some((source) => sourceIds.has(source.id)));
      const articles = articleRepository.listArticles()
        .filter((article) => sourceIds.has(article.sourceId))
        .sort(comparePublishedDesc)
        .map(articleSummary);

      return {
        family,
        label: familyLabels[family] || family,
        sources: familySources.map(sourcePublic),
        signals: signals.map(signalSummary),
        articles
      };
    },

    getSourceArchive(family, sourceId) {
      const source = safeSource(sourceId);
      if (!source || source.family !== family) {
        return undefined;
      }
      const signals = signalsForSource(source.id, rankedVisibleSignals());
      const articles = articlesForSource(source.id).sort(comparePublishedDesc).map(articleSummary);

      return {
        source: sourcePublic(source),
        signals: signals.map(signalSummary),
        articles
      };
    },

    getDateArchive({ label, from, to }) {
      const range = dateRange({ label, from, to, now: now() });
      const signals = rankedVisibleSignals().filter((signal) => withinDateRange(signal.primaryPublishedAt, range.from, range.to));
      return {
        range,
        signals: signals.map(signalSummary)
      };
    },

    listTopics() {
      const visible = rankedVisibleSignals();
      return {
        topics: topicRepository.listTopics().map((topic) => {
          const signals = visible.filter((signal) => topicsForSignal(signal.id).some((item) => item.slug === topic.slug));
          return {
            ...topic,
            signalCount: signals.length,
            latestSignalAt: signals.map((signal) => signal.primaryPublishedAt).filter(Boolean).sort().at(-1)
          };
        })
      };
    },

    getTopicArchive(slug) {
      const topic = topicRepository.getTopicBySlug(slug);
      if (!topic) {
        return undefined;
      }
      const signals = rankedVisibleSignals()
        .filter((signal) => topicsForSignal(signal.id).some((item) => item.slug === slug))
        .map(signalSummary);

      return {
        topic,
        signals
      };
    },

    search({ q = '', topic, sourceFamily, from, to } = {}) {
      const query = cleanText(q);
      const range = from || to ? dateRange({ from, to, now: now() }) : undefined;
      const signalResults = rankedVisibleSignals()
        .filter((signal) => matchesSignalFilters(signal, { query, topic, sourceFamily, range }))
        .map((signal) => ({
          type: 'signal',
          relevance: relevanceForSignal(signal, query),
          ...signalSummary(signal)
        }));
      const articleResults = articleRepository.listArticles()
        .filter((article) => matchesArticleFilters(article, { query, topic, sourceFamily, range }))
        .map((article) => ({
          type: 'article',
          relevance: relevanceForArticle(article, query),
          id: article.id,
          title: article.title,
          excerpt: article.excerpt,
          primaryPublishedAt: article.publishedAt,
          sourceFamilies: [safeSource(article.sourceId)?.family].filter(Boolean),
          sources: [sourceRef(safeSource(article.sourceId), [article])].filter(Boolean),
          topics: articleTopics(article.id),
          originalUrl: article.canonicalUrl
        }));

      return {
        query: {
          q: query,
          topic,
          sourceFamily,
          from,
          to
        },
        results: [...signalResults, ...articleResults]
          .filter((result) => !query || result.relevance > 0)
          .sort((a, b) => b.relevance - a.relevance || comparePublishedDesc(a, b))
      };
    }
  };

  function rankedVisibleSignals() {
    return signalRepository.listSignals()
      .filter(isVisibleSignal)
      .sort(compareSignalsForProduct);
  }

  function resolveDataStatus({ visibleCount = 0 } = {}) {
    const value = typeof dataStatus === 'function' ? dataStatus() : dataStatus;
    const rawStatus = value || {
      mode: 'unknown',
      stale: true,
      sourceOutcomeCounts: {
        ready: 0,
        skipped: 0,
        succeeded: 0,
        failed: 0,
        fetched: 0,
        processed: 0
      }
    };
    const counts = {
      ready: 0,
      skipped: 0,
      succeeded: 0,
      failed: 0,
      fetched: 0,
      processed: 0,
      ...(rawStatus.sourceOutcomeCounts || {})
    };
    const state = deriveProductDataState(rawStatus, counts, visibleCount);
    return {
      ...rawStatus,
      state,
      label: dataStateLabels[state] || state,
      empty: visibleCount === 0,
      lastUpdatedAt: rawStatus.lastUpdatedAt || rawStatus.lastLiveFetchAt || rawStatus.completedAt,
      sourceOutcomeCounts: counts
    };
  }

  function signalSummary(signal) {
    const context = sourceContextForSignal(signal);
    const topics = topicsForSignal(signal.id);
    return {
      id: signal.id,
      slug: signal.slug,
      title: signal.title,
      summary: signal.aiBrief || signal.summary,
      aiBrief: signal.aiBrief,
      heatScore: signal.heatScore || 0,
      signalScore: signal.signalScore || 0,
      status: signal.status,
      primaryPublishedAt: signal.primaryPublishedAt,
      enrichmentStatus: signal.enrichmentStatus,
      sourceCount: context.sources.length,
      sourceFamilies: unique(context.sources.map((source) => source.family).filter(Boolean)),
      sources: context.sources.map((source) => sourceRef(source, context.articles)),
      topics,
      attribution: {
        sourceNames: context.sources.map((source) => source.name),
        originalLinks: context.articles.map((article) => ({
          articleId: article.id,
          sourceId: article.sourceId,
          title: article.title,
          url: article.canonicalUrl
        }))
      }
    };
  }

  function sourceContextForSignal(signal) {
    const links = signalRepository.listSignalArticles(signal.id);
    const articles = links
      .map((link) => ({ ...articleRepository.getArticle(link.articleId), role: link.role }))
      .filter((article) => article.id);
    const sources = uniqueBy(
      articles.map((article) => safeSource(article.sourceId)).filter(Boolean),
      (source) => source.id
    );
    return { articles, sources };
  }

  function topicsForSignal(signalId) {
    return topicRepository.listSignalTopics(signalId).map((assignment) => {
      const topic = topicRepository.getTopicBySlug(assignment.topicSlug);
      return {
        id: topic?.id,
        slug: assignment.topicSlug,
        name: topic?.name || assignment.topicSlug,
        confidence: assignment.confidence,
        method: assignment.method
      };
    });
  }

  function articleTopics(articleId) {
    const signalIds = signalRepository.listSignalArticles()
      .filter((link) => link.articleId === articleId)
      .map((link) => link.signalId);
    const topics = signalIds.flatMap((signalId) => topicsForSignal(signalId));
    return uniqueBy(topics, (topic) => topic.slug);
  }

  function safeSource(sourceId) {
    try {
      return sourceId ? sourceService.getSource(sourceId) : undefined;
    } catch {
      return undefined;
    }
  }

  function buildStats(visible) {
    const articles = articleRepository.listArticles();
    const sources = sourceService.listSources();
    return {
      visibleSignals: visible.length,
      enrichedSignals: visible.filter((signal) => signal.enrichmentStatus === 'completed').length,
      articlesIndexed: articles.length,
      sourceCount: sources.length,
      hotSignals: visible.filter((signal) => (signal.heatScore || 0) >= 70).length
    };
  }

  function buildSourceSummaries(visible) {
    return Object.entries(countByFamily(visible)).map(([family, signalCount]) => ({
      family,
      label: familyLabels[family] || family,
      signalCount,
      sourceCount: sourceService.listSources().filter((source) => source.family === family).length
    })).sort((a, b) => b.signalCount - a.signalCount || a.family.localeCompare(b.family));
  }

  function buildDateSummaries(visible) {
    const counts = new Map();
    for (const signal of visible) {
      const key = dateKey(signal.primaryPublishedAt);
      if (!key) {
        continue;
      }
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([date, signalCount]) => ({ date, signalCount }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function countByFamily(visible) {
    const counts = {};
    for (const signal of visible) {
      for (const family of signalSummary(signal).sourceFamilies) {
        counts[family] = (counts[family] || 0) + 1;
      }
    }
    return counts;
  }

  function signalsForSource(sourceId, visible) {
    return visible.filter((signal) => sourceContextForSignal(signal).articles.some((article) => article.sourceId === sourceId));
  }

  function articlesForSource(sourceId) {
    return articleRepository.listArticles().filter((article) => article.sourceId === sourceId);
  }

  function matchesSignalFilters(signal, filters) {
    const summary = signalSummary(signal);
    if (filters.topic && !summary.topics.some((item) => item.slug === filters.topic)) {
      return false;
    }
    if (filters.sourceFamily && !summary.sourceFamilies.includes(filters.sourceFamily)) {
      return false;
    }
    if (filters.range && !withinDateRange(signal.primaryPublishedAt, filters.range.from, filters.range.to)) {
      return false;
    }
    return !filters.query || relevanceForSignal(signal, filters.query) > 0;
  }

  function matchesArticleFilters(article, filters) {
    const source = safeSource(article.sourceId);
    if (filters.topic && !articleTopics(article.id).some((item) => item.slug === filters.topic)) {
      return false;
    }
    if (filters.sourceFamily && source?.family !== filters.sourceFamily) {
      return false;
    }
    if (filters.range && !withinDateRange(article.publishedAt, filters.range.from, filters.range.to)) {
      return false;
    }
    return !filters.query || relevanceForArticle(article, filters.query) > 0;
  }

  function relevanceForSignal(signal, query) {
    if (!query) {
      return (signal.heatScore || 0) / 100;
    }
    const context = sourceContextForSignal(signal);
    const text = cleanText([
      signal.title,
      signal.summary,
      signal.aiBrief,
      signal.nextWatch,
      ...context.articles.flatMap((article) => [article.title, article.excerpt, article.textForAI])
    ].join(' ')).toLowerCase();
    return relevance(text, query) + ((signal.heatScore || 0) / 1000);
  }

  return service;
}

function isVisibleSignal(signal) {
  return Boolean(signal?.id) && !hiddenStatuses.has(signal.status);
}

function deriveProductDataState(status, counts, visibleCount) {
  if (productDataStates.has(status.state)) {
    return status.state;
  }
  if (status.mode === 'demo' || status.mode === 'fixture') {
    return 'demo';
  }
  if (status.mode === 'live') {
    if (status.stale) {
      return 'stale_live';
    }
    if (visibleCount === 0 && (status.lastLiveFetchAt || status.completedAt || counts.succeeded > 0 || counts.failed > 0 || counts.skipped > 0)) {
      return 'empty_live';
    }
    if (visibleCount === 0) {
      return 'loading';
    }
    if (counts.succeeded > 0 && (counts.failed > 0 || counts.skipped > 0)) {
      return 'partial_live';
    }
    if (counts.succeeded > 0 || status.lastLiveFetchAt || status.completedAt) {
      return 'live';
    }
    return 'loading';
  }
  if (status.mode === 'api_unavailable') {
    return 'api_unavailable';
  }
  return 'unknown';
}

function sourcePublic(source) {
  return {
    id: source.id,
    name: source.name,
    sourceType: source.sourceType,
    family: source.family,
    enabled: source.enabled,
    trustScore: source.trustScore,
    language: source.language
  };
}

function sourceRef(source, articles = []) {
  if (!source) {
    return undefined;
  }
  const article = articles.find((candidate) => candidate.sourceId === source.id);
  return {
    sourceId: source.id,
    name: source.name,
    sourceType: source.sourceType,
    family: source.family,
    trustScore: source.trustScore,
    originalUrl: article?.canonicalUrl
  };
}

function sourceRefs(sourceIds = [], sources = []) {
  return asArray(sourceIds)
    .map((sourceId) => sources.find((source) => source.id === sourceId))
    .filter(Boolean)
    .map((source) => sourceRef(source));
}

function articleSummary(article) {
  return {
    id: article.id,
    sourceId: article.sourceId,
    title: article.title,
    excerpt: article.excerpt,
    author: article.author,
    language: article.language,
    publishedAt: article.publishedAt,
    primaryPublishedAt: article.publishedAt,
    originalUrl: article.canonicalUrl,
    role: article.role,
    fullTextDisplayAllowed: article.fullTextDisplayAllowed === true
  };
}

function relevanceForArticle(article, query) {
  if (!query) {
    return 0.5;
  }
  const text = cleanText([article.title, article.excerpt, article.textForAI].join(' ')).toLowerCase();
  return relevance(text, query);
}

function relevance(text, query) {
  const terms = cleanText(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return 0;
  }
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0) / terms.length;
}

function dateRange({ label, from, to, now }) {
  if (label === 'today') {
    const date = dateKey(now);
    return { label, from: `${date}T00:00:00.000Z`, to: `${date}T23:59:59.999Z` };
  }
  if (label === 'yesterday') {
    const date = offsetDateKey(now, -1);
    return { label, from: `${date}T00:00:00.000Z`, to: `${date}T23:59:59.999Z` };
  }
  if (label === 'week') {
    const end = dateKey(now);
    const start = offsetDateKey(now, -6);
    return { label, from: `${start}T00:00:00.000Z`, to: `${end}T23:59:59.999Z` };
  }
  const start = from || '1970-01-01';
  const end = to || '2999-12-31';
  return {
    label: label || 'custom',
    from: start.includes('T') ? start : `${start}T00:00:00.000Z`,
    to: end.includes('T') ? end : `${end}T23:59:59.999Z`
  };
}

function withinDateRange(value, from, to) {
  if (!value) {
    return false;
  }
  const time = new Date(value).getTime();
  return time >= new Date(from).getTime() && time <= new Date(to).getTime();
}

function compareSignalsForProduct(a, b) {
  return (b.heatScore || 0) - (a.heatScore || 0)
    || (b.signalScore || 0) - (a.signalScore || 0)
    || comparePublishedDesc(a, b);
}

function comparePublishedDesc(a, b) {
  return new Date(b.primaryPublishedAt || b.publishedAt || 0).getTime() - new Date(a.primaryPublishedAt || a.publishedAt || 0).getTime();
}

function dateKey(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : undefined;
}

function offsetDateKey(value, offsetDays) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return dateKey(date);
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  return Array.from(new Set(values));
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
