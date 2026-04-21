import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/env.ts';
import { loadRuntimeConfig } from '../config/runtime-config.ts';
import { createHealthSnapshot } from '../health.ts';
import { createLogger } from '../logging/logger.ts';
import { InMemoryQueue } from '../queue/in-memory-queue.ts';
import { processFetchJobs } from '../ingestion/fetch-job-handler.ts';
import { processQueuedJobs } from '../ingestion/process-job-handler.ts';
import { processEnrichmentJobs } from '../signal-processing/enrichment-job-handler.ts';

export function createWorker({ config = loadConfig(), queue = new InMemoryQueue(), logger = createLogger(), fetchJobHandler, processJobHandler, enrichmentJobHandler } = {}) {
  return {
    queue,
    health() {
      return createHealthSnapshot({
        service: 'worker',
        config,
        checks: { database: Boolean(config.databaseUrl), queue: Boolean(config.redisUrl) }
      });
    },
    start() {
      logger.info('worker_started', {
        runtimeMode: config.runtimeMode,
        queueLanes: ['fetch', 'process', 'enrichment']
      });
    },
    async runFetchJobs({ limit = 25 } = {}) {
      if (!fetchJobHandler) {
        logger.warn('fetch_jobs_skipped', { reason: 'missing_fetch_job_handler' });
        return { completed: 0, retried: 0, failed: 0, results: [] };
      }

      const summary = await processFetchJobs({
        queue,
        handler: fetchJobHandler,
        limit
      });
      logger.info('fetch_jobs_finished', summary);
      return summary;
    },
    async runProcessJobs({ limit = 25 } = {}) {
      if (!processJobHandler) {
        logger.warn('process_jobs_skipped', { reason: 'missing_process_job_handler' });
        return { completed: 0, failed: 0, results: [] };
      }

      const summary = await processQueuedJobs({
        queue,
        lane: 'process',
        handler: processJobHandler,
        limit
      });
      logger.info('process_jobs_finished', summary);
      return summary;
    },
    async runEnrichmentJobs({ limit = 25 } = {}) {
      if (!enrichmentJobHandler) {
        logger.warn('enrichment_jobs_skipped', { reason: 'missing_enrichment_job_handler' });
        return { completed: 0, failed: 0, results: [] };
      }

      const summary = await processEnrichmentJobs({
        queue,
        handler: enrichmentJobHandler,
        limit
      });
      logger.info('enrichment_jobs_finished', summary);
      return summary;
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createWorker({ config: await loadRuntimeConfig() }).start();
}
