import { cloneRecord } from '../db/in-memory-store.ts';

export class SourceRelationRepository {
  constructor(store) {
    this.store = store;
  }

  upsertRelation(input) {
    validateRelation(input);
    const key = relationKey(input);
    const existingId = this.store.sourceRelationIndex.get(key);
    const now = new Date().toISOString();

    if (existingId) {
      const existing = this.store.sourceRelations.get(existingId);
      const updated = {
        ...existing,
        evidence: cloneRecord(input.evidence || {}),
        updatedAt: now
      };
      this.store.sourceRelations.set(existingId, updated);
      return cloneRecord(updated);
    }

    const relation = {
      id: this.store.nextId('rel'),
      sourceId: input.sourceId,
      articleId: input.articleId,
      signalId: input.signalId,
      relationType: input.relationType,
      evidence: cloneRecord(input.evidence || {}),
      createdAt: now,
      updatedAt: now
    };

    this.store.sourceRelations.set(relation.id, relation);
    this.store.sourceRelationIndex.set(key, relation.id);
    return cloneRecord(relation);
  }

  listRelations() {
    return Array.from(this.store.sourceRelations.values()).map(cloneRecord);
  }

  deleteRelations(predicate) {
    let deleted = 0;
    for (const relation of Array.from(this.store.sourceRelations.values())) {
      if (!predicate(cloneRecord(relation))) {
        continue;
      }
      this.store.sourceRelations.delete(relation.id);
      this.store.sourceRelationIndex.delete(relationKey(relation));
      deleted += 1;
    }
    return deleted;
  }
}

function relationKey(input) {
  const targetArticleId = input.evidence?.targetArticleId || '';
  const signalId = input.signalId || '';
  return `${input.relationType}:${input.sourceId}:${input.articleId || ''}:${signalId}:${targetArticleId}`;
}

function validateRelation(input) {
  if (!input.sourceId) {
    throw new Error('Source relation requires source id');
  }
  if (!input.articleId && !input.signalId) {
    throw new Error('Source relation requires article id or signal id');
  }
  if (!input.relationType) {
    throw new Error('Source relation requires relation type');
  }
}
