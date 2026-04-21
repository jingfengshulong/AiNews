import { createOpenAICompatibleEnrichmentProvider } from '../src/ai/openai-compatible-enrichment-provider.ts';
import { loadConfigFromEnvFile } from '../src/config/env.ts';
import { validateEnrichmentOutput } from '../src/signal-processing/enrichment-output-validator.ts';

const config = await loadConfigFromEnvFile();

const context = {
  signal: {
    id: 'smoke-signal-agent-sdk',
    title: 'OpenAI introduces Agent SDK updates',
    primaryPublishedAt: '2026-04-21T08:00:00.000Z',
    heatScore: 86,
    signalScore: 82
  },
  sources: [
    {
      id: 'source-official-openai',
      name: 'OpenAI News',
      sourceType: 'rss',
      family: 'company_announcement',
      usagePolicy: {
        allowFullText: false,
        attributionRequired: true
      }
    },
    {
      id: 'source-tech-media',
      name: 'Tech Media',
      sourceType: 'newsapi',
      family: 'technology_media',
      usagePolicy: {
        allowFullText: false,
        attributionRequired: true
      }
    }
  ],
  articles: [
    {
      id: 'article-official-openai',
      sourceId: 'source-official-openai',
      role: 'lead',
      title: 'OpenAI introduces Agent SDK updates',
      canonicalUrl: 'https://example.com/openai-agent-sdk',
      publishedAt: '2026-04-21T08:00:00.000Z',
      excerpt: 'OpenAI announces updates to its Agent SDK for developers.',
      textForAI: [
        'OpenAI published a developer update for its Agent SDK, focusing on orchestration, tool calls, and production integration patterns.',
        'The announcement describes improved primitives for building agent workflows, better observability hooks, and clearer migration guidance.',
        'The post positions the SDK as infrastructure for teams moving from prototypes to maintained AI applications.'
      ].join(' '),
      fullTextDisplayAllowed: false
    },
    {
      id: 'article-media-sdk',
      sourceId: 'source-tech-media',
      role: 'supporting',
      title: 'Developers evaluate Agent SDK changes',
      canonicalUrl: 'https://example.com/developers-agent-sdk',
      publishedAt: '2026-04-21T09:00:00.000Z',
      excerpt: 'Developer coverage highlights adoption questions and integration tradeoffs.',
      textForAI: [
        'Independent coverage says developers are comparing the updated SDK with existing orchestration frameworks.',
        'The article highlights adoption questions around debugging, deployment safety, cost control, and compatibility with current application stacks.',
        'Several teams are watching whether official examples and migration notes make production rollout easier.'
      ].join(' '),
      fullTextDisplayAllowed: false
    }
  ],
  sourceMix: [
    {
      sourceId: 'source-official-openai',
      sourceName: 'OpenAI News',
      sourceType: 'rss',
      family: 'company_announcement',
      role: 'lead',
      url: 'https://example.com/openai-agent-sdk',
      title: 'OpenAI introduces Agent SDK updates',
      publishedAt: '2026-04-21T08:00:00.000Z'
    },
    {
      sourceId: 'source-tech-media',
      sourceName: 'Tech Media',
      sourceType: 'newsapi',
      family: 'technology_media',
      role: 'supporting',
      url: 'https://example.com/developers-agent-sdk',
      title: 'Developers evaluate Agent SDK changes',
      publishedAt: '2026-04-21T09:00:00.000Z'
    }
  ],
  backendText: []
};

const provider = createOpenAICompatibleEnrichmentProvider({
  apiKey: config.secrets.enrichment,
  model: config.enrichment.model,
  baseUrl: config.enrichment.baseUrl
});

const output = await provider.generate(context);
const validated = validateEnrichmentOutput(output, context);

console.log(JSON.stringify({
  ok: true,
  provider: provider.name,
  model: config.enrichment.model,
  validation: 'passed',
  output: validated
}, null, 2));
