# Performance Core

Code reference for `classes/Performance`. User view: [../user/PERFORMANCE.md](../user/PERFORMANCE.md).

## Flow

```
PageSpeedInsightsFetcher (psi_fetcher)  --calls Google PageSpeed Insights API-->  PageSpeedRepository (table vulopilot_page_speed)
PageSpeedScanner / SlowPageScanner      --read scores--> Findings
PerformanceRequestLogger                --samples own request timing--> PerformanceRequestRepository (vulopilot_performance_samples)
CoreWebVitalsBeacon                     --front-end beacon (small script) --> CoreWebVitalsRepository
PerformanceScoreSnapshotRecorder        --on scan--> vulopilot_snapshots (score trend)
Asset scanners (CSS/JS/Fonts/Images/Cache/CDN/LazyLoading) --> findings by group
PerformanceOptimizations                --optional runtime optimizations
```

## Notes

- The beacon script is enqueued as a real script (`wp_enqueue_script` + `wp_localize_script` object `vulopilotCwvBeacon`); its readable source is `public/js/performance-vitals-beacon.js`.
- The PageSpeed API key is stored as a setting and only sent to Google when a check runs. Documented in the readme's External services section.
- Score groups in the UI (Server & Response Time, Images & Media, Code Optimization, Caching & Delivery, Loading & Fonts) map to scanner ids in `src/pages/Performance/PerformanceTab.tsx`.

## Class reference

