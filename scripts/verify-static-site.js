const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const baseUrl = process.env.SITE_URL || "http://localhost:8000";
const screenshotDir = path.join(process.cwd(), ".superpowers", "verification");

async function assertText(page, text) {
  const count = await page.getByText(text, { exact: false }).count();
  if (count === 0) {
    throw new Error(`Missing expected text: ${text}`);
  }
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) {
    throw new Error(`${label} has horizontal overflow`);
  }
}

async function main() {
  fs.mkdirSync(screenshotDir, { recursive: true });

  const launchOptions = { headless: true };
  if (process.env.BROWSER_EXECUTABLE) {
    launchOptions.executablePath = process.env.BROWSER_EXECUTABLE;
  }

  const browser = await chromium.launch(launchOptions);

  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    await desktop.goto(baseUrl, { waitUntil: "networkidle" });
    await assertText(desktop, "AI Agent 企业落地进入加速周");
    await assertText(desktop, "TODAY TOP RANKING");
    await assertText(desktop, "HOT NEWS");
    await assertText(desktop, "BY SOURCE");
    await assertText(desktop, "BY DATE");
    await assertNoHorizontalOverflow(desktop, "desktop homepage");
    await desktop.screenshot({ path: path.join(screenshotDir, "home-desktop.png"), fullPage: true });

    const searchShellCount = await desktop.locator(".search-shell, .search-panel, #searchInput").count();
    if (searchShellCount !== 0) {
      throw new Error("Homepage contains a prominent search UI");
    }

    const pages = [
      ["sources.html", "按资讯来源浏览"],
      ["dates.html", "按日期回看热点"],
      ["topics.html", "AI 产业专题线索"],
      ["search.html", "搜索 AI 资讯信号"]
    ];

    for (const [path, heading] of pages) {
      await desktop.goto(`${baseUrl}/${path}`, { waitUntil: "networkidle" });
      await assertText(desktop, heading);
      await assertNoHorizontalOverflow(desktop, path);
    }

    await desktop.goto(`${baseUrl}/search.html`, { waitUntil: "networkidle" });
    await desktop.locator("#searchInput").fill("端侧模型");
    await desktop.locator("#searchButton").click();
    await assertText(desktop, "已为「端侧模型」生成静态示例结果。");

    const mobile = await browser.newPage({ viewport: { width: 390, height: 900 }, isMobile: true });
    await mobile.goto(baseUrl, { waitUntil: "networkidle" });
    await assertText(mobile, "AI Agent 企业落地进入加速周");
    await assertNoHorizontalOverflow(mobile, "mobile homepage");
    await mobile.screenshot({ path: path.join(screenshotDir, "home-mobile.png"), fullPage: true });

    console.log("static-site verification passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
