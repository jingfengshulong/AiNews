export async function ingestRssAtomSource({ source, adapter, rawItemRepository, queue, fetchedAt = new Date() }) {
  const records = await adapter.fetchSource(source);
  const created = [];
  const duplicates = [];

  for (const record of records) {
    const rawItem = rawItemRepository.upsertRawItem({
      sourceId: source.id,
      externalId: record.externalId,
      fetchedAt,
      payload: {
        title: record.title,
        url: record.url,
        publishedAt: record.publishedAt,
        updatedAt: record.updatedAt,
        author: record.author,
        summary: record.summary,
        categories: record.categories,
        rawPayload: record.rawPayload
      },
      responseMeta: record.responseMeta
    });

    if (rawItem.duplicateFetchCount > 0) {
      duplicates.push(rawItem);
      continue;
    }

    created.push(rawItem);
    queue.enqueue('process', { rawItemId: rawItem.id, sourceId: source.id }, { jobKey: `process:${rawItem.id}` });
  }

  return {
    sourceId: source.id,
    fetched: records.length,
    created,
    duplicates
  };
}
