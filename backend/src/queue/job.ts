export const queueLanes = ['fetch', 'process', 'enrichment'];

export function ensureQueueLane(lane) {
  if (!queueLanes.includes(lane)) {
    throw new Error(`Unsupported queue lane: ${lane}`);
  }
}

export function createJobRecord({ id, lane, payload, jobKey, runAfter, attempts = 0, now = new Date() }) {
  return {
    id,
    lane,
    jobKey,
    payload: structuredClone(payload),
    status: 'queued',
    attempts,
    runAfter: toIso(runAfter || now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

export function defaultJobKey(lane, payload, runAfter) {
  return `${lane}:${JSON.stringify(payload)}:${toIso(runAfter)}`;
}

export function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
