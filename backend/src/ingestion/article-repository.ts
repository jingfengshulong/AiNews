import { cloneRecord } from '../db/in-memory-store.ts';

export class ArticleRepository {
  constructor(store) {
    this.store = store;
  }

  upsertArticleCandidate(input) {
    validateArticleCandidate(input);
    const key = input.rawItemId;
    const existingId = this.store.articleIndex.get(key);

    if (existingId) {
      return cloneRecord(this.store.articles.get(existingId));
    }

    const now = new Date().toISOString();
    const article = {
      id: this.store.nextId('art'),
      rawItemId: input.rawItemId,
      sourceId: input.sourceId,
      canonicalUrl: input.canonicalUrl,
      title: input.title,
      language: input.language,
      excerpt: input.excerpt,
      publishedAt: input.publishedAt,
      author: input.author,
      textForAI: input.textForAI,
      fullTextDisplayAllowed: input.fullTextDisplayAllowed === true,
      contentHash: input.contentHash,
      extractionMeta: cloneRecord(input.extractionMeta || {}),
      dedupeStatus: 'candidate',
      createdAt: now,
      updatedAt: now
    };

    this.store.articles.set(article.id, article);
    this.store.articleIndex.set(key, article.id);
    return cloneRecord(article);
  }

  listArticles() {
    return Array.from(this.store.articles.values()).map(cloneRecord);
  }

  getArticle(id) {
    return cloneRecord(this.store.articles.get(id));
  }

  updateDedupeStatus(id, dedupeStatus) {
    const existing = this.store.articles.get(id);
    if (!existing) {
      throw new Error(`Article not found: ${id}`);
    }

    const updated = {
      ...existing,
      dedupeStatus,
      updatedAt: new Date().toISOString()
    };

    this.store.articles.set(id, updated);
    return cloneRecord(updated);
  }
}

function validateArticleCandidate(input) {
  if (!input.rawItemId) {
    throw new Error('Article candidate requires raw item id');
  }
  if (!input.sourceId) {
    throw new Error('Article candidate requires source id');
  }
  if (!input.canonicalUrl) {
    throw new Error('Article candidate requires canonical URL');
  }
  if (!input.title) {
    throw new Error('Article candidate requires title');
  }
  if (!input.textForAI) {
    throw new Error('Article candidate requires backend text for AI processing');
  }
}
