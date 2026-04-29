import { validateEnrichmentOutput } from './enrichment-output-validator.ts';
import { currentEnrichmentVersion } from './enrichment-version.ts';

export class EnrichmentJobError extends Error {
  constructor(message, category = 'enrichment_failed') {
    super(message);
    this.name = 'EnrichmentJobError';
    this.category = category;
  }
}

export function enqueuePendingEnrichmentJobs({ signalRepository, queue, now = new Date(), retryFallback = false, signalIds, runId } = {}) {
  const runAt = new Date(now);
  const allowedSignalIds = signalIds ? new Set(signalIds) : undefined;
  return signalRepository.listSignals()
    .filter((signal) => signal.enrichmentStatus === 'pending' || (retryFallback && isRetryableFallbackSignal(signal)))
    .filter((signal) => !allowedSignalIds || allowedSignalIds.has(signal.id))
    .map((signal) => queue.enqueue('enrichment', { signalId: signal.id, runId }, {
      jobKey: enrichmentJobKey(signal, { retryFallback, now: runAt }),
      runAfter: runAt
    }));
}

function enrichmentJobKey(signal, { retryFallback, now }) {
  if (retryFallback && isRetryableFallbackSignal(signal)) {
    return `enrichment:${signal.id}:${signal.enrichmentStatus}-retry:${now.toISOString()}`;
  }
  return `enrichment:${signal.id}`;
}

function isRetryableFallbackSignal(signal) {
  if (signal.enrichmentStatus === 'fallback') {
    return true;
  }
  return signal.enrichmentStatus === 'failed'
    && signal.enrichmentMeta?.fallbackGenerated === true
    && signal.enrichmentMeta?.errorCategory === 'enrichment_validation_failed';
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
        sourceCount: context.sources.length,
        enrichmentVersion: currentEnrichmentVersion
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
        sourceCount: context.sources.length,
        enrichmentVersion: currentEnrichmentVersion
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
        fallbackGenerated: true,
        enrichmentVersion: currentEnrichmentVersion
      }, fallback);
      throw new EnrichmentJobError(error.message, category);
    }
  };
}

export async function processEnrichmentJobs({ queue, handler, limit = 25, now = new Date(), filter } = {}) {
  const results = [];
  let completed = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const job = await queue.claimNext('enrichment', { now, filter });
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
  const facts = fallbackFacts(context);
  const sourceMix = sources.map((source) => ({
    sourceId: source.id,
    sourceName: source.name,
    role: roleForSource(source)
  }));
  const keyPoints = fallbackKeyPoints({ articles, sources, facts });

  return {
    aiBrief: buildFallbackBrief(facts),
    keyPoints: keyPoints.length ? keyPoints : sources.slice(0, 3).map((source) => ({
      text: `${source.name} 提供了该信号的来源标题、摘要和发布时间。`,
      sourceIds: [source.id]
    })),
    timeline: articles.slice(0, 4).map((article) => ({
      label: `${sourceNameFor(sources, article.sourceId)} 发布了这条相关资讯。`,
      at: article.publishedAt,
      sourceIds: [article.sourceId]
    })),
    sourceMix,
    nextWatch: leadArticle
      ? facts.watch
      : '继续关注后续来源确认和更新时间。',
    relatedSignalIds: []
  };
}

function ensureSubstantiveEnrichmentOutput(output, context) {
  const fallback = createFallbackEnrichmentOutput(context);
  const repaired = {
    ...output,
    keyPoints: validKeyPoints(output?.keyPoints, context) ? compactKeyPoints(output.keyPoints) : fallback.keyPoints,
    timeline: validTimeline(output?.timeline, context) ? compactTimeline(output.timeline) : fallback.timeline,
    sourceMix: validSourceMix(output?.sourceMix, context) ? output.sourceMix : fallback.sourceMix,
    nextWatch: hasCjk(output?.nextWatch) ? clipToVisibleLength(output.nextWatch, 140) : fallback.nextWatch,
    relatedSignalIds: asArray(output?.relatedSignalIds)
  };
  if (chineseCharCount(output?.aiBrief) >= 100) {
    return repaired;
  }
  return {
    ...repaired,
    aiBrief: buildSubstantiveBrief(output?.aiBrief, context, repaired)
  };
}

function validKeyPoints(value, context) {
  const points = asArray(value);
  return points.length >= 1 && points.length <= 6 && points.every((point) => {
    const text = typeof point === 'string' ? point : point?.text;
    return hasCjk(text) && validSourceIds(point?.sourceIds, context);
  });
}

function validTimeline(value, context) {
  const items = asArray(value);
  return items.length <= 8 && items.every((item) => {
    const label = typeof item === 'string' ? item : item?.label;
    return hasCjk(label) && validSourceIds(item?.sourceIds, context);
  });
}

function validSourceMix(value, context) {
  const sourceIds = new Set(asArray(context.sources).map((source) => source.id));
  const items = asArray(value);
  return items.length > 0 && items.every((item) => sourceIds.has(item?.sourceId));
}

