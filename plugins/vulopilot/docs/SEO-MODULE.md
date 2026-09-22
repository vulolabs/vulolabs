# VuloPilot — SEO module

Companion to [`SCANNERS.md`](SCANNERS.md), [`RULE-ENGINE.md`](RULE-ENGINE.md),
[`AI-ACTIONS.md`](AI-ACTIONS.md),
[`AI-CRAWLER-ANALYTICS-MODULE.md`](AI-CRAWLER-ANALYTICS-MODULE.md), and to
`vulopilot-pro`'s own
[`ADVANCED-SEO-MODULE.md`](../../../../plugins/vulopilot-pro/docs/ADVANCED-SEO-MODULE.md).
Covers the 15
SEO checks (13 new scanners plus the 2 that already existed), the 3 new SEO rules
(plus one existing rule corrected in this pass), the AI-suggestion/one-click-fix
pairing (now closed for both `MissingMetaDescriptionRule` and the pre-existing
`SeoTitleRewriteRule`), and how these checks are now organized as a real,
independently-toggleable Free module.

## SEO scanning is now a real `modules/Seo/` package

This section used to explain why 13 new scanner classes weren't worth forcing
into a `modules/SEO/` folder, because VuloPilot's own module loader
(`classes/Modules.php`) didn't exist yet. **That's no longer true.** VuloPilot
has since grown the same folder-scan/reflection module system `vulolabs`'s own
`Modules` class and every Pro plugin already use (`Modules::get_all_modules()`,
`vulopilot_module_sources`, per-module activate/deactivate), and SEO scanning
was moved behind it: `modules/Seo/Module.php` registers all 18 SEO-adjacent
scanner classes via `vulopilot_scanner_sources` (the *same* extension point,
just called from a real module instead of `ScannerRegistry`'s own hardcoded
default list) instead of `ScannerRegistry::get_default_scanner_classes()`.

This is a genuine behavior change, not just a reorganization: **`Seo\Module`
actually gates scanning.** If an admin turns the `seo` module off from
Settings → Modules, `Modules::load_active_modules()` never `new`s
`Seo\Module`, its `register_scanners()` filter callback is never registered,
and none of its 18 scanner classes get instantiated by future scans — no new
SEO findings, sitewide, until it's turned back on. Already-stored findings
from before deactivation aren't deleted; they still show up on the Health page,
which lists every category regardless of which modules are active. This is
deliberately unlike `modules/Geo/Module.php`, VuloPilot's other module: GEO's
own scanners (`GEO-MODULE.md`) always run with no whole-category kill switch —
`Geo\Module`'s own job is narrower (auto-regenerating `llms.txt` on
publish/update) and doesn't gate anything. Both modules auto-activate on a
fresh install, the same way `vulocart`'s `Cart`/`Order` modules do in the
sibling free plugin.

