import { SourceFetchError, sourceFetchErrorFromHttpResponse } from './source-fetch-error.ts';

const postsQuery = `
  query AiNewsProductHuntPosts($first: Int!, $after: String, $topic: String) {
    posts(first: $first, after: $after, featured: true, topic: $topic) {
      totalCount
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          id
          name
          tagline
          description
          slug
          url
          website
          createdAt
          featuredAt
          votesCount
          commentsCount
          reviewsCount
          dailyRank
          thumbnail { url }
          topics(first: 10) {
            edges {
              node { name slug }
            }
          }
          makers {
            name
            username
            url
          }
          productLinks {
            type
            url
          }
        }
      }
    }
  }
`;

export class ProductHuntAdapter {
  constructor({ fetchImpl = fetch, getSecret = (name) => process.env[name], now = () => new Date() } = {}) {
    this.fetchImpl = fetchImpl;
    this.getSecret = getSecret;
    this.now = now;
  }

  async fetchSource(source, context = {}) {
    if (!source.apiEndpoint) {
      throw new SourceFetchError(`Product Hunt source requires apiEndpoint: ${source.id}`, {
        category: 'configuration_error',
        retryable: false
      });
    }
    if (!source.credentialRef) {
      throw new SourceFetchError(`Product Hunt source requires credentialRef: ${source.id}`, {
        category: 'configuration_error',
        retryable: false
      });
    }

    const token = this.getSecret(source.credentialRef);
    if (!token) {
      throw new SourceFetchError(`Missing Product Hunt credential: ${source.credentialRef}`, {
        category: 'configuration_error',
        retryable: false
      });
    }

    const records = [];
    const pageSize = positiveInteger(source.fetchLimit, 100);
    const boundary = contextBoundary(context);
    const shouldPaginate = Boolean(boundary);
    let after = null;
    while (true) {
      const response = await this.fetchImpl(source.apiEndpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'AI-News/0.1 (+https://localhost)',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          query: postsQuery,
          variables: {
            first: pageSize,
            after,
            topic: source.query || null
          }
        })
      });

      if (response.status < 200 || response.status >= 300) {
        throw sourceFetchErrorFromHttpResponse('Product Hunt', response);
      }

      const body = await response.json();
      if (body.errors?.length) {
        throw new Error(`Product Hunt returned GraphQL errors: ${body.errors.map((error) => error.message).join('; ')}`);
      }

      const pageRecords = asArray(body.data?.posts?.edges)
        .map((edge) => edge.node)
        .filter(Boolean)
        .map((post) => mapPost({
          post,
          source,
          response,
          body,
          fetchedAt: this.now()
        }));
      records.push(...pageRecords);

      const pageInfo = body.data?.posts?.pageInfo;
      if (!shouldPaginate || !pageInfo?.hasNextPage || !pageInfo.endCursor) {
        break;
      }
      if (allReliableDatesBefore(pageRecords, boundary)) {
        break;
      }
      after = pageInfo.endCursor;
    }

    return records;
  }
}

function mapPost({ post, source, response, body, fetchedAt }) {
  const topics = asArray(post.topics?.edges).map((edge) => edge.node).filter(Boolean);
  const categories = topics.map((topic) => cleanText(topic.name)).filter(Boolean);
  const makers = asArray(post.makers).map((maker) => cleanText(maker.name || maker.username)).filter(Boolean);

  return {
    sourceId: source.id,
    sourceType: source.sourceType,
    externalId: post.id || post.slug || post.url,
    title: cleanText(post.name),
    url: post.url,
    publishedAt: toIsoDate(post.featuredAt || post.createdAt),
    updatedAt: undefined,
    author: makers.join(', ') || undefined,
    authors: makers,
    summary: cleanSummary(post.tagline || post.description),
    categories,
    fetchedAt: fetchedAt.toISOString(),
    rawPayload: post,
    responseMeta: {
      adapter: 'product_hunt',
      status: response.status,
      totalResults: body.data?.posts?.totalCount,
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
  return cleanText(value)?.replace(/\s+/g, ' ').trim();
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
