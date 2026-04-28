import { sourceFetchErrorFromHttpResponse } from './source-fetch-error.ts';

export class HackerNewsAdapter {
  constructor({ fetchImpl = fetch, now = () => new Date() } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  async fetchSource(source, context = {}) {
    const listUrl = source.apiEndpoint || 'https://hacker-news.firebaseio.com/v0/newstories.json';
    const idsResponse = await this.fetchJson(listUrl);
    const ids = asArray(idsResponse).slice(0, positiveInteger(source.fetchLimit, asArray(idsResponse).length));
    const items = [];
    const boundary = context.lookbackWindowStart || toValidDate(context.cursor?.lastSeenPublishedAt);

    for (const id of ids) {
      const item = await this.fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (boundary && item?.time && item.time * 1000 < boundary.getTime()) {
        break;
      }
      if (isUsefulStory(item, source.query)) {
        items.push(item);
      }
    }

    return items.map((item) => ({
      sourceId: source.id,
      sourceType: source.sourceType,
      externalId: String(item.id),
      title: cleanText(item.title),
      url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
      publishedAt: new Date(item.time * 1000).toISOString(),
      updatedAt: undefined,
      author: cleanText(item.by),
      summary: cleanSummary(item.text),
      categories: ['hacker_news'],
      fetchedAt: this.now().toISOString(),
      rawPayload: {
        ...item,
        commentsCount: item.descendants || 0,
        discussionUrl: `https://news.ycombinator.com/item?id=${item.id}`
      },
      responseMeta: {
        adapter: 'hacker_news',
        sourceLanguage: source.language,
        listUrl,
        query: source.query
      }
    }));
  }

  async fetchJson(url) {
    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AI-News/0.1 (+https://localhost)'
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw sourceFetchErrorFromHttpResponse('Hacker News', response);
    }
    return response.json();
  }
}

function toValidDate(value) {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isUsefulStory(item, query) {
  if (!item || item.type !== 'story' || item.deleted || item.dead) {
    return false;
  }
  if (!query) {
    return true;
  }
  const needle = query.toLowerCase();
  const haystack = [item.title, item.url, item.text].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(needle.toLowerCase());
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
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
