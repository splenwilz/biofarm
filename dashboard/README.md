# Biofarm marketing dashboard

Shows the two measures marketing is judged on, qualified inbound
opportunities per month and cost per qualified opportunity (media spend only),
plus enquiries by source, a developer/landowner split and an enquiry-month
cohort view. The plan behind it, with the Pipedrive findings and the proposed
KPI rule, is in the private artifact linked from the project memory.

## Status

Frontend first. v1 runs on **demo data** generated in `src/data/demo.ts`,
shaped like the real Pipedrive account (same pipelines, channels, volumes and
attribution labels). Every number on screen is marked "Demo data" until the
backend-backed source replaces it. Nothing here is behind a login yet; do not
deploy it with real data until it is.

## Stack

- Next.js 16 (App Router, Turbopack, Cache Components on), React 19, TypeScript
- Material UI 9 via `@mui/material-nextjs/v16-appRouter`, MUI X Charts 9 (MIT)
- Vitest 5 + React Testing Library, per the Next.js testing guide

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit + component tests
npm run typecheck  # next typegen && tsc --noEmit
npm run lint
npm run build      # proves every route prerenders under Cache Components
```

## Layout

The shell follows the BoothIQ dashboard: a persistent 256px sidebar (logo
block, grouped navigation with a tinted active pill, person footer), a sticky
64px top bar carrying the global filters, and the page in `<main>`. Below the
`lg` breakpoint the sidebar becomes a modal drawer behind a menu button.

| Route | Page |
|---|---|
| `/` | Overview: four tiles (qualified, cost per qualified, enquiries, speed to lead) with month-on-month change, same month last year and sparklines; 12- or 24-month trend with notes pinned to months; top-source meters; latest cohorts as a heatmap |
| `/sources` | Source meters (paid search split into Google and Microsoft), enquiries by form, and what became of marketing's opportunities by source (won, open, lost) |
| `/campaigns` | Spend, enquiries, cost per enquiry, qualified and cost per qualified per campaign, joined on the campaign name; landing pages |
| `/cohorts` | Cohort heatmap: twelve months by three horizons, mature average in the header |
| `/traffic` | Sessions by month and by channel, session-to-enquiry conversion |
| `/newsletter` | Subscribers, last-issue open and click rates, one meter per issue, subscribers by month |
| `/search` | Brand searches against target, AI referral sessions, AI mention share, referrals by assistant |
| `/events` | Trade shows, CPD sessions and webinars: attendees, leads, qualified |
| `/spend` | Spend and CPQO tiles; by-platform spend with the opportunities each platform paid for and its own cost per opportunity; spend by month; add, remove and CSV-import lines |
| `/alerts` | Rules that fired: stale data, missing spend, below target, cost jump, unattributed deals, unanswered enquiries; the sidebar and bell carry the count |
| `/data-quality` | Gaps that distort the numbers, speed to lead, and the list of deals to fix in Pipedrive |
| `/report` | The month on one page: print to PDF, copy the summary text, export, and the delivery schedule settings |
| `/kpi-rule` | The rule spelled out from `src/config/kpi.ts`: targets anyone can change (logged: who, old, new, when), the qualified ramp and this month's target, the five draft qualification checks as switches, data sources, data status |

Every page has **Export CSV** of what it shows, and a print stylesheet drops the sidebar and top bar. Under the route group, `loading.tsx` draws a skeleton while data loads and `error.tsx` keeps the shell and offers a retry; the app-level `not-found.tsx` points home.

**Filters live in the URL** (`?audience=developer&month=2026-09`), the way
BoothIQ carries `?booth=`. The audience switcher and month select in the top
bar rewrite the current URL; every sidebar link preserves the filters. Defaults
(all audiences, last complete month) are omitted so canonical URLs stay clean.

## Where things are

| Path | What |
|---|---|
| `src/config/kpi.ts` | The KPI definition: target and its ramp, the draft qualification checks (`QUALIFICATION_CHECKS`, all off until agreed), pipelines, inbound vs network channels, cohort horizons. Change the rule here, nowhere else. |
| `src/lib/types.ts` | Domain records (`Deal`, `Enquiry`, `SpendEntry`) the backend will produce. |
| `src/lib/kpi.ts` | Pure calculations: qualified by month, spend and CPQO, `qualifiedTargetForMonth` (the ramp), `passesChecks` (the draft checks that are on, applied inside the one qualified-deal test every page uses), `inboundSourceGroups` (inbound channels by the shared names), source groups (`sourceOf` maps a source/medium label or Pipedrive channel to one of eight groups and a platform inside it; `enquiriesBySource` joins spend for cost per qualified on paid groups), cohorts. |
| `src/lib/report.ts` | `buildReport()`: everything the pages show, derived once from records + config + filters. |
| `src/lib/pipedrive.ts` | Links into Pipedrive (`pipedriveDealUrl`); set `NEXT_PUBLIC_PIPEDRIVE_COMPANY_DOMAIN` to the company subdomain, else links go via app.pipedrive.com. |
| `src/lib/channelNames.ts` | The one list of channel names (`CHANNEL_NAMES`); the Sources groups come from it and `channelName()` maps GA4 traffic channels onto it, so a channel has one name on every page. |
| `src/lib/channels.ts` | `newsletterReport()` and `searchReport()` for the two channel pages. |
| `src/lib/insights.ts` | Campaigns, landing pages, forms, outcomes, traffic, events, speed to lead, data quality, alert rules, the summary text. |
| `src/lib/filters.ts` | URL filter parsing and link building: `audience`, `month` (the month the period ends on; headline tiles show it) and `window` (1, 3 or 12 months for the breakdowns, default 3). |
| `src/data/source.ts` | The `DataSource` interface. `src/data/index.ts` picks the implementation. |
| `src/data/api.ts` | The backend feed: `GET /v1/dashboard` on the lead API with `x-dashboard-token`, server-only, never cached; `selectDataSource` picks it when `DASHBOARD_API_URL` and `DASHBOARD_API_TOKEN` are set, else demo. |
| `src/data/demo.ts` | Deterministic demo data (seeded), 24 months so year-on-year figures exist. |
| `src/lib/csv.ts` | CSV writer for exports and the spend CSV reader (month, platform, campaign, amount). |
| `src/components/DashboardProvider.tsx` | Client context: the loaded records, KPI config, and what was entered this session: spend, chart notes, events and their edits (`events`, `addEvent`, `updateEvent`, `removeEvent`), target changes with their log (`setTargets(patch, who)`, `targetLog`) and the draft check switches (`setCheck`). |
| `src/components/SpendDialog.tsx`, `SpendImport.tsx`, `SpendPanel.tsx` | Media spend entry: the "Add spend" dialog and "Import CSV" button in the page header, and the month's lines with a remove control. |
| `src/components/EventDialog.tsx` | One dialog for adding an event and editing it later: name, date, type, attendees, leads and cost (stand, travel, fees). Opened from the Events header button and from each row's edit control. |
| `src/components/shell/` | `AppShell` (sidebar, top bar, drawer), `nav.ts` (the menu), `useFilters` (URL filters), inline Heroicons. |
| `src/components/charts/` | `BarTable` (bar in its own column, printed numbers, optional sparkline column and expandable child rows), `MeterList`, `CohortHeatmap`, `ColumnChart`, `JoinedLeftChart` (joined above zero, left below, net written above each month), `ChartNotes` (the shared note markers), `OutcomeBars` and `palette.ts` (one hue does the work; grey for context; a light-to-dark ramp for magnitude). |
| `src/components/pages/` | One client component per route, all reading `useReport()`, which also returns `period` (the month and the breakdown window as words) so every card and section can name the window it covers. `WindowToggle` sits on the Sources and Campaigns headers. |
| `src/app/(dashboard)/` | Route group: the layout loads data once and wraps the shell; each `page.tsx` is a thin server file with its title. |
| `src/theme.ts` | Brand palette on MUI: `#F5F6F1` canvas, `#212121` text, `#71977A` green with black text. |

