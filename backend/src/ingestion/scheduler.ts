export function createDueFetchJobs({ sourceService, queue, now = new Date() }) {
  const dueSources = sourceService.listDueSources(now);
  const jobs = [];

  for (const source of dueSources) {
    const job = queue.enqueue(
      'fetch',
      {
        sourceId: source.id,
        sourceType: source.sourceType
      },
      {
        jobKey: `fetch:${source.id}:${now.toISOString()}`,
        runAfter: now
      }
    );
    jobs.push(job);

    const nextFetchAt = new Date(now.getTime() + source.fetchIntervalMinutes * 60_000);
    sourceService.markFetchScheduled(source.id, nextFetchAt);
  }

  return jobs;
}
