export function createLiveIngestionScheduler({
  runtime,
  logger,
  intervalMinutes = 30,
  enabled = true,
  sourceIds,
  now = () => new Date()
} = {}) {
  const intervalMs = Math.max(Number(intervalMinutes) || 30, 1) * 60_000;
  let timer;
  let startedAt;
  let tickCount = 0;

  async function tick() {
    tickCount += 1;
    try {
      const report = await runtime.runOnce({
        mode: 'scheduled',
        incremental: true,
        intervalMinutes,
        sourceIds
      });
      logger?.info?.('live_scheduled_refresh_completed', {
        runId: report.runId,
        runMode: report.runMode,
        state: report.state,
        intervalMinutes,
        skippedOverlapCount: report.skippedOverlapCount,
        sourceOutcomeCounts: report.sourceOutcomeCounts,
        totals: report.totals
      });
    } catch (error) {
      logger?.error?.('live_scheduled_refresh_failed', {
        message: error.message,
        intervalMinutes
      });
    }
  }

  return {
    start() {
      if (!enabled || timer) {
        return;
      }
      startedAt = now().toISOString();
      timer = setInterval(() => {
        void tick();
      }, intervalMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
      logger?.info?.('live_ingestion_scheduler_started', {
        intervalMinutes,
        startedAt
      });
    },
    stop() {
      if (!timer) {
        return;
      }
      clearInterval(timer);
      timer = undefined;
      logger?.info?.('live_ingestion_scheduler_stopped', {
        intervalMinutes,
        tickCount
      });
    },
    async runNow() {
      return tick();
    },
    getState() {
      return {
        enabled,
        running: Boolean(timer),
        intervalMinutes,
        startedAt,
        tickCount
      };
    }
  };
}