## Swapping in the backend

1. Implement `DataSource.getDashboardData()` against the reports API
   (deals with `qualifiedAt`, `channel`, `sourceLabel`, `personId`; enquiries;
   persisted spend) and set `source: "pipedrive"`.
2. Point `src/data/index.ts` at it. Under Cache Components, give the fetch a
   `'use cache'` + `cacheLife`, or the layout's Suspense boundary will stream it.
3. Move spend (`addSpend`, `removeSpend`, `importSpend`), notes, events and their costs (`addEvent`, `updateEvent`), targets with their change log, the check switches and the report schedule in `DashboardProvider` from local state to the API (the log's "who" comes from the sidebar placeholder until sign-in exists); the demo-data banner in `AppShell` goes by itself once `data.source` is not `demo`; the scheduler that sends the summary is server-side.
4. Add the login before any real data is served, and replace `SHELL_USER` in
   `src/components/shell/nav.ts` with the signed-in person.

## Design notes

- The headline month is the last complete month at sync time, because the
  monthly meeting reviews a finished month; the top bar can pick any of the
  last twelve.
- CPQO always divides total spend by all-audience opportunities: spend cannot
  be split by developer vs landowner. The tile says so.
- Cohorts match enquiries to deals by Pipedrive person id; a cohort is marked
  "still maturing" until 150 days after its month end (the sales cycle).
- Network (Introducer, Existing Network) deals are drawn on the trend chart in
  grey for context and are excluded from marketing's number and the source
  table.
- Charts follow the dataviz rules: one accent hue with grey for context, no dual axes (spend and CPQO are two charts), numbers always printed beside meters and in heatmap cells. One view per page: no second rendering of the same figures.
- Delta lines use semantic green/red (`success`/`error` in the theme), not the
  brand green, which the brand rules keep off light grounds as text.
