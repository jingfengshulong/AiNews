export async function normalizeRawItemToArticleCandidate({ rawItem, source, fetcher, articleRepository }) {
  const url = rawItem.payload?.url;
  const candidate = await fetcher.fetchArticle({ url, rawItem, source });
  return articleRepository.upsertArticleCandidate(candidate);
}
