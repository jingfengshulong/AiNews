import { createHash } from 'node:crypto';

export async function normalizeRawItemToResearchArticleCandidate({ rawItem, source, articleRepository }) {
  const payload = rawItem.payload || {};
  const rawPayload = payload.rawPayload || {};
  const externalIds = readExternalIds(payload, rawPayload);
  const authors = readAuthors(payload, rawPayload);
  const categories = readCategories(payload, rawPayload);
  const title = firstText(payload.title, rawPayload.title, rawPayload.name);
  const abstract = firstText(payload.abstract, payload.summary, rawPayload.abstract, rawPayload.summary, rawPayload.description);
  const doi = firstText(payload.doi, payload.DOI, rawPayload.doi, rawPayload.DOI, externalIds.DOI, externalIds.doi);
  const arxivId = firstText(payload.arxivId, rawPayload.arxivId, externalIds.ArXiv, externalIds.arxiv, source.sourceType === 'arxiv' ? rawItem.externalId : undefined);
  const canonicalUrl = firstText(
    payload.url,
    rawPayload.url,
    rawPayload.paperUrl,
    rawPayload.openAccessPdf?.url,
    arxivId ? `http://arxiv.org/abs/${arxivId}` : undefined,
    doi ? `https://doi.org/${doi}` : undefined
  );

  const candidate = {
    rawItemId: rawItem.id,
    sourceId: source.id,
    canonicalUrl,
    title,
    language: source.language || payload.language || 'en',
    excerpt: excerpt(abstract || payload.summary || title),
    publishedAt: toIsoDate(firstText(payload.publishedAt, rawPayload.publishedAt, rawPayload.publicationDate, rawPayload.year)),
    author: firstText(payload.author) || authors.join(', ') || undefined,
    textForAI: buildResearchText({
      rawItem,
      source,
      title,
      abstract,
      authors,
      categories,
      canonicalUrl,
      doi,
      arxivId,
      pdfUrl: firstText(payload.pdfUrl, rawPayload.pdfUrl, rawPayload.openAccessPdf?.url),
      publishedAt: firstText(payload.publishedAt, rawPayload.publishedAt, rawPayload.publicationDate, rawPayload.year),
      updatedAt: firstText(payload.updatedAt, rawPayload.updatedAt),
      citationCount: rawPayload.citationCount ?? payload.citationCount
    }),
    fullTextDisplayAllowed: source.usagePolicy?.allowFullText === true,
    contentHash: rawItem.contentHash || hashResearchPayload({ title, abstract, authors, categories, canonicalUrl, doi, arxivId }),
    extractionMeta: {
      extractor: 'research-metadata',
      sourceType: source.sourceType,
      sourceFamily: source.family,
      rawItemExternalId: rawItem.externalId,
      abstractAvailable: Boolean(abstract),
      authors,
      categories,
      externalIds,
      doi,
      arxivId,
      pdfUrl: firstText(payload.pdfUrl, rawPayload.pdfUrl, rawPayload.openAccessPdf?.url)
    }
  };

  return articleRepository.upsertArticleCandidate(candidate);
}

function buildResearchText({ rawItem, source, title, abstract, authors, categories, canonicalUrl, doi, arxivId, pdfUrl, publishedAt, updatedAt, citationCount }) {
  const lines = [
    `Source type: ${source.sourceType}`,
    source.name ? `Source name: ${source.name}` : undefined,
    title ? `Title: ${title}` : undefined,
    authors.length ? `Authors: ${authors.join(', ')}` : undefined,
    publishedAt ? `Published: ${publishedAt}` : undefined,
    updatedAt ? `Updated: ${updatedAt}` : undefined,
    categories.length ? `Categories: ${categories.join(', ')}` : undefined,
    doi ? `DOI: ${doi}` : undefined,
    arxivId ? `arXiv ID: ${arxivId}` : undefined,
    pdfUrl ? `PDF: ${pdfUrl}` : undefined,
    canonicalUrl ? `Canonical URL: ${canonicalUrl}` : undefined,
    Number.isFinite(citationCount) ? `Citation count: ${citationCount}` : undefined,
    abstract ? `Abstract:\n${abstract}` : undefined,
    `Raw item external ID: ${rawItem.externalId}`
  ].filter(Boolean);

  return lines.join('\n');
}

function readExternalIds(payload, rawPayload) {
  const ids = rawPayload.externalIds || payload.externalIds || {};
  if (!ids || typeof ids !== 'object' || Array.isArray(ids)) {
    return {};
  }
  return { ...ids };
}

function readAuthors(payload, rawPayload) {
  const value = payload.authors || rawPayload.authors || rawPayload.author || payload.author;
  if (Array.isArray(value)) {
    return value.map(authorName).filter(Boolean);
  }
  const single = authorName(value);
  return single ? [single] : [];
}

function readCategories(payload, rawPayload) {
  const value = payload.categories || rawPayload.categories || rawPayload.fieldsOfStudy || rawPayload.subject || rawPayload.subjects;
  if (Array.isArray(value)) {
    return value.map((item) => firstText(item?.name, item?.term, item)).filter(Boolean);
  }
  const single = firstText(value);
  return single ? [single] : [];
}

function authorName(value) {
  return firstText(value?.name, value?.author?.name, value);
}

function firstText(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      const fromArray = firstText(...value);
      if (fromArray) {
        return fromArray;
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
  if (!text) {
    return undefined;
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function toIsoDate(value) {
  if (!value) {
    return undefined;
  }
  const date = /^\d{4}$/.test(String(value)) ? new Date(`${value}-01-01T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function hashResearchPayload(value) {
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
