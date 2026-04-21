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
    const home = await fetchApi("/api/home");
    if (!home.leadSignal) {
      return;
    }

    const lead = home.leadSignal;
    setText(".hero-title", lead.title);
    setText(".hero-summary", lead.summary || lead.aiBrief);
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
      rankingRoot.innerHTML = home.rankedSignals.slice(0, 4).map((signal, index) => `
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
            ${home.sourceSummaries.slice(0, 5).map((item) => `
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
            ${home.dateSummaries.slice(0, 5).map((item) => `
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
      ticker.textContent = home.tickerItems.map((item) => item.text).join(" / ");
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

    document.title = `${signal.title} | Signal Daily`;
    setDetail("kicker", `# ${signal.id} / HOT SIGNAL`);
    setDetail("title", signal.title);
    setDetail("summary", signal.summary || signal.aiBrief);
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

  function detailHref(id) {
    return `details.html?id=${encodeURIComponent(id)}`;
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
    if (status.mode === "live") {
      const label = status.stale ? "STALE LIVE DATA" : "LIVE DATA";
      return `${label} / ${counts.succeeded || 0} sources OK / ${counts.failed || 0} failed / ${counts.skipped || 0} skipped / fetched ${counts.fetched || 0} / updated ${formatDateTime(status.lastLiveFetchAt)}`;
    }
    if (status.mode === "demo" || status.mode === "fixture") {
      return "DEMO DATA / deterministic local backend fixture";
    }
    return `${String(status.mode || "API").toUpperCase()} DATA / status pending`;
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