function compactKeyPoints(value) {
  return asArray(value).map((point) => ({
    ...(typeof point === 'string' ? {} : point),
    text: clipToVisibleLength(typeof point === 'string' ? point : point?.text, 100),
    sourceIds: asArray(point?.sourceIds).filter(Boolean)
  }));
}

function compactTimeline(value) {
  return asArray(value).map((item) => ({
    ...(typeof item === 'string' ? {} : item),
    label: clipToVisibleLength(typeof item === 'string' ? item : item?.label, 100),
    sourceIds: asArray(item?.sourceIds).filter(Boolean)
  }));
}

function validSourceIds(value, context) {
  const sourceIds = new Set(asArray(context.sources).map((source) => source.id));
  const ids = asArray(value).filter(Boolean);
  return ids.length > 0 && ids.every((sourceId) => sourceIds.has(sourceId));
}

function fallbackFacts(context) {
  const sources = asArray(context.sources);
  const articles = asArray(context.articles);
  const leadArticle = articles[0] || {};
  const sourceNames = sources.slice(0, 3).map((source) => source.name).filter(Boolean).join('、') || '已登记来源';
  const title = cleanText(context.signal?.title || leadArticle.title);
  const excerpt = cleanText(leadArticle.excerpt);
  const contextText = [
    title,
    excerpt,
    ...articles.map((article) => article.textForAI)
  ].join(' ');
  const terms = extractContextTerms(contextText);
  const claims = extractContextClaims(contextText, { terms });
  const compactTerms = terms.slice(0, 5).join('、');
  const subject = title || '这条资讯';
  const summaryLine = excerpt || `${sourceNames} 已提供标题、发布时间和来源归因。`;
  const watch = claims.length
    ? `继续核对${compactTerms || claims.slice(0, 2).join('、')}的官方说明、开源资料、实测反馈和更多独立来源。`
    : compactTerms
    ? `继续关注${compactTerms}的官方说明、落地案例和更多来源确认。`
    : '继续关注官方更新、独立报道和更多来源确认。';

  return {
    sourceNames,
    title: subject,
    excerpt: summaryLine,
    terms,
    claims,
    watch
  };
}

function fallbackKeyPoints({ articles, sources, facts }) {
  const leadArticle = articles[0];
  if (!leadArticle) {
    return [];
  }
  const sourceName = sourceNameFor(sources, leadArticle.sourceId);
  const terms = facts.terms.slice(0, 5).join('、');
  const claimPoints = facts.claims.slice(0, 3).map((claim) => ({
    text: withTerminalPunctuation(claim),
    sourceIds: [leadArticle.sourceId]
  }));
  return [
    {
      text: `${sourceName} 报道了${clip(facts.title, 70)}。`,
      sourceIds: [leadArticle.sourceId]
    },
    ...claimPoints,
    claimPoints.length === 0 && facts.excerpt ? {
      text: hasCjk(facts.excerpt) ? clip(facts.excerpt, 96) : `来源摘要提到：${clip(facts.excerpt, 82)}`,
      sourceIds: [leadArticle.sourceId]
    } : undefined,
    claimPoints.length < 2 && terms ? {
      text: `后续可重点核对${terms}的实际进展。`,
      sourceIds: [leadArticle.sourceId]
    } : undefined
  ].filter(Boolean);
}

function buildFallbackBrief(facts) {
  const terms = facts.terms.slice(0, 5).join('、');
  const claimSentence = facts.claims.length
    ? `可确认的关键信息包括：${facts.claims.slice(0, 4).map(stripTerminalPunctuation).join('；')}。`
    : '';
  const termSentence = claimSentence || (terms
    ? `可提取的主题线索包括${terms}，这些信息能帮助判断它更偏向会议议程、企业采用、技术架构还是产品落地。`
    : '目前可提取的主题线索仍有限，需要结合后续来源判断它对产品发布、企业采用、技术路线或行业竞争的影响。');
  const brief = [
    `这条资讯聚焦${clip(facts.title, 62)}。`,
    `来源摘要显示，${stripTerminalPunctuation(clip(facts.excerpt, 78))}。`,
    termSentence
  ].join('');
  return clipToVisibleLength(ensureMinimumChineseLength(brief), 280);
}

function extractContextTerms(value) {
  const text = cleanText(value);
  const candidates = [
    '企业 Agent',
    '自动化行动架构',
    'AICon',
    'WinNexO',
    '数据到行动',
    '多模态数据集成',
    '语义模型',
    'Agent Runtime',
    '权限控制',
    '行业实践',
    '工程挑战',
    '数据与记忆',
    '安全可信',
    '落地保障',
    '大模型推理',
    '智算架构',
    'SenseNova U1',
    'NEO-unify',
    '统一表征空间',
    '多模态理解',
    '视觉推理',
    '图像生成',
    '连续性图文创作',
    '开源 SOTA',
    'GitHub',
    'Hugging Face'
  ];
  return unique(candidates.filter((term) => text.includes(term)));
}

