import { SourceFetchError, sourceFetchErrorFromHttpResponse } from './source-fetch-error.ts';

export class CrossrefAdapter {
  constructor({ fetchImpl = fetch, contactEmail = process.env.CROSSREF_CONTACT_EMAIL, now = () => new Date() } = {}) {
    this.fetchImpl = fetchImpl;
    this.contactEmail = contactEmail;
    this.now = now;
  }

  async fetchSource(source) {
    if (!source.apiEndpoint) {
      throw new SourceFetchError(`Crossref source requires apiEndpoint: ${source.id}`, {
        category: 'configuration_error',
        retryable: false
      });
    }

    const url = new URL(source.apiEndpoint);
    if (!url.searchParams.has('query')) {
      url.searchParams.set('query', source.query || 'artificial intelligence');
    }
    if (!url.searchParams.has('rows')) {
      url.searchParams.set('rows', String(source.fetchLimit || 10));
    }
    if (this.contactEmail && !url.searchParams.has('mailto')) {
      url.searchParams.set('mailto', this.contactEmail);
    }

    const response = await this.fetchImpl(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent(this.contactEmail)
      }
    });
    if (response.status < 200 || response.status >= 300) {
      throw sourceFetchErrorFromHttpResponse('Crossref', response);
    }

    const body = await response.json();
    return asArray(body.message?.items).map((work) => {
      const authors = readAuthors(work.author);
      const title = firstText(work.title, work.subtitle);
      const publishedAt = readPublishedDate(work);
      return {
        sourceId: source.id,
        sourceType: source.sourceType,
        externalId: work.DOI || work.URL,
        title,
        url: work.URL || (work.DOI ? `https://doi.org/${work.DOI}` : undefined),
        publishedAt,
        updatedAt: readDateTime(work.created),
        author: authors.join(', ') || undefined,
        authors,
        summary: cleanSummary(work.abstract),
        categories: asArray(work.subject).map(cleanText).filter(Boolean),
        fetchedAt: this.now().toISOString(),
        rawPayload: work,
        responseMeta: {
          adapter: 'crossref',
          status: response.status,
          totalResults: body.message?.['total-results'],
          sourceLanguage: source.language,
          politePool: Boolean(this.contactEmail)
        }
      };
    });
  }
}

function userAgent(email) {
  return email
    ? `AI-News/0.1 (https://localhost; mailto:${email})`
    : 'AI-News/0.1 (+https://localhost)';
}

function readAuthors(authors) {
  return asArray(authors)
    .map((author) => cleanText([author.given, author.family].filter(Boolean).join(' ') || author.name))
    .filter(Boolean);
}

function readPublishedDate(work) {
  const dateParts = work.published?.['date-parts'] || work['published-print']?.['date-parts'] || work['published-online']?.['date-parts'] || work.created?.['date-parts'];
  const first = asArray(dateParts)[0];
  if (!Array.isArray(first) || first.length === 0) {
    return undefined;
  }
  const [year, month = 1, day = 1] = first;
  return toIsoDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

function readDateTime(value) {
  return toIsoDate(value?.['date-time']);
}

function firstText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstText(...value);
      if (nested) {
        return nested;
      }
      continue;
    }
    const text = cleanText(value);
    if (text) {
      return text;
    }
  }
  return undefined;
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