| Class | File | What it does |
|---|---|---|
| `AbstractAssetOptimizationScanner` | `classes/Performance/AbstractAssetOptimizationScanner.php` | Shared homepage-asset-inspection helpers for CssOptimizationScanner and JavaScriptOptimizationScanner - both need the exact same "fetch the homepage, find same-host `<link>`/script tags, check for a known minification plugin"  |
| `CacheDetectionScanner` | `classes/Performance/CacheDetectionScanner.php` | Flags a site with no detectable caching layer - checks a short list of well-known caching plugins (the same is_plugin_active() approach PluginsScanner/ThemesScanner already use for plugin detection), and falls back to inspecting t |
| `CdnScanner` | `classes/Performance/CdnScanner.php` | Flags a site with no detectable CDN/asset-offloading - checks whether any same-page asset (link href/script src/`<img src>`) resolves to a host other than the site's own (a real signal that assets are already being served  |
| `CoreWebVitalsBeacon` | `classes/Performance/CoreWebVitalsBeacon.php` | Enqueues public/js/performance-vitals-beacon.js on real front-end pages - this plugin's first ever `wp_enqueue_scripts` registration (confirmed no other front-end-visitor-facing script exists anywhere in this codebase today; every |
| `CoreWebVitalsRepository` | `classes/Performance/CoreWebVitalsRepository.php` | Persistence for `vulopilot_performance_samples` (type `vital`) - one row per real front-end pageview that reported at least one metric, written by Services\CoreWebVitalsBeacon's public REST endpoint. |
| `CssOptimizationScanner` | `classes/Performance/CssOptimizationScanner.php` | Flags un-minified same-host CSS on the homepage when no known minification-capable plugin is active - see AbstractAssetOptimizationScanner for the shared fetch/detection logic this and JavaScriptOptimizationScanner both build on. |
| `FontsScanner` | `classes/Performance/FontsScanner.php` | Flags externally-hosted Google Fonts on the homepage - same `wp_remote_get(home_url())` homepage-inspection approach CacheDetectionScanner already uses, just checking for fonts.googleapis.com/fonts.gstatic.com references instead o |
| `ImageCleanupScanner` | `classes/Performance/ImageCleanupScanner.php` | Flags unused image attachments the same way real media-cleaner plugins define "orphaned": unattached (`post_parent = 0`), not set as anyone's featured image, not the site icon or custom logo, and uploaded more than MIN_AGE_DAYS ag |
| `JavaScriptOptimizationScanner` | `classes/Performance/JavaScriptOptimizationScanner.php` | Flags un-minified same-host JavaScript on the homepage when no known minification-capable plugin is active - see AbstractAssetOptimizationScanner for the shared fetch/detection logic this and CssOptimizationScanner both build on. |
| `LargeImagesScanner` | `classes/Performance/LargeImagesScanner.php` | Flags oversized image attachments - distinct from ImagesScanner, which only checks for missing alt text and never inspects file size. |
| `LazyLoadingScanner` | `classes/Performance/LazyLoadingScanner.php` | Flags a site where WordPress core's own native lazy-loading (`loading="lazy"`, on by default since WP 5.5) has been disabled by a theme or plugin - a zero-cost check via the exact filter WordPress core itself calls, no HTTP reques |
| `PageSpeedInsightsFetcher` | `classes/Performance/PageSpeedInsightsFetcher.php` | - |
| `PageSpeedRepository` | `classes/Performance/PageSpeedRepository.php` | Persistence for `vulopilot_page_speed` - "Performance" › Slow Pages' per-page table, written by Services\PageSpeedScanner. |
| `PageSpeedScanner` | `classes/Performance/PageSpeedScanner.php` | Real per-page speed checks for "Performance" › Slow Pages. |
| `PerformanceOptimizations` | `classes/Performance/PerformanceOptimizations.php` | Real, reversible effects for 2 of "Performance" Overview's 6 Quick Actions (`classes/Performance/Rest/PerformanceActions.php` only flips the option; this class is what actually reads it on every real request): - `vulopilot_force_l |
| `PerformanceRequestLogger` | `classes/Performance/PerformanceRequestLogger.php` | Real-time "Performance" telemetry - logs one response-time sample for a real front-end request, the data RealTimeMonitoringCard.tsx's "Server Response Time"/"Page Views (Last 5 Min)" tiles and MetricsGrid.tsx's "Performance Monito |
| `PerformanceRequestRepository` | `classes/Performance/PerformanceRequestRepository.php` | Persistence for `vulopilot_performance_samples` (type `request`) - one row per sampled real front-end request, written by Services\PerformanceRequestLogger. |
| `PerformanceScanner` | `classes/Performance/PerformanceScanner.php` | Flags an oversized autoloaded-options footprint - every option row with `autoload = 'yes'` is loaded into memory on *every* WordPress request (`wp_load_alloptions()`), so a bloated autoload set (a common side effect of poorly-beha |
| `PerformanceScoreSnapshotRecorder` | `classes/Performance/PerformanceScoreSnapshotRecorder.php` | Writes today's real performance-category score into `vulopilot_score_snapshots` (category `performance`) - the data SpeedHistoryCard.tsx's chart reads. |
| `SlowPageScanner` | `classes/Performance/SlowPageScanner.php` | Times a real request to the site's own homepage and flags a slow response - no existing scanner measures request timing (ScanRunner times a whole scanner's execution, not one HTTP response), so this brackets its own wp_remote_get( |
| `CoreWebVitals` | `classes/Performance/Rest/CoreWebVitals.php` | `GET /core-web-vitals` - backs "Performance" Overview's PerformanceScoreCard.tsx Core Web Vitals tiles. |
| `CoreWebVitalsBeaconRest` | `classes/Performance/Rest/CoreWebVitalsBeaconRest.php` | `POST /performance-vitals-beacon` - this codebase's first public, anonymous REST route (confirmed via a full audit: every other `permission_callback` in this plugin is `current_user_can('manage_options')`). |
| `EfficiencyChecks` | `classes/Performance/Rest/EfficiencyChecks.php` | - |
| `PageSpeed` | `classes/Performance/Rest/PageSpeed.php` | `GET /page-speed` lists real per-page speed results plus a real summary and `top_issues` (PageSpeedRepository::get_top_issues() - the real, deduplicated `main_issue` values grouped by how many pages they affect, backing the "Perfo |
| `PerformanceActions` | `classes/Performance/Rest/PerformanceActions.php` | `POST /performance-actions/{action_id}` - backs "Performance" Overview's Quick Actions card (QuickActionsCard.tsx). |
| `PerformanceRealtime` | `classes/Performance/Rest/PerformanceRealtime.php` | `GET /performance-realtime` - backs "Performance" Overview's RealTimeMonitoringCard.tsx (Server Response Time, Page Views Last 5 Min) and MetricsGrid.tsx's "Performance Monitor" tile (Active vs. |
| `PerformanceScoreSnapshots` | `classes/Performance/Rest/PerformanceScoreSnapshots.php` | `GET /performance-score-snapshots?days=N` - backs SpeedHistoryCard.tsx's trend chart. |

Hooks and routes registered by these classes:

- `CoreWebVitalsBeacon` - hooks: `init`, `wp_enqueue_scripts`
- `PageSpeedInsightsFetcher` - hooks: `init`, `update_option_`
- `PerformanceOptimizations` - hooks: `wp_head`, `wp_lazy_loading_enabled`
- `PerformanceRequestLogger` - hooks: `init`, `shutdown`
- `PerformanceScoreSnapshotRecorder` - hooks: `init`, `vulopilot_scan_completed`
- `CoreWebVitals` - routes: `/core-web-vitals`
- `CoreWebVitalsBeaconRest` - routes: `/performance-vitals-beacon`
- `EfficiencyChecks` - routes: `/efficiency-checks`
- `PageSpeed` - routes: `/page-speed`
- `PerformanceActions` - hooks: `wp_editor_set_quality`; routes: `/performance-actions/(?P<action_id>[a-z-]+)`
- `PerformanceRealtime` - routes: `/performance-realtime`
- `PerformanceScoreSnapshots` - routes: `/performance-score-snapshots`
