import { createHash } from 'node:crypto';

export async function normalizeRawItemToProductLaunchCandidate({ rawItem, source, articleRepository }) {
  const payload = rawItem.payload || {};
  const rawPayload = payload.rawPayload || {};
  const title = firstText(payload.title, rawPayload.name, rawPayload.title);
  const tagline = firstText(payload.summary, rawPayload.tagline);
  const description = firstText(rawPayload.description, payload.description, tagline);
  const categories = readCategories(payload, rawPayload);
  const makers = readMakers(payload, rawPayload);
  const canonicalUrl = firstText(payload.url, rawPayload.url, rawPayload.website);

  const candidate = {
    rawItemId: rawItem.id,
    sourceId: source.id,
    canonicalUrl,
    title,
    language: source.language || payload.language || 'en',
    excerpt: tagline || excerpt(description),
    publishedAt: toIsoDate(firstText(payload.publishedAt, rawPayload.featuredAt, rawPayload.createdAt)),
    author: firstText(payload.author) || makers.join(', ') || undefined,
    textForAI: buildProductLaunchText({
      rawItem,
      source,
      title,
      tagline,
      description,
      categories,
      makers,
      canonicalUrl,
      website: firstText(rawPayload.website, payload.website),
      votesCount: rawPayload.votesCount ?? payload.votesCount,
      commentsCount: rawPayload.commentsCount ?? payload.commentsCount,
      reviewsCount: rawPayload.reviewsCount ?? payload.reviewsCount,
      dailyRank: rawPayload.dailyRank ?? payload.dailyRank,
      launchedAt: firstText(payload.publishedAt, rawPayload.featuredAt, rawPayload.createdAt)
    }),
    fullTextDisplayAllowed: source.usagePolicy?.allowFullText === true,
    contentHash: rawItem.contentHash || hashProductPayload({ title, tagline, description, canonicalUrl }),
    extractionMeta: {
      extractor: 'product-launch-metadata',
      sourceType: source.sourceType,
      sourceFamily: source.family,
      rawItemExternalId: rawItem.externalId,
      categories,
      makers,
      website: firstText(rawPayload.website, payload.website),
      votesCount: rawPayload.votesCount ?? payload.votesCount,
      commentsCount: rawPayload.commentsCount ?? payload.commentsCount,
      dailyRank: rawPayload.dailyRank ?? payload.dailyRank
    }
  };

  return articleRepository.upsertArticleCandidate(candidate);
}

function buildProductLaunchText({ rawItem, source, title, tagline, description, categories, makers, canonicalUrl, website, votesCount, commentsCount, reviewsCount, dailyRank, launchedAt }) {
  return [
    `Source type: ${source.sourceType}`,
    source.name ? `Source name: ${source.name}` : undefined,
    title ? `Product: ${title}` : undefined,
    tagline ? `Tagline: ${tagline}` : undefined,
    description ? `Description: ${description}` : undefined,
    makers.length ? `Makers: ${makers.join(', ')}` : undefined,
    categories.length ? `Topics: ${categories.join(', ')}` : undefined,
    launchedAt ? `Launched: ${launchedAt}` : undefined,
    canonicalUrl ? `Product Hunt URL: ${canonicalUrl}` : undefined,
    website ? `Website: ${website}` : undefined,
    Number.isFinite(votesCount) ? `Votes: ${votesCount}` : undefined,
    Number.isFinite(commentsCount) ? `Comments: ${commentsCount}` : undefined,
    Number.isFinite(reviewsCount) ? `Reviews: ${reviewsCount}` : undefined,
    Number.isFinite(dailyRank) ? `Daily rank: ${dailyRank}` : undefined,
    `Raw item external ID: ${rawItem.externalId}`
  ].filter(Boolean).join('\n');
}

function readCategories(payload, rawPayload) {
  const topics = rawPayload.topics?.edges ? rawPayload.topics.edges.map((edge) => edge.node) : rawPayload.topics;
  return unique(asArray(payload.categories || topics).map((item) => firstText(item?.name, item?.slug, item)).filter(Boolean));
}

function readMakers(payload, rawPayload) {
  return unique(asArray(payload.authors || rawPayload.makers).map((item) => firstText(item?.name, item?.username, item)).filter(Boolean));
}

function firstText(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      const nested = firstText(...value);
      if (nested) {
        return nested;
      }
      continue;
    }
    if (typeof value === 'object') {
      const nested = firstText(value.name, value.title, value.value, value.text, value['#text']);
      if (nested) {
        return nested;
      }
      continue;
    }
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (text) {
      return text;
    }
  }
  return undefined;
}

function excerpt(value, maxLength = 320) {
  const text = firstText(value);
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trim()}...`;
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

function toIsoDate(value) {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function hashProductPayload(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
