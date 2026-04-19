# AI News Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished static frontend prototype for an AI information website whose homepage prioritizes today's hot news, signal statistics, and calm classification entry points.

**Architecture:** Use a plain static site with shared CSS and JavaScript. `index.html` is the flagship homepage; secondary pages reuse the same visual system and navigation. No backend, build step, or external API is required.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, responsive CSS grid, CSS animations.

---

## File Structure

- Create: `index.html`
  - Homepage with header navigation, hero hot story, hot ranking list, statistics strip, source/date entry points, and live ticker.
- Create: `sources.html`
  - Static source archive page grouped by source type.
- Create: `dates.html`
  - Static date archive page grouped by today, yesterday, and week.
- Create: `topics.html`
  - Static topic page for AI news themes.
- Create: `search.html`
  - Secondary search page with visual-only search input and results.
- Create: `assets/css/styles.css`
  - Shared design system, layout, responsive behavior, and animations.
- Create: `assets/js/main.js`
  - Small progressive enhancements: active nav state, current date label, visual search interactions, and reduced-motion support.

## Task 1: Create Shared Visual System

**Files:**
- Create: `assets/css/styles.css`

- [ ] **Step 1: Create the CSS file**

Add CSS variables for the dark editorial technology palette, global reset, typography, layout containers, navigation, line-based sections, hot story treatment, rankings, stats strip, archive lists, secondary pages, hover states, and responsive breakpoints.

- [ ] **Step 2: Include these required design rules**

The CSS must include:

```css
:root {
  --bg: #071014;
  --bg-2: #0d171b;
  --ink: #edf6f8;
  --muted: #8a9aa1;
  --line: rgba(221, 242, 247, 0.15);
  --cyan: #00c8e8;
  --lime: #b7f15e;
  --amber: #f1bd4a;
  --red: #ff6257;
  --radius: 8px;
}
```

Also include `@keyframes scan`, `@keyframes heat`, and `@keyframes ticker` for subtle motion.

- [ ] **Step 3: Check for clutter-prone styles**

Run:

```powershell
Select-String -Path assets\css\styles.css -Pattern "box-shadow|border-radius|card"
```

Expected: Few shadows, border radius no higher than `8px`, and no generic nested-card system.

## Task 2: Build Homepage

**Files:**
- Create: `index.html`

- [ ] **Step 1: Add page structure**

Create semantic sections in this order:

```html
<header class="site-header">...</header>
<main>
  <section class="home-hero">...</section>
  <section class="signal-strip">...</section>
  <section class="home-archives">...</section>
  <section class="live-ticker">...</section>
</main>
```

- [ ] **Step 2: Add required content**

The homepage must include:

- Brand: `Signal Daily`.
- Navigation links to `index.html`, `sources.html`, `dates.html`, `topics.html`, and `search.html`.
- One dominant hot story titled `AI Agent 企业落地进入加速周`.
- Three supporting ranked stories.
- Four statistics: 今日热点, 新增来源, 最高主题, 信号分数.
- Source entry points: 科技媒体, 论文与研究, 投融资, 政策监管.
- Date entry points: 今天, 昨天, 本周.

- [ ] **Step 3: Verify search is secondary**

Run:

```powershell
Select-String -Path index.html -Pattern "search-panel|search-shell|搜索："
```

Expected: no output. The homepage should only contain a compact search navigation link/icon.

## Task 3: Build Secondary Pages

**Files:**
- Create: `sources.html`
- Create: `dates.html`
- Create: `topics.html`
- Create: `search.html`

- [ ] **Step 1: Add shared header**

Each page must reuse the same header/nav as the homepage and set the active navigation item using `data-page`.

- [ ] **Step 2: Add source archive page**

`sources.html` contains four source groups: 科技媒体, 论文与研究, 投融资, 政策监管. Each group includes 2-3 sample rows with headline, source name, and heat value.

- [ ] **Step 3: Add date archive page**

`dates.html` contains date groups: 今天, 昨天, 本周. Each group includes sample rows and compact metadata.

- [ ] **Step 4: Add topic page**

`topics.html` contains topic lanes for AI Agent, 大模型产品, AI 视频, 端侧模型, and 政策监管.

- [ ] **Step 5: Add secondary search page**

`search.html` contains a visual-only search field, filter chips, and sample result rows. It should feel like a secondary tool page, not the homepage.

## Task 4: Add JavaScript Enhancements

**Files:**
- Create: `assets/js/main.js`

- [ ] **Step 1: Add active navigation behavior**

Use `document.body.dataset.page` to mark matching nav links active.

- [ ] **Step 2: Add current date label**

Fill any `[data-current-date]` element with a Chinese locale date string.

- [ ] **Step 3: Add visual-only search interaction**

On `search.html`, let the search button update a small status line such as `已生成静态示例结果`. Do not fetch data.

- [ ] **Step 4: Respect reduced motion**

If `prefers-reduced-motion` is enabled, add a `reduce-motion` class to the document root.

## Task 5: Verify Static Site

**Files:**
- Read: all created files

- [ ] **Step 1: Validate expected files exist**

Run:

```powershell
Test-Path index.html, sources.html, dates.html, topics.html, search.html, assets\css\styles.css, assets\js\main.js
```

Expected: all entries are `True`.

- [ ] **Step 2: Search for accidental backend code**

Run:

```powershell
Select-String -Path *.html,assets\js\main.js -Pattern "fetch\\(|XMLHttpRequest|api/"
```

Expected: no output.

- [ ] **Step 3: Check responsive and visual rendering**

Start a static server:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000` and verify:

- Homepage top story is visually dominant.
- Search is only a compact nav entry on the homepage.
- Hot ranking, stats, source/date sections are scannable.
- Secondary pages share the same visual system.
- Mobile viewport stacks without text overlap.

