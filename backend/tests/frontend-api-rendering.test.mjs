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
    state: 'live',
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

test('homepage compacts long live lead titles for the hero layout', async () => {
  const longTitle = 'GitHub - nicobailon/surf-cli: The CLI for AI agents to control Chrome. Zero config, agent-agnostic, battle-tested.';
  const dom = await renderPage({
    file: 'index.html',
    url: 'http://localhost/index.html',
    responses: {
      '/api/home': {
        ...homeResponse,
        leadSignal: {
          ...homeResponse.leadSignal,
          title: longTitle,
          summary: `${longTitle} 目前已保留基础来源信息，AI 精炼暂不可用；请优先查看来源标题、发布时间和后续确认。`
        }
      }
    }
  });
  const document = dom.window.document;
  const heroTitle = document.querySelector('.hero-title');

  assert.equal(heroTitle.textContent, 'surf-cli: The CLI for AI agents to control Chrome.');
  assert.equal(heroTitle.getAttribute('title'), longTitle);
  assert.equal(heroTitle.classList.contains('is-long-title'), true);
  assert.doesNotMatch(document.querySelector('.hero-summary').textContent, /GitHub - nicobailon/);
  assert.match(document.querySelector('.hero-summary').textContent, /目前已保留基础来源信息/);
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
          state: 'stale_live',
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
          state: 'demo',
          stale: false,
          sourceOutcomeCounts: { succeeded: 0, failed: 0, skipped: 0 }
        }
      }
    }
  });
  assert.match(fixtureDom.window.document.querySelector('.footer-note').textContent, /DEMO DATA/);
});

test('homepage renders empty and API-unavailable states without sample headlines', async () => {
  const emptyDom = await renderPage({
    file: 'index.html',
    url: 'http://localhost/index.html',
    responses: {
      '/api/home': {
        ...homeResponse,
        dataStatus: {
          ...homeResponse.dataStatus,
          state: 'empty_live',
          stale: false,
          empty: true,
          sourceOutcomeCounts: { succeeded: 2, failed: 0, skipped: 0, fetched: 3, processed: 3 }
        },
        leadSignal: undefined,
        rankedSignals: [],
        stats: { visibleSignals: 0, articlesIndexed: 3, sourceCount: 2, hotSignals: 0 },
        sourceSummaries: [],
        dateSummaries: [],
        tickerItems: []
      }
    }
  });
  const emptyDocument = emptyDom.window.document;
  assert.match(emptyDocument.querySelector('.hero-title').textContent, /暂无可见热点/);
  assert.doesNotMatch(emptyDocument.querySelector('.ranking-list').textContent, /开源模型许可证/);
  assert.match(emptyDocument.querySelector('.footer-note').textContent, /EMPTY LIVE DATA/);

  const unavailableDom = await renderPage({
    file: 'index.html',
    url: 'http://localhost/index.html',
    responses: {}
  });
  const unavailableDocument = unavailableDom.window.document;
  assert.match(unavailableDocument.querySelector('.hero-title').textContent, /实时数据暂不可用/);
  assert.doesNotMatch(unavailableDocument.querySelector('.ranking-list').textContent, /端侧小模型/);
  assert.match(unavailableDocument.querySelector('.footer-note').textContent, /API UNAVAILABLE/);
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

test('detail page compacts long titles without losing the original title', async () => {
  const longTitle = 'GitHub - nicobailon/surf-cli: The CLI for AI agents to control Chrome. Zero config, agent-agnostic, battle-tested.';
  const dom = await renderPage({
    file: 'details.html',
    url: 'http://localhost/details.html?id=sig_0001',
    responses: {
      '/api/signals/sig_0001': {
        ...detailResponse,
        signal: {
          ...detailResponse.signal,
          title: longTitle,
          summary: `${longTitle} 目前已保留基础来源信息，AI 精炼暂不可用；请优先查看来源标题、发布时间和后续确认。`
        }
      }
    }
  });
  const document = dom.window.document;
  const detailTitle = document.querySelector('.detail-title');

  assert.equal(detailTitle.textContent, 'surf-cli: The CLI for AI agents to control Chrome.');
  assert.equal(detailTitle.getAttribute('title'), longTitle);
  assert.equal(detailTitle.classList.contains('is-long-title'), true);
  assert.doesNotMatch(document.querySelector('.detail-deck').textContent, /GitHub - nicobailon/);
  assert.match(document.querySelector('.detail-deck').textContent, /目前已保留基础来源信息/);
});

test('sources, dates, topics, and search pages render API data', async () => {
  const signal = homeResponse.leadSignal;
  const sourceDom = await renderPage({
    file: 'sources.html',
    url: 'http://localhost/sources.html',
    responses: {
      '/api/sources': {
        families: [{ family: 'company_announcement', label: 'Company Announcement', signalCount: 1 }],
        sources: [{ id: 'src_1', name: 'OpenAI News RSS' }, { id: 'src_2', name: 'NewsAPI AI Coverage' }]
      },
      '/api/sources/company_announcement': {
        family: 'company_announcement',
        label: 'Company Announcement',
        signals: [signal]
      }
    }
  });
  assert.match(sourceDom.window.document.querySelector('.archive-grid').textContent, /OpenAI introduces Agent SDK/);
  assert.doesNotMatch(sourceDom.window.document.querySelector('.archive-grid').textContent, /企业 AI 采购关键词/);

  const datesDom = await renderPage({
    file: 'dates.html',
    url: 'http://localhost/dates.html',
    responses: {
      '/api/dates/today': { range: { label: 'today' }, signals: [signal] },
      '/api/dates/yesterday': { range: { label: 'yesterday' }, signals: [] },
      '/api/dates/week': { range: { label: 'week' }, signals: [signal, homeResponse.rankedSignals[0]] }
    }
  });
  assert.match(datesDom.window.document.querySelector('.archive-grid').textContent, /OpenAI introduces Agent SDK/);
  assert.doesNotMatch(datesDom.window.document.querySelector('.archive-grid').textContent, /AI Agent 企业落地/);

  const topicsDom = await renderPage({
    file: 'topics.html',
    url: 'http://localhost/topics.html',
    responses: {
      '/api/topics': {
        topics: [
          { slug: 'ai-agent', name: 'AI Agent', signalCount: 1 },
          { slug: 'empty-topic', name: 'Empty Topic', signalCount: 0 }
        ]
      },
      '/api/topics/ai-agent': {
        topic: { slug: 'ai-agent', name: 'AI Agent' },
        signals: [signal]
      }
    }
  });
  assert.match(topicsDom.window.document.querySelector('.topic-list').textContent, /OpenAI introduces Agent SDK/);
  assert.doesNotMatch(topicsDom.window.document.querySelector('.topic-list').textContent, /企业流程自动化/);

  const searchDom = await renderPage({
    file: 'search.html',
    url: 'http://localhost/search.html',
    responses: {
      '/api/search': {
        query: { q: 'AI Agent 企业采购' },
        results: [
          { type: 'signal', ...signal },
          {
            type: 'article',
            id: 'art_1',
            title: 'NewsAPI article confirms enterprise Agent procurement',
            excerpt: 'API search result rendered from backend data.',
            sourceFamilies: ['technology_media'],
            primaryPublishedAt: '2026-04-21T09:00:00.000Z',
            originalUrl: 'https://example.com/article'
          }
        ]
      }
    }
  });
  assert.match(searchDom.window.document.querySelector('.result-list').textContent, /NewsAPI article confirms/);
  assert.doesNotMatch(searchDom.window.document.querySelector('.result-list').textContent, /流程自动化成为企业 AI 预算/);
});
