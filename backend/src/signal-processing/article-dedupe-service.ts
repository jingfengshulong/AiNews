const confirmedTitleThreshold = 0.82;
const possibleTitleThreshold = 0.5;
const titleTimeWindowHours = 72;

export class ArticleDedupeService {
  constructor({ articleRepository, sourceRelationRepository, now = () => new Date() } = {}) {
    this.articleRepository = articleRepository;
    this.sourceRelationRepository = sourceRelationRepository;
    this.now = now;
  }

  dedupeArticles() {
    const articles = this.articleRepository.listArticles().sort(articleSort);
    const duplicateIds = new Set();
    const possibleIds = new Set();
    let confirmedDuplicates = 0;
    let possibleDuplicates = 0;

    for (let i = 0; i < articles.length; i += 1) {
      const lead = articles[i];
      if (duplicateIds.has(lead.id)) {
        continue;
      }

      for (let j = i + 1; j < articles.length; j += 1) {
        const candidate = articles[j];
        if (duplicateIds.has(candidate.id)) {
          continue;
        }

        const evidence = compareArticles(lead, candidate);
        if (evidence.confidence >= confirmedTitleThreshold || evidence.reasons.includes('canonical_url') || evidence.reasons.includes('content_hash')) {
          duplicateIds.add(candidate.id);
          possibleIds.delete(candidate.id);
          this.articleRepository.updateDedupeStatus(lead.id, 'canonical');
          this.articleRepository.updateDedupeStatus(candidate.id, 'duplicate');
          this.sourceRelationRepository.upsertRelation({
            sourceId: candidate.sourceId,
            articleId: candidate.id,
            relationType: 'duplicate_confirmed',
            evidence: {
              ...evidence,
              targetArticleId: lead.id,
              scoreImpact: {
                duplicateSupport: true,
                heatBoost: scoreBoost(evidence.confidence, 0.2),
                credibilityBoost: scoreBoost(evidence.confidence, 0.12)
              },
              detectedAt: this.now().toISOString()
            }
          });
          confirmedDuplicates += 1;
          continue;
        }

        if (evidence.confidence >= possibleTitleThreshold && !possibleIds.has(candidate.id)) {
          possibleIds.add(candidate.id);
          this.articleRepository.updateDedupeStatus(candidate.id, 'possible_duplicate');
          this.sourceRelationRepository.upsertRelation({
            sourceId: candidate.sourceId,
            articleId: candidate.id,
            relationType: 'duplicate_candidate',
            evidence: {
              ...evidence,
              targetArticleId: lead.id,
              scoreImpact: {
                duplicateSupport: false,
                heatBoost: 0,
                credibilityBoost: 0
              },
              detectedAt: this.now().toISOString()
            }
          });
          possibleDuplicates += 1;
        }
      }
    }

    return {
      checkedArticles: articles.length,
      confirmedDuplicates,
      possibleDuplicates
    };
  }
}

function compareArticles(first, second) {
  const reasons = [];
  const normalizedFirstUrl = normalizeUrl(first.canonicalUrl);
  const normalizedSecondUrl = normalizeUrl(second.canonicalUrl);

  if (normalizedFirstUrl && normalizedFirstUrl === normalizedSecondUrl) {
    reasons.push('canonical_url');
  }
  if (first.contentHash && second.contentHash && first.contentHash === second.contentHash) {
    reasons.push('content_hash');
  }

  const titleSimilarity = titleSimilarityScore(first.title, second.title);
  if (titleSimilarity >= possibleTitleThreshold) {
    reasons.push('title_similarity');
  }

  const hoursApart = publicationHoursApart(first.publishedAt, second.publishedAt);
  const withinTimeWindow = hoursApart === undefined || hoursApart <= titleTimeWindowHours;
  if (withinTimeWindow) {
    reasons.push('time_window');
  }
  if (first.sourceId && second.sourceId && first.sourceId !== second.sourceId) {
    reasons.push('source_diversity');
  }

  const exactMatch = reasons.includes('canonical_url') || reasons.includes('content_hash');
  const confidence = exactMatch ? 0.98 : titleSimilarity * (withinTimeWindow ? 1 : 0.65);

  return {
    confidence: round(confidence),
    titleSimilarity: round(titleSimilarity),
    hoursApart,
    reasons: exactMatch ? reasons.filter((reason) => reason === 'canonical_url' || reason === 'content_hash') : reasons
  };
}

function titleSimilarityScore(firstTitle, secondTitle) {
  const firstTokens = titleTokens(firstTitle);
  const secondTokens = titleTokens(secondTitle);
  if (firstTokens.length === 0 || secondTokens.length === 0) {
    return 0;
  }

  const secondTokenSet = new Set(secondTokens);
  const intersection = firstTokens.filter((token) => secondTokenSet.has(token)).length;
  return (2 * intersection) / (firstTokens.length + secondTokens.length);
}

function titleTokens(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !stopWords.has(token));
}

function publicationHoursApart(first, second) {
  if (!first || !second) {
    return undefined;
  }
  const firstTime = new Date(first).getTime();
  const secondTime = new Date(second).getTime();
  if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) {
    return undefined;
  }
  return Math.abs(firstTime - secondTime) / (1000 * 60 * 60);
}

function normalizeUrl(value) {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(value).trim().replace(/\/$/, '');
  }
}

function scoreBoost(confidence, maxBoost) {
  return round(confidence * maxBoost);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function articleSort(first, second) {
  const firstTime = new Date(first.publishedAt || first.createdAt).getTime();
  const secondTime = new Date(second.publishedAt || second.createdAt).getTime();
  if (firstTime !== secondTime) {
    return firstTime - secondTime;
  }
  return first.id.localeCompare(second.id);
}

const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'for',
  'from',
  'in',
  'into',
  'new',
  'of',
  'on',
  'the',
  'to',
  'with'
]);
