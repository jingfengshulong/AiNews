import { currentEnrichmentVersion } from './enrichment-version.ts';

export { currentEnrichmentVersion };

const staleBoilerplatePatterns = [
  /基础来源信息/,
  /来源归因显示/,
  /页面只展示/,
  /AI 精炼暂不可用/,
  /提供了与该信号相关/
];

export function enqueueEnrichmentBackfillJobs({
  signalRepository,
  queue,
  limit = 25,
  dryRun = false,
  staleOnly = false,
  statuses,
  now = new Date()
} = {}) {
  const selectedStatuses = normalizeStatuses(statuses);
  const candidates = selectBackfillCandidates(signalRepository.listSignals(), {
    limit,
    staleOnly,
    statuses: selectedStatuses
  });

  if (dryRun) {
    return {
      queued: 0,
      candidates,
      dryRun: true
    };
  }

  const runAt = new Date(now);
  const jobs = candidates.map((signal) => {
    if (signal.enrichmentStatus !== 'pending') {
      signalRepository.markEnrichmentPending(signal.id, {
        reason: backfillReasonForSignal(signal),
        previousStatus: signal.enrichmentStatus,
        requestedAt: runAt.toISOString()
      });
    }
    return queue.enqueue('enrichment', { signalId: signal.id }, {
      jobKey: `enrichment-backfill:${signal.id}:${runAt.toISOString()}`,
      runAfter: runAt
    });
  });

  return {
    queued: jobs.length,
    candidates,
    jobs,
    dryRun: false
  };
}

export function selectBackfillCandidates(signals = [], {
  limit = 25,
  staleOnly = false,
  statuses
} = {}) {
  const selectedStatuses = normalizeStatuses(statuses);
  return signals
    .filter((signal) => shouldBackfillSignal(signal, { staleOnly, statuses: selectedStatuses }))
    .sort(compareBackfillPriority)
    .slice(0, normalizeLimit(limit));
}

export function shouldBackfillSignal(signal, { staleOnly = false, statuses } = {}) {
  if (!signal) {
    return false;
  }
  if (statuses?.size && !statuses.has(signal.enrichmentStatus)) {
    return false;
  }
  if (isStaleEnrichmentSignal(signal)) {
    return true;
  }
  if (staleOnly) {
    return false;
  }
  return signal.enrichmentStatus === 'failed' || signal.enrichmentStatus === 'fallback';
}

export function isStaleEnrichmentSignal(signal) {
  if (!signal) {
    return false;
  }
  if (signal.enrichmentStatus === 'pending' || signal.enrichmentStatus === 'processing') {
    return false;
  }
  if (Number(signal.enrichmentMeta?.enrichmentVersion || 0) < currentEnrichmentVersion) {
    return true;
  }
  const text = [
    signal.summary,
    signal.aiBrief,
    ...(Array.isArray(signal.keyPoints) ? signal.keyPoints.map((point) => point?.text) : [])
  ].filter(Boolean).join(' ');
  if (staleBoilerplatePatterns.some((pattern) => pattern.test(text))) {
    return true;
  }
  return signal.enrichmentStatus === 'completed'
    && (!signal.aiBrief || String(signal.aiBrief).trim().length < 80 || !Array.isArray(signal.keyPoints) || signal.keyPoints.length < 2);
}

function compareBackfillPriority(left, right) {
  const leftScore = Number(left.signalScore || left.heatScore || 0);
  const rightScore = Number(right.signalScore || right.heatScore || 0);
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }
  const leftDate = new Date(left.primaryPublishedAt || left.updatedAt || left.createdAt || 0).getTime();
  const rightDate = new Date(right.primaryPublishedAt || right.updatedAt || right.createdAt || 0).getTime();
  return rightDate - leftDate;
}

function backfillReasonForSignal(signal) {
  if (isStaleEnrichmentSignal(signal)) {
    return 'stale_enrichment';
  }
  return signal.enrichmentStatus === 'failed' ? 'failed_enrichment_retry' : 'fallback_enrichment_retry';
}

function normalizeLimit(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 25;
}

function normalizeStatuses(statuses) {
  if (!statuses) {
    return undefined;
  }
  const values = Array.isArray(statuses)
    ? statuses
    : String(statuses).split(',');
  return new Set(values.map((status) => String(status).trim()).filter(Boolean));
}
