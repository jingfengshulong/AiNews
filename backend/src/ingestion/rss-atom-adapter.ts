import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { SourceFetchError, sourceFetchErrorFromHttpResponse } from './source-fetch-error.ts';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  cdataPropName: false
});

export class RssAtomAdapter {
  constructor({ fetchImpl = fetch, now = () => new Date(), maxBytes = 2_000_000 } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.maxBytes = maxBytes;
  }

  async fetchSource(source) {
    if (!source.feedUrl) {
      throw new SourceFetchError(`RSS/Atom source requires feedUrl: ${source.id}`, {
        category: 'configuration_error',
        retryable: false
      });
    }

    const response = await this.fetchImpl(source.feedUrl, {
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.2',
        'User-Agent': 'AI-News/0.1 (+https://localhost)'
      }
    });

    if (response.status === 304) {
      return [];
    }

    if (response.status < 200 || response.status >= 300) {
      throw sourceFetchErrorFromHttpResponse('Feed', response);
    }

    const xml = await readLimitedText(response, this.maxBytes);
    return parseRssAtomFeed({
      xml,
      source,
      fetchedAt: this.now(),
      responseMeta: {
        status: response.status,
        contentType: getHeader(response.headers, 'content-type'),
        feedUrl: source.feedUrl
      }
    });
  }
}

export function parseRssAtomFeed({ xml, source, fetchedAt = new Date(), responseMeta = {} }) {
  const parsed = parser.parse(xml);
  if (parsed.rss?.channel) {
    return parseRssItems({ channel: parsed.rss.channel, source, fetchedAt, responseMeta });
  }
  if (parsed.feed) {
    return parseAtomEntries({ feed: parsed.feed, source, fetchedAt, responseMeta });
  }

  throw new Error('Unsupported RSS/Atom feed format');
}

function parseRssItems({ channel, source, fetchedAt, responseMeta }) {
  const items = asArray(channel.item);
  return items.map((item) => {
    const title = cleanText(readText(item.title));
    const url = cleanText(readText(item.link));
    const publishedAt = toIsoDate(readText(item.pubDate) || readText(item.date));
    const externalId = readGuid(item.guid) || url || fallbackExternalId({ title, url, publishedAt });

    return {
      sourceId: source.id,
      sourceType: source.sourceType,
      externalId,
      title,
      url,
      publishedAt,
      updatedAt: undefined,
      author: cleanText(readText(item.creator) || readText(item.author)),
      summary: cleanSummary(readText(item.description) || readText(item.summary)),
      categories: readCategories(item.category),
      rawPayload: item,
      fetchedAt: toIsoDate(fetchedAt),
      responseMeta: {
        ...responseMeta,
        feedFormat: 'rss',
        sourceLanguage: source.language
      }
    };
  }).filter((record) => matchesFilterKeywords(record, source.filterKeywords));
}

function parseAtomEntries({ feed, source, fetchedAt, responseMeta }) {
  const entries = asArray(feed.entry);
  return entries.map((entry) => {
    const title = cleanText(readText(entry.title));
    const url = readAtomAlternateLink(entry.link);
    const publishedAt = toIsoDate(readText(entry.published) || readText(entry.updated));
    const updatedAt = toIsoDate(readText(entry.updated));
    const externalId = cleanText(readText(entry.id)) || url || fallbackExternalId({ title, url, publishedAt });

    return {
      sourceId: source.id,
      sourceType: source.sourceType,
      externalId,
      title,
      url,
      publishedAt,
      updatedAt,
      author: readAtomAuthor(entry.author),
      summary: cleanSummary(readText(entry.summary) || readText(entry.content)),
      categories: readAtomCategories(entry.category),
      rawPayload: entry,
      fetchedAt: toIsoDate(fetchedAt),
      responseMeta: {
        ...responseMeta,
        feedFormat: 'atom',
        sourceLanguage: source.language
      }
    };
  }).filter((record) => matchesFilterKeywords(record, source.filterKeywords));
}

async function readLimitedText(response, maxBytes) {
  const text = await response.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new Error(`Feed response exceeds ${maxBytes} bytes`);
  }
  return text;
}

function readGuid(guid) {
  if (!guid) {
    return undefined;
  }
  if (typeof guid === 'object') {
    return cleanText(readText(guid['#text']) || readText(guid));
  }
  return cleanText(readText(guid));
}

function readAtomAlternateLink(link) {
  const links = asArray(link);
  const alternate = links.find((candidate) => candidate?.['@_rel'] === 'alternate') || links[0];
  if (typeof alternate === 'string') {
    return cleanText(alternate);
  }
  return cleanText(alternate?.['@_href'] || alternate?.href || readText(alternate));
}

function readAtomAuthor(author) {
  const first = asArray(author)[0];
  if (!first) {
    return undefined;
  }
  return cleanText(readText(first.name) || readText(first));
}

function readCategories(category) {
  return asArray(category)
    .map((item) => cleanText(readText(item)))
    .filter(Boolean);
}

function readAtomCategories(category) {
  return asArray(category)
    .map((item) => cleanText(item?.['@_term'] || readText(item)))
    .filter(Boolean);
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

function fallbackExternalId({ title, url, publishedAt }) {
  return createHash('sha256').update([title, url, publishedAt].filter(Boolean).join('|')).digest('hex');
}

export function matchesFilterKeywords(record, filterKeywords) {
  if (!filterKeywords || filterKeywords.length === 0) {
    return true;
  }
  const haystack = [record.title, record.summary].filter(Boolean).join(' ').toLowerCase();
  return filterKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
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
