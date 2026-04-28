import { XMLParser } from 'fast-xml-parser';
import { SourceFetchError, sourceFetchErrorFromHttpResponse } from './source-fetch-error.ts';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  cdataPropName: false
});

export class ArxivAdapter {
  constructor({ fetchImpl = fetch, now = () => new Date(), maxBytes = 3_000_000 } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.maxBytes = maxBytes;
  }

  async fetchSource(source, context = {}) {
    if (!source.apiEndpoint) {
      throw new SourceFetchError(`arXiv source requires apiEndpoint: ${source.id}`, {
        category: 'configuration_error',
        retryable: false
      });
    }

    const url = new URL(source.apiEndpoint);
    const pageSize = positiveInteger(source.fetchLimit, 100);
    if (!url.searchParams.has('max_results')) {
      url.searchParams.set('max_results', String(pageSize));
    }
    let start = nonNegativeInteger(url.searchParams.get('start'), 0);
    const boundary = contextBoundary(context);
    const shouldPaginate = Boolean(boundary);
    const records = [];

    while (true) {
      if (shouldPaginate || url.searchParams.has('start')) {
        url.searchParams.set('start', String(start));
      }
      const response = await this.fetchImpl(url.toString(), {
        headers: {
          Accept: 'application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.2',
          'User-Agent': 'AI-News/0.1 (+https://localhost)'
        }
      });

      if (response.status < 200 || response.status >= 300) {
        throw sourceFetchErrorFromHttpResponse('arXiv', response);
      }

      const xml = await readLimitedText(response, this.maxBytes);
      const pageRecords = parseArxivFeed({
        xml,
        source,
        fetchedAt: this.now(),
        responseMeta: {
          status: response.status,
          contentType: getHeader(response.headers, 'content-type'),
          start,
          pageSize
        }
      });
      records.push(...pageRecords);

      if (!shouldPaginate || pageRecords.length < pageSize) {
        break;
      }
      if (allReliableDatesBefore(pageRecords, boundary)) {
        break;
      }
      start += pageRecords.length;
    }

    return records;
  }
}

export function parseArxivFeed({ xml, source, fetchedAt = new Date(), responseMeta = {} }) {
  const parsed = parser.parse(xml);
  const entries = asArray(parsed.feed?.entry);

  return entries.map((entry) => {
    const links = asArray(entry.link);
    const url = readLink(links, 'alternate') || readText(entry.id);
    const pdfUrl = readLink(links, 'related', 'application/pdf');
    const arxivId = extractArxivId(readText(entry.id) || url);
    const categories = readCategories(entry.category);

    return {
      sourceId: source.id,
      sourceType: source.sourceType,
      externalId: arxivId,
      title: cleanText(readText(entry.title)),
      url,
      publishedAt: toIsoDate(readText(entry.published)),
      updatedAt: toIsoDate(readText(entry.updated)),
      author: readAuthors(entry.author).join(', ') || undefined,
      authors: readAuthors(entry.author),
      summary: cleanSummary(readText(entry.summary)),
      categories,
      fetchedAt: toIsoDate(fetchedAt),
      rawPayload: {
        arxivId,
        abstract: cleanSummary(readText(entry.summary)),
        authors: readAuthors(entry.author),
        categories,
        primaryCategory: entry.primary_category?.['@_term'],
        comment: readText(entry.comment),
        journalRef: readText(entry.journal_ref),
        pdfUrl,
        entry
      },
      responseMeta: {
        ...responseMeta,
        adapter: 'arxiv',
        sourceLanguage: source.language
      }
    };
  });
}

function readAuthors(author) {
  return asArray(author)
    .map((item) => cleanText(readText(item?.name) || readText(item)))
    .filter(Boolean);
}

function readCategories(category) {
  return asArray(category)
    .map((item) => cleanText(item?.['@_term'] || readText(item)))
    .filter(Boolean);
}

function readLink(links, rel, type) {
  const match = links.find((link) => {
    if (!link || typeof link === 'string') {
      return false;
    }
    if (link['@_rel'] !== rel) {
      return false;
    }
    return type ? link['@_type'] === type : true;
  });
  return match?.['@_href'];
}

function extractArxivId(value) {
  return cleanText(value).replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/^https?:\/\/export\.arxiv\.org\/abs\//, '');
}

async function readLimitedText(response, maxBytes) {
  const text = await response.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new Error(`arXiv response exceeds ${maxBytes} bytes`);
  }
  return text;
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function readText(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'object') {
    return value['#text'] ?? value.text ?? value.value;
  }
  return String(value);
}

function cleanSummary(value) {
  return cleanText(value)?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function cleanText(value) {
  const text = readText(value);
  if (!text) {
    return undefined;
  }
  return text.replace(/\s+/g, ' ').trim();
}

function toIsoDate(value) {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function getHeader(headers, name) {
  if (!headers) {
    return undefined;
  }
  if (typeof headers.get === 'function') {
    return headers.get(name) || undefined;
  }
  return headers[name] || headers[name.toLowerCase()];
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
