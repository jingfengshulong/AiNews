import { cloneRecord } from '../db/in-memory-store.ts';

export class ScoreComponentRepository {
  constructor(store) {
    this.store = store;
  }

  upsertScoreComponent(input) {
    validateScoreComponent(input);
    const key = `${input.signalId}:${input.component}`;
    const existingId = this.store.scoreComponentIndex.get(key);
    const now = new Date().toISOString();

    if (existingId) {
      const existing = this.store.scoreComponents.get(existingId);
      const updated = {
        ...existing,
        value: round(input.value),
        weight: round(input.weight),
        contribution: round(input.contribution),
        updatedAt: now
      };
      this.store.scoreComponents.set(existingId, updated);
      return cloneRecord(updated);
    }

    const component = {
      id: this.store.nextId('score'),
      signalId: input.signalId,
      component: input.component,
      value: round(input.value),
      weight: round(input.weight),
      contribution: round(input.contribution),
      createdAt: now,
      updatedAt: now
    };

    this.store.scoreComponents.set(component.id, component);
    this.store.scoreComponentIndex.set(key, component.id);
    return cloneRecord(component);
  }

  listScoreComponents(signalId) {
    return Array.from(this.store.scoreComponents.values())
      .filter((component) => !signalId || component.signalId === signalId)
      .map(cloneRecord);
  }
}

function validateScoreComponent(input) {
  if (!input.signalId) {
    throw new Error('Score component requires signal id');
  }
  if (!input.component) {
    throw new Error('Score component requires component name');
  }
  for (const field of ['value', 'weight', 'contribution']) {
    if (typeof input[field] !== 'number' || Number.isNaN(input[field])) {
      throw new Error(`Score component requires numeric ${field}`);
    }
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
