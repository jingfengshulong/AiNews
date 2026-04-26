export class OpenAICompatibleEnrichmentProviderError extends Error {
  constructor(message, category = 'enrichment_provider_failed') {
    super(message);
    this.name = 'OpenAICompatibleEnrichmentProviderError';
    this.category = category;
  }
}

export function createOpenAICompatibleEnrichmentProvider({
  apiKey,
  model,
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30000
} = {}) {
  if (!apiKey) {
    throw new OpenAICompatibleEnrichmentProviderError('AI enrichment API key is required', 'configuration_error');
  }
  if (!model) {
    throw new OpenAICompatibleEnrichmentProviderError('AI enrichment model is required', 'configuration_error');
  }
  if (!baseUrl) {
    throw new OpenAICompatibleEnrichmentProviderError('AI enrichment base URL is required', 'configuration_error');
  }
  if (!fetchImpl) {
    throw new OpenAICompatibleEnrichmentProviderError('Fetch implementation is required', 'configuration_error');
  }

  return {
    name: `openai-compatible:${model}`,
    async generate(context) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(chatCompletionsUrl(baseUrl), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(createRequestBody({ model, context })),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new OpenAICompatibleEnrichmentProviderError(
            `AI enrichment provider returned HTTP ${response.status}: ${await safeResponseText(response, apiKey)}`,
            'enrichment_provider_failed'
          );
        }

        const payload = await response.json();
        return parseModelJson(extractMessageContent(payload), apiKey);
      } catch (error) {
        if (error.name === 'OpenAICompatibleEnrichmentProviderError') {
          throw error;
        }
        if (error.name === 'AbortError') {
          throw new OpenAICompatibleEnrichmentProviderError('AI enrichment provider request timed out');
        }
        throw new OpenAICompatibleEnrichmentProviderError(redactSecret(String(error.message || error), apiKey));
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

function createRequestBody({ model, context }) {
  return {
    model,
    temperature: 0.2,
    max_tokens: 1600,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'You are an AI news editor for a Chinese AI intelligence product.',
          'Return valid JSON only. Do not use markdown.',
          'Write polished Simplified Chinese for every user-facing field.',
          'Produce an editorial brief, 2 to 4 key points, source-grounded timeline, source mix, next-watch text, and related signals.',
          'Every key point and timeline item must cite valid sourceIds from the input.',
          'Summaries must be short, transformative, and must not copy long source passages or expose backend-only full text.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify(createPromptPayload(context), null, 2)
      }
    ]
  };
}

function createPromptPayload(context) {
  return {
    task: 'Generate AI enrichment for this clustered news signal.',
    outputSchema: {
      aiBrief: 'Simplified Chinese string, 100 to 220 Chinese characters',
      keyPoints: [{ text: 'Simplified Chinese string, <= 100 Chinese characters', sourceIds: ['source id'] }],
      timeline: [{ label: 'Simplified Chinese string, <= 100 Chinese characters', at: 'ISO timestamp when available', sourceIds: ['source id'] }],
      sourceMix: [{ sourceId: 'source id', sourceName: 'source name', role: 'official|media|research|community|product|supporting' }],
      nextWatch: 'Simplified Chinese string, <= 140 Chinese characters',
      relatedSignalIds: ['signal id from relatedSignalCandidates only, empty array if unknown']
    },
    constraints: [
      'Use only the provided sources and articles.',
      'Do not invent source IDs, URLs, dates, claims, or related signals.',
      'Return 2 to 4 keyPoints unless only one source exists.',
      'Prefer official and research sources when resolving conflicts.',
      'Do not copy any 12-word-or-longer passage from article text.',
      'If evidence is thin, say what is known and keep the output conservative.',
      'Do not include backend-only full article text in the output.'
    ],
    signal: {
      id: context.signal?.id,
      title: context.signal?.title,
      primaryPublishedAt: context.signal?.primaryPublishedAt,
      heatScore: context.signal?.heatScore,
      signalScore: context.signal?.signalScore
    },
    sources: asArray(context.sources).map((source) => ({
      id: source.id,
      name: source.name,
      sourceType: source.sourceType,
      family: source.family,
      usagePolicy: {
        allowFullText: source.usagePolicy?.allowFullText === true,
        attributionRequired: source.usagePolicy?.attributionRequired !== false
      }
    })),
    sourceMix: asArray(context.sourceMix).map((item) => ({
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      role: item.role,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt
    })),
    relatedSignalCandidates: asArray(context.relatedSignals).map((signal) => ({
      id: signal.id,
      title: signal.title,
      primaryPublishedAt: signal.primaryPublishedAt
    })),
    articles: asArray(context.articles).map((article) => ({
      id: article.id,
      sourceId: article.sourceId,
      sourceName: sourceNameFor(context, article.sourceId),
      role: article.role,
      title: article.title,
      canonicalUrl: article.canonicalUrl,
      publishedAt: article.publishedAt,
      excerpt: clip(article.excerpt, 700),
      textForAI: clip(article.textForAI, 4500),
      fullTextDisplayAllowed: article.fullTextDisplayAllowed === true
    }))
  };
}

function extractMessageContent(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content ?? payload?.output_text;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === 'string' ? part : part?.text || '').join('');
  }
  throw new OpenAICompatibleEnrichmentProviderError('AI enrichment provider response did not include message content');
}

function parseModelJson(content, apiKey) {
  const cleaned = stripJsonFence(content).trim();
  const jsonText = cleaned.startsWith('{') ? cleaned : extractJsonObject(cleaned);

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new OpenAICompatibleEnrichmentProviderError(
      `AI enrichment provider returned invalid JSON: ${redactSecret(error.message, apiKey)}`
    );
  }
}

function stripJsonFence(value) {
  const trimmed = String(value || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

function extractJsonObject(value) {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new OpenAICompatibleEnrichmentProviderError('AI enrichment provider response did not contain a JSON object');
  }
  return value.slice(start, end + 1);
}

async function safeResponseText(response, apiKey) {
  try {
    const text = await response.text();
    return clip(redactSecret(text, apiKey), 600);
  } catch {
    return '[unreadable response body]';
  }
}

function chatCompletionsUrl(baseUrl) {
  const normalized = String(baseUrl).replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}

function sourceNameFor(context, sourceId) {
  return asArray(context.sources).find((source) => source.id === sourceId)?.name;
}

function redactSecret(value, secret) {
  if (!secret) {
    return value;
  }
  return String(value).split(secret).join('[redacted]');
}

function clip(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
