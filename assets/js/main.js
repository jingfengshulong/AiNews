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
})();
