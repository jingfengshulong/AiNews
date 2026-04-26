(function () {
  const page = document.body.dataset.page;
  const apiBases = Array.from(new Set([
    document.body.dataset.apiBase || "",
    "http://localhost:4100"
  ].filter((value, index) => value || index === 0)));

  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === page) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
  });

  document.querySelectorAll("[data-current-date]").forEach((node) => {
    node.textContent = new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short"
    }).format(new Date());
  });

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const applyMotionPreference = () => {
    document.documentElement.classList.toggle("reduce-motion", motionQuery.matches);
  };
  applyMotionPreference();
  motionQuery.addEventListener("change", applyMotionPreference);

  hydratePage().catch((error) => {
    console.warn("API rendering skipped:", error.message);
    renderPageUnavailable(error);
  });

  async function hydratePage() {
    if (page === "home") {
      await hydrateHomePage();
    }
    if (page === "detail") {
      await hydrateDetailPage();
    }
    if (page === "sources") {
      await hydrateSourcesPage();
    }
    if (page === "dates") {
      await hydrateDatesPage();
    }
    if (page === "topics") {
      await hydrateTopicsPage();
    }
    if (page === "search") {
      await hydrateSearchPage();
    }
  }

  async function hydrateHomePage() {
    setText(".footer-note", formatDataStatus({ mode: "live", state: "loading", sourceOutcomeCounts: {} }));
    const home = await fetchApi("/api/home");
    if (!home.leadSignal) {
      renderHomeState(home, home.dataStatus?.state || "empty_live");
      return;
    }

    const lead = home.leadSignal;
    applyHeroTitle(compactHeroTitle(lead.title), { fullTitle: lead.title, sourceLength: lead.title?.length || 0 });
    setText(".hero-summary", heroLeadSummary(lead));
    setText(".system-label", `#01 / BACKEND SIGNAL / ${formatDate(lead.primaryPublishedAt)}`);
    const heroLink = document.querySelector(".hero-link");
    if (heroLink) {
      heroLink.setAttribute("href", detailHref(lead.id));
    }
    const heatValue = document.querySelector(".heat-meter span:last-child");
    if (heatValue) {
      heatValue.textContent = formatScore(lead.heatScore);
    }

    const rankingRoot = document.querySelector(".ranking-list");
    if (rankingRoot) {
      rankingRoot.innerHTML = asArray(home.rankedSignals).slice(0, 4).map((signal, index) => `
        <a class="ranking-item" href="${detailHref(signal.id)}">
          <span class="rank-number">${padRank(index + 2)}</span>
          <div>
            <h2>${escapeHtml(signal.title)}</h2>
            <p>${escapeHtml(signal.summary || sourceLine(signal))}</p>
          </div>
        </a>
      `).join("");
    }

    const statRoot = document.querySelector(".signal-strip");
    if (statRoot) {
      statRoot.innerHTML = [
        ["HOT NEWS", home.stats.visibleSignals],
        ["ARTICLES", home.stats.articlesIndexed],
        ["SOURCES", home.stats.sourceCount],
        ["TOP SCORE", formatScore(lead.signalScore)]
      ].map(([label, value]) => `
        <div class="stat-block">
          <span class="stat-label">${label}</span>
          <span class="stat-value">${escapeHtml(value)}</span>
        </div>
      `).join("");
    }

    const archives = document.querySelector(".home-archives");
    if (archives) {
      archives.innerHTML = `
        <div>
          <div class="section-label"><span>BY SOURCE</span><a href="sources.html">VIEW ALL</a></div>
          <div class="entry-list">
            ${asArray(home.sourceSummaries).slice(0, 5).map((item) => `
              <a class="entry-row" href="sources.html?family=${encodeURIComponent(item.family)}">
                <h3>${escapeHtml(item.label || item.family)}</h3>
                <span class="source-count">${item.signalCount} signals</span>
              </a>
            `).join("")}
          </div>
        </div>
        <div>
          <div class="section-label"><span>BY DATE</span><a href="dates.html">ARCHIVE</a></div>
          <div class="entry-list">
            ${asArray(home.dateSummaries).slice(0, 5).map((item) => `
              <a class="entry-row" href="dates.html?date=${encodeURIComponent(item.date)}">
                <h3>${escapeHtml(item.date)}</h3>
                <span class="archive-date">${item.signalCount} signals</span>
              </a>
            `).join("")}
          </div>
        </div>
      `;
    }

    const ticker = document.querySelector(".ticker-track");
    if (ticker) {
      ticker.textContent = asArray(home.tickerItems).map((item) => item.text).join(" / ");
    }
    setText(".footer-note", formatDataStatus(home.dataStatus));
  }

  async function hydrateDetailPage() {
    const params = new URLSearchParams(window.location.search);
    let id = params.get("id");
    if (!id || !id.startsWith("sig_")) {
      const home = await fetchApi("/api/home");
      id = home.leadSignal?.id;
      if (!id) {
        return;
      }
    }

    const detail = await fetchApi(`/api/signals/${encodeURIComponent(id)}`);
    const signal = detail.signal;
    setText(".footer-note", formatDataStatus(detail.dataStatus));

    document.title = `${signal.title} | Signal Daily`;
    setDetail("kicker", `# ${signal.id} / HOT SIGNAL`);
    applyDetailTitle(compactHeroTitle(signal.title), { fullTitle: signal.title, sourceLength: signal.title?.length || 0 });
    setDetail("summary", heroLeadSummary(signal));
    setDetail("body", signal.aiBrief || signal.summary);
    setDetail("source", detail.supportingSources.map((source) => source.name).join(" + "));
    setDetail("date", formatDate(signal.primaryPublishedAt));
    setDetail("category", signal.sourceFamilies.join(" / "));
    setDetail("topic", signal.topics.map((topic) => topic.name).join(" / "));
    setDetail("heat", formatScore(signal.heatScore));
    setDetail("score", formatScore(signal.signalScore));
    setDetail("scoreText", `${signal.sourceCount} 个来源支撑，${signal.enrichmentStatus || "pending"} enrichment。`);
    setDetail("watch", detail.nextWatch);

    const heatBar = document.querySelector("[data-detail-style='heatWidth']");
    if (heatBar) {
      heatBar.style.width = `${Math.min(100, Math.max(0, signal.heatScore || 0))}%`;
    }

    renderList("[data-detail-list='points']", detail.keyPoints, (point) => `
      <li>${escapeHtml(point.text)} <span class="timeline-source">${escapeHtml(sourceNames(point.sources))}</span></li>
    `);
    renderList("[data-detail-list='timeline']", detail.timeline, (item) => `
      <div class="timeline-row">
        <span class="timeline-time">${escapeHtml(formatTime(item.at))}</span>
        <span>${escapeHtml(item.label)}</span>
        <span class="timeline-source">${escapeHtml(sourceNames(item.sources))}</span>
      </div>
    `);
    renderList("[data-detail-list='sourceMix']", detail.sourceMix, (item) => `
      <div class="source-mix-row">
        <span class="source-type">${escapeHtml(item.sourceName)}</span>
        <span class="source-weight">${escapeHtml(item.role)}</span>
      </div>
    `);
    renderList("[data-detail-list='related']", detail.relatedSignals, (item, index) => `
      <a class="related-row" href="${detailHref(item.id)}">
        <span>${escapeHtml(item.title)}</span>
        <span class="related-rank">${padRank(index + 1)}</span>
      </a>
    `);
  }

  async function hydrateSourcesPage() {
    const data = await fetchApi("/api/sources");
    const stat = document.querySelector(".page-stat strong");
    if (stat) {
      stat.textContent = String(data.sources.length);
    }
    const grid = document.querySelector(".archive-grid");
    if (!grid) {
      return;
    }
    const archives = await Promise.all(data.families.map(async (family) => {
      try {
        return await fetchApi(`/api/sources/${encodeURIComponent(family.family)}`);
      } catch {
        return { family: family.family, label: family.label, signals: [] };
      }
    }));
    grid.innerHTML = archives.map((archive) => `
      <div class="archive-group">
        <div class="section-label"><span>${escapeHtml(archive.label || archive.family)}</span><span>${archive.signals.length} signals</span></div>
        <div class="entry-list">
          ${archive.signals.slice(0, 4).map(signalRow).join("")}
        </div>
      </div>
    `).join("");
  }

  async function hydrateDatesPage() {
    const groups = await Promise.all([
      ["今天", "/api/dates/today"],
      ["昨天", "/api/dates/yesterday"],
      ["本周", "/api/dates/week"]
    ].map(async ([label, path]) => [label, await fetchApi(path)]));
    const stat = document.querySelector(".page-stat strong");
    if (stat) {
      stat.textContent = String(groups.at(-1)[1].signals.length);
    }
    const grid = document.querySelector(".archive-grid");
    if (grid) {
      grid.innerHTML = groups.map(([label, group], index) => `
        <div class="archive-group ${index === 2 ? "wide" : ""}">
          <div class="section-label"><span>${label}</span><span>${group.signals.length} signals</span></div>
          <div class="entry-list">
            ${group.signals.slice(0, 6).map(signalRow).join("")}
          </div>
        </div>
      `).join("");
    }
  }

  async function hydrateTopicsPage() {
    const data = await fetchApi("/api/topics");
    const activeTopics = data.topics.filter((topic) => topic.signalCount > 0);
    const stat = document.querySelector(".page-stat strong");
    if (stat) {
      stat.textContent = String(activeTopics.length);
    }
    const rows = await Promise.all(activeTopics.map(async (topic) => {
      const archive = await fetchApi(`/api/topics/${encodeURIComponent(topic.slug)}`);
      const lead = archive.signals[0];
      return lead ? `
        <a class="topic-row" href="${detailHref(lead.id)}">
          <span class="topic-name">${escapeHtml(topic.name)}</span>
          <div>
            <h3>${escapeHtml(lead.title)}</h3>
            <p>${escapeHtml(lead.summary || sourceLine(lead))}</p>
          </div>
          <span class="heat-value">${formatScore(lead.heatScore)}</span>
        </a>
      ` : "";
    }));
    const topicList = document.querySelector(".topic-list");
    if (topicList) {
      topicList.innerHTML = rows.join("");
    }
  }

  async function hydrateSearchPage() {
    const searchButton = document.getElementById("searchButton");
    const searchInput = document.getElementById("searchInput");
    const searchStatus = document.getElementById("searchStatus");
    const resultList = document.querySelector(".result-list");
    if (!searchButton || !searchInput || !searchStatus || !resultList) {
      return;
    }

    const runSearch = async () => {
      const term = searchInput.value.trim() || "AI Agent";
      searchStatus.textContent = `正在搜索「${term}」...`;
      const data = await fetchApi(`/api/search?q=${encodeURIComponent(term)}`);
      searchStatus.textContent = `已从后端 API 返回 ${data.results.length} 条结果`;
      resultList.innerHTML = data.results.slice(0, 8).map((item) => `
        <a class="result-row" href="${item.type === "signal" ? detailHref(item.id) : item.originalUrl}">
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.summary || item.excerpt || sourceLine(item))}</p>
            <span class="meta">
              <span>${escapeHtml(item.type)}</span>
              <span>${escapeHtml(item.sourceFamilies?.join(" / ") || "")}</span>
              <span>${escapeHtml(formatDate(item.primaryPublishedAt))}</span>
            </span>
          </div>
          <span class="heat-value">${item.heatScore !== undefined ? formatScore(item.heatScore) : "LINK"}</span>
        </a>
      `).join("");
    };

    searchButton.addEventListener("click", () => {
      runSearch().catch((error) => {
        searchStatus.textContent = `搜索失败：${error.message}`;
      });
    });
    await runSearch();
  }

  async function fetchApi(path) {
    let lastError;
    for (const base of apiBases) {
      try {
        const response = await fetch(`${base}${path}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("API unavailable");
  }

  function signalRow(signal) {
    return `
      <a class="entry-row" href="${detailHref(signal.id)}">
        <div>
          <h3>${escapeHtml(signal.title)}</h3>
          <p>${escapeHtml(signal.summary || sourceLine(signal))}</p>
        </div>
        <span class="heat-value">${formatScore(signal.heatScore)}</span>
      </a>
    `;
  }

  function setDetail(key, value) {
    document.querySelectorAll(`[data-detail-field="${key}"]`).forEach((node) => {
      node.textContent = value || "";
    });
  }

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (node && value !== undefined && value !== null) {
      node.textContent = value;
    }
  }

  function renderList(selector, items, renderer) {
    const root = document.querySelector(selector);
    if (!root) {
      return;
    }
    root.innerHTML = (items || []).map(renderer).join("");
  }

  function renderHomeState(home = {}, state = "empty_live") {
    const copy = stateCopy(state);
    setText(".system-label", copy.kicker);
    applyHeroTitle(copy.title);
    setText(".hero-summary", copy.summary);
    const heroLink = document.querySelector(".hero-link");
    if (heroLink) {
      heroLink.setAttribute("href", copy.href || "sources.html");
    }
    const heatValue = document.querySelector(".heat-meter span:last-child");
    if (heatValue) {
      heatValue.textContent = "0";
    }
    const rankingRoot = document.querySelector(".ranking-list");
    if (rankingRoot) {
      rankingRoot.innerHTML = statePanel(copy, home.dataStatus);
    }
    const statRoot = document.querySelector(".signal-strip");
    if (statRoot) {
      const stats = home.stats || {};
      statRoot.innerHTML = [
        ["VISIBLE", stats.visibleSignals || 0],
        ["ARTICLES", stats.articlesIndexed || 0],
        ["SOURCES", stats.sourceCount || 0],
        ["STATE", (home.dataStatus?.state || state).replace("_", " ").toUpperCase()]
      ].map(([label, value]) => `
        <div class="stat-block">
          <span class="stat-label">${escapeHtml(label)}</span>
          <span class="stat-value">${escapeHtml(value)}</span>
        </div>
      `).join("");
    }
    const archives = document.querySelector(".home-archives");
    if (archives) {
      archives.innerHTML = `
        <div>
          <div class="section-label"><span>BY SOURCE</span><a href="sources.html">VIEW ALL</a></div>
          <div class="entry-list">${stateEntry("来源状态", copy.sourceLine)}</div>
        </div>
        <div>
          <div class="section-label"><span>BY DATE</span><a href="dates.html">ARCHIVE</a></div>
          <div class="entry-list">${stateEntry("刷新状态", copy.dateLine)}</div>
        </div>
      `;
    }
    const ticker = document.querySelector(".ticker-track");
    if (ticker) {
      ticker.textContent = copy.ticker;
    }
    setText(".footer-note", formatDataStatus(home.dataStatus || { mode: "live", state }));
  }

  function renderPageUnavailable(error) {
    const status = {
      mode: "api_unavailable",
      state: "api_unavailable",
      stale: true,
      empty: true,
      sourceOutcomeCounts: {}
    };
    if (page === "home") {
      renderHomeState({ dataStatus: status, stats: {} }, "api_unavailable");
      return;
    }
    setText(".footer-note", formatDataStatus(status));
    const stat = document.querySelector(".page-stat strong");
    if (stat) {
      stat.textContent = "0";
    }
    const panel = statePanel({
      title: "后端 API 暂不可用",
      summary: `无法完成实时数据加载：${error.message}`,
      action: "检查后端服务后刷新页面"
    }, status);
    const root = document.querySelector(".archive-grid") || document.querySelector(".topic-list") || document.querySelector(".result-list");
    if (root) {
      root.innerHTML = panel;
    }
    const searchStatus = document.getElementById("searchStatus");
    if (searchStatus) {
      searchStatus.textContent = "API 暂不可用，无法执行实时搜索。";
    }
  }

  function stateCopy(state) {
    const copies = {
      loading: {
        kicker: "#00 / WAITING FOR LIVE DATA",
        title: "正在等待首次实时抓取",
        summary: "后端已经启动，首页会在第一轮抓取、质量过滤和聚类完成后显示真实热点。",
        sourceLine: "来源调度中，暂不展示样例资讯。",
        dateLine: "等待第一轮刷新完成。",
        ticker: "LIVE DATA LOADING / 等待首次实时抓取完成 /",
        action: "稍后刷新页面"
      },
      empty_live: {
        kicker: "#00 / EMPTY LIVE DATA",
        title: "暂无可见热点",
        summary: "实时抓取已完成，但当前没有通过时效、质量和聚类门控的资讯。原始记录仍会保留给后端处理。",
        sourceLine: "暂无通过质量门控的可见信号。",
        dateLine: "本轮刷新没有可展示热点。",
        ticker: "EMPTY LIVE DATA / 没有展示静态样例内容 /",
        action: "查看来源页确认抓取覆盖"
      },
      api_unavailable: {
        kicker: "#00 / API UNAVAILABLE",
        title: "实时数据暂不可用",
        summary: "前端没有连接到后端 API，因此不会把静态样例误当作最新资讯展示。",
        sourceLine: "后端 API 未响应。",
        dateLine: "等待服务恢复后重新加载。",
        ticker: "API UNAVAILABLE / STATIC SAMPLE HIDDEN /",
        action: "启动后端服务后刷新"
      }
    };
    return copies[state] || copies.empty_live;
  }

  function statePanel(copy, status) {
    const counts = status?.sourceOutcomeCounts || {};
    return `
      <div class="state-panel">
        <span class="state-kicker">${escapeHtml(status?.label || status?.state || "STATE")}</span>
        <h2>${escapeHtml(copy.title)}</h2>
        <p>${escapeHtml(copy.summary)}</p>
        <div class="state-metrics">
          <span>${counts.succeeded || 0} OK</span>
          <span>${counts.failed || 0} failed</span>
          <span>${counts.skipped || 0} skipped</span>
        </div>
        <span class="state-action">${escapeHtml(copy.action || "")}</span>
      </div>
    `;
  }

  function stateEntry(title, summary) {
    return `
      <div class="entry-row state-entry">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(summary)}</p>
        </div>
      </div>
    `;
  }

  function detailHref(id) {
    return `details.html?id=${encodeURIComponent(id)}`;
  }

  function applyHeroTitle(title, options = {}) {
    applyAdaptiveTitle(".hero-title", title, {
      ...options,
      longAt: 72,
      displayLongAt: 56,
      extraAt: 118,
      displayExtraAt: 82
    });
  }

  function applyDetailTitle(title, options = {}) {
    applyAdaptiveTitle(".detail-title", title, {
      ...options,
      longAt: 88,
      displayLongAt: 68,
      extraAt: 132,
      displayExtraAt: 96
    });
  }

  function applyAdaptiveTitle(selector, title, options = {}) {
    const node = document.querySelector(selector);
    if (!node) {
      return;
    }
    const displayTitle = String(title || "");
    const sourceLength = Number(options.sourceLength || displayTitle.length);
    node.textContent = displayTitle;
    node.removeAttribute("title");
    node.classList.remove("is-long-title", "is-extra-long-title");
    if (sourceLength > options.longAt || displayTitle.length > options.displayLongAt) {
      node.classList.add("is-long-title");
    }
    if (sourceLength > options.extraAt || displayTitle.length > options.displayExtraAt) {
      node.classList.add("is-extra-long-title");
    }
    if (options.fullTitle && options.fullTitle !== displayTitle) {
      node.setAttribute("title", options.fullTitle);
    }
  }

  function compactHeroTitle(title) {
    const normalized = normalizeSpace(title);
    if (!normalized) {
      return "";
    }

    const githubMatch = normalized.match(/^GitHub\s*-\s*([^:]+):\s*(.+)$/i);
    if (githubMatch) {
      const repoName = githubMatch[1].split("/").filter(Boolean).pop() || githubMatch[1];
      return truncateAtWord(`${repoName}: ${firstSentence(githubMatch[2])}`, 76);
    }

    return truncateAtWord(normalized, 96);
  }

  function heroLeadSummary(signal) {
    const summary = normalizeSpace(signal.summary || signal.aiBrief || "");
    const fullTitle = normalizeSpace(signal.title || "");
    if (!summary) {
      return compactHeroTitle(fullTitle);
    }
    if (fullTitle && summary.toLowerCase().startsWith(fullTitle.toLowerCase())) {
      const remainder = summary.slice(fullTitle.length).replace(/^[\s:：,，。;；.-]+/, "");
      return remainder || compactHeroTitle(fullTitle);
    }
    return summary;
  }

  function firstSentence(value) {
    const text = normalizeSpace(value);
    const match = text.match(/^(.+?[.!?。！？])(?:\s|$)/);
    return match ? match[1] : text;
  }

  function truncateAtWord(value, maxLength) {
    const text = normalizeSpace(value);
    if (text.length <= maxLength) {
      return text;
    }
    const slice = text.slice(0, maxLength + 1);
    const wordBreak = slice.lastIndexOf(" ");
    const end = wordBreak > maxLength * 0.62 ? wordBreak : maxLength;
    return `${slice.slice(0, end).replace(/[\s,;:，。；：.-]+$/, "")}...`;
  }

  function normalizeSpace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function sourceLine(signal) {
    if (signal.sources?.length) {
      return signal.sources.map((source) => source.name).join(" / ");
    }
    if (signal.sourceFamilies?.length) {
      return signal.sourceFamilies.join(" / ");
    }
    return "";
  }

  function sourceNames(sources) {
    return (sources || []).map((source) => source.name).join(" / ");
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(value));
  }

  function formatTime(value) {
    if (!value) {
      return "--:--";
    }
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(value));
  }

  function formatScore(value) {
    return String(Math.round(Number(value || 0)));
  }

  function formatDataStatus(status) {
    if (!status) {
      return "API DATA / status unavailable";
    }
    const counts = status.sourceOutcomeCounts || {};
    if (status.state === "loading") {
      return "LOADING LIVE DATA / waiting for first refresh";
    }
    if (status.state === "empty_live") {
      return `EMPTY LIVE DATA / ${counts.succeeded || 0} sources OK / ${counts.failed || 0} failed / no visible signals`;
    }
    if (status.state === "partial_live") {
      return `PARTIAL LIVE DATA / ${counts.succeeded || 0} sources OK / ${counts.failed || 0} failed / ${counts.skipped || 0} skipped`;
    }
    if (status.state === "stale_live") {
      return `STALE LIVE DATA / ${counts.succeeded || 0} sources OK / ${counts.failed || 0} failed / updated ${formatDateTime(status.lastUpdatedAt || status.lastLiveFetchAt)}`;
    }
    if (status.state === "api_unavailable") {
      return "API UNAVAILABLE / static sample hidden";
    }
    if (status.mode === "live") {
      const label = status.stale ? "STALE LIVE DATA" : "LIVE DATA";
      return `${label} / ${counts.succeeded || 0} sources OK / ${counts.failed || 0} failed / ${counts.skipped || 0} skipped / fetched ${counts.fetched || 0} / updated ${formatDateTime(status.lastLiveFetchAt)}`;
    }
    if (status.mode === "demo" || status.mode === "fixture") {
      return "DEMO DATA / deterministic local backend fixture";
    }
    return `${String(status.mode || "API").toUpperCase()} DATA / status pending`;
  }

  function asArray(value) {
    if (value === undefined || value === null) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  function formatDateTime(value) {
    if (!value) {
      return "pending";
    }
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(value));
  }

  function padRank(value) {
    return String(value).padStart(2, "0");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
