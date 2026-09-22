# VuloPilot — AI Visibility module

Companion to [`GEO-MODULE.md`](GEO-MODULE.md), [`SEO-MODULE.md`](SEO-MODULE.md),
[`SCANNERS.md`](SCANNERS.md), [`DASHBOARD-WIDGETS.md`](DASHBOARD-WIDGETS.md),
[`AI-ACTIONS.md`](AI-ACTIONS.md), and to `vulopilot-pro`'s own
[`GEO-INSIGHTS-MODULE.md`](../../../../plugins/vulopilot-pro/docs/GEO-INSIGHTS-MODULE.md)
and
[`ONE-CLICK-FIX-MODULE.md`](../../../../plugins/vulopilot-pro/docs/ONE-CLICK-FIX-MODULE.md).
"AI Visibility" isn't a new, separate system —
it's the existing GEO/AEO feature set (`GeoAnalysis\GeoAnalyzer`, the 10 free
GEO/AEO scanners, GEO-MODULE.md's per-post scoring, and vulopilot-pro's
GeoInsights/OneClickFix modules), extended to close the specific gaps a full
feature audit against a requested Free/Pro checklist turned up. This file
covers what was already there, what's genuinely new, and why — nothing here
duplicates GEO-MODULE.md, it only adds to it.

## Audit: requested vs. already-shipped

Before writing any code, every requested item was checked against what
already existed, since re-implementing an already-shipped feature (or
silently moving it behind a paywall it was never behind) would violate this
codebase's own "don't introduce duplicated systems" rule.

**Already shipped, unchanged by this pass:**

| Requested | Already implemented as |
|---|---|
| AI Visibility Scanner / GEO Scanner | The 9 `geo`-category scanners (GEO-MODULE.md) |
| Visibility Score | `GeoAnalyzer::analyze()`'s `overall_score` (per-post) |
| Missing FAQ Detection | `GeoFaqOpportunityScanner` |
| Missing Author Detection | `GeoAuthorInfoScanner` |
| Recommendations | `GeoAnalyzer`'s AI-generated suggestions list |
| Dashboard Widget | `geo` stat widget (`registry.ts`, backed by `Dashboard.php`'s `category_scores.geo`) |
| Report | `Reports\Types\AiVisibilityReport` (category `geo`) |
| Manual Scan | `ScanRunner`, already supports category `geo` |
| Scheduled Visibility Scans (Pro) | `GeoInsights\VisibilitySnapshotScheduler` |
| Citation Opportunities (Pro on the request, but already Free) | `GeoCitationOpportunityScanner` — left in Free; see "Tier corrections" below |
| Entity Recommendations (Pro on the request, but already Free) | `GeoEntityNamingConsistencyScanner` + `normalize-entity-naming` AI action — left in Free |
| AI Optimization (Pro) | The 8 existing GEO AI actions (`GenerateFaqAction`, `GenerateSummaryBlockAction`, `generate-author-bio`, `create-trust-page`, `soften-unsourced-claims`, `split-long-paragraphs`, `fix-heading-hierarchy`, `normalize-entity-naming`) — not to be confused with `add-subheadings`/`generate-schema`, which pair with SEO-category findings (`HeadingStructureScanner`/`SchemaScanner`), not GEO ones |

**Tier correction, not a new feature:** two requested Pro items
("Citation Opportunities", "Entity Recommendations") already ship in Free.
Moving them behind Pro would mean regressing a shipped Free feature, so
they stay exactly where they are — this file just documents the mapping
rather than duplicating a second, Pro-gated copy of either.

## What's genuinely new in this pass

### Free

**`AeoSchemaScanner`** (`classes/Scanners/Basic/AeoSchemaScanner.php`, id
`aeo-schema`, category `geo`) — covers both "AEO Scanner" and "Missing Schema
Detection" as the same real check (deliberately not two overlapping
scanners): flags a post whose content is *already shaped* like FAQ content
(question-phrased headings — the same signal `GeoFaqOpportunityScanner`
uses) or HowTo content (an ordered list with 3+ steps) but has no matching
`FAQPage`/`HowTo` schema.org markup saved to its `_vulopilot_schema_json`
postmeta (`Services\SchemaJsonLdRenderer`'s own key). Narrower than
`GeoFaqOpportunityScanner` on purpose — that scanner flags content with *no*
FAQ shape at all; this one only fires once the shape already exists but the
schema an answer engine would actually read doesn't.

**Top Pages** — `GET /geo-analysis/top-pages`
(`modules/Geo/Rest/GeoAnalysis.php`, new file — see its own
docblock for why this filename is safe to reuse even though it previously
hosted routes that moved to Pro) ranks published posts by open
`geo`-category finding count (fewest = most AI-visibility-ready), using
`FindingRepository::count_by_column()` — no AI cost, works for every scanned
post, not just ones an admin has explicitly AI-analyzed. Rendered as a new
"Top Pages" card (`src/pages/GEO/TopPagesCard.tsx`) on the GEO page.

### Pro

**2 new deterministic scanners** — `GeoInsights\Module::register_scanners()`
adds two more `geo`-category checks on top of Free's 9 (`vulopilot_scanner_sources`,
the same extension point `AdvancedSeo`/`SecurityMonitoring` already use):

