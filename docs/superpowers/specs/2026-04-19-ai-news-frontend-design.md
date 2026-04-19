# AI 资讯网站前端设计 Spec

## Goal

Build a static frontend prototype for an AI news and information website. The site should feel like a polished technology front page, not a search dashboard. The homepage prioritizes today's hottest stories, key signal statistics, and simple entry points into source and date archives. Backend search, scraping, ranking, and data logic are out of scope.

## Design Direction

The approved direction is **清爽科技头版**.

The page should look like a high-end AI industry briefing product:

- Dark, clean, editorial, and technology-driven.
- Clear visual hierarchy with one dominant top story.
- Sparse layout with line-based structure instead of many boxed cards.
- Search is secondary, exposed as a compact icon or lightweight entry point.
- Motion is subtle and purposeful: background scan, heat line animation, live ticker, and hover transitions.

The interface should avoid a dense dashboard feel. It should not stack many equal-weight blocks or make the homepage feel like a control panel.

## Homepage Information Architecture

The homepage contains these sections in order:

1. Header navigation
   - Brand identity.
   - Navigation links: 今日热点, 来源, 日期, 专题.
   - Compact search icon on the right.

2. Hero hot story
   - One large "most explosive today" story.
   - Large editorial headline.
   - Short AI-generated style summary.
   - Animated heat indicator.

3. Hot ranking
   - Three supporting hot news items beside or below the main story.
   - Each item includes rank number, headline, and a short summary.
   - The list should feel linear and calm, not like separate heavy cards.

4. Statistics strip
   - Four concise metrics, for example:
     - 今日热点数量.
     - 新增来源数量.
     - 最高热度主题.
     - 今日信号分数.
   - The strip should be horizontal on desktop and stacked on mobile.

5. Classification entry points
   - Source categories: 科技媒体, 论文与研究, 投融资, 政策监管.
   - Date categories: 今天, 昨天, 本周.
   - These are navigation previews only. Full filtering belongs on separate pages.

6. Live ticker
   - A subtle moving line of current updates.
   - It reinforces real-time technology feeling without adding visual clutter.

## Secondary Pages

The prototype may include static page shells for:

- Source archive page.
- Date archive page.
- Topic/special page.
- Search page.

These pages should reuse the same header, dark theme, line-based layout, and typography. They can be less elaborate than the homepage, but should feel complete enough to demonstrate navigation.

Search should live primarily on its own page. The homepage search control should route visually to that page rather than becoming the main homepage feature.

## Visual System

Use a dark technology editorial palette:

- Near-black background.
- Soft off-white text.
- Muted gray-blue secondary text.
- Cyan for system/technology accents.
- Lime, amber, or red only for heat, status, and ranking emphasis.

Use clean typography:

- Sans-serif Chinese UI font for navigation, summaries, and labels.
- A stronger editorial display treatment for the main headline.
- Monospace only for small system labels, metrics, ticker, and ranks.

Layout principles:

- Prefer lines, bands, and spacing over heavy cards.
- Keep border radius modest, 8px or less.
- Avoid nested cards.
- Keep homepage content scannable in one first viewport where possible.
- Ensure mobile stacks cleanly without overlapping text.

## Interaction And Motion

Static frontend interactions should include:

- Hover states on navigation links and list rows.
- Animated heat line on the main story.
- Slow scan-line or grid-light movement in the background.
- Horizontal live ticker.
- Navigation between static pages.

Motion must remain subtle. It should make the site feel live and technical, not busy.

## Scope

In scope:

- Static HTML/CSS/JS frontend.
- Responsive layout for desktop and mobile.
- Polished homepage.
- Static secondary page shells.
- Sample AI news content.
- Visual-only navigation and interactions.

Out of scope:

- Backend scraping or search logic.
- Real API integration.
- User accounts.
- Admin tools.
- Persisted data.

## Acceptance Criteria

- Homepage clearly prioritizes today's hot news, not search.
- Search is visibly secondary.
- Page feels beautiful, modern, and IT-oriented without clutter.
- There are fewer large boxes than the rejected dashboard-style iteration.
- Statistics and category/date entries are easy to scan.
- Layout works on desktop and mobile.
- Visual motion is present but controlled.
