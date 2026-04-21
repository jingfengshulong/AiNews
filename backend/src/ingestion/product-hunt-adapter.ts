import { SourceFetchError, sourceFetchErrorFromHttpResponse } from './source-fetch-error.ts';

const postsQuery = `
  query AiNewsProductHuntPosts($first: Int!, $topic: String) {
    posts(first: $first, featured: true, topic: $topic) {
      totalCount
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

  async fetchSource(source) {
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
          first: source.fetchLimit || 10,
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

    const posts = asArray(body.data?.posts?.edges).map((edge) => edge.node).filter(Boolean);
    return posts.map((post) => {
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
        fetchedAt: this.now().toISOString(),
        rawPayload: post,
        responseMeta: {
          adapter: 'product_hunt',
          status: response.status,
          totalResults: body.data?.posts?.totalCount,
          sourceLanguage: source.language
        }
      };
    });
  }
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
