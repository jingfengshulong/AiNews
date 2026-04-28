import { SourceFetchError, sourceFetchErrorFromHttpResponse } from './source-fetch-error.ts';

export class NewsApiAdapter {
  constructor({ fetchImpl = fetch, getSecret = (name) => process.env[name], now = () => new Date() } = {}) {
    this.fetchImpl = fetchImpl;
    this.getSecret = getSecret;
    this.now = now;
  }

  async fetchSource(source, context = {}) {
    if (!source.apiEndpoint) {
      throw new SourceFetchError(`NewsAPI source requires apiEndpoint: ${source.id}`, {
        category: 'configuration_error',
        retryable: false
      });
    }
    if (!source.credentialRef) {
      throw new SourceFetchError(`NewsAPI source requires credentialRef: ${source.id}`, {
        category: 'configuration_error',
        retryable: false
      });
    }

    const apiKey = this.getSecret(source.credentialRef);
    if (!apiKey) {
      throw new SourceFetchError(`Missing NewsAPI credential: ${source.credentialRef}`, {
        category: 'configuration_error',
        retryable: false
      });
    }

    const url = new URL(source.apiEndpoint);
    const pageSize = positiveInteger(source.fetchLimit, 100);
    if (!url.searchParams.has('pageSize')) {
      url.searchParams.set('pageSize', String(pageSize));
    }
    if (!url.searchParams.has('from')) {
      const from = contextBoundary(context);
      if (from) {
        url.searchParams.set('from', from.toISOString());
      }
    }

    const records = [];
    let page = positiveInteger(url.searchParams.get('page'), 1);
    let totalResults;
    const boundary = contextBoundary(context);
    while (true) {
      url.searchParams.set('page', String(page));
      const response = await this.fetchImpl(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AI-News/0.1 (+https://localhost)',
          'X-Api-Key': apiKey
        }
      });

      if (response.status < 200 || response.status >= 300) {
        throw sourceFetchErrorFromHttpResponse('NewsAPI', response);
      }

      const body = await response.json();
      if (body.status && body.status !== 'ok') {
        throw new Error(`NewsAPI returned ${body.status}: ${body.code || 'unknown'}`);
      }

      totalResults = body.totalResults;
      const pageRecords = asArray(body.articles).map((article) => mapArticle({
        article,
        source,
        response,
        totalResults,
        page,
        pageSize,
        fetchedAt: this.now()
      }));
      records.push(...pageRecords);

      if (!boundary || pageRecords.length < pageSize || records.length >= Number(totalResults || 0)) {
        break;
      }
      if (allReliableDatesBefore(pageRecords, boundary)) {
        break;
      }
      page += 1;
    }

    return records;
  }
}

function mapArticle({ article, source, response, totalResults, page, pageSize, fetchedAt }) {
  return {
      sourceId: source.id,
      sourceType: source.sourceType,
      externalId: article.url,
      title: cleanText(article.title),
      url: article.url,
      publishedAt: toIsoDate(article.publishedAt),
      updatedAt: undefined,
      author: cleanText(article.author),
      summary: cleanSummary(article.description || article.content),
      categories: [article.source?.name].filter(Boolean),
      fetchedAt: fetchedAt.toISOString(),
      rawPayload: article,
      responseMeta: {
        adapter: 'newsapi',
        status: response.status,
        totalResults,
        page,
        pageSize,
        sourceLanguage: source.language
      }
    };
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function positiveInteger(value, fallback) {
  const number = Number(value || 0);
  return Number.isInteger(number) && number > 0 ? number : fallback;
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
