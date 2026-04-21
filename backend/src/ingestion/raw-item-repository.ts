import { createHash } from 'node:crypto';
import { cloneRecord } from '../db/in-memory-store.ts';

export class RawItemRepository {
  constructor(store) {
    this.store = store;
  }

  upsertRawItem(input) {
    validateRawItemInput(input);
    const fetchedAt = toIso(input.fetchedAt || new Date());
    const key = `${input.sourceId}:${input.externalId}`;
    const existingId = this.store.rawItemIndex.get(key);

    if (existingId) {
      const existing = this.store.rawItems.get(existingId);
      const updated = {
        ...existing,
        responseMeta: cloneRecord(input.responseMeta || existing.responseMeta),
        lastFetchedAt: fetchedAt,
        duplicateFetchCount: existing.duplicateFetchCount + 1,
        updatedAt: new Date().toISOString()
      };
      this.store.rawItems.set(existingId, updated);
      return cloneRecord(updated);
    }

    const now = new Date().toISOString();
    const rawItem = {
      id: this.store.nextId('raw'),
      sourceId: input.sourceId,
      externalId: input.externalId,
      contentHash: contentHash(input.payload),
      payload: cloneRecord(input.payload),
      responseMeta: cloneRecord(input.responseMeta || {}),
      firstFetchedAt: fetchedAt,
      lastFetchedAt: fetchedAt,
      duplicateFetchCount: 0,
      createdAt: now,
      updatedAt: now
    };

    this.store.rawItems.set(rawItem.id, rawItem);
    this.store.rawItemIndex.set(key, rawItem.id);
    return cloneRecord(rawItem);
  }

  listRawItems() {
    return Array.from(this.store.rawItems.values()).map(cloneRecord);
  }

  getRawItem(id) {
    return cloneRecord(this.store.rawItems.get(id));
  }
}

export function contentHash(payload) {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function validateRawItemInput(input) {
  if (!input.sourceId) {
    throw new Error('Raw item requires source id');
  }
  if (!input.externalId) {
    throw new Error('Raw item requires external id');
  }
  if (input.payload === undefined) {
    throw new Error('Raw item requires payload');
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