`Seo\Module`'s scanner list isn't limited to this doc's own 15 checks: it also
carries `ImagesScanner`/`BrokenLinksScanner` (older, pre-existing scanners,
categories `images`/`links`) and `AiCrawlerBlockedPagesScanner`
(`AI-CRAWLER-ANALYTICS-MODULE.md`'s "Blocked Pages" check, category `seo`) —
all genuinely SEO-adjacent, all gated by the same module toggle, even though
they're documented in their own separate passes rather than repeated here.

**The SEO admin page reflects this.** `pages/SEO/SEO.tsx` used to be a single
`FindingsTable` filtered to `category="seo"` (true when this doc was first
written); it's since been split into one `FindingsTable` per section — "Titles
& meta", "Images", "Links & schema", "XML Sitemap", "Robots.txt", and
"Redirects & 404s" — each scoped to its own hardcoded `scannerIds` list,
matching the same groupings Settings → Scanning → SEO already presents these
checks under (`components/Settings/Scanning/Seo.ts`). It also renders a
`ModuleGuardComponent` in place of every section when `seo` is inactive
(`appLocalizer.active_modules`), rather than five/six tables silently sitting
empty with no explanation — the one page in Free that actually checks module
state for this reason, since (unlike GEO) a scan running wouldn't fix an empty
SEO page if the module itself is off.

**"Redirects & 404s" is no longer a placeholder.** It now hosts a real
`FindingsTable` scoped to `redirect-analysis` (`RedirectAnalysisScanner`,
category `redirects` — a homepage redirect-chain check that predates this page
and had nowhere in the UI to surface until now) plus a "Manage redirects →"
button linking to the redirect manager/404 log's own dedicated admin page.
`RedirectAnalysisScanner` itself isn't part of `Seo\Module`'s gated list — it's
registered in `ScannerRegistry`'s own core default list alongside
`SslMonitoringScanner`/`NotFoundScanner`/`PhpWarningScanner` (Website Health
Monitoring), so it keeps running even if the `seo` module is turned off.

**A new SEO scanner's findings are still stored and counted normally, but won't
appear on this page until it's added to *both* `modules/Seo/Module.php`'s
registration list *and* the matching section's `scannerIds` array in
`SEO.tsx`** — category membership alone was never sufficient for a new scanner
to show up here, and now module registration is a second, separate requirement
on top of that.

## The 15 SEO checks

| Check | Scanner `id` | Severity | Notes |
|---|---|---|---|
| Titles | `seo` (pre-existing `SeoScanner`) | low | Title length outside ~10–60 chars |
| Descriptions | `meta-description` | low | No `post_excerpt` set (the real, always-present field most themes/SEO plugins fall back to) |
| Canonicals | `canonical-url` | low | No `rel="canonical"` in rendered HTML — homepage + up to 9 recent posts |
| Schema | `schema` (pre-existing `SchemaScanner`) | info | No JSON-LD present at all on the homepage |
| Internal Links | `internal-linking` | low | Zero same-site links found in a post's own content |
| Headings | `heading-structure` | low | 300+ word posts with no `<h2>`-`<h6>` anywhere |
| Thin Content | `thin-content` | low | Under 300 words |
| Duplicate Content | `duplicate-content` | medium | Two+ published posts share an exact title (see "What this is not" below) |
| Sitemap | `sitemap` | medium | Neither `/wp-sitemap.xml` nor `/sitemap.xml` reachable |
| Robots | `robots-txt` | low / **high** | Unreachable (low), or blocking every crawler sitewide (high) |
| OpenGraph | `open-graph` | low | Missing `og:title`/`og:description`/`og:image` on the homepage |
| Twitter Cards | `twitter-card` | low | Missing `twitter:card` on the homepage |
| Orphan Pages | `orphan-pages` | low | Nothing in the sampled batch links to this page |
| Missing Images | `seo-images` | low | No featured image set |
| Structured Data | `structured-data` | medium | JSON-LD blocks exist but fail to parse as valid JSON |

14 of these 15 share `get_category() === 'seo'` and `get_tier() === 'free'` — the
one exception is **Schema**: `SchemaScanner::get_category()` returns `'schema'`,
not `'seo'`, and always has (it's one of the two pre-existing scanners this pass
joined, not one it wrote). `SEO.tsx` accounts for this directly — it filters its
"Links & schema" section by `scannerIds` rather than a `category="seo"` prop,
since a category filter would silently exclude both `schema` and `links`
(`BrokenLinksScanner`) findings from a page that otherwise reads as "the SEO
page." Every new scanner extends `AbstractBasicScanner` and lives flat in
`classes/Scanners/Basic/` alongside the original 14 — no subfolder, per
`SCANNERS.md`'s "no folder-per-scanner" reasoning.

### What "Schema" vs. "Structured Data" actually means here

These sound like the same check but are deliberately different: `SchemaScanner`
("Schema" in the checklist) is a **presence** check — is there any JSON-LD on the
homepage at all. `StructuredDataValidationScanner` ("Structured Data") is a
**validity** check — of whatever JSON-LD blocks exist, do they actually parse as
JSON. A site can pass one and fail the other (JSON-LD present but malformed), which
is exactly why both exist as separate scanners rather than one doing both jobs.

### What "Duplicate Content" is not

A real text-similarity/near-duplicate detector would need to compare every pair of
posts' full content — an unbounded, expensive operation for a scanner that runs on
demand (`performance.md`). `DuplicateContentScanner` instead does one indexed SQL
aggregate (`GROUP BY post_title HAVING COUNT(*) > 1`) across the 200 most recently
modified posts — an honest, cheap proxy (two pages with an identical title are
almost always competing for the same search intent) documented as exactly that in
the scanner's own docblock, not a claim to detect near-duplicate content generally.

### What "Orphan Pages" is not

`OrphanPageScanner` cross-references posts only *within* the same 50-post sampled
batch (an O(n²) comparison, bounded and fast at that size). A page could have a
genuine inbound link from an older post outside the batch and still be reported as
an orphan here — a documented, deliberate trade-off for keeping the scanner's
runtime bounded, not a full sitewide link-graph analysis.

## Pro: the `AdvancedSeo` module

`vulopilot-pro/modules/AdvancedSeo` registers 5 more `category: seo` scanners on
top of Free's 15+, each checking something Free's own scanners deliberately
don't:

| Check | Scanner `id` | What it adds over the Free equivalent |
|---|---|---|
| Sitewide structured data | `sitewide-structured-data` | Per-post JSON-LD presence — Free's `SchemaScanner`/`StructuredDataValidationScanner` only ever look at the homepage |
| Sitemap validation | `sitemap-validation` | Whether the sitemap's *content* actually parses and has entries — Free's `SitemapScanner` only checks that the URL returns 200 |
| Meta description duplication | `meta-description-duplication` | Duplicate `post_excerpt` values across posts — Free's `DuplicateContentScanner` only checks duplicate titles |
| Multiple H1s | `multiple-h1` | More than one `<h1>` in a page's own content — Free's `HeadingStructureScanner` only checks that *any* subheading exists |
| Focus keyword audit | `focus-keyword-audit` | A sitewide audit of the post-editor metabox's own focus-keyword field, catching drift across the whole site the metabox's live checklist can only ever check one open post at a time |

Gated only by `AdvancedSeo`'s own module active-state (a Pro-tier toggle,
`vulopilot_scanner_sources` the same as any other addition) — not by Free's
`seo` module being active, so these 5 keep working even if a site owner has
turned Free's own SEO scanning off. There's no `enable_seo_scanning` category
kill switch; that setting was replaced by granular per-check `flag_*` toggles
(`Utill.php`).

