(function () {
  const page = document.body.dataset.page;

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

  const searchButton = document.getElementById("searchButton");
  const searchInput = document.getElementById("searchInput");
  const searchStatus = document.getElementById("searchStatus");

  if (searchButton && searchInput && searchStatus) {
    searchButton.addEventListener("click", () => {
      const term = searchInput.value.trim() || "AI 资讯";
      searchStatus.textContent = `已为「${term}」生成静态示例结果。`;
    });
  }

  const articleData = {
    "agent-enterprise": {
      kicker: "#01 / MOST EXPLOSIVE TODAY",
      title: "AI Agent 企业落地进入加速周",
      summary: "多条产品发布、融资与企业采购信号在 24 小时内同时出现。企业正在从“试用 AI”转向“把 AI 接入真实流程”。",
      source: "Signal Daily",
      date: "04.20",
      category: "AI Agent",
      topic: "AI Agent",
      heat: "98°",
      score: "91",
      heatWidth: "98%",
      scoreText: "来源密度高，跨媒体、融资和产品发布同时升温。",
      body: "这条资讯不是单一新闻，而是一组被聚类后的产业信号：Agent 产品开始强调企业连接器、权限控制、可观测能力和成本治理，说明市场关注点正在从演示效果转向真实部署。",
      watch: "继续观察企业采购公告、平台连接器数量、权限治理能力和客户案例是否在接下来 24 小时内继续增加。",
      points: [
        "企业采购语言从“模型能力”转向“流程接管、权限边界和可审计执行”。",
        "融资与产品发布同向出现，说明 Agent 赛道正在进入商业化验证阶段。",
        "对资讯平台来说，这类新闻适合用“信号聚合”而不是单篇转载来表达。"
      ],
      timeline: [
        ["09:20", "产品发布集中出现，强调企业系统连接器", "8 sources"],
        ["11:45", "融资新闻与流程自动化主题合并", "6 sources"],
        ["14:10", "采购分析提到权限、成本和可观测能力", "12 sources"]
      ],
      sourceMix: [
        ["科技媒体", "42%"],
        ["投融资", "31%"],
        ["产品公告", "27%"]
      ],
      related: [
        ["02", "流程自动化成为企业 AI 预算新入口", "procurement-keywords"],
        ["03", "连接器和权限控制成为 Agent 平台重点", "connectors-permissions"],
        ["04", "流程自动化 Agent 公司完成新轮融资", "agent-funding"]
      ]
    },
    "license-boundary": {
      title: "开源模型许可证争议持续升温",
      summary: "模型权利边界正在影响企业采购评估，社区讨论开始进入法务和安全团队视野。",
      category: "开源模型",
      topic: "开源模型",
      heat: "82°",
      score: "78",
      body: "开源模型生态的讨论不再停留在开发者社区。企业开始把许可证、商用限制、训练数据披露和二次分发风险纳入采购评估。",
      points: ["许可证条款正在成为企业采用模型的门槛。", "开发者社区关注自由度，企业团队更关注责任边界。", "后续可能影响模型托管、微调服务和私有化部署。"],
      timeline: [["08:40", "社区讨论许可证变更影响", "5 sources"], ["12:30", "企业采购团队关注商用限制", "7 sources"], ["16:20", "法律解读文章开始扩散", "4 sources"]]
    },
    "edge-models": {
      title: "端侧小模型发布频率创下本月新高",
      summary: "硬件厂商与应用平台形成联动，隐私和低延迟成为核心叙事。",
      category: "端侧模型",
      topic: "端侧模型",
      heat: "79°",
      score: "75",
      body: "端侧模型正在从概念展示走向产品卖点。设备能力提升、模型压缩和本地推理框架共同推动应用把更多 AI 功能放到用户设备上。",
      points: ["隐私、低延迟和离线能力成为主要价值。", "硬件发布与模型优化新闻同步增加。", "端侧能力可能改变 AI 应用的成本结构。"],
      timeline: [["10:10", "硬件厂商展示本地推理能力", "6 sources"], ["13:00", "小模型评测加入端侧任务", "3 sources"], ["17:15", "应用平台发布隐私模式", "5 sources"]]
    },
    "ai-video": {
      title: "AI 视频工具进入专业制作链路",
      summary: "AI 视频从爆款演示进入广告、素材管理和后期制作流程。",
      category: "AI 视频",
      topic: "AI 视频",
      heat: "88°",
      score: "84",
      body: "AI 视频工具的热度正在从社交平台扩散到商业制作链路。新的信号集中在脚本生成、素材检索、风格一致性和后期协作。",
      points: ["广告制作团队开始把 AI 视频作为流程工具而非玩具。", "素材管理和版权边界成为新的产品关注点。", "未来竞争可能转向稳定性、可控性和团队协作能力。"],
      timeline: [["09:50", "广告制作案例被多家媒体引用", "7 sources"], ["12:10", "工具厂商发布素材管理能力", "4 sources"], ["15:35", "创作者社区讨论商业使用边界", "9 sources"]]
    },
    "procurement-keywords": {
      title: "企业 AI 采购关键词出现明显变化",
      summary: "企业 AI 预算从模型订阅转向流程集成，采购语言更关注 ROI、权限和审计。",
      category: "企业采购",
      topic: "AI Agent",
      heat: "92°",
      score: "87",
      body: "近期企业采购相关报道显示，AI 项目评估正在从“选哪一个模型”转向“如何接入业务流程”。这让连接器、权限、审计和成本可视化变成高频需求。",
      points: ["采购方更关注业务结果和部署成本。", "安全、权限和审计能力正在前置。", "工具型 AI 公司会被要求证明实际流程收益。"],
      timeline: [["09:00", "采购报告提到 ROI 评估变化", "5 sources"], ["13:20", "平台厂商强调权限治理", "4 sources"], ["18:10", "行业分析文章归纳预算迁移", "6 sources"]]
    },
    "connectors-permissions": {
      title: "连接器和权限控制成为 Agent 平台重点",
      summary: "Agent 平台正在把产品重心从智能演示转向企业级连接和治理。",
      category: "产品发布",
      topic: "AI Agent",
      heat: "87°",
      score: "82",
      body: "Agent 能否进入企业流程，关键不只是模型能力，而是能否安全连接系统、继承权限、记录执行过程，并在出错时可追踪。",
      points: ["连接器数量成为平台生态能力的外显指标。", "权限继承和执行审计是企业部署的底座。", "这类能力决定 Agent 是否能从试点进入生产环境。"],
      timeline: [["10:30", "多家平台发布连接器更新", "9 sources"], ["14:00", "安全团队讨论权限继承风险", "3 sources"], ["17:50", "客户案例强调审计能力", "4 sources"]]
    },
    "research-memory": {
      title: "端侧模型评测加入长期记忆任务",
      summary: "研究评测开始关注端侧模型在真实使用中的持续上下文能力。",
      category: "论文与研究",
      topic: "端侧模型",
      heat: "79°",
      score: "74",
      body: "新的端侧模型评测不再只看单轮问答，而是加入长期记忆、上下文恢复和隐私约束下的个性化任务。",
      points: ["长期记忆会影响端侧助手的真实可用性。", "隐私约束让本地存储与摘要策略更重要。", "评测变化会引导产品能力优先级。"],
      timeline: [["11:10", "研究笔记发布新评测维度", "3 sources"], ["15:05", "开发者社区复现实验结果", "2 sources"], ["18:30", "产品团队引用评测指标", "4 sources"]]
    },
    "multi-agent-benchmark": {
      title: "多智能体协作基准测试更新",
      summary: "新的基准测试更强调任务分工、工具调用和失败恢复能力。",
      category: "论文与研究",
      topic: "AI Agent",
      heat: "76°",
      score: "72",
      body: "多智能体系统正在从概念演示走向更严肃的工程评估。新的基准测试关注协作效率、工具调用质量和异常恢复。",
      points: ["协作型 Agent 需要可验证的评估标准。", "工具调用失败后的恢复能力变得关键。", "基准变化会影响平台对外宣传口径。"],
      timeline: [["08:55", "基准项目发布更新", "2 sources"], ["12:40", "研究社区讨论失败恢复指标", "3 sources"], ["16:10", "平台团队引用新榜单", "3 sources"]]
    },
    "agent-funding": {
      title: "流程自动化 Agent 公司完成新轮融资",
      summary: "资本继续押注能进入企业流程的 AI Agent 公司。",
      category: "投融资",
      topic: "AI Agent",
      heat: "85°",
      score: "80",
      body: "融资新闻显示，资本更偏好具备行业流程入口、数据连接能力和清晰 ROI 证明的 Agent 公司。",
      points: ["资金关注点从通用聊天转向流程自动化。", "垂直场景和企业客户成为估值叙事核心。", "融资新闻与采购信号形成同向验证。"],
      timeline: [["09:35", "融资新闻发布", "4 sources"], ["13:15", "投资人解读行业流程入口", "3 sources"], ["17:25", "竞品数据被重新讨论", "2 sources"]]
    },
    "knowledge-ma": {
      title: "企业知识库工具进入并购视野",
      summary: "知识库、搜索和 AI 助手能力正在被更大的企业软件平台吸收。",
      category: "投融资",
      topic: "企业知识",
      heat: "72°",
      score: "69",
      body: "并购讨论说明企业知识基础设施仍是 AI 应用的重要入口。搜索、权限、文档治理和生成式问答正在被整合。",
      points: ["企业知识库是 AI 助手接入工作流的基础。", "并购可能加速知识管理与 Agent 能力融合。", "大型平台会争夺数据入口和权限体系。"],
      timeline: [["10:45", "并购传闻出现", "2 sources"], ["14:30", "行业分析关注知识入口", "3 sources"], ["19:00", "用户社区讨论迁移风险", "2 sources"]]
    },
    "policy-ledger": {
      title: "企业 AI 使用台账要求被更多行业采纳",
      summary: "合规要求正在推动企业记录 AI 使用、权限和输出责任链路。",
      category: "政策监管",
      topic: "政策监管",
      heat: "77°",
      score: "73",
      body: "AI 使用台账从政策概念逐渐进入企业内部流程。它要求记录谁在何时使用了什么模型、调用了哪些数据、产生了什么输出。",
      points: ["台账要求会改变企业 AI 平台的默认功能。", "审计和权限记录会成为产品竞争点。", "监管信号会反过来影响采购清单。"],
      timeline: [["09:15", "政策解读文章扩散", "3 sources"], ["12:55", "企业合规团队讨论台账模板", "4 sources"], ["16:40", "平台产品发布审计功能", "5 sources"]]
    },
    "transparency-guidance": {
      title: "模型透明度指引进入公开征询",
      summary: "模型透明度、披露义务和使用说明成为监管讨论焦点。",
      category: "政策监管",
      topic: "政策监管",
      heat: "68°",
      score: "66",
      body: "透明度指引要求模型提供方和使用方更清楚地说明模型能力边界、数据来源和适用场景。",
      points: ["披露义务可能影响模型发布节奏。", "企业客户会要求更完整的风险说明。", "透明度标准会推动文档和评测体系升级。"],
      timeline: [["08:20", "征询信息发布", "2 sources"], ["11:35", "法律评论解读透明度义务", "3 sources"], ["15:45", "企业用户关注落地成本", "2 sources"]]
    },
    "model-benchmarks": {
      title: "大模型评测从参数转向真实任务完成率",
      summary: "评测话语正在从模型能力展示转向业务任务是否真的完成。",
      category: "大模型产品",
      topic: "大模型产品",
      heat: "86°",
      score: "81",
      body: "新的评测趋势说明市场正在厌倦抽象分数，更需要能对应真实业务任务的完成率、稳定性和成本指标。",
      points: ["真实任务完成率更贴近企业采购。", "成本和延迟会与准确率一起被比较。", "产品宣传会从大参数转向可落地指标。"],
      timeline: [["10:00", "评测榜单更新指标", "4 sources"], ["13:40", "企业软件团队引用任务完成率", "5 sources"], ["18:05", "分析师讨论评测口径变化", "3 sources"]]
    },
    "cost-observability": {
      title: "行业开始关注模型成本的可观测性",
      summary: "Token 成本、调用延迟和权限审计成为 AI 平台的新卖点。",
      category: "成本治理",
      topic: "大模型产品",
      heat: "73°",
      score: "70",
      body: "随着 AI 应用进入生产环境，成本不可控会直接影响预算和产品体验。可观测性工具开始把模型调用、延迟和费用拆解到团队与任务层面。",
      points: ["成本治理是 AI 应用规模化的前提。", "可观测性会和权限审计结合。", "企业需要按团队、场景和任务追踪模型使用。"],
      timeline: [["09:25", "平台发布成本监控能力", "4 sources"], ["12:15", "开发者讨论调用延迟", "3 sources"], ["16:55", "企业案例强调预算控制", "5 sources"]]
    }
  };

  const defaultArticle = articleData["agent-enterprise"];

  const hydrateDetailPage = () => {
    if (page !== "detail") return;

    const params = new URLSearchParams(window.location.search);
    const article = articleData[params.get("id")] || defaultArticle;
    const filledArticle = {
      ...defaultArticle,
      ...article,
      sourceMix: article.sourceMix || defaultArticle.sourceMix,
      related: article.related || defaultArticle.related,
      kicker: article.kicker || "# SIGNAL DETAIL"
    };

    document.title = `${filledArticle.title} | Signal Daily`;

    document.querySelectorAll("[data-detail-field]").forEach((node) => {
      const key = node.dataset.detailField;
      if (filledArticle[key]) {
        node.textContent = filledArticle[key];
      }
    });

    const heatBar = document.querySelector("[data-detail-style='heatWidth']");
    if (heatBar) {
      heatBar.style.width = filledArticle.heatWidth || filledArticle.heat;
    }

    const renderList = (selector, items, renderer) => {
      const root = document.querySelector(selector);
      if (!root) return;
      root.innerHTML = items.map(renderer).join("");
    };

    renderList("[data-detail-list='points']", filledArticle.points, (point) => `<li>${point}</li>`);
    renderList(
      "[data-detail-list='timeline']",
      filledArticle.timeline,
      ([time, text, source]) => `
        <div class="timeline-row">
          <span class="timeline-time">${time}</span>
          <span>${text}</span>
          <span class="timeline-source">${source}</span>
        </div>
      `
    );
    renderList(
      "[data-detail-list='sourceMix']",
      filledArticle.sourceMix,
      ([type, weight]) => `
        <div class="source-mix-row">
          <span class="source-type">${type}</span>
          <span class="source-weight">${weight}</span>
        </div>
      `
    );
    renderList(
      "[data-detail-list='related']",
      filledArticle.related,
      ([rank, title, id]) => `
        <a class="related-row" href="details.html?id=${id}">
          <span>${title}</span>
          <span class="related-rank">${rank}</span>
        </a>
      `
    );
  };

  hydrateDetailPage();
})();
