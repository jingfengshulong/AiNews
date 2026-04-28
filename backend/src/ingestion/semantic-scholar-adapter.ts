import { SourceFetchError, sourceFetchErrorFromHttpResponse } from './source-fetch-error.ts';

const defaultFields = [
  'paperId',
  'externalIds',
  'url',
  'title',
  'abstract',
  'year',
  'publicationDate',
  'authors',
  'venue',
  'publicationVenue',
  'fieldsOfStudy',
  's2FieldsOfStudy',
  'citationCount',
  'referenceCount',
  'influentialCitationCount',
  'isOpenAccess',
  'openAccessPdf',
  'publicationTypes',
  'journal',
  'tldr'
].join(',');

export class SemanticScholarAdapter {
  constructor({ fetchImpl = fetch, getSecret = (name) => process.env[name], now = () => new Date() } = {}) {
    this.fetchImpl = fetchImpl;
    this.getSecret = getSecret;
    this.now = now;
    this.lastRequestHeaders = undefined;
  }

  async fetchSource(source, context = {}) {
    if (!source.apiEndpoint) {
      throw new SourceFetchError(`Semantic Scholar source requires apiEndpoint: ${source.id}`, {
        category: 'configuration_error',
        retryable: false
      });
    }

    const url = new URL(source.apiEndpoint);
    if (!url.searchParams.has('query')) {
      url.searchParams.set('query', source.query || 'artificial intelligence');
    }
    if (!url.searchParams.has('fields')) {
      url.searchParams.set('fields', defaultFields);
    }
    const pageSize = positiveInteger(source.fetchLimit, 100);
    if (!url.searchParams.has('limit')) {
      url.searchParams.set('limit', String(pageSize));
    }
    if (!url.searchParams.has('sort')) {
      url.searchParams.set('sort', 'publicationDate:desc');
    }

    const headers = {
      Accept: 'application/json',
      'User-Agent': 'AI-News/0.1 (+https://localhost)'
    };
    const apiKey = source.credentialRef ? this.getSecret(source.credentialRef) : undefined;
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    this.lastRequestHeaders = headers;

    const records = [];
    let offset = nonNegativeInteger(url.searchParams.get('offset'), 0);
    const boundary = contextBoundary(context);
    const shouldPaginate = Boolean(boundary);
    while (true) {
      if (shouldPaginate || url.searchParams.has('offset')) {
        url.searchParams.set('offset', String(offset));
      }
      const response = await this.fetchImpl(url.toString(), { headers });
      if (response.status < 200 || response.status >= 300) {
        throw sourceFetchErrorFromHttpResponse('Semantic Scholar', response);
      }

      const body = await response.json();
      const pageRecords = asArray(body.data).map((paper) => mapPaper({
        paper,
        source,
        response,
        body,
        apiKey,
        fetchedAt: this.now()
      }));
      records.push(...pageRecords);

      if (!shouldPaginate || pageRecords.length < pageSize || offset + pageRecords.length >= Number(body.total || 0)) {
        break;
      }
      if (allReliableDatesBefore(pageRecords, boundary)) {
        break;
      }
      offset += pageRecords.length;
    }

    return records;
  }
}

function mapPaper({ paper, source, response, body, apiKey, fetchedAt }) {
  const authors = asArray(paper.authors).map((author) => cleanText(author?.name || author)).filter(Boolean);
  const s2Categories = asArray(paper.s2FieldsOfStudy).map((field) => cleanText(field?.category || field)).filter(Boolean);
  const categories = unique([...asArray(paper.fieldsOfStudy).map(cleanText), ...s2Categories].filter(Boolean));

  return {
    sourceId: source.id,
    sourceType: source.sourceType,
    externalId: paper.paperId || paper.externalIds?.DOI || paper.url,
    title: cleanText(paper.title),
    url: paper.url || doiUrl(paper.externalIds?.DOI) || arxivUrl(paper.externalIds?.ArXiv),
    publishedAt: toIsoDate(paper.publicationDate || paper.year),
    updatedAt: undefined,
    author: authors.join(', ') || undefined,
    authors,
    summary: cleanSummary(paper.abstract || paper.tldr?.text),
    categories,
    fetchedAt: fetchedAt.toISOString(),
    rawPayload: paper,
    responseMeta: {
      adapter: 'semantic_scholar',
      status: response.status,
      totalResults: body.total,
      offset: body.offset,
      sourceLanguage: source.language,
      authenticated: Boolean(apiKey)
    }
  };
}

function doiUrl(doi) {
  return doi ? `https://doi.org/${doi}` : undefined;
}

function arxivUrl(arxivId) {
  return arxivId ? `https://arxiv.org/abs/${arxivId}` : undefined;
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

function cleanSummary(value) {
  return cleanText(value)?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function cleanText(value) {
  if (!value) {
    return undefined;
  }
  return String(value).replace(/\s+/g, ' ').trim();
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

function positiveInteger(value, fallback) {
  const number = Number(value || 0);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value || 0);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function contextBoundary(context = {}) {
  return toValidDate(context.lookbackWindowStart) || toValidDate(context.cursor?.lastSeenPublishedAt);
}

function allReliableDatesBefore(records, boundary) {
  if (!boundary || records.length === 0) {
    return false;
  }
  const dates = records.map((record) => toValidDate(record.publishedAt));
  return dates.every(Boolean) && dates.every((date) => date.getTime() < boundary.getTime());
}

function toValidDate(value) {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
