const BATCH_SIZE = 15;

const SYSTEM_PROMPT = [
  '你是一个 AI 资讯编辑。判断以下文章是否与人工智能/AI 相关。',
  '相关主题包括：大模型、LLM、GPT、Claude、DeepSeek、机器学习、深度学习、',
  '神经网络、AIGC、生成式AI、智能体、Agent、RAG、多模态、计算机视觉、',
  '自然语言处理、AI芯片、GPU、算力、AI产品发布、AI研究论文、AI政策法规。',
  '不相关主题包括：纯消费电子、汽车（除非涉及自动驾驶AI）、娱乐、体育、金融（除非涉及AI金融）。',
  '返回一个JSON数组，每个元素是true或false，对应每篇文章是否AI相关。只返回JSON数组。'
].join('');

export function createRelevanceFilter({ apiKey, model, baseUrl, fetchImpl = globalThis.fetch, batchSize = BATCH_SIZE, timeoutMs = 20000 } = {}) {
  if (!apiKey || !model || !baseUrl) {
    return null;
  }

  return {
    async filterArticles(articles) {
      if (!articles.length) return [];

      const relevant = [];
      for (let i = 0; i < articles.length; i += batchSize) {
        const batch = articles.slice(i, i + batchSize);
        const flags = await judgeBatch({ apiKey, model, baseUrl, fetchImpl, timeoutMs, articles: batch });
        for (let j = 0; j < batch.length; j++) {
          if (flags[j] !== false) {
            relevant.push(batch[j]);
          }
        }
      }
      return relevant;
    }
  };
}

async function judgeBatch({ apiKey, model, baseUrl, fetchImpl, timeoutMs, articles }) {
  const items = articles.map((article, index) => {
    const title = article.title || '(无标题)';
    const summary = (article.summary || article.excerpt || '').slice(0, 200);
    return `${index + 1}. [${title}] ${summary}`;
  });

  const userMessage = items.join('\n');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const normalized = String(baseUrl).replace(/\/+$/, '');
    const url = normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return articles.map(() => true);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content || '';
    return parseResults(content, articles.length);
  } catch {
    // Fail-open: if AI is unavailable, treat all as relevant
    return articles.map(() => true);
  }
}

function parseResults(content, expectedLength) {
  try {
    const cleaned = content.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length === expectedLength) {
        return parsed.map((v) => v === true || v === 1 || v === 'true');
      }
    }
  } catch {
    // fall through to fail-open
  }
  // Fail-open on parse error
  return Array.from({ length: expectedLength }, () => true);
}
