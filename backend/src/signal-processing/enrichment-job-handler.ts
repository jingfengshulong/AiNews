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
      signalRepository.updateEnrichmentFailure(signal.id, error.message, {
        provider: provider.name || 'custom',
        failedAt: new Date().toISOString(),
        errorCategory: category
      });
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