Three of the five (`meta-description-duplication`, `multiple-h1`,
`focus-keyword-audit`) are grouped into `SEO.tsx`'s "Titles & meta" section
alongside the Free checks that section already covers; the other two
(`sitewide-structured-data`, `sitemap-validation`) land in "Links & schema" and
"XML Sitemap" respectively — the same `scannerIds`-based grouping described
above, no separate Pro section on this page.

## Fixing a category collision this pass introduced

Before this pass, `seo` was one scanner's (`SeoScanner`) category, so the existing
`SeoTitleRewriteRule.applies_to()` could safely check `category === 'seo'` alone.
Giving 13 more scanners the same category broke that assumption — `applies_to()`
would have started firing on `meta-description`/`thin-content`/every other SEO
finding too. Fixed by matching on the `title_length` meta key `SeoScanner`
specifically attaches, not category alone (see `SeoTitleRewriteRule.php`'s updated
docblock). The 3 new rules below follow the same discipline from the start: each
matches on a scanner-specific meta key (`missing_description`,
`missing_featured_image`, `blocks_all_crawlers`), never on category alone or on the
Finding's (already-translated, locale-unsafe to string-match) title text.

## The 3 new rules (`classes/RuleEngine/Rules/`)

| Rule | `id` | type | fixable | AI required | Pairs with scanner |
|---|---|---|---|---|---|
| `MissingMetaDescriptionRule` | `missing-meta-description` | suggestion | yes | **yes** | `meta-description` |
| `MissingFeaturedImageRule` | `missing-featured-image` | suggestion | yes | no | `seo-images` |
| `RobotsBlockingCrawlersRule` | `robots-blocking-crawlers` | **critical** | **no** | no | `robots-txt` (the blocking finding only) |

`MissingFeaturedImageRule` demonstrates the fixable-but-no-AI combination
`RULE-ENGINE.md`'s `DormantPluginRule` already established (a mechanical editorial
task, nothing for AI to generate). `RobotsBlockingCrawlersRule` is deliberately
**not** fixable — automatically rewriting robots.txt is exactly the kind of
high-blast-radius, whole-site-affecting change no `AIAction` here should make
unattended; a site owner needs to look at the file before that rule is removed.

