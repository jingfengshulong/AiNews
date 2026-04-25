const defaultFreshnessWindowHours = {
  technology_media: 7 * 24,
  company_announcement: 14 * 24,
  research: 30 * 24,
  funding: 30 * 24,
  policy: 30 * 24,
  community: 3 * 24,
  product_launch: 14 * 24
};

const supportedLanguages = new Set(['en', 'zh', 'zh-CN']);

export class ArticleQualityService {
  constructor({ articleRepository, sourceService, now = () => new Date(), freshnessWindowHours = defaultFreshnessWindowHours } = {}) {
    this.articleRepository = articleRepository;
    this.sourceService = sourceService;
    this.now = now;
    this.freshnessWindowHours = freshnessWindowHours;
  }

  classifyArticles() {
    const articles = this.articleRepository.listArticles();
    let visibleLatest = 0;
    let hiddenLatest = 0;
    let lowQuality = 0;

    for (const article of articles) {
      const classification = classifyArticleForLatest(article, {
        source: this.getSource(article.sourceId),
        now: this.now(),
        freshnessWindowHours: this.freshnessWindowHours
      });
      this.articleRepository.updateQualityStatus(article.id, classification);
      if (classification.visibilityStatus === 'visible_latest') {
        visibleLatest += 1;
      } else {
        hiddenLatest += 1;
      }
      if (classification.qualityStatus === 'low_quality') {
        lowQuality += 1;
      }
    }

    return {
      checkedArticles: articles.length,
      visibleLatest,
      hiddenLatest,
      lowQuality
    };
  }

  getSource(sourceId) {
    try {
      return this.sourceService?.getSource(sourceId);
    } catch {
      return undefined;
    }
  }
}

export function classifyArticleForLatest(article, { source, now = new Date(), freshnessWindowHours = defaultFreshnessWindowHours } = {}) {
  const qualityReasons = [];
  const lowQualityReasons = [];

  if (!article.title || article.title.trim().length < 6) {
    lowQualityReasons.push('missing_title');
  }
  if (!article.canonicalUrl) {
    lowQualityReasons.push('missing_url');
  }
  if (!article.publishedAt) {
    lowQualityReasons.push('missing_published_at');
  }
  if (!hasMeaningfulContent(article)) {
    lowQualityReasons.push('missing_content');
  }
  if (article.language && !supportedLanguages.has(article.language)) {
    lowQualityReasons.push('unsupported_language');
  }

  qualityReasons.push(...lowQualityReasons);
  if (isStaleForLatest(article, { source, now, freshnessWindowHours })) {
    qualityReasons.push('stale_for_latest');
  }

  return {
    qualityStatus: lowQualityReasons.length > 0 ? 'low_quality' : 'approved',
    visibilityStatus: qualityReasons.length > 0 ? 'hidden_latest' : 'visible_latest',
    qualityReasons,
    qualityCheckedAt: now.toISOString()
  };
}

function hasMeaningfulContent(article) {
  const excerptLength = String(article.excerpt || '').trim().length;
  const textLength = String(article.textForAI || '').trim().length;
  return excerptLength >= 20 || textLength >= 80;
}

function isStaleForLatest(article, { source, now, freshnessWindowHours }) {
  if (!article.publishedAt) {
    return false;
  }
  const publishedAt = new Date(article.publishedAt);
  if (Number.isNaN(publishedAt.getTime())) {
    return true;
  }
  const windowHours = sourceFreshnessWindowHours(source, freshnessWindowHours);
  const ageHours = Math.max(0, (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60));
  return ageHours > windowHours;
}

function sourceFreshnessWindowHours(source, freshnessWindowHours) {
  if (Number.isFinite(source?.freshnessWindowHours) && source.freshnessWindowHours > 0) {
    return source.freshnessWindowHours;
  }
  return freshnessWindowHours[source?.family] || (7 * 24);
}
