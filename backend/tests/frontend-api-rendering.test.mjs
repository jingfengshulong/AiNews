import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

async function renderPage({ file, url, responses }) {
  const html = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
  const script = await readFile(new URL('../../assets/js/main.js', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });

  dom.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {}
  });
  dom.window.fetch = async (requestUrl) => {
    const path = new URL(requestUrl, url).pathname + new URL(requestUrl, url).search;
    const body = responses[path] || responses[new URL(requestUrl, url).pathname];
    if (!body) {
      return { ok: false, status: 404, json: async () => ({ error: 'not_found' }) };
    }
    return { ok: true, status: 200, json: async () => body };
  };

  dom.window.eval(script);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return dom;
}

const homeResponse = {
  dataStatus: {
    mode: 'live',
    runId: 'live_test',
    lastLiveFetchAt: '2026-04-21T11:55:00.000Z',
    stale: false,
    sourceOutcomeCounts: {
      succeeded: 3,
      failed: 0,
      skipped: 1,
      fetched: 7,
      processed: 7
    }
  },
  leadSignal: {
    id: 'sig_0001',
    title: 'OpenAI introduces Agent SDK updates for enterprise developers',
    summary: '后端 API 生成的首页主信号。',
    heatScore: 94,
    signalScore: 88,
    primaryPublishedAt: '2026-04-21T08:00:00.000Z',
    sourceCount: 3,
    sourceFamilies: ['company_announcement'],
    sources: [{ name: 'OpenAI News RSS' }],
    topics: [{ name: 'AI Agent', slug: 'ai-agent' }]
  },
  rankedSignals: [
    {
      id: 'sig_0002',
      title: 'Benchmarking Tool-Using AI Agents for Enterprise Workflows',
      summary: '研究来源生成的支持信号。',
      heatScore: 76,
      signalScore: 82,
      primaryPublishedAt: '2026-04-20T18:30:00.000Z',
      sourceCount: 2,
      sourceFamilies: ['research'],
      sources: [{ name: 'arXiv AI Recent' }],
      topics: [{ name: 'Research', slug: 'research' }]
    }
  ],
  stats: {
    visibleSignals: 5,
    articlesIndexed: 7,
    sourceCount: 7,
    hotSignals: 3
  },
  sourceSummaries: [
    { family: 'company_announcement', label: 'Company Announcement', signalCount: 1 },
    { family: 'research', label: 'Research', signalCount: 3 }
  ],
  dateSummaries: [
    { date: '2026-04-21', signalCount: 3 },
    { date: '2026-04-20', signalCount: 1 }
  ],
  tickerItems: [
    { signalId: 'sig_0001', text: 'OpenAI introduces Agent SDK updates · 3 sources · heat 94' }
  ]
};

const detailResponse = {
  signal: {
    id: 'sig_0001',
    title: 'OpenAI introduces Agent SDK updates for enterprise developers',
    summary: '后端 API 生成的详情摘要。',
    aiBrief: '后端 API 生成的 AI Brief。',
    heatScore: 94,
    signalScore: 88,
    primaryPublishedAt: '2026-04-21T08:00:00.000Z',
    sourceCount: 3,
    sourceFamilies: ['company_announcement'],
    sources: [{ name: 'OpenAI News RSS' }],
    topics: [{ name: 'AI Agent', slug: 'ai-agent' }]
  },
  keyPoints: [
    { text: '官方来源确认 Agent SDK 更新。', sources: [{ name: 'OpenAI News RSS' }] },
    { text: '媒体来源补充企业采用背景。', sources: [{ name: 'NewsAPI AI Coverage' }] }
  ],
  timeline: [
    { label: '官方发布更新。', at: '2026-04-21T08:00:00.000Z', sources: [{ name: 'OpenAI News RSS' }] }
  ],
  sourceMix: [
    { sourceName: 'OpenAI News RSS', role: 'lead' },
    { sourceName: 'NewsAPI AI Coverage', role: 'media' }
  ],
  nextWatch: '继续关注企业部署反馈。',
  relatedSignals: [
    { id: 'sig_0002', title: 'Benchmarking Tool-Using AI Agents for Enterprise Workflows', heatScore: 76 }
  ],
  supportingSources: [
    { name: 'OpenAI News RSS', family: 'company_announcement', originalUrl: 'https://openai.example/news/agent-sdk-enterprise' }
  ],
  supportingArticles: [
    { title: 'OpenAI introduces Agent SDK updates for enterprise developers', originalUrl: 'https://openai.example/news/agent-sdk-enterprise' }
  ]
};

test('homepage renders lead, ranking, stats, archives, and ticker from /api/home', async () => {
  const dom = await renderPage({
    file: 'index.html',
    url: 'http://localhost/index.html',
    responses: { '/api/home': homeResponse }
  });
  const document = dom.window.document;

  assert.equal(document.querySelector('.hero-title').textContent, homeResponse.leadSignal.title);
  assert.equal(document.querySelector('.hero-link').getAttribute('href'), 'details.html?id=sig_0001');
  assert.match(document.querySelector('.ranking-list').textContent, /Benchmarking Tool-Using/);
  assert.match(document.querySelector('.signal-strip').textContent, /5/);
  assert.match(document.querySelector('.home-archives').textContent, /Research/);
  assert.match(document.querySelector('.ticker-track').textContent, /OpenAI introduces/);
  assert.match(document.querySelector('.footer-note').textContent, /LIVE DATA/);
  assert.match(document.querySelector('.footer-note').textContent, /3 sources/);
});

test('homepage renders stale and fixture data status from /api/home metadata', async () => {
  const staleDom = await renderPage({
    file: 'index.html',
    url: 'http://localhost/index.html',
    responses: {
      '/api/home': {
        ...homeResponse,
        dataStatus: {
          ...homeResponse.dataStatus,
          stale: true,
          sourceOutcomeCounts: { succeeded: 2, failed: 1, skipped: 1 }
        }
      }
    }
  });
  assert.match(staleDom.window.document.querySelector('.footer-note').textContent, /STALE LIVE DATA/);

  const fixtureDom = await renderPage({
    file: 'index.html',
    url: 'http://localhost/index.html',
    responses: {
      '/api/home': {
        ...homeResponse,
        dataStatus: {
          mode: 'demo',
          stale: false,
          sourceOutcomeCounts: { succeeded: 0, failed: 0, skipped: 0 }
        }
      }
    }
  });
  assert.match(fixtureDom.window.document.querySelector('.footer-note').textContent, /DEMO DATA/);
});

test('detail page renders signal detail from /api/signals/:id', async () => {
  const dom = await renderPage({
    file: 'details.html',
    url: 'http://localhost/details.html?id=sig_0001',
    responses: { '/api/signals/sig_0001': detailResponse }
  });
  const document = dom.window.document;

  assert.equal(document.querySelector('.detail-title').textContent, detailResponse.signal.title);
  assert.equal(document.querySelector('[data-detail-field="body"]').textContent, '后端 API 生成的 AI Brief。');
  assert.match(document.querySelector('[data-detail-list="points"]').textContent, /官方来源确认/);
  assert.match(document.querySelector('[data-detail-list="timeline"]').textContent, /官方发布更新/);
  assert.match(document.querySelector('[data-detail-list="sourceMix"]').textContent, /OpenAI News RSS/);
  assert.match(document.querySelector('[data-detail-list="related"]').textContent, /Benchmarking Tool-Using/);
});