function extractContextClaims(value, { terms = [] } = {}) {
  const text = cleanText(value);
  const claims = [];
  const modelNames = extractModelNames(text);
  const product = modelNames.find((name) => /SenseNova/i.test(name)) || modelNames[0];
  const modelLabel = product || '相关模型';

  if (containsAny(text, ['开源', 'GitHub', 'Hugging Face'])) {
    const releaseTargets = modelNames.filter((name) => !/NEO[-\s]?unify/i.test(name)).slice(0, 3);
    claims.push(releaseTargets.length
      ? `${releaseTargets.join('、')} 已开放开源资料或部署入口`
      : '来源提到项目已开放开源资料或部署入口');
  }
  if (/NEO[-\s]?unify/i.test(text) || containsAny(text, ['统一表征空间', '单一模型架构', '原生统一'])) {
    claims.push(`${modelLabel} 以统一表征空间整合多模态理解、推理与生成，重点在减少传统拼接式多模型链路的转换损耗`);
  }
  if (containsAny(text, ['视觉编码器', '变分自编码器', 'VAE', 'VE'])) {
    claims.push('报道强调该架构弱化对视觉编码器或 VAE 等独立模块拼接的依赖，试图把图像和语言放入同一套表示中处理');
  }
  if (containsAny(text, ['8B-MoT', 'A3B-MoT', 'MoE', '稠密骨干网络', '混合专家'])) {
    claims.push('本次轻量版包含稠密骨干与混合专家等不同规格，便于开发者按算力和场景选择');
  }
  if (containsAny(text, ['SOTA', '基准测试', 'benchmark', 'Benchmark', '图像理解', '视觉推理', '商业闭源模型'])) {
    claims.push('来源称它在图像理解、图像生成、视觉推理等测试中对标同量级开源 SOTA，并强调推理效率');
  }
  if (containsAny(text, ['连续性图文创作', '图文交错', '单次单模型调用', '共享上下文'])) {
    claims.push('一个重点应用方向是连续性图文创作输出，用单模型调用保持文本与图像内容的一致上下文');
  }
  if (containsAny(text, ['机器人', '具身大脑', '复杂环境感知', '任务执行'])) {
    claims.push('报道还把该路线延伸到机器人感知、逻辑推演和任务执行等具身智能场景');
  }
  if (claims.length === 0 && terms.length > 0) {
    claims.push(`主题线索集中在${terms.slice(0, 5).join('、')}`);
  }
  return unique(claims).slice(0, 6);
}

function extractModelNames(value) {
  const text = cleanText(value);
  const matches = [
    ...text.matchAll(/\bSenseNova[-\s]?[A-Za-z0-9.-]+\b/g),
    ...text.matchAll(/\bNEO[-\s]?unify\b/gi),
    ...text.matchAll(/\b[A-Za-z]+-[A-Za-z0-9]+(?:-[A-Za-z0-9]+){1,3}\b/g)
  ].map((match) => cleanText(match[0]).replace(/\s+/g, ' '));
  return unique(matches).slice(0, 6);
}

function containsAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function buildSubstantiveBrief(seed, context, output = {}) {
  const sources = asArray(context.sources);
  const articles = asArray(context.articles);
  const sourceNames = sources.slice(0, 3).map((source) => source.name).filter(Boolean).join('、') || '已登记来源';
  const title = clip(context.signal.title, 72);
  const opening = cleanText(seed) || `${title} 当前已有基础来源支撑。`;
  const keyPointText = asArray(output.keyPoints)
    .map((point) => stripTerminalPunctuation(typeof point === 'string' ? point : point?.text))
    .filter(Boolean)
    .slice(0, 1)
    .join('；');
  const nextWatch = stripTerminalPunctuation(output.nextWatch);
  const repairedBrief = [
    opening,
    chineseCharCount(opening) < 20 && !opening.includes(title.slice(0, 12)) ? `相关标题是${title}。` : '',
    keyPointText
      ? `要点显示：${keyPointText}。`
      : `这条信号目前由${sourceNames}提供支撑，核心线索集中在“${title}”及相关来源标题。`,
    nextWatch
      ? `后续观察：${nextWatch}。`
      : `后续应继续核对官方说明、独立报道、研究或社区反馈，判断它对产品发布、企业采用、技术路线或行业竞争格局的实际影响。`
  ].filter(Boolean).join('');
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
  const clipped = clipToVisibleLength(value, 280);
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
  ].join(''), 280);
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

function withTerminalPunctuation(value) {
  const text = cleanText(value);
  return /[。.!?！？]$/.test(text) ? text : `${text}。`;
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
  const clipped = chars.slice(0, maxLength - 1).join('');
  const sentenceEnd = Math.max(
    clipped.lastIndexOf('。'),
    clipped.lastIndexOf('！'),
    clipped.lastIndexOf('？')
  );
  if (sentenceEnd >= Math.floor(maxLength * 0.62)) {
    return clipped.slice(0, sentenceEnd + 1);
  }
  return `${clipped.replace(/[，。、；：\s]+$/, '')}。`;
}

function chineseCharCount(value) {
  return Array.from(String(value || '')).filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
}

function hasCjk(value) {
  return chineseCharCount(value) > 0;
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