- **`LlmsTxtMissingScanner`** (`llms-txt-missing`, sitewide) — Free's own
  `GeoAnalysis\LlmsTxtGenerator` can serve/write `llms.txt`, but nothing
  previously scanned for its *absence*; a site owner who never opened
  Settings → GEO had no signal the check even existed. One combined finding
  covers both failure states: the feature toggle is off, or it's on but the
  physical file isn't written yet (e.g. a host that blocks writes to
  `ABSPATH`).
- **`StaleContentScanner`** (`stale-content`, per-post) — turns
  `GeoAnalyzer::calculate_content_freshness()`'s own staleness math (Scanning
  → GEO's `stale_content_months` threshold) into an actual Finding a site
  owner sees on the GEO findings list, rather than only ever surfacing when
  someone runs a per-post GEO analysis.

Both are Pro-only — Free's `ScannerRegistry` has no equivalent — so `GEO.tsx`
groups their findings under two sections (`Crawlability`, `Freshness`) that
render a `ProLockedCard` instead of an always-empty `FindingsTable` when
`geo-insights` isn't active, and `AEO.tsx` surfaces `llms-txt-missing` under
its own "llms.txt & Crawlability" section the same way.

**Historical Trends** — closes GEO-MODULE.md's own "no GEO score history"
gap for the *sitewide* snapshot. New table `vulopilot_geo_visibility_history`
(one row per calendar day, upserted — `classes/Install.php`'s
`create_geo_visibility_history_table()`, same self-healing
`CREATE TABLE IF NOT EXISTS` migration shape every other post-v1.0.0 table
uses). Same Free/Pro split `vulopilot_site_health_snapshots`/
`AdvancedReports\SiteHealthSnapshotRepository` already establishes: **Free
owns the table schema and the generic `AbstractRepository` base**;
**Pro owns the concrete `GeoInsights\GeoVisibilityHistoryRepository`** and is
the only thing that ever writes to it (`VisibilitySnapshotBuilder`, on its
existing cron cadence). Read via `GET /geo-visibility-history`
(`GeoInsights\Rest.php`), rendered as a trend chart
(`GeoVisibilityTrend.tsx`, `recharts` — already a real dependency of this
plugin family, added to vulopilot-pro's own `package.json` rather than
picking a second charting library).

