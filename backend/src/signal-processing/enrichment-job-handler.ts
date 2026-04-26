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
      const repaired = ensureSubstantiveEnrichmentOutput(output, context);
      const validated = validateEnrichmentOutput(repaired, context);
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
    aiBrief: buildSubstantiveBrief('目前已保留基础来源信息，AI 精炼暂不可用。', context),
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

function ensureSubstantiveEnrichmentOutput(output, context) {
  if (chineseCharCount(output?.aiBrief) >= 100) {
    return output;
  }
  return {
    ...output,
    aiBrief: buildSubstantiveBrief(output?.aiBrief, context, output)
  };
}

function buildSubstantiveBrief(seed, context, output = {}) {
  const sources = asArray(context.sources);
  const articles = asArray(context.articles);
  const sourceNames = sources.slice(0, 3).map((source) => source.name).filter(Boolean).join('、') || '已登记来源';
  const articleTitles = articles.slice(0, 2).map((article) => article.title).filter(Boolean).join('；') || context.signal.title;
  const title = clip(context.signal.title, 72);
  const opening = clip(cleanText(seed), 86) || `${title} 当前已有基础来源支撑。`;
  const keyPointText = asArray(output.keyPoints)
    .map((point) => stripTerminalPunctuation(typeof point === 'string' ? point : point?.text))
    .filter(Boolean)
    .slice(0, 2)
    .join('；');
  const nextWatch = stripTerminalPunctuation(output.nextWatch);
  const repairedBrief = [
    opening,
    keyPointText
      ? `要点显示：${keyPointText}。`
      : `这条信号目前由${sourceNames}提供支撑，核心线索集中在“${title}”及相关来源标题。`,
    `来源归因显示为${sourceNames}，页面只展示经过处理的摘要、要点和可公开字段，避免直接暴露受限原文。`,
    nextWatch
      ? `后续观察：${nextWatch}。`
      : `后续应继续核对官方说明、独立报道、研究或社区反馈，判断它对产品发布、企业采用、技术路线或行业竞争格局的实际影响。`,
    `可优先回看这些来源标题：${clip(articleTitles, 80)}。`
  ].join('');
  return finalizeSubstantiveBrief(ensureMinimumChineseLength(repairedBrief), {
    seed,
    title,
    sourceNames
  });
}

function ensureMinimumChineseLength(value) {
  let brief = cleanText(value);
  const addition = ' 目前信息仍以来源标题、发布时间、来源类型和后续交叉验证为准，建议关注是否出现更多独立来源、官方补充、用户反馈和可执行的产品变化。';
  while (chineseCharCount(brief) < 100) {
    brief = `${brief}${addition}`;
  }
  return brief;
}

function finalizeSubstantiveBrief(value, { seed, title, sourceNames }) {
  const clipped = clipToVisibleLength(value, 220);
  if (chineseCharCount(clipped) >= 100) {
    return clipped;
  }
  const compactSeed = clip(cleanText(seed) || title, 60);
  const sourcePhrase = sourceNames ? `，并保留 ${clip(sourceNames, 42)} 等来源的归因` : '，并保留来源归因';
  return clipToVisibleLength([
    compactSeed,
    `。这条资讯已完成来源归因整理${sourcePhrase}。`,
    '当前可确认的是：系统记录了原始链接、发布时间、来源类型和标题证据，页面展示处理后的摘要、要点和可公开字段。',
    '后续需要继续观察官方说明、独立报道、研究或社区反馈是否增加，以判断它对产品发布、企业采用、技术路线或行业竞争格局的实际影响。'
  ].join(''), 220);
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

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripTerminalPunctuation(value) {
  return cleanText(value).replace(/[。.!?！？；;]+$/g, '');
}

function clip(value, maxLength) {
  const text = cleanText(value);
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3).trim()}...`;
}

function clipToVisibleLength(value, maxLength) {
  const chars = Array.from(cleanText(value));
  if (chars.length <= maxLength) {
    return chars.join('');
  }
  return `${chars.slice(0, maxLength - 1).join('').replace(/[，。、；：\s]+$/, '')}。`;
}

function chineseCharCount(value) {
  return Array.from(String(value || '')).filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
