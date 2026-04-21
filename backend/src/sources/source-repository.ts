import { cloneRecord } from '../db/in-memory-store.ts';

export class SourceRepository {
  constructor(store) {
    this.store = store;
  }

  create(source) {
    const record = cloneRecord(source);
    this.store.sources.set(record.id, record);
    return cloneRecord(record);
  }

  update(id, updater) {
    const existing = this.store.sources.get(id);
    if (!existing) {
      throw new Error(`Source not found: ${id}`);
    }

    const updated = updater(cloneRecord(existing));
    this.store.sources.set(id, cloneRecord(updated));
    return cloneRecord(updated);
  }

  get(id) {
    return cloneRecord(this.store.sources.get(id));
  }

  list() {
    return Array.from(this.store.sources.values()).map(cloneRecord);
  }

  nextId() {
    return this.store.nextId('src');
  }
}
