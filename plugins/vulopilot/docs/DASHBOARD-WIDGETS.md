# VuloPilot — Dashboard widgets

Companion to [`DATABASE.md`](DATABASE.md), [`SCANNERS.md`](SCANNERS.md),
[`RULE-ENGINE.md`](RULE-ENGINE.md), [`AI-ARCHITECTURE.md`](AI-ARCHITECTURE.md),
[`AI-ACTIONS.md`](AI-ACTIONS.md), [`AI-CRAWLER-ANALYTICS-MODULE.md`](AI-CRAWLER-ANALYTICS-MODULE.md),
[`KNOWLEDGE-GRAPH-MODULE.md`](KNOWLEDGE-GRAPH-MODULE.md), and
[`MCP-SERVER-MODULE.md`](MCP-SERVER-MODULE.md). Covers the current 13 Free dashboard widgets (plus
3 more Pro registers via filter), the registry/grid the Dashboard page renders them through, the
REST endpoints that back the grid, and the extension strategy.

**This widget set has been redesigned once since it was first built** — the original 13 widgets
were 7 "one number" stat cards (Overall Health, SEO, Performance, Security, WooCommerce,
Accessibility, AI Usage) plus Recent Activity, Quick Fixes, Health Timeline, Latest Reports,
Pending Approval, and Automation Status. Today's 13 Free widgets are a different set: `registry.ts`'s
own comment explains why — the individual score tiles duplicated the exact same
`category_scores` numbers `HealthPillarsWidget`'s pillar tiles now show in one place, and the
standalone Quick Fixes count duplicated `NeedsAttentionWidget`'s real "Quick fixes" tab, so both
were **removed rather than kept alongside**. Pending Approval was folded into that same
`NeedsAttentionWidget` as a third tab rather than staying a separate card. Four widgets that didn't
exist in the original set are new: `CrawlerTrafficWidget`, `KnowledgeGraphWidget`,
`BrandBreakdownWidget`, and `IssueDistributionWidget`. The count stayed at 13 by coincidence, not
because the set is unchanged.

## Why a widget system instead of one fixed page

The original Dashboard.tsx (built during the admin-UI pass) rendered a
fixed set of stat cards plus one chart plus one findings table. This pass
replaces that with named, independently reorderable/hideable widgets —
because a fixed layout can't be personalized and can't be extended by a Pro module without editing
Dashboard.tsx directly. A registry + grid gives both: a site owner
reorders/hides widgets, and Pro/third-party code adds new ones through a
filter, the same way every other extension point in this codebase works
(`vulopilot_scanner_sources`, `vulopilot_ai_action_sources`, etc.).

## Contracts (`src/dashboard-widgets/types.ts`)

```
DashboardSummary       the /dashboard aggregate payload (below)
WidgetProps            { summary, isLoading, onHide, isCustomizing } — every widget component's props
WidgetDefinition        { id, title, icon, grid, component } — what registry.ts registers
WidgetLayoutEntry       { id, enabled } — one row of a saved layout
```

