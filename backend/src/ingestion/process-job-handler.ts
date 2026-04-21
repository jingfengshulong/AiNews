import { normalizeRawItemToArticleCandidate } from './article-normalizer.ts';
import { normalizeRawItemToProductLaunchCandidate } from './product-launch-normalizer.ts';
import { normalizeRawItemToResearchArticleCandidate } from './research-normalizer.ts';

const articleBackedSourceTypes = new Set(['rss', 'atom', 'newsapi', 'hacker_news']);
const researchSourceTypes = new Set(['arxiv', 'semantic_scholar', 'crossref']);

export class ProcessJobError extends Error {
  constructor(message, category = 'process_failed') {
    super(message);
    this.name = 'ProcessJobError';
    this.category = category;
  }
}

export function createProcessJobHandler({ rawItemRepository, sourceService, articleFetcher, articleRepository }) {
  return async function handleProcessJob(job) {
    return processRawItemJob({
      job,
      rawItemRepository,
      sourceService,
      articleFetcher,
      articleRepository
    });
  };
}

export async function processRawItemJob({ job, rawItemRepository, sourceService, articleFetcher, articleRepository }) {
  if (job.lane !== 'process') {
    throw new ProcessJobError(`Unsupported job lane for process handler: ${job.lane}`, 'unsupported_job_lane');
  }

  const rawItemId = job.payload?.rawItemId;
  const sourceId = job.payload?.sourceId;
  if (!rawItemId || !sourceId) {
    throw new ProcessJobError('Process job requires rawItemId and sourceId', 'invalid_job_payload');
  }

  const rawItem = rawItemRepository.getRawItem(rawItemId);
  if (!rawItem) {
    throw new ProcessJobError(`Raw item not found: ${rawItemId}`, 'raw_item_not_found');
  }

  const source = sourceService.getSource(sourceId);
  if (researchSourceTypes.has(source.sourceType)) {
    const article = await normalizeRawItemToResearchArticleCandidate({
      rawItem,
      source,
      articleRepository
    });

    return {
      normalizedType: 'research_article',
      rawItemId: rawItem.id,
      sourceId: source.id,
      articleId: article.id
    };
  }

  if (source.sourceType === 'product_hunt') {
    const article = await normalizeRawItemToProductLaunchCandidate({
      rawItem,
      source,
      articleRepository
    });

    return {
      normalizedType: 'product_launch_article',
      rawItemId: rawItem.id,
      sourceId: source.id,
      articleId: article.id
    };
  }

  if (!articleBackedSourceTypes.has(source.sourceType)) {
    throw new ProcessJobError(`No process normalizer for source type: ${source.sourceType}`, 'unsupported_source_type');
  }

  const article = await normalizeRawItemToArticleCandidate({
    rawItem,
    source,
    fetcher: articleFetcher,
    articleRepository
  });

  return {
    normalizedType: 'article',
    rawItemId: rawItem.id,
    sourceId: source.id,
    articleId: article.id
  };
}

export async function processQueuedJobs({ queue, lane = 'process', handler, limit = 25, now = new Date() }) {
  const results = [];
  let completed = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const job = queue.claimNext(lane, { now });
    if (!job) {
      break;
    }

    try {
      const result = await handler(job);
      queue.complete(job.id, result);
      completed += 1;
      results.push({ jobId: job.id, status: 'completed', result });
    } catch (error) {
      const errorCategory = error.category || 'process_failed';
      queue.fail(job.id, { message: error.message, errorCategory });
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