## The AI Actions: closing both title and description fix loops

`RuleEngine\Rules\SeoTitleRewriteRule` (pre-existing) has recommended
AI-assisted title rewrites since the Rule Engine pass, but for a while no
`AIAction` existed to actually do it — `requires_ai() === true` with no wiring
behind it was a real, documented gap. This pass closed the *equivalent* gap for
the new `MissingMetaDescriptionRule` first (chosen at the time because it's the
more natural one-click fix: describing a page from its own content is a
well-bounded AI task, matching `GenerateAltAction`'s reasoning, whereas a good
title rewrite has tighter, harder-to-validate length constraints):

**`AiCopilot\Actions\WriteMetaDescriptionAction`** (`write-meta-description`) —
shaped like `ImproveReadabilityAction` (a real `wp_update_post()` write, so it also
creates a WordPress revision as a bonus safety net) rather than
`GenerateAltAction`'s raw postmeta write, since `post_excerpt` is a first-class post
field. Writes to `post_excerpt`; rollback restores the previous value.
`RuleEngine\Rules\MissingMetaDescriptionRule`'s recommendations are this action's
natural input source, by the same by-convention id-matching `AI-ACTIONS.md`
documents (no formal Recommendation → Action mapping exists yet — see that doc's
own "What's not here yet").

**`SeoTitleRewriteRule`'s own gap has since been closed too**, by
`AiCopilot\Actions\WriteMetaTitleAction` (`write-meta-title` — not
`write-seo-title`, despite what an earlier version of this doc predicted the id
would be). Unlike `WriteMetaDescriptionAction`'s `post_excerpt` write, this
writes directly to the native `post_title` field via `wp_update_post()` — the
only way it actually changes what search engines/visitors see, at the cost of
being a more visible change (the page's own `<h1>`, post lists, RSS) than a
description edit. Same propose/approve/rollback safety net, same length bounds
(10-60 characters) as `SeoScanner`'s own `title_length` check, same
by-convention id-matching input source (`SeoTitleRewriteRule`'s
recommendations).

## Extension strategy

Identical shape to every other engine in this codebase:

1. **A new Free SEO check**: add a scanner class under `classes/Scanners/Basic/`
   with `get_category() === 'seo'`, register it in `modules/Seo/Module.php`'s
   `register_scanners()` (not `ScannerRegistry::get_default_scanner_classes()` —
   see "SEO scanning is now a real `modules/Seo/` package" above). If it's
   fixable, add a matching `Rule` (and an `AIAction` if AI is genuinely needed)
   the same way. Also add it to the right `SEO_SECTIONS` entry in `SEO.tsx`, or
   it won't be visible on the SEO page even though it's scanning and storing
   findings correctly.
2. **A Pro premium SEO check** (e.g. a competitor-title-comparison scanner needing
   an external API): implement `ScannerInterface` directly inside a Pro module,
   `get_tier()` returns `'premium'`, register via
   `add_filter('vulopilot_scanner_sources', ...)`, license-gated
   (`plugin-families.md`). Already realized once: `vulopilot-pro`'s
   `AdvancedSeo` module adds 5 more `seo`-category scanners this way (see above).
3. **A third-party SEO check**: same filter, from any other plugin — no more
   privileged a path for Pro than a third party.

## What's not here yet

- **REST endpoints/UI surfacing these specific new findings differently** — they
  flow through the exact same `/findings` endpoint and `FindingsTable` component
  every existing SEO finding already uses (filtered by `scanner_id`, not
  `category`, on the SEO page itself — see above); no new REST work was needed.
- **A formal GEO (AI-search/answer-engine) equivalent** as part of *this*
  module. That gap has since been closed, but as its own separately-scoped
  feature area rather than folded into "the SEO module" — see
  [`GEO-MODULE.md`](GEO-MODULE.md) and [`AI-VISIBILITY-MODULE.md`](AI-VISIBILITY-MODULE.md).
- **Per-check configuration** (e.g. a custom thin-content word-count threshold) —
  every threshold in this pass is a class constant, matching how `SeoScanner`'s
  title-length bounds and `BrokenLinksScanner`'s batch size already are.
