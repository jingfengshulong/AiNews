export function filterSourceRecordsForRun({
  records = [],
  source,
  mode = 'manual',
  incremental = false,
  force = false,
  lookbackHours,
  now = new Date()
} = {}) {
  const normalizedRecords = asArray(records);
  const cursor = source?.ingestionCursor || {};
  const seenExternalIds = new Set(asArray(cursor.seenExternalIds).map(String));
  const cursorPublishedAt = toValidDate(cursor.lastSeenPublishedAt);
  const windowStart = lookbackHours ? new Date(new Date(now).getTime() - lookbackHours * 60 * 60 * 1000) : undefined;
  const stats = {
    input: normalizedRecords.length,
    kept: 0,
    skippedByLookback: 0,
    skippedByCursor: 0
  };

  if (force) {
    return {
      records: normalizedRecords,
      stats: { ...stats, kept: normalizedRecords.length }
    };
  }

  const filtered = [];
  for (const record of normalizedRecords) {
    const publishedAt = toValidDate(record?.publishedAt);
    const externalId = record?.externalId ? String(record.externalId) : undefined;

    if (windowStart && publishedAt && publishedAt.getTime() < windowStart.getTime()) {
      stats.skippedByLookback += 1;
      continue;
    }

    if (incremental && mode !== 'startup' && cursorHasPosition(cursor)) {
      const seen = externalId ? seenExternalIds.has(externalId) : false;
      const olderOrEqualCursor = publishedAt && cursorPublishedAt && publishedAt.getTime() <= cursorPublishedAt.getTime();
      if (seen && (!publishedAt || olderOrEqualCursor)) {
        stats.skippedByCursor += 1;
        continue;
      }
    }

    filtered.push(record);
  }

  stats.kept = filtered.length;
  return { records: filtered, stats };
}

export function lookbackWindowStart({ lookbackHours, now = new Date() } = {}) {
  return lookbackHours ? new Date(new Date(now).getTime() - lookbackHours * 60 * 60 * 1000) : undefined;
}

function cursorHasPosition(cursor = {}) {
  return Boolean(cursor.lastSeenPublishedAt || asArray(cursor.seenExternalIds).length > 0);
}

function toValidDate(value) {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
