import { SourceFetchError, sourceFetchErrorFromHttpResponse } from './source-fetch-error.ts';

export class NewsApiAdapter {
  constructor({ fetchImpl = fetch, getSecret = (name) => process.env[name], now = () => new Date() } = {}) {
    this.fetchImpl = fetchImpl;
    this.getSecret = getSecret;
    this.now = now;
  }

  async fetchSource(source) {
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

    const response = await this.fetchImpl(source.apiEndpoint, {
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

    return asArray(body.articles).map((article) => ({
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
      fetchedAt: this.now().toISOString(),
      rawPayload: article,
      responseMeta: {
        adapter: 'newsapi',
        status: response.status,
        totalResults: body.totalResults,
        sourceLanguage: source.language
      }
    }));
  }
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
