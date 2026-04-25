import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { cloneRecord, InMemoryStore } from './in-memory-store.ts';
import { queueLanes } from '../queue/job.ts';

export const runtimeSnapshotVersion = 1;

const mapFields = [
  'sources',
  'rawItems',
  'rawItemIndex',
  'articles',
  'articleIndex',
  'sourceRelations',
  'sourceRelationIndex',
  'signals',
  'signalArticles',
  'signalArticleIndex',
  'topics',
  'topicIndex',
  'signalTopics',
  'signalTopicIndex',
  'scoreComponents',
  'scoreComponentIndex',
  'counters'
];

const nestedMapFields = ['jobs', 'jobKeyIndex'];

export function serializeRuntimeStore(store, { metadata = {}, savedAt = new Date() } = {}) {
  return {
    version: runtimeSnapshotVersion,
    savedAt: toIso(savedAt),
    metadata: cloneRecord(metadata),
    maps: Object.fromEntries(mapFields.map((field) => [
      field,
      mapEntries(store[field])
    ])),
    nestedMaps: Object.fromEntries(nestedMapFields.map((field) => [
      field,
      nestedMapEntries(store[field])
    ]))
  };
}

export function restoreRuntimeStore(snapshot) {
  validateSnapshot(snapshot);
  const store = new InMemoryStore();

  for (const field of mapFields) {
    store[field] = new Map(snapshot.maps?.[field] || []);
  }
  for (const field of nestedMapFields) {
    store[field] = restoreNestedMap(snapshot.nestedMaps?.[field]);
  }

  return {
    store,
    metadata: cloneRecord(snapshot.metadata || {})
  };
}

export async function loadRuntimeSnapshot(path) {
  let content;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }

  try {
    const snapshot = JSON.parse(content);
    validateSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    throw new Error(`Invalid runtime snapshot at ${path}: ${error.message}`);
  }
}

export async function saveRuntimeSnapshot(path, snapshot) {
  validateSnapshot(snapshot);
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(tempPath, path);
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Runtime snapshot must be an object');
  }
  if (snapshot.version !== runtimeSnapshotVersion) {
    throw new Error(`Unsupported runtime snapshot version: ${snapshot.version}`);
  }
}

function mapEntries(map) {
  return Array.from((map || new Map()).entries()).map(([key, value]) => [
    key,
    cloneRecord(value)
  ]);
}

function nestedMapEntries(map) {
  return Array.from((map || new Map()).entries()).map(([key, value]) => [
    key,
    mapEntries(value)
  ]);
}

function restoreNestedMap(entries = []) {
  const restored = new Map(entries.map(([key, value]) => [key, new Map(value || [])]));
  for (const lane of queueLanes) {
    if (!restored.has(lane)) {
      restored.set(lane, new Map());
    }
  }
  return restored;
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
