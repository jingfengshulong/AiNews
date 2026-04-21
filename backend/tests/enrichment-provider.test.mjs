import test from 'node:test';
import assert from 'node:assert/strict';

import { createOpenAICompatibleEnrichmentProvider } from '../src/ai/openai-compatible-enrichment-provider.ts';

function createContext() {
  return {
    signal: {
      id: 'signal-1',
      title: 'OpenAI introduces Agent SDK updates',
      primaryPublishedAt: '2026-04-21T08:00:00.000Z'
    },
    sources: [
      {
        id: 'source-official',
        name: 'OpenAI News',
        sourceType: 'rss',
        family: 'company_announcement',
        usagePolicy: { allowFullText: false, attributionRequired: true }
      },
      {
        id: 'source-media',
        name: 'Tech Media',
        sourceType: 'newsapi',
        family: 'technology_media',
        usagePolicy: { allowFullText: false, attributionRequired: true }
      }
    ],
    articles: [
      {
        id: 'article-1',
        sourceId: 'source-official',
        title: 'OpenAI introduces Agent SDK updates',
        canonicalUrl: 'https://example.com/openai-agent-sdk',
        publishedAt: '2026-04-21T08:00:00.000Z',
        role: 'lead',
        fullTextDisplayAllowed: false,
        textForAI: 'OpenAI published developer-facing Agent SDK updates with tool orchestration details and migration guidance.'
      },
      {
        id: 'article-2',
        sourceId: 'source-media',
        title: 'Developers evaluate Agent SDK changes',
        canonicalUrl: 'https://example.com/media-agent-sdk',
        publishedAt: '2026-04-21T09:00:00.000Z',
        role: 'supporting',
        fullTextDisplayAllowed: false,
        textForAI: 'Independent coverage describes early developer reactions, integration questions, and expected production use cases.'
      }
    ],
    sourceMix: [
      {
        sourceId: 'source-official',
        sourceName: 'OpenAI News',
        role: 'lead',
        title: 'OpenAI introduces Agent SDK updates'
      },
      {
        sourceId: 'source-media',
        sourceName: 'Tech Media',
        role: 'supporting',
        title: 'Developers evaluate Agent SDK changes'
      }
    ],
    backendText: []
  };
}

function createJsonResponse(body, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText || 'OK',
    async json() {
      return body;
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    }
  };
}

test('OpenAI-compatible enrichment provider sends structured chat request and parses JSON content', async () => {
  const requests = [];
  const provider = createOpenAICompatibleEnrichmentProvider({
    apiKey: 'test-secret',
    model: 'test-model',
    baseUrl: 'https://provider.example/v1/',
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                aiBrief: '这条信号由官方发布和媒体跟进共同支撑，重点是 Agent SDK 的开发者能力更新。',
                keyPoints: [
                  { text: '官方来源确认了 Agent SDK 的开发者更新。', sourceIds: ['source-official'] },
                  { text: '媒体来源补充了开发者反馈和落地疑问。', sourceIds: ['source-media'] }
                ],
                timeline: [
                  { label: '官方发布更新。', at: '2026-04-21T08:00:00.000Z', sourceIds: ['source-official'] }
                ],
                sourceMix: [
                  { sourceId: 'source-official', sourceName: 'OpenAI News', role: 'official' },
                  { sourceId: 'source-media', sourceName: 'Tech Media', role: 'media' }
                ],
                nextWatch: '继续关注迁移说明、示例项目和开发者采用情况。',
                relatedSignalIds: []
              })
            }
          }
        ]
      });
    }
  });

  const output = await provider.generate(createContext());

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://provider.example/v1/chat/completions');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-secret');
  assert.equal(requests[0].body.model, 'test-model');
  assert.equal(requests[0].body.temperature, 0.2);
  assert.deepEqual(requests[0].body.response_format, { type: 'json_object' });
  assert.match(JSON.stringify(requests[0].body.messages), /source-official/);
  assert.match(JSON.stringify(requests[0].body.messages), /sourceIds/);
  assert.equal(output.keyPoints.length, 2);
  assert.equal(output.sourceMix[0].sourceId, 'source-official');
});

test('OpenAI-compatible enrichment provider strips fenced JSON responses', async () => {
  const provider = createOpenAICompatibleEnrichmentProvider({
    apiKey: 'test-secret',
    model: 'test-model',
    baseUrl: 'https://provider.example/v1/chat/completions',
    fetchImpl: async () => createJsonResponse({
      choices: [
        {
          message: {
            content: '```json\n{"aiBrief":"简短摘要","keyPoints":[{"text":"一点","sourceIds":["source-official"]}],"timeline":[],"sourceMix":[{"sourceId":"source-official","sourceName":"OpenAI News","role":"official"}],"nextWatch":"继续关注。","relatedSignalIds":[]}\n```'
          }
        }
      ]
    })
  });

  const output = await provider.generate(createContext());

  assert.equal(output.aiBrief, '简短摘要');
  assert.equal(output.keyPoints[0].sourceIds[0], 'source-official');
});

test('OpenAI-compatible enrichment provider reports upstream HTTP errors without exposing the API key', async () => {
  const provider = createOpenAICompatibleEnrichmentProvider({
    apiKey: 'test-secret',
    model: 'test-model',
    baseUrl: 'https://provider.example/v1',
    fetchImpl: async () => createJsonResponse({ error: { message: 'invalid key test-secret' } }, {
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    })
  });

  await assert.rejects(
    () => provider.generate(createContext()),
    (error) => {
      assert.equal(error.category, 'enrichment_provider_failed');
      assert.match(error.message, /401/);
      assert.doesNotMatch(error.message, /test-secret/);
      return true;
    }
  );
});
