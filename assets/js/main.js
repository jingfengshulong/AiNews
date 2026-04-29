(function () {
  const sourceTypeLabels = {
    technology_media: "技术媒体",
    research: "研究",
    funding: "投融资",
    policy: "政策监管",
    community: "社区",
    product_launch: "产品发布",
    company_announcement: "公司公告"
  };
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

  renderInitialLoadingState();

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
          <div class="section-label"><span>BY SOURCE TYPE</span><a href="sources.html">VIEW ALL</a></div>
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
    setDetail("summary", detailLeadSummary(signal, detail));
    setDetail("body", signal.aiBrief || signal.summary);
    setDetail("source", detail.supportingSources.map((source) => source.name).join(" + "));
    setDetail("date", formatDate(signal.primaryPublishedAt));
    setDetail("category", sourceTypeNames(signal.sourceFamilies).join(" / "));
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
    renderList("[data-detail-list='originalLinks']", originalLinks(detail), (item) => `
      <a class="original-link-row" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(item.title || item.url)}">
        <span>${escapeHtml(item.displayTitle)}</span>
        <span class="source-weight">OPEN</span>
      </a>
    `, {
      emptyHtml: `
        <div class="original-link-row is-empty">
          <span>暂无可公开打开的原文链接</span>
          <span class="source-weight">SOURCE</span>
        </div>
      `
    });
    renderList("[data-detail-list='related']", detail.relatedSignals, (item, index) => `
      <a class="related-row" href="${detailHref(item.id)}">
        <span>${escapeHtml(item.title)}</span>
        <span class="related-rank">${padRank(index + 1)}</span>
      </a>
    `);
  }

  async function hydrateSourcesPage() {
    const params = new URLSearchParams(window.location.search);
    const family = params.get("family") || params.get("sourceType") || params.get("type");
    if (family) {
      await hydrateCategoryStream({
        path: `/api/source-types/${encodeURIComponent(family)}`,
        title: "来源类型流",
        emptyTitle: "该来源类型暂无资讯",
        getHeader: (data) => data.sourceType || { family, label: family },
        headerLabel: (header) => header.label || header.family,
        headerCount: (header) => header.signalCount
      });
      return;
    }

    const data = await fetchApi("/api/source-types");
    const sourceTypes = asArray(data.sourceTypes);
    setText(".page-title", "按来源类型浏览");
    setText(".page-intro", "来源类型回答“这条资讯从哪类渠道来”，例如技术媒体、研究、产品发布、社区和政策；具体来源名称只在详情页作为归因出现。");
    const stat = document.querySelector(".page-stat strong");
    if (stat) {
      stat.textContent = String(sourceTypes.length);
    }
    const grid = document.querySelector(".archive-grid");
    if (!grid) {
      return;
    }
    grid.innerHTML = sourceTypes.map((item) => categoryCard({
      href: `sources.html?family=${encodeURIComponent(item.family)}`,
      label: item.label || item.family,
      kicker: "SOURCE TYPE",
      count: `${item.signalCount || 0} signals`,
      previewSignals: item.previewSignals
    })).join("");
  }

  async function hydrateDatesPage() {
    const params = new URLSearchParams(window.location.search);
    const range = params.get("range");
    const date = params.get("date");
    if (range || date) {
      await hydrateCategoryStream({
        path: date ? `/api/dates?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}` : `/api/dates/${encodeURIComponent(range)}`,
        title: date ? `${date} 资讯流` : `${dateRangeLabel(range)}资讯流`,
        emptyTitle: "该日期暂无资讯",
        getHeader: (data) => data.range || { label: range || date },
        headerLabel: (header) => date || dateRangeLabel(header.label),
        headerCount: () => undefined
      });
      return;
    }

    setText(".page-title", "按日期回看热点");
    setText(".page-intro", "日期页承接首页归档入口，让用户按时间线追踪 AI 行业信号，而不是在首页展开复杂筛选。");
    const statLabel = document.querySelector(".page-stat span");
    if (statLabel) {
      statLabel.textContent = "本周趋势资讯";
    }
    const groups = await Promise.all([
      ["今天", "today", "/api/dates/today"],
      ["昨天", "yesterday", "/api/dates/yesterday"],
      ["本周", "week", "/api/dates/week"]
    ].map(async ([label, key, path]) => [label, key, await fetchApi(path)]));
    const stat = document.querySelector(".page-stat strong");
    if (stat) {
      stat.textContent = String(groups.at(-1)?.[2]?.signals?.length || 0);
    }
    const grid = document.querySelector(".archive-grid");
    if (grid) {
      grid.innerHTML = groups.map(([label, key, group]) => categoryCard({
        href: `dates.html?range=${encodeURIComponent(key)}`,
        label,
        kicker: "DATE WINDOW",
        count: `${asArray(group.signals).length} signals`,
        previewSignals: group.signals
      })).join("");
    }
  }

  async function hydrateTopicsPage() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("topic") || params.get("slug");
    if (slug) {
      await hydrateCategoryStream({
        path: `/api/topics/${encodeURIComponent(slug)}`,
        title: "专题资讯流",
        emptyTitle: "该专题暂无资讯",
        getHeader: (data) => data.topic || { slug, name: slug },
        headerLabel: (header) => header.name || header.slug,
        headerCount: (header) => header.signalCount
      });
      return;
    }

    const data = await fetchApi("/api/topics");
    const activeTopics = data.topics.filter((topic) => topic.signalCount > 0);
    setText(".page-title", "AI 产业专题线索");
    setText(".page-intro", "专题页把爆款资讯背后的长期主题抽出来，帮助用户从一天的热点切换到持续追踪。");
    const statLabel = document.querySelector(".page-stat span");
    if (statLabel) {
      statLabel.textContent = "核心专题正在追踪";
    }
    const stat = document.querySelector(".page-stat strong");
    if (stat) {
      stat.textContent = String(activeTopics.length);
    }
    const rows = await Promise.all(activeTopics.map(async (topic) => {
      const archive = await fetchApi(`/api/topics/${encodeURIComponent(topic.slug)}`);
      const lead = archive.signals[0];
      return `
        <a class="topic-row" href="topics.html?topic=${encodeURIComponent(topic.slug)}">
          <span class="topic-name">${escapeHtml(topic.name)}</span>
          <div>
            <h3>${escapeHtml(lead?.title || topic.description || topic.name)}</h3>
            <p>${escapeHtml(lead?.summary || `${topic.signalCount} 条资讯等待展开`)}</p>
          </div>
          <span class="heat-value">${escapeHtml(topic.signalCount || 0)}</span>
        </a>
      `;
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

    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q") || "";
    if (initialQuery) {
      searchInput.value = initialQuery;
    }

    const renderSearchIdle = () => {
      searchStatus.textContent = "准备搜索后端处理后的资讯信号。";
      resultList.classList.add("is-empty");
      resultList.innerHTML = statePanel({
        title: "等待搜索关键词",
        summary: "处理后的资讯信号会在这里出现。"
      }, { label: "SEARCH READY", sourceOutcomeCounts: {} });
    };

    const runSearch = async () => {
      const term = searchInput.value.trim();
      if (!term) {
        renderSearchIdle();
        return;
      }
      searchStatus.textContent = `正在搜索「${term}」...`;
      const data = await fetchApi(`/api/search?q=${encodeURIComponent(term)}`);
      const results = asArray(data.results).filter((item) => item.type === "signal");
      searchStatus.textContent = `已从后端 API 返回 ${results.length} 条处理后资讯`;
      resultList.classList.toggle("is-empty", results.length === 0);
      resultList.innerHTML = results.length ? results.slice(0, 8).map((item) => `
        <a class="result-row" href="${detailHref(item.id)}">
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.summary || sourceLine(item))}</p>
            <span class="meta">
              <span>signal</span>
              <span>${escapeHtml(sourceTypeNames(item.sourceFamilies).join(" / "))}</span>
              <span>${escapeHtml(formatDate(item.primaryPublishedAt))}</span>
            </span>
          </div>
          <span class="heat-value">${formatScore(item.heatScore)}</span>
        </a>
      `).join("") : statePanel({
        title: "没有找到匹配资讯",
        summary: `当前关键词「${term}」没有命中已处理资讯信号。`
      }, { label: "NO RESULTS", sourceOutcomeCounts: {} });
    };

    searchButton.addEventListener("click", () => {
      runSearch().catch((error) => {
        searchStatus.textContent = `搜索失败：${error.message}`;
      });
    });
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch().catch((error) => {
          searchStatus.textContent = `搜索失败：${error.message}`;
        });
      }
    });

    if (initialQuery) {
      await runSearch();
    } else {
      renderSearchIdle();
    }
  }

  async function fetchApi(path) {
    let lastError;
    for (const base of apiBases) {
      try {
        const response = await fetch(`${base}${path}`, { cache: "no-store" });
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

  function categoryCard({ href, label, kicker, count, previewSignals }) {
    const previews = asArray(previewSignals).slice(0, 3);
    return `
      <a class="category-card archive-group" href="${escapeHtml(href)}">
        <div class="section-label"><span>${escapeHtml(kicker)}</span><span>${escapeHtml(count)}</span></div>
        <h2>${escapeHtml(label)}</h2>
        <div class="category-preview">
          ${previews.length ? previews.map((signal) => `
            <span>
              <strong>${escapeHtml(compactHeroTitle(signal.title))}</strong>
              <em>${escapeHtml(formatScore(signal.heatScore))}</em>
            </span>
          `).join("") : "<span><strong>暂无可展示资讯</strong><em>0</em></span>"}
        </div>
      </a>
    `;
  }

  async function hydrateCategoryStream({ path, title, emptyTitle, getHeader, headerLabel, headerCount }) {
    const grid = document.querySelector(".archive-grid") || document.querySelector(".topic-list");
    if (!grid) {
      return;
    }
    grid.classList.add("archive-stream-shell");
    grid.innerHTML = `
      <div class="archive-group wide">
        <div class="section-label"><span data-stream-kicker>${escapeHtml(title)}</span><span data-stream-count>LOADING</span></div>
        <div class="archive-stream entry-list" aria-live="polite"></div>
        <button class="load-more" type="button" data-load-more>继续加载</button>
        <div class="stream-sentinel" data-stream-sentinel></div>
      </div>
    `;

    const stream = grid.querySelector(".archive-stream");
    const button = grid.querySelector("[data-load-more]");
    const countNode = grid.querySelector("[data-stream-count]");
    const kickerNode = grid.querySelector("[data-stream-kicker]");
    const sentinel = grid.querySelector("[data-stream-sentinel]");
    let nextCursor;
    let loading = false;
    let loaded = 0;

    const loadPage = async () => {
      if (loading) {
        return;
      }
      loading = true;
      button.disabled = true;
      button.textContent = "加载中";
      const data = await fetchApi(paginatedPath(path, { limit: 6, cursor: nextCursor }));
      const header = getHeader(data);
      const signals = asArray(data.signals);
      nextCursor = data.pageInfo?.nextCursor;
      loaded += signals.length;
      const label = headerLabel(header);
      const total = headerCount(header) || data.pageInfo?.total;

      setText(".page-title", label);
      setText(".page-intro", "向下浏览这个分类下的处理后资讯；列表会按热度和新鲜度继续加载，直到该分类没有更多内容。");
      if (kickerNode) {
        kickerNode.textContent = title;
      }
      if (countNode) {
        countNode.textContent = total ? `${loaded}/${total} signals` : `${loaded} signals`;
      }
      const stat = document.querySelector(".page-stat strong");
      const statLabel = document.querySelector(".page-stat span");
      if (stat) {
        stat.textContent = String(total || loaded);
      }
      if (statLabel) {
        statLabel.textContent = total ? "当前分类资讯" : "已加载资讯";
      }
      if (signals.length) {
        stream.insertAdjacentHTML("beforeend", signals.map(signalRow).join(""));
      }
      if (!loaded) {
        stream.innerHTML = statePanel({
          title: emptyTitle,
          summary: "当前分类还没有通过后端处理的可见资讯。"
        }, { label: "EMPTY STREAM", sourceOutcomeCounts: {} });
      }
      const hasMore = Boolean(data.pageInfo?.hasMore && nextCursor);
      button.hidden = !hasMore;
      button.disabled = !hasMore;
      button.textContent = hasMore ? "继续加载" : "已加载完";
      loading = false;
    };

    button.addEventListener("click", () => {
      loadPage().catch((error) => {
        button.textContent = `加载失败：${error.message}`;
      });
    });

    await loadPage();

    if ("IntersectionObserver" in window && sentinel) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !button.hidden) {
          loadPage().catch(() => {});
        }
      }, { rootMargin: "240px" });
      observer.observe(sentinel);
    }
  }

  function paginatedPath(path, { limit, cursor } = {}) {
    const separator = path.includes("?") ? "&" : "?";
    const cursorPart = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    return `${path}${separator}limit=${encodeURIComponent(limit)}${cursorPart}`;
  }

  function dateRangeLabel(value) {
    const labels = {
      today: "今天",
      yesterday: "昨天",
      week: "本周"
    };
    return labels[value] || value || "日期";
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

  function renderList(selector, items, renderer, options = {}) {
    const root = document.querySelector(selector);
    if (!root) {
      return;
    }
    const list = items || [];
    root.innerHTML = list.length ? list.map(renderer).join("") : (options.emptyHtml || "");
  }

  function renderInitialLoadingState() {
    const status = {
      mode: "live",
      state: "loading",
      label: "LOADING LIVE DATA",
      sourceOutcomeCounts: {}
    };
    if (page === "home") {
      renderHomeState({ dataStatus: status, stats: {} }, "loading");
      return;
    }
    if (page === "detail") {
      setDetail("kicker", "# -- / LOADING SIGNAL");
      setDetail("summary", "正在从后端加载这条资讯的最新处理结果。");
      setDetail("body", "正在读取 AI 摘要、来源归因和要点。");
      setDetail("source", "LOADING");
      setDetail("date", "--/--");
      setDetail("category", "LOADING");
      setDetail("topic", "");
      setDetail("heat", "--");
      setDetail("score", "--");
      setDetail("scoreText", "正在加载后端信号。");
      setDetail("watch", "正在等待后端返回下一步观察项。");
      applyDetailTitle("正在加载资讯详情", { fullTitle: "正在加载资讯详情", sourceLength: 8 });
      [
        "[data-detail-list='points']",
        "[data-detail-list='timeline']",
        "[data-detail-list='sourceMix']",
        "[data-detail-list='originalLinks']",
        "[data-detail-list='related']"
      ].forEach((selector) => renderList(selector, [], () => "", {
        emptyHtml: statePanel({
          title: "正在加载",
          summary: "后端数据返回后会替换这里的占位内容。"
        }, status)
      }));
      return;
    }
    if (page === "sources" || page === "dates" || page === "topics") {
      const titles = {
        sources: "正在加载来源类型",
        dates: "正在加载日期归档",
        topics: "正在加载专题线索"
      };
      setText(".page-title", titles[page]);
      setText(".page-intro", "正在从后端读取最新处理后的资讯，不展示静态示例内容。");
      const stat = document.querySelector(".page-stat strong");
      const statLabel = document.querySelector(".page-stat span");
      if (stat) {
        stat.textContent = "--";
      }
      if (statLabel) {
        statLabel.textContent = "正在加载";
      }
      const root = page === "topics"
        ? document.querySelector(".topic-list")
        : document.querySelector(".archive-grid");
      if (root) {
        root.innerHTML = statePanel({
          title: titles[page],
          summary: "后端数据返回前先显示加载状态，避免旧示例页面闪现。"
        }, status);
      }
    }
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
          <div class="section-label"><span>BY SOURCE TYPE</span><a href="sources.html">VIEW ALL</a></div>
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
      const repoTitle = cleanDecorativeTitleText(firstSentence(githubMatch[2]));
      return truncateAtWord(`${repoName}: ${repoTitle}`, 76);
    }

    return truncateAtWord(normalized, 96);
  }

  function cleanDecorativeTitleText(value) {
    return normalizeSpace(String(value || "")
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, "")
      .replace(/^[\s:：\-–—|•·]+/, ""));
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

  function detailLeadSummary(signal, detail) {
    const heroSummary = heroLeadSummary(signal);
    const aiBrief = normalizeSpace(signal.aiBrief || signal.summary || "");
    if (!sameNormalizedText(heroSummary, aiBrief)) {
      return heroSummary;
    }

    const primaryPoint = asArray(detail.keyPoints)
      .map((point) => normalizeSpace(point.text || point))
      .find(Boolean);
    if (primaryPoint && !sameNormalizedText(primaryPoint, aiBrief)) {
      return truncateAtWord(firstSentence(primaryPoint), 118);
    }

    const nextWatch = normalizeSpace(detail.nextWatch || "");
    if (nextWatch && !sameNormalizedText(nextWatch, aiBrief)) {
      return truncateAtWord(`后续观察：${nextWatch}`, 118);
    }

    return truncateAtWord(firstSentence(aiBrief || heroSummary), 118);
  }

  function sameNormalizedText(left, right) {
    return normalizeSpace(left) === normalizeSpace(right);
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

  function originalLinks(detail) {
    const links = asArray(detail?.attribution?.originalLinks)
      .map((item) => ({
        title: item.title,
        url: item.url,
        displayTitle: compactHeroTitle(item.title || item.url)
      }))
      .concat(asArray(detail?.supportingArticles).map((item) => ({
        title: item.title,
        url: item.originalUrl,
        displayTitle: compactHeroTitle(item.title || item.originalUrl)
      })))
      .filter((item) => item.url);
    return uniqueBy(links, (item) => item.url);
  }

  function uniqueBy(items, keyFn) {
    const seen = new Set();
    return items.filter((item) => {
      const key = keyFn(item);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
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

  function sourceTypeNames(families = []) {
    return asArray(families).map((family) => sourceTypeLabels[family] || family).filter(Boolean);
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
