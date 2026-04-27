import test from 'node:test';
import assert from 'node:assert/strict';

import {
  currentEnrichmentVersion,
  enqueueEnrichmentBackfillJobs,
  isStaleEnrichmentSignal
} from '../src/signal-processing/enrichment-backfill-service.ts';
import { InMemoryStore } from '../src/db/in-memory-store.ts';
import { InMemoryQueue } from '../src/queue/in-memory-queue.ts';
import { SignalRepository } from '../src/signal-processing/signal-repository.ts';

function createRuntime() {
  const store = new InMemoryStore();
  return {
    queue: new InMemoryQueue(store),
    signalRepository: new SignalRepository(store)
  };
}

function createSignal(repository, patch = {}) {
  return repository.createSignal({
    title: patch.title || 'OpenAI launches a new agent platform',
    summary: patch.summary,
    heatScore: patch.heatScore || 0,
    signalScore: patch.signalScore || 0,
    primaryPublishedAt: patch.primaryPublishedAt || '2026-04-27T08:00:00.000Z',
    enrichmentStatus: patch.enrichmentStatus,
    aiBrief: patch.aiBrief,
    keyPoints: patch.keyPoints,
    enrichmentMeta: patch.enrichmentMeta
  });
}

test('stale enrichment detection catches old boilerplate and outdated versions', () => {
  assert.equal(isStaleEnrichmentSignal(createSignalRecord({
    enrichmentStatus: 'completed',
    aiBrief: '目前已保留基础来源信息，已根据来源标题、摘要和发布时间完成基础整理。',
    enrichmentMeta: { enrichmentVersion: currentEnrichmentVersion }
  })), true);

  assert.equal(isStaleEnrichmentSignal(createSignalRecord({
    enrichmentStatus: 'completed',
    aiBrief: '这条资讯聚焦企业 Agent 在生产环境中的部署能力，重点关注安全、成本和工程落地。',
    keyPoints: [{ text: '企业正在验证 Agent 工作流。', sourceIds: ['src_1'] }],
    enrichmentMeta: { enrichmentVersion: currentEnrichmentVersion - 1 }
  })), true);

  assert.equal(isStaleEnrichmentSignal(createSignalRecord({
    enrichmentStatus: 'completed',
    aiBrief: freshBrief(),
    keyPoints: [
      { text: '企业正在验证 Agent 工作流。', sourceIds: ['src_1'] },
      { text: '后续需要关注产品化节奏。', sourceIds: ['src_1'] }
    ],
    enrichmentMeta: { enrichmentVersion: currentEnrichmentVersion }
  })), false);
});

test('backfill enqueues stale signals by priority and respects dry run', () => {
  const runtime = createRuntime();
  const staleHigh = createSignal(runtime.signalRepository, {
    title: 'High score stale signal',
    signalScore: 80,
    aiBrief: 'High score stale signal 当前已有基础来源支撑。要点显示：来源提供了基础来源信息。',
    enrichmentStatus: 'completed',
    enrichmentMeta: { enrichmentVersion: currentEnrichmentVersion }
  });
  const failed = createSignal(runtime.signalRepository, {
    title: 'Failed signal',
    signalScore: 55,
    aiBrief: '这条资讯聚焦模型发布。',
    enrichmentStatus: 'failed',
    enrichmentMeta: { fallbackGenerated: true, errorCategory: 'enrichment_provider_failed' }
  });
  const fresh = createSignal(runtime.signalRepository, {
    title: 'Fresh signal',
    signalScore: 90,
    aiBrief: freshBrief(),
    keyPoints: [
      { text: '企业正在验证 Agent 工作流。', sourceIds: ['src_1'] },
      { text: '后续需要关注产品化节奏。', sourceIds: ['src_1'] }
    ],
    enrichmentStatus: 'completed',
    enrichmentMeta: { enrichmentVersion: currentEnrichmentVersion }
  });

  const dryRun = enqueueEnrichmentBackfillJobs({
    signalRepository: runtime.signalRepository,
    queue: runtime.queue,
    dryRun: true,
    limit: 10,
    now: new Date('2026-04-27T09:00:00.000Z')
  });
  assert.equal(dryRun.queued, 0);
  assert.equal(dryRun.candidates.length, 2);
  assert.equal(runtime.queue.list('enrichment').length, 0);

  const result = enqueueEnrichmentBackfillJobs({
    signalRepository: runtime.signalRepository,
    queue: runtime.queue,
    limit: 1,
    now: new Date('2026-04-27T09:00:00.000Z')
  });

  assert.equal(result.queued, 1);
  assert.deepEqual(result.candidates.map((signal) => signal.id), [staleHigh.id]);
  assert.equal(runtime.queue.list('enrichment')[0].payload.signalId, staleHigh.id);
  assert.equal(runtime.signalRepository.getSignal(staleHigh.id).enrichmentStatus, 'pending');
  assert.equal(runtime.signalRepository.getSignal(failed.id).enrichmentStatus, 'failed');
  assert.equal(runtime.signalRepository.getSignal(fresh.id).enrichmentStatus, 'completed');
});

function createSignalRecord(patch) {
  return {
    id: patch.id || 'sig_test',
    title: patch.title || 'Test signal',
    signalScore: patch.signalScore || 0,
    enrichmentStatus: patch.enrichmentStatus,
    aiBrief: patch.aiBrief,
    keyPoints: patch.keyPoints,
    enrichmentMeta: patch.enrichmentMeta
  };
}

function freshBrief() {
  return '这条资讯聚焦企业 Agent 在生产环境中的部署能力，重点关注安全、成本、权限控制和工程落地。它提供了清晰的来源归因和后续观察方向，可用于判断产品化节奏、企业采用风险以及相关技术路线的实际进展。';
}