**Monitoring** — `GeoInsights\VisibilityMonitor` self-registers on a new
extension hook, `vulopilot_pro_geo_visibility_snapshot_built` (fired by
`VisibilitySnapshotBuilder::build_and_store()` after every run, alongside its
existing option-cache write). Logs every run to `vulopilot_activity_logs`
(Free's existing `ActivityLogRepository`) and emails
(`email_on_geo_score_drop`/`aeo_drop_threshold`, the same two settings
`GeoAnalyzer`'s own per-post notification already reads) when the *sitewide*
score drops past threshold — same logic as the per-post notification, just
scoped to the sample average instead of one post.

**Competitor Visibility** — `GeoInsights\CompetitorVisibilityAnalyzer`, a
real `wp_remote_get()` per competitor URL
(`geo_competitor_urls` setting, Scanning → GEO), checking the *same*
structural signals the free scanners check locally (schema presence, author
byline, FAQ-shaped heading) against the fetched HTML. Deliberately does
**not** attempt off-site brand-mention/share-of-voice tracking — that's a
different, already-documented gap
(`src/pages/BrandVisibility/BrandVisibility.tsx`'s own honest "Not connected
yet" stub, which needs a real third-party data source like Ahrefs Brand
Radar this codebase has no credentials for). This is a real, on-page,
zero-AI-cost comparison instead, exposed via
`POST /geo-competitor-visibility` and a new
`CompetitorVisibilityCard.tsx` on the GEO page.

**Bulk Fixes** — `OneClickFix\BulkFixRest` (`POST /findings/bulk-fix`),
generalized to any category, not GEO-only. Loops the existing single-finding
resolution (`FindingFixRest::resolve_fix()`, extracted from `fix_item()`
without changing its behavior) across a batch, same "loop the existing
single-item call" shape `WooCommerceAi\BulkOptimizeRest` already established.
Wired into `FindingsTable.tsx`'s existing bulk-actions bar as a "Fix
selected" option, behind a new `vulopilot_finding_bulk_fix_handler` filter —
identical registration pattern to the existing per-row
`vulopilot_finding_fix_handler`.

**Automation** — no new trigger class. `AutomationEngine::handle_trigger_fired()`
only ever resolves *Finding → Rule → Recommendation*; a sitewide score-drop
event has no corresponding Finding/Rule, and forcing one through would mean
inventing a synthetic Finding just to make a trigger fire — the kind of
duplicated/parallel path this pass avoids. What already works today, with no
new code: bind any existing trigger (`PostPublishedTrigger`, a cron trigger)
to GEO's own existing rules (`FaqOpportunityRule`, `MissingSummaryBlockRule`)
and `RunAiActionAction` — automatically running `GenerateFaqAction`/
`GenerateSummaryBlockAction` whenever those GEO findings appear is already
fully supported by the generic Automation module.

**Email Reports / Advanced Reports** — no new code. `Reports\Types\AiVisibilityReport`
(Free) is already a selectable report type in Pro's existing
`ScheduledReportRunner`/PDF export/`CustomReport` builder
(`AdvancedReports` module) — scheduling a recurring emailed AI Visibility
report already works through the existing generic reporting engine.

## Extension points added

- `vulopilot_pro_geo_visibility_snapshot_built` (action, 2 args: `$snapshot`, `$previous_row`) — fired by `VisibilitySnapshotBuilder` after every sitewide sample run. `VisibilityMonitor` hooks it; a future Pro/third-party consumer can too.
- `vulopilot_geo_visibility_trend` / `vulopilot_geo_competitor_visibility` (React filters, `@wordpress/hooks`) — same "register a source, don't modify the host" slot pattern `vulopilot_geo_score_card`/`vulopilot_geo_visibility_summary` already use on the GEO page. All 4 slots are read via `useFilterSlot()` (`src/services/useFilterSlot.ts`), not a plain one-time `applyFilters()` call — Free's and Pro's admin bundles are two separately-enqueued scripts, and a one-time read at module scope or first render can run before Pro's `addFilter()` calls have executed, permanently missing the registration. `useFilterSlot()` re-resolves on mount and again on a `vulopilot_pro_modules_loaded` `window` event Pro's own `src/index.tsx` dispatches once its modules have actually registered — see that hook's own docblock, and `GEO-MODULE.md`'s "Frontend: GeoScoreCard" for the full mechanism.
- `vulopilot_finding_bulk_fix_handler` (React filter) — bulk-action counterpart to the existing `vulopilot_finding_fix_handler`.

No new PHP registry was introduced — every new scanner/REST controller
still goes through `vulopilot_scanner_sources`/`vulopilot_rest_controllers`,
exactly as documented in `GEO-MODULE.md`/`SCANNERS.md`.

## Tests

`tests/php/` (both plugins — this pass is what scaffolded the directory
`phpunit.xml.dist` already pointed at but that didn't exist yet). Uses
Brain\Monkey (already a dev dependency) for fast, isolated unit tests over
deterministic logic — not a full `wp-phpunit` integration bootstrap against a
real WordPress+MySQL install, which is real infrastructure this pass didn't
stand up. Covers `AeoSchemaScanner`'s content-shape detection,
`CompetitorVisibilityAnalyzer`'s structural-signal regexes, and
`GeoVisibilityHistoryRepository`'s table-key wiring. Run with
`vendor/bin/phpunit` from either plugin directory.

## What's still not here (honest gaps)

- **Real off-site brand-mention tracking** — Competitor Visibility above is
  a real, on-page structural comparison, not the Ahrefs-Brand-Radar-backed
  share-of-voice feature `BrandVisibility.tsx` still honestly says it needs.
- **A live post-search picker, bulk/sitewide *AI-scored* GEO scoring, and
  per-post GEO score history** — still open per `GEO-MODULE.md`'s own "What's
  not here yet" (the *sitewide sample average* now has history via this
  pass; a single post's own AI-judged score still only ever has its latest
  value in postmeta).
