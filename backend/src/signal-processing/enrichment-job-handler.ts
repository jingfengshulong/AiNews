import { validateEnrichmentOutput } from './enrichment-output-validator.ts';

export class EnrichmentJobError extends Error {
  constructor(message, category = 'enrichment_failed') {
    super(message);
    this.name = 'EnrichmentJobError';
    this.category = category;
  }
}

export function enqueuePendingEnrichmentJobs({ signalRepository, queue, now = new Date() }) {
  return signalRepository.listSignals()
    .filter((signal) => signal.enrichmentStatus === 'pending')
    .map((signal) => queue.enqueue('enrichment', { signalId: signal.id }, {
      jobKey: `enrichment:${signal.id}`,
      runAfter: now
    }));
}

export function createEnrichmentJobHandler({ signalRepository, articleRepository, sourceService, provider }) {
  return async function handleEnrichmentJob(job) {
    if (job.lane !== 'enrichment') {
      throw new EnrichmentJobError(`Unsupported job lane for enrichment handler: ${job.lane}`, 'unsupported_job_lane');
    }

    const signalId = job.payload?.signalId;
    if (!signalId) {
      throw new EnrichmentJobError('Enrichment job requires signalId', 'invalid_job_payload');
    }

    const signal = signalRepository.getSignal(signalId);
    if (!signal) {
      throw new EnrichmentJobError(`Signal not found: ${signalId}`, 'signal_not_found');
    }

    signalRepository.markEnrichmentProcessing(signal.id);
    const context = buildEnrichmentContext({
      signal,
      signalRepository,
      articleRepository,
      sourceService
    });

    if (!provider?.generate || provider.fallbackOnly) {
      const fallback = createFallbackEnrichmentOutput(context);
      signalRepository.updateEnrichmentFallback(signal.id, fallback, {
        provider: provider?.name || 'fallback',
        generatedAt: new Date().toISOString(),
        errorCategory: provider?.fallbackReason || 'provider_unavailable',
        sourceCount: context.sources.length
      });
      return {
        signalId: signal.id,
        enriched: false,
        fallback: true,
        keyPoints: fallback.keyPoints.length,
        timelineItems: fallback.timeline.length
      };
    }

    try {
      const output = await provider.generate(context);
      const validated = validateEnrichmentOutput(output, context);
      signalRepository.updateEnrichmentSuccess(signal.id, validated, {
        provider: provider.name || 'custom',
        generatedAt: new Date().toISOString(),
        sourceCount: context.sources.length
      });
      return {
        signalId: signal.id,
        enriched: true,
        keyPoints: validated.keyPoints.length,
        timelineItems: validated.timeline.length
      };
    } catch (error) {
      const category = error.category || 'enrichment_failed';
      const fallback = createFallbackEnrichmentOutput(context);
      signalRepository.updateEnrichmentFailure(signal.id, error.message, {
        provider: provider.name || 'custom',
        failedAt: new Date().toISOString(),
        errorCategory: category,
        fallbackGenerated: true
      }, fallback);
      throw new EnrichmentJobError(error.message, category);
    }
  };
}

export async function processEnrichmentJobs({ queue, handler, limit = 25, now = new Date() }) {
  const results = [];
  let completed = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const job = await queue.claimNext('enrichment', { now });
    if (!job) {
      break;
    }

    try {
      const result = await handler(job);
      await queue.complete(job.id, result);
      completed += 1;
      results.push({ jobId: job.id, status: 'completed', result });
    } catch (error) {
      const errorCategory = error.category || 'enrichment_failed';
      await queue.fail(job.id, { message: error.message, errorCategory });
      failed += 1;
      results.push({ jobId: job.id, status: 'failed', errorCategory, error: error.message });
    }
  }

  return {
    completed,
    failed,
    results
  };
}

function buildEnrichmentContext({ signal, signalRepository, articleRepository, sourceService }) {
  const links = signalRepository.listSignalArticles(signal.id);
  const articles = links.map((link) => ({
    ...articleRepository.getArticle(link.articleId),
    role: link.role
  })).filter((article) => article.id);
  const sources = articles.map((article) => sourceService.getSource(article.sourceId));

  return {
    signal,
    articles,
    sources,
    sourceMix: articles.map((article) => {
      const source = sources.find((candidate) => candidate.id === article.sourceId);
      return {
        sourceId: source.id,
        sourceName: source.name,
        sourceType: source.sourceType,
        family: source.family,
        role: article.role,
        url: article.canonicalUrl,
        title: article.title,
        publishedAt: article.publishedAt
      };
    }),
    backendText: articles.map((article) => ({
      articleId: article.id,
      sourceId: article.sourceId,
      title: article.title,
      excerpt: article.excerpt,
      textForAI: article.textForAI,
      fullTextDisplayAllowed: article.fullTextDisplayAllowed
    }))
  };
}

export function createFallbackEnrichmentOutput(context) {
  const sources = asArray(context.sources);
  const articles = asArray(context.articles);
  const leadArticle = articles[0];
  const sourceMix = sources.map((source) => ({
    sourceId: source.id,
    sourceName: source.name,
    role: roleForSource(source)
  }));
  const keyPoints = articles.slice(0, 3).map((article) => ({
    text: `${sourceNameFor(sources, article.sourceId)} 提供了与该信号相关的基础来源信息。`,
    sourceIds: [article.sourceId]
  }));

  return {
    aiBrief: `${context.signal.title} 目前已保留基础来源信息，AI 精炼暂不可用；请优先查看来源标题、发布时间和后续确认。`,
    keyPoints: keyPoints.length ? keyPoints : sources.slice(0, 3).map((source) => ({
      text: `${source.name} 提供了该信号的基础来源信息。`,
      sourceIds: [source.id]
    })),
    timeline: articles.slice(0, 4).map((article) => ({
      label: `${sourceNameFor(sources, article.sourceId)} 捕获了相关来源。`,
      at: article.publishedAt,
      sourceIds: [article.sourceId]
    })),
    sourceMix,
    nextWatch: leadArticle
      ? '继续关注官方更新、独立报道和更多来源确认。'
      : '继续关注后续来源确认和更新时间。',
    relatedSignalIds: []
  };
}

function roleForSource(source) {
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

function sourceNameFor(sources, sourceId) {
  return sources.find((source) => source.id === sourceId)?.name || '未知来源';
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
