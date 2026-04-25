import { cloneRecord } from '../db/in-memory-store.ts';

export class SignalRepository {
  constructor(store) {
    this.store = store;
  }

  createSignal(input) {
    validateSignalInput(input);
    const now = new Date().toISOString();
    const signal = {
      id: this.store.nextId('sig'),
      slug: input.slug || slugify(input.title, this.store.signals.size + 1),
      title: input.title,
      summary: input.summary,
      heatScore: input.heatScore || 0,
      signalScore: input.signalScore || 0,
      status: input.status || 'candidate',
      primaryPublishedAt: input.primaryPublishedAt,
      enrichmentStatus: input.enrichmentStatus || 'pending',
      aiBrief: input.aiBrief,
      keyPoints: input.keyPoints,
      timeline: input.timeline,
      sourceMix: input.sourceMix,
      nextWatch: input.nextWatch,
      relatedSignalIds: input.relatedSignalIds,
      enrichmentError: input.enrichmentError,
      enrichmentMeta: input.enrichmentMeta,
      createdAt: now,
      updatedAt: now
    };

    this.store.signals.set(signal.id, signal);
    return cloneRecord(signal);
  }

  listSignals() {
    return Array.from(this.store.signals.values()).map(cloneRecord);
  }

  getSignal(id) {
    return cloneRecord(this.store.signals.get(id));
  }

  touchSignal(id) {
    const existing = this.store.signals.get(id);
    if (!existing) {
      throw new Error(`Signal not found: ${id}`);
    }
    const updated = {
      ...existing,
      updatedAt: new Date().toISOString()
    };
    this.store.signals.set(id, updated);
    return cloneRecord(updated);
  }

  updateScores(id, { heatScore, signalScore }) {
    const existing = this.store.signals.get(id);
    if (!existing) {
      throw new Error(`Signal not found: ${id}`);
    }
    const updated = {
      ...existing,
      heatScore: roundScore(heatScore),
      signalScore: roundScore(signalScore),
      updatedAt: new Date().toISOString()
    };
    this.store.signals.set(id, updated);
    return cloneRecord(updated);
  }

  markEnrichmentProcessing(id) {
    const existing = this.store.signals.get(id);
    if (!existing) {
      throw new Error(`Signal not found: ${id}`);
    }
    const updated = {
      ...existing,
      enrichmentStatus: 'processing',
      enrichmentError: undefined,
      updatedAt: new Date().toISOString()
    };
    this.store.signals.set(id, updated);
    return cloneRecord(updated);
  }

  updateEnrichmentSuccess(id, output, meta = {}) {
    const existing = this.store.signals.get(id);
    if (!existing) {
      throw new Error(`Signal not found: ${id}`);
    }
    const updated = {
      ...existing,
      summary: output.aiBrief,
      aiBrief: output.aiBrief,
      keyPoints: output.keyPoints,
      timeline: output.timeline,
      sourceMix: output.sourceMix,
      nextWatch: output.nextWatch,
      relatedSignalIds: output.relatedSignalIds || [],
      enrichmentStatus: 'completed',
      enrichmentError: undefined,
      enrichmentMeta: meta,
      updatedAt: new Date().toISOString()
    };
    this.store.signals.set(id, updated);
    return cloneRecord(updated);
  }

  updateEnrichmentFallback(id, output, meta = {}) {
    const existing = this.store.signals.get(id);
    if (!existing) {
      throw new Error(`Signal not found: ${id}`);
    }
    const updated = {
      ...existing,
      summary: output.aiBrief,
      aiBrief: output.aiBrief,
      keyPoints: output.keyPoints,
      timeline: output.timeline,
      sourceMix: output.sourceMix,
      nextWatch: output.nextWatch,
      relatedSignalIds: output.relatedSignalIds || [],
      enrichmentStatus: 'fallback',
      enrichmentError: undefined,
      enrichmentMeta: meta,
      updatedAt: new Date().toISOString()
    };
    this.store.signals.set(id, updated);
    return cloneRecord(updated);
  }

  updateEnrichmentFailure(id, message, meta = {}, fallbackOutput) {
    const existing = this.store.signals.get(id);
    if (!existing) {
      throw new Error(`Signal not found: ${id}`);
    }
    const updated = {
      ...existing,
      ...(fallbackOutput ? {
        summary: fallbackOutput.aiBrief,
        aiBrief: fallbackOutput.aiBrief,
        keyPoints: fallbackOutput.keyPoints,
        timeline: fallbackOutput.timeline,
        sourceMix: fallbackOutput.sourceMix,
        nextWatch: fallbackOutput.nextWatch,
        relatedSignalIds: fallbackOutput.relatedSignalIds || []
      } : {}),
      enrichmentStatus: 'failed',
      enrichmentError: message,
      enrichmentMeta: meta,
      updatedAt: new Date().toISOString()
    };
    this.store.signals.set(id, updated);
    return cloneRecord(updated);
  }

  findSignalByArticleIds(articleIds) {
    const expected = new Set(articleIds);
    for (const signal of this.store.signals.values()) {
      const linkedIds = Array.from(this.store.signalArticles.values())
        .filter((link) => link.signalId === signal.id)
        .map((link) => link.articleId);
      if (linkedIds.length !== expected.size) {
        continue;
      }
      if (linkedIds.every((articleId) => expected.has(articleId))) {
        return cloneRecord(signal);
      }
    }
    return undefined;
  }

  linkArticle(input) {
    if (!input.signalId) {
      throw new Error('Signal article link requires signal id');
    }
    if (!input.articleId) {
      throw new Error('Signal article link requires article id');
    }

    const key = `${input.signalId}:${input.articleId}`;
    const existingId = this.store.signalArticleIndex.get(key);
    const now = new Date().toISOString();
    if (existingId) {
      const existing = this.store.signalArticles.get(existingId);
      const updated = {
        ...existing,
        role: input.role || existing.role,
        updatedAt: now
      };
      this.store.signalArticles.set(existingId, updated);
      return cloneRecord(updated);
    }

    const link = {
      id: this.store.nextId('sigart'),
      signalId: input.signalId,
      articleId: input.articleId,
      role: input.role || 'supporting',
      createdAt: now,
      updatedAt: now
    };

    this.store.signalArticles.set(link.id, link);
    this.store.signalArticleIndex.set(key, link.id);
    return cloneRecord(link);
  }

  listSignalArticles(signalId) {
    return Array.from(this.store.signalArticles.values())
      .filter((link) => !signalId || link.signalId === signalId)
      .map(cloneRecord);
  }
}

function validateSignalInput(input) {
  if (!input.title) {
    throw new Error('Signal requires title');
  }
}

function slugify(title, suffix) {
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return `${slug || 'signal'}-${suffix}`;
}

function roundScore(value) {
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}
