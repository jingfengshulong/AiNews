import { createHash } from 'node:crypto';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export class ArticleFetcher {
  constructor({ fetchImpl = fetch, maxBytes = 5_000_000 } = {}) {
    this.fetchImpl = fetchImpl;
    this.maxBytes = maxBytes;
  }

  async fetchArticle({ url, rawItem, source }) {
    if (!url) {
      throw new Error(`Raw item has no article URL: ${rawItem.id}`);
    }

    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.2',
        'User-Agent': 'AI-News/0.1 (+https://localhost)'
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Article fetch failed with status ${response.status}`);
    }

    const html = await readLimitedText(response, this.maxBytes);
    const extracted = extractArticleHtml({
      html,
      url,
      rawItem,
      source,
      responseMeta: {
        status: response.status,
        contentType: getHeader(response.headers, 'content-type')
      }
    });

    return extracted;
  }
}

export function extractArticleHtml({ html, url, rawItem, source, responseMeta = {} }) {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;
  const reader = new Readability(document.cloneNode(true));
  const readable = reader.parse();

  const canonicalUrl = readCanonicalUrl(document) || stripTracking(url);
  const title = readable?.title || readMeta(document, 'og:title') || document.title || rawItem.payload?.title;
  const textForAI = normalizeWhitespace(readable?.textContent || fallbackArticleText(document) || rawItem.payload?.summary || '');
  const excerpt = readMeta(document, 'description') || readable?.excerpt || rawItem.payload?.summary;
  const publishedAt = toIsoDate(
    readMeta(document, 'article:published_time') ||
      readMeta(document, 'date') ||
      rawItem.payload?.publishedAt
  );
  const author = readMeta(document, 'author') || readable?.byline;
  const language = document.documentElement.getAttribute('lang') || rawItem.responseMeta?.sourceLanguage || source.language;

  return {
    rawItemId: rawItem.id,
    sourceId: source.id,
    canonicalUrl,
    title: normalizeWhitespace(title),
    language,
    excerpt: normalizeWhitespace(excerpt),
    publishedAt,
    author: normalizeWhitespace(author),
    textForAI,
    fullTextDisplayAllowed: source.usagePolicy?.allowFullText === true,
    contentHash: createHash('sha256').update(textForAI || canonicalUrl || '').digest('hex'),
    extractionMeta: {
      extractor: readable ? 'readability' : 'fallback',
      fetchedUrl: url,
      status: responseMeta.status,
      contentType: responseMeta.contentType,
      textLength: textForAI.length
    }
  };
}

async function readLimitedText(response, maxBytes) {
  const text = await response.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new Error(`Article response exceeds ${maxBytes} bytes`);
  }
  return text;
}

function readCanonicalUrl(document) {
  return document.querySelector('link[rel="canonical"]')?.getAttribute('href') || undefined;
}

function readMeta(document, name) {
  return (
    document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
    document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
    undefined
  );
}

function fallbackArticleText(document) {
  const article = document.querySelector('article') || document.body;
  return article?.textContent || '';
}

function stripTracking(url) {
  const parsed = new URL(url);
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (key.startsWith('utm_')) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.hash = '';
  return parsed.toString();
}

function normalizeWhitespace(value) {
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

function getHeader(headers, name) {
  if (!headers) {
    return undefined;
  }
  if (typeof headers.get === 'function') {
    return headers.get(name) || undefined;
  }
  return headers[name] || headers[name.toLowerCase()];
}