`grid` maps to a CSS grid column span (`DashboardGrid.tsx`'s `ColumnComponent`), not a fixed pixel
size, so widgets stay responsive at narrow admin-column widths. `isCustomizing` — new since this doc
was first written — is `Dashboard.tsx`'s own "Customize dashboard" header toggle
(local component state, never persisted, so every fresh page load starts read-only), forwarded
through to every widget's shell so drag/hide controls are only reachable while it's on.

No PHP-side `WidgetInterface` exists — widgets are a React rendering
concern with no server-side polymorphism behind them (unlike
`ScannerInterface`/`RuleInterface`/`AIActionInterface`, which really do
have many independent PHP implementations). Inventing a backend contract
for something that's purely "which React component renders in which grid
cell" would be exactly the kind of interface-with-one-real-shape
`SCANNERS.md`'s "no `ScanResultInterface`" reasoning already argues
against.

## The two widget kinds

**Stat widgets** (`StatWidget.tsx`) — today just **three** "one number + one label" widgets
(AI Usage, Content, Brand), each a plain `StatWidgetConfig` object (`registry.ts`), not three
separate component files — the same declarative-config-over-hand-built-JSX
approach `.claude/rules/react-frontend.md`
documents for Settings screens, applied here. `createStatWidgetComponent()`
binds one config into a component matching `WidgetProps`, so the grid
never has to know a widget is config-driven. Overall Health, SEO, Performance, Security,
WooCommerce, Accessibility, and GEO used to be `StatWidgetConfig` entries too — see the redesign
note above for why they were removed rather than kept alongside `HealthPillarsWidget`.

**Standalone widgets** — the other ten (Health by Pillar, Recent Activity, Health Timeline, Needs
Your Attention, Latest Reports, Automation Status, AI Crawler Traffic, Knowledge Graph, Brand
Visibility Breakdown, Issue Distribution) each have real layout differences (a hero score ring, a
list, a chart, tabs) and fetch their own data, so each gets its own component file rather than being
forced into the stat-config shape.

Every widget, of either kind, renders inside `DashboardWidget.tsx` — the
one shell providing the header, loading skeleton, drag handle, and hide
control, so none of that is reimplemented per widget. `isCustomizing` gates the whole drag/hide
`action` block: outside customization mode the shell omits it entirely (not just visually hides it),
so a read-only dashboard can't be reordered or hidden by a stray click.

## `GET /dashboard` — the stat widgets' shared payload

`Controllers/Dashboard.php` returns one aggregate object rather than one
REST call per stat widget (`.claude/rules/performance.md`'s "prefer a
single query" guidance, applied to the frontend's fetch pattern too):

```
overall_score, open_findings, critical_findings, findings_by_severity: { critical, high, medium, low },
active_automations, ai_jobs_used, ai_jobs_quota,
category_scores: { seo, performance, security, accessibility, geo, woocommerce, content, brand }
quick_fixes, pending_approvals,
automation_status: { enabled, disabled }
```

`findings_by_severity` is the one field added to this payload since the doc was first written — it
backs `IssueDistributionWidget`'s donut chart, a pure aggregation of the same open-finding counts
`overall_score` is already computed from (`build_findings_by_severity()`), with `info` excluded
since `calculate_overall_score()`'s own weighting never treats it as an issue needing attention.

**`quick_fixes` is computed but no longer read by anything in the frontend.** The controller still
returns it (see below for what it means), and `Dashboard.tsx`'s `EMPTY_SUMMARY` still zero-fills it,
but `NeedsAttentionWidget`'s own "Quick fixes" tab fetches the real finding list directly
(`useApiList('findings', { category: 'images', status: 'open' })`) instead of reading this number —
`registry.ts`'s own comment explains this was a deliberate de-duplication, not an oversight. The
field is dead weight in the payload contract, not a bug, but it's honest to note nothing renders it
today.

### `category_scores` is computed live, not read from a stored column

`vulopilot_site_health_snapshots` already has `seo_score`/
`performance_score`/`security_score` columns (`DATABASE.md`), but nothing
in this codebase writes them —
`ScanPersistenceListener::refresh_todays_snapshot()` only ever upserts
`overall_score`. Reading those columns here would always return `null`,
indistinguishable from "feature not implemented," which is exactly the
kind of fabricated-looking number this same controller already refuses to
show for AI usage (`ai_jobs_used`/`ai_jobs_quota` are honestly `0`/`0`
until a real usage-metering subsystem exists). Instead each category score
uses `FindingRepository::get_severity_breakdown_for_category()` and the
identical weighting `calculate_overall_score()` already uses, just scoped
to one category's open findings — a real, honest number computed from
data that already exists, not a placeholder.

`woocommerce` is `null` (not `0`) when `class_exists('WooCommerce')` is
false — the same guard `WooCommerceScanner` already uses (`SCANNERS.md`)
— so `HealthPillarsWidget`'s pillar row can skip the tile entirely instead of showing a misleading
perfect or zero score for a category that doesn't apply to the site.

`content` (Content Intelligence, [`CONTENT-INTELLIGENCE-MODULE.md`](CONTENT-INTELLIGENCE-MODULE.md))
is the one entry **not** computed by the single-category loop the others
above share — it spans a fixed `scanner_id` list across two categories
(the `content` category's own `readability` scanner, plus 5 reused
`seo`-category scanners) rather than one category string, via
`calculate_content_score()` and
`FindingRepository::get_severity_breakdown_for_scanner_ids()`. Same
weighting formula, just a different scope mechanism.

`brand` (Brand Intelligence, [`BRAND-INTELLIGENCE-MODULE.md`](BRAND-INTELLIGENCE-MODULE.md))
is the same shape as `content` above — a fixed 7-scanner_id union across
`brand`-relevant scanners (`geo-trust-signals`, `about-page-analysis`, `geo-eeat-signals`,
`geo-author-info`, `author-schema`, `geo-entity-naming-consistency`, `organization-schema`), via
`calculate_brand_score()`. `BrandBreakdownWidget` (below) shows this same score's own named
sub-scores (Trust/Authority/Entity) via a separate, dedicated endpoint rather than this aggregate.

### `quick_fixes` is honest about what's actually wired up

"Quick Fixes" counts open findings in a category that has a matching
one-click `AIAction` already registered — today that's exactly one pairing
(`images` findings ↔ the `generate-alt` action), the same by-convention id
match [`AI-ACTIONS.md`](AI-ACTIONS.md)'s "Recommendations as an input
source" section documents. It is not a general "all fixable findings"
count, because there's no formal Recommendation → Action mapping yet —
counting more than the one real pairing would overstate what VuloPilot can
actually do today.

## `HealthPillarsWidget` — the "at a glance" hero

Replaces the old fixed row of separate score stat cards. One `ScoreRingComponent` for
`overall_score`, plus a row of clickable tiles — one per pillar with a non-null score
(SEO, Performance, Accessibility, GEO, Security, WooCommerce) — each linking to that pillar's own
page (`?page=vulopilot#&tab=X`). Reuses the exact same `AnalyticsComponent` `progress`-variant tiles
the Health page's own `HealthScoreSummary.tsx` already renders (non-clickable there); this widget is
the same tiles with each item's `link` set, making the score also a launcher. Security has no
dedicated page of its own, so its tile routes to the Health tab instead of a dead link —
`NeedsAttentionWidget` below makes the same routing choice for the same reason.

**Not yet wired to real data**: the three trend badges next to the score ring ("+5 this week",
"2 new issues", "12 fixed") are hardcoded literal strings in `HealthPillarsWidget.tsx`, not derived
from `summary` — there's no week-over-week comparison computed anywhere in this codebase yet. Same
for the "Good" label next to the ring, which doesn't vary with the actual score. Worth flagging
plainly rather than leaving implicit, since this is exactly the kind of fabricated-looking number
this same widget's own sibling controller (`Dashboard.php`) is otherwise careful to avoid elsewhere
in this payload.

## `NeedsAttentionWidget` — Quick Fixes, Open Issues, and Pending Approval, tabbed

The three real, honest data sources that used to be three separate cards (Quick fixes, Recent open
issues, Pending approval) combined into one `TabsComponent`-driven widget instead, mirroring the
Dashboard mockup's own tabbed panel rather than three near-duplicate list cards competing for grid
space. Each tab is its own independent `useApiList` call:

- **Quick fixes** — `GET /findings?category=images&status=open`, capped to 5.
- **Open issues** — `GET /findings?status=open&orderby=id&order=desc`, capped to 5; each row routes
  to its category's own tab (same `security → health` routing `HealthPillarsWidget` uses).
- **Pending approval** — `GET /ai-action-runs?status=pending_approval`, capped to 5.

**Approve/Reject are real now, not placeholders.** `Controllers/AiActionRuns.php` has grown two new
routes since this doc was first written — `POST /ai-action-runs/{id}/approve` and
`POST /ai-action-runs/{id}/reject` — both wired straight to `AiCopilot\ActionRunner::approve()`/
`reject()` (the full propose → approval → execution lifecycle `AI-ACTIONS.md` designed). The Pending
Approval tab's rows render real Approve/Reject controls that call these routes and refetch the tab
on success — the "no Approve/Reject buttons, because the routes don't exist" gap this doc used to
describe has been closed.

**Rollback is the one part still not reachable from the UI.** `POST /ai-action-runs/{id}/rollback`
exists on the same controller and is fully implemented server-side, but nothing under `src/` calls
it — there's no rollback button anywhere in this widget or elsewhere in the Dashboard. A previously
executed AI action can only be rolled back today by calling the REST route directly (cURL, WP-CLI's
own generic REST bridge, etc.), not through any built UI.

## List-shaped widgets call their own endpoints

Recent Activity, Latest Reports, and Automation Status's row list are
**not** part of the `/dashboard` payload — each calls the
same dedicated list endpoint its full page already uses
(`/activity-logs`, `/reports`, `/automations`), capped to 5 rows via
`per_page`, through the existing `useApiList` hook. Health Timeline calls
`/site-health-snapshots` the same way. This avoids duplicating list data inside the summary
aggregate and keeps each widget's data source identical to its full-page equivalent.

**Health Timeline degrades on Free-only installs, deliberately.** `/site-health-snapshots` only
exists at all once `vulopilot-pro`'s `AdvancedReports` module registers it via the
`vulopilot_rest_controllers` filter (`EXTENSION-SDK.md`) — on a Free-only install this request 404s
every single time, which is the expected, permanent state, not a transient failure a "Retry" button
could fix. `HealthTimelineWidget.tsx` treats "failed to load" and "loaded zero rows" as the same
friendly empty state for exactly that reason, rather than surfacing an error+retry card for
something retrying can't fix.

## `IssueDistributionWidget` — open findings by severity, as a donut

New since this doc was first written. Reads `summary.findings_by_severity` (see the payload section
above) straight off the shared `/dashboard` response — no dedicated endpoint of its own, since it's
a single small object already in the aggregate. Renders a `ChartComponent` pie chart, one slice per
non-zero severity, using the same severity color convention (`critical`/`high`/`medium`/`low`)
`NeedsAttentionWidget`'s badges and the findings tables elsewhere already use.

## `BrandBreakdownWidget` — Brand Intelligence's named sub-scores

New since this doc was first written. Fetches its own data (`GET /brand-intelligence/score`,
`Controllers/BrandIntelligence.php`) rather than reading off the shared `/dashboard` summary, same
reasoning list-shaped widgets above already follow. Shows the same overall `brand` category score
`HealthPillarsWidget`/the old Brand stat tile would show, broken into its three real, deterministic
named components (Trust/Authority/Entity) as a bar chart — no competitor share-of-voice data exists
anywhere in this codebase (that would need an external source like Ahrefs, which isn't wired up), so
this shows the three real sub-scores VuloPilot itself computes instead of fabricating a competitive
comparison.

## `KnowledgeGraphWidget` (Free) and `knowledge-graph-health` (Pro)

Free's own `knowledge-graph` widget ([`KNOWLEDGE-GRAPH-MODULE.md`](KNOWLEDGE-GRAPH-MODULE.md)) is a
plain `STANDALONE_WIDGETS` entry — a Dashboard-level teaser for the Knowledge Graph page, fetching
`GET /entities` directly and condensing it to a per-type count row (People/Organizations/
Products/Services/Locations/Categories). `vulopilot-pro`'s own `KnowledgeGraph` module adds a
second widget via `vulopilot_dashboard_widgets`, `knowledge-graph-health`, surfacing the most recent
row from `vulopilot_kg_health_history` (`DATABASE.md`, table 21) instead of live entity counts.
Since Pro's own webpack bundle can't import Free's internal `DashboardWidget.tsx` chrome component
or `WidgetProps` type across the plugin boundary, the Pro widget renders its own self-contained
markup via `@zyra/components` instead — the same constraint every other cross-plugin filter slot in
this codebase already works within.

## `CrawlerTrafficWidget` (Free) and `ai-monitoring` (Pro) — two different AI-crawler widgets

Easy to conflate, so worth being explicit: these are two separate widgets with two separate data
sources, both about AI crawler traffic but not interchangeable.

- **`crawler-traffic`** (Free, `STANDALONE_WIDGETS`) — a Dashboard-level teaser for the Crawler
  Traffic page, new since this doc was first written. Fetches the same `GET /crawler-traffic/summary`
  endpoint the full `CrawlerTraffic.tsx` page's `CrawlerSummaryCard.tsx` already uses, condensed to
  total visits over the last 30 days plus the top 3 bots by last-seen — reading real rows out of
  `vulopilot_crawler_visits` (`DATABASE.md`, table 14), not a Pro-only capability.
- **`ai-monitoring`** (Pro, registered via `vulopilot_dashboard_widgets`) — `vulopilot-pro`'s
  `AiCrawlerAnalytics` module ([`AI-CRAWLER-ANALYTICS-MODULE.md`](AI-CRAWLER-ANALYTICS-MODULE.md))
  surfaces the most recent AI Crawler Alerts check (`CrawlerAlertMonitor`'s own
  `vulopilot_activity_logs` entry) instead — an alert/monitoring feed, not a traffic summary. Same
  "renders its own markup, can't import Free's chrome" constraint as `knowledge-graph-health` above.

## `mcp-server-status` — the third Pro-registered widget

`vulopilot-pro`'s `McpServer` module ([`MCP-SERVER-MODULE.md`](MCP-SERVER-MODULE.md)) registers
`McpServerStatusWidget.tsx` into Free's Dashboard grid via `vulopilot_dashboard_widgets`, the same
pattern `ai-monitoring`/`knowledge-graph-health` already use — a small status tile so an admin can
tell whether the MCP server endpoint is enabled without leaving the Dashboard, degrading gracefully
to "disabled" rather than erroring when the module itself is off.

## Drag-and-drop layout: `GET`/`POST /dashboard-layout`

Persisted as **user meta** (`Utill::DASHBOARD_LAYOUT_META_KEY`), not a row
in `VULOPILOT_SETTINGS_KEY`'s shared `wp_options` settings blob — a widget
arrangement is a personal UI preference, the same category of thing
WordPress core's own dashboard already stores per-user
(`meta-box-order_{screen}`), not site-wide configuration every admin
shares. `Utill::DASHBOARD_WIDGET_IDS` is the canonical id whitelist both
`DashboardLayout.php` and `registry.ts` agree on by convention (the same
id-matching convention `AI-ACTIONS.md` already uses between Rule ids and
Action ids) — `update_item()` silently drops any id not on this list, so a
client can never persist a widget id it invented. The whitelist has **15 entries** today: the 12
Free widget ids (`ai-usage`, `health-timeline`, `latest-reports`,
`needs-attention`, `automation-status`, `crawler-traffic`, `health-pillars`, `content`, `brand`,
`knowledge-graph`, `brand-breakdown`, `issue-distribution`) plus the 3 Pro-registered ones
(`ai-monitoring`, `knowledge-graph-health`, `mcp-server-status`).

**Reconciliation, not raw storage**: `get_reconciled_layout()` merges the
saved layout against the canonical id list every time it's read — any
widget id that exists but isn't in a user's saved layout yet (a widget
added after they last customized their order) is appended, enabled by
default; any saved id no longer on the canonical list is dropped. This is
what made adding all four of the newer widgets above (`crawler-traffic`, `knowledge-graph`,
`brand-breakdown`, `issue-distribution`) additive-safe instead of silently invisible to existing
users forever, and what will do the same for any future 17th widget.

## Drag-and-drop mechanism: `react-sortablejs`

`DashboardGrid.tsx` uses `ReactSortable` from `react-sortablejs` — not a
new drag-and-drop dependency choice: `react-sortablejs`/`sortablejs` are
already declared `peerDependencies` of `@multivendorx/zyra`, and are the
exact primitive Zyra's own `packages/builders/src/EditPanel/PanelEditor.tsx`
already uses for its drag-and-drop block canvas. Using the same library
here follows the dominant drag-and-drop pattern this monorepo already has,
rather than introducing dnd-kit, react-beautiful-dnd, or anything else
undocumented. `handle=".widget-drag-handle"` restricts dragging to
`DashboardWidget.tsx`'s drag-handle icon specifically, so clicking
anywhere else on a widget (a button inside it, its content) never
accidentally starts a drag. Sortability itself is also gated by
`isCustomizing`: outside customization mode the grid renders the same visible widgets as a plain,
non-sortable list with no `ReactSortable` wrapper at all.

Hidden widgets aren't unmounted with no way back — `DashboardGrid.tsx`
renders a "Hidden widgets" chip row beneath the grid (only while `isCustomizing` is on) so a widget
hidden by mistake can be restored with one click, rather than only being
recoverable by clearing all user meta.

## Extension strategy

Identical shape to every other registry in this codebase
(`vulopilot_scanner_sources`, `vulopilot_ai_action_sources`, …), applied
to the one React-side registry:

1. **A new Free widget**: add a `WidgetDefinition` (or `StatWidgetConfig`
   if it's a single-number tile) to `registry.ts`, and its id to
   `Utill::DASHBOARD_WIDGET_IDS` so a saved layout can include it.
2. **A Pro or third-party widget**: register via
   `addFilter('vulopilot_dashboard_widgets', ...)` from Pro's own
   `src/index.tsx` — the same `@wordpress/hooks` mechanism
   `.claude/rules/react-frontend.md` already
   documents, applied to
   VuloPilot's own filter naming (`vulopilot_` prefix, no `_pro` infix,
   per `.claude/rules/php-wordpress.md`'s hook-naming convention extended
   to the JS side). Its id must also be added to
   `Utill::DASHBOARD_WIDGET_IDS`, license-gated the same way every other
   Pro capability is (`plugin-families.md`), and — since it can't import Free's
   `DashboardWidget.tsx` chrome across the plugin boundary — renders its own self-contained markup,
   the pattern `ai-monitoring`/`knowledge-graph-health`/`mcp-server-status` all three already
   establish.

## What's not here yet

- **A rollback trigger on the Pending Approval tab** — `POST /ai-action-runs/{id}/rollback` exists
  and works, but nothing in `NeedsAttentionWidget.tsx` or anywhere else under `src/` calls it.
  Approve/Reject were closed in this pass; Rollback wasn't.
- **Real week-over-week trend data on `HealthPillarsWidget`** — the "+5 this week"/"2 new
  issues"/"12 fixed" badges next to the score ring are hardcoded strings, not computed from
  `summary` or any stored history.
- **A per-widget settings/configuration UI** (e.g. choosing how many rows
  Recent Activity or a `NeedsAttentionWidget` tab shows) — every widget's row count is a fixed
  constant today (`per_page: 5`).
- **Real WooCommerce/accessibility score columns** —
  `category_scores.woocommerce`/`.accessibility` are computed live from
  findings (see above) rather than from a `vulopilot_site_health_snapshots`
  column, because no column for either exists in that table's schema
  (`DATABASE.md`) — only `seo_score`/`performance_score`/`security_score`/
  `uptime_score` do, and none of those four are populated yet either.
- **A "reset to default layout" action** — a user who reorders/hides
  widgets today has no one-click way back to
  `DEFAULT_DASHBOARD_WIDGETS`'s order beyond restoring each hidden widget
  individually.
