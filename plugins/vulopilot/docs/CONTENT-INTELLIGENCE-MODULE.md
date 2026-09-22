# VuloPilot — Content Intelligence module

Companion to [`SEO-MODULE.md`](SEO-MODULE.md), [`GEO-MODULE.md`](GEO-MODULE.md),
[`SCANNERS.md`](SCANNERS.md), [`DASHBOARD-WIDGETS.md`](DASHBOARD-WIDGETS.md),
[`AI-ACTIONS.md`](AI-ACTIONS.md), and to `vulopilot-pro`'s own
[`CONTENT-INTELLIGENCE-MODULE.md`](../../../../plugins/vulopilot-pro/docs/CONTENT-INTELLIGENCE-MODULE.md).
Content Intelligence is a new module (new
category `content`, alongside `seo`/`geo`/`performance`/etc.) built to the
same shape GEO-MODULE.md/AI-VISIBILITY-MODULE.md already establish: Free owns
one new deterministic scanner plus a composite score/report spanning several
existing SEO scanners it reuses rather than duplicates; Pro owns the AI
dimension (`ContentAnalyzer`, mirroring `GeoAnalysis\GeoAnalyzer` exactly) and
every action that spends real AI money.

## Audit: requested vs. already-shipped

Before writing any code, every requested item was checked against what
already existed — this turned up two Pro items already shipped in Free.

**Already shipped, unchanged by this pass:**

| Requested | Already implemented as |
|---|---|
| Thin Content Detection | `SeoAnalysis\Basic\ThinContentScanner` (`thin-content`, category `seo`) |
| Duplicate Content Detection | `DuplicateContentScanner` (`duplicate-content`) |
| Heading Analysis | `HeadingStructureScanner` (`heading-structure`) |
| Internal Link Analysis | `InternalLinkingScanner` (`internal-linking`) |
| AI FAQ Generator (Pro on the request, but already Free) | `GenerateFaqAction` (`generate-faq`, `AIActions/Actions/`, `get_tier() === 'free'`) |
| AI Internal Linking (Pro on the request, but already Free) | `SuggestInternalLinksAction` (`suggest-internal-links`) — already `OneClickFix`'s `ScannerFixMap` entry for `internal-linking` |

**Tier correction, not a new feature:** "AI FAQ Generator" and "AI Internal
Linking" already ship in Free, both as scanner-mapped one-click fixes
(`OneClickFix`'s `ScannerFixMap`). Moving them behind Pro would regress a
shipped Free feature, so they stay exactly where they are — this file
documents the mapping rather than duplicating a second, Pro-gated copy.

Thin Content/Duplicate Content/Heading Structure/Internal Linking scanners
are **reused, not recategorized** — they stay `seo`-category (so
`SEO.tsx`'s own `SEO_SECTIONS` grouping doesn't break) and are additionally
read into Content Intelligence's own composite score/page/report via an
explicit `scanner_id` list, not a `category` filter. See
`FindingRepository::get_severity_breakdown_for_scanner_ids()`'s own docblock
for the mechanism.

## What's genuinely new in this pass

### Free

**`ReadabilityScanner`** (`modules/ContentIntelligence/Scanners/ReadabilityScanner.php`, id
`readability`, new category `content`) — the one genuinely new scanner. Real
Flesch Reading Ease score (`206.835 - 1.015*(words/sentences) -
84.6*(syllables/words)`, clamped 0–100), skipping posts under 100 words
(already flagged by `ThinContentScanner` for a different reason). Threshold
is a real setting, `content_readability_min_score` (Scanning → Content
Intelligence, default 50 — Flesch's own published "Fairly Difficult"
boundary), not a hardcoded number.

**Content Score** — `GET /content-intelligence/score`
(`modules/ContentIntelligence/Rest/ContentIntelligence.php`) — a composite score
over `readability` + the 4 reused `seo` scanners + `orphan-pages`, same
weighting formula (`100 - critical*15 - high*8 - medium*3 - low*1`) every
other category score already uses. Also wired into the Dashboard's
`category_scores.content` (`Controllers/Dashboard.php`'s
`calculate_content_score()`) and a new `content` stat widget
(`dashboard-widgets/registry.ts`).

**Content Reports** — `Reports\Types\ContentIntelligenceReport`. Extends
`AbstractReportType` directly rather than `AbstractCategoryReportType` — that
base only scopes to one category string, but this report spans the same
cross-category `scanner_id` list the Content Score does (`orphan-pages`
included here, since a report period naturally includes sitewide findings
too, unlike the per-post `ContentAnalyzer`).

**Content page** (`src/pages/Content/Content.tsx`) — was already a routed,
menu-linked placeholder stub before this pass (`routes.ts`/`Admin.php` both
already had real entries); this pass filled in the real implementation.
Three sections grouped by their own `scanner_id` list (Readability; Content
Depth = thin+duplicate; Structure = heading+internal-linking+orphan), the
Content Score card, and two Pro filter slots (below).

**AI Content page** (`src/pages/AIContent/AIContent.tsx`, `routes.ts`'s
`ai-content` tab, grouped under `Admin.php`'s `ai-visibility` menu group
alongside GEO/AEO/Crawler Traffic rather than under Content Intelligence's
own menu entry) — a separate, newer page that reads the *same* two scanners
this module owns (`readability`, `thin-content`, plus the `seo`-category
`heading-structure`) through a different lens: "the content-quality signals
AI assistants weigh" (Depth & Completeness, Trust & Credibility, Multimedia
& Visual Aids, Scannable Formatting, Terminology & Tone) rather than this
page's own Readability/Content Depth/Structure grouping — the same
"a finding legitimately shows up grouped differently across pages"
cross-page overlap `GEO.tsx`/`AEO.tsx` already established for their own
shared scanners (see this page's own `SCANNER_TO_SECTION` docblock). Only
2 of its 5 sections (Depth & Completeness, Scannable Formatting) have a real
scanner behind them today; Trust & Credibility, Multimedia & Visual Aids,
and Terminology & Tone render an honest "not built yet" notice
(`scannerIds: []`, a `notBuiltDesc` string) rather than a findings table
that would sit permanently and misleadingly empty — none of those three
have a scanner anywhere in this codebase, Free or Pro, since checking any
of them needs real judgment, not pattern-matching, and this codebase's
established posture is that an AI-judged check is always a Pro-gated
engine (`ContentAnalyzer`'s own `topic_authority` dimension is the closest
existing thing), never a Free `ScannerInterface` implementer. Also renders
`TopicAuthorityCard` via the same `vulopilot_content_topic_authority_card`
slot Content.tsx uses, and is gated on the same `content-intelligence`
active-module check.

### Pro

**Topic Authority** — `ContentAnalyzer`
(`modules/ContentIntelligence/ContentAnalyzer.php`, **lives in Free**,
mirrors `GeoAnalysis\GeoAnalyzer` exactly) produces a `ContentScore`: a
deterministic score (% of the 5 per-post checks passing) averaged with one
AI dimension, `topic_authority` (0–100, does the content demonstrate real
depth/expertise rather than reading as generic or superficial), plus 3–5 AI
suggestions. Same Free-owns-the-engine/Pro-owns-the-costed-route split
`GeoInsights\Rest.php`'s own docblock documents: the analyzer class is
constructed unconditionally in Free's `VuloPilot::init_classes()`
(`content_analyzer`), but the REST route that actually calls `analyze()`
(real AI spend) is Pro's own `ContentIntelligence\Rest.php`
(`GET`/`POST /content-intelligence/{post_id}`). Surfaced as
`TopicAuthorityCard.tsx` via the `vulopilot_content_topic_authority_card`
filter slot.

**AI Expansion** — `ExpandContentAction` (`expand-content`). Distinct from
Free's existing `improve-readability` (which rewrites for clarity *without*
growing the content): this action is asked to genuinely add depth/examples,
and is safety-checked with an inverted ratio guard — `MIN_GROWTH_RATIO =
1.15`, rejecting output that isn't at least 15% longer than the original.
Deliberately **not** added to `ScannerFixMap` (that map is one action per
scanner, and `thin-content` is already mapped to `improve-readability`) —
this is a standalone, manually-invoked action, the same posture
`GenerateBlogAction` already has.

**AI Rewrite** — `RewriteContentAction` (`rewrite-content`). General-purpose,
user-directed rewrite: takes a required free-text `goal` input (e.g. "more
persuasive", "more casual tone") rather than one fixed purpose, so it has no
deterministic trigger and, like `ExpandContentAction`, no `ScannerFixMap`
entry. Same `MIN_LENGTH_RATIO = 0.5` shrink guard `ImproveReadabilityAction`
already uses.

**Content Gap Analysis + Competitor Content Suggestions** — one feature, not
two (`ContentGapAnalyzer`). Same bounded, sample-based pattern
`GeoInsights\VisibilitySnapshotBuilder` already established for sitewide GEO
scoring: samples up to 20 most-recently-modified published posts' own
titles, and — only when Scanning → GEO's `geo_competitor_urls` setting has
real URLs — also fetches each URL's real `<title>`/heading text
(`wp_remote_get()`, same fetch mechanics `CompetitorVisibilityAnalyzer`
already uses, but extracting text instead of that class's own structural
boolean signals — a different need, not a duplicate). One AI call asks what
real topics aren't covered given both real inputs; nothing is fabricated.
Single cached option (`vulopilot_pro_content_gap_analysis`), not a growing
history table — history wasn't requested for this module the way GEO's
Historical Trends was. `GET`/`POST /content-gap-analysis`
(read/regenerate split, same no-cost-vs-costed pattern as Topic Authority).
Surfaced as `ContentGapAnalysisCard.tsx` via
`vulopilot_content_gap_analysis_card`.

**Bulk Optimization** — `ContentBulkOptimizeRest`
(`POST /content-intelligence/bulk-optimize`), mirrors
`WooCommerceAi\BulkOptimizeRest`/`OneClickFix\BulkFixRest` exactly: loops
`ai_action_runner->propose()` over `expand-content`/`rewrite-content` across
a batch (capped at `MAX_BULK_ITEMS`), handling `rewrite-content`'s extra
required `goal` param.

## Extension points added

- `vulopilot_content_topic_authority_card` / `vulopilot_content_gap_analysis_card` (React filters, `@wordpress/hooks`) — same "register a source, don't modify the host" slot pattern GEO.tsx's own `GeoScoreCard`/`GeoVisibilitySummary` slots use.
- No new PHP registry — the new scanner/REST controllers/report/AI actions all go through the existing `vulopilot_scanner_sources`/`vulopilot_rest_controllers`/`ReportTypeRegistry`/`vulopilot_ai_action_sources`, exactly as documented in `SCANNERS.md`/`AI-ACTIONS.md`.

## REST routes added

| Route | Plugin | Cost | Notes |
|---|---|---|---|
| `GET /content-intelligence/score` | Free | None | Composite Content Score (dashboard/page use) |
| `GET /content-intelligence/{post_id}` | Pro | None | Reads back a previously stored `ContentScore` |
| `POST /content-intelligence/{post_id}` | Pro | Real AI | Runs `ContentAnalyzer::analyze()` |
| `GET /content-gap-analysis` | Pro | None | Reads back the last stored snapshot |
| `POST /content-gap-analysis` | Pro | Real AI + HTTP fetch | Runs `ContentGapAnalyzer::build_and_store()` |
| `POST /content-intelligence/bulk-optimize` | Pro | Real AI (per item) | `expand-content`/`rewrite-content` in bulk |

Free's `content_score` and Pro's `content_analysis` REST controller-array
keys are deliberately different even though their route bases both start
with `content-intelligence` — see `RestAPI/Rest.php`'s own comment; using
the same array key would let one silently overwrite the other before
`register_routes()` ever runs (the same bug class caught and fixed twice in
`AI-VISIBILITY-MODULE.md`'s own pass, for `geo_top_pages`/`geo_analysis`).

## Tests

`tests/php/src/test-readability-scanner.php` (Flesch formula + syllable
heuristic) and `test-content-analyzer.php` (deterministic scoring, overall
score averaging, AI response parsing/validation) in Free;
`test-content-gap-analyzer.php` (HTML title/heading extraction, AI response
parsing), `test-expand-content-action.php`, and
`test-rewrite-content-action.php` (both actions' `validate_input`/
`validate_output` guards) in Pro — same Brain\Monkey-based fast-unit-test
posture `AI-VISIBILITY-MODULE.md`'s own Tests section documents. Run with
`vendor/bin/phpunit` from either plugin directory.

React tests use Jest + React Testing Library
(`wp-scripts test-unit-js`, `@wordpress/jest-preset-default`) — newly wired
up in this pass for both plugins (`jest-unit.config.js`,
`tests/js/__mocks__/zyra-*` test doubles for the `@zyra/*` design-system
aliases, since the real `@multivendorx/zyra` bundles `@react-pdf/renderer`,
which ships ESM this repo's babel-config-less Jest setup can't parse).
Covers `TopicAuthorityCard`/`ContentGapAnalysisCard` (Pro) and `Content.tsx`'s
own module-active gating and Pro filter-slot rendering (Free). Run with
`pnpm test:unit:js` from either plugin directory.

## What's still not here (honest gaps)

- **No Content Gap history / trend** — `ContentGapAnalyzer` stores one
  cached snapshot, overwritten each run, the same pre-history-table shape
  `VisibilitySnapshotBuilder` had before GEO's own Historical Trends pass —
  a growing history table wasn't requested for this module.
- **No scheduled/automatic Content Gap regeneration** — always a manual
  "Regenerate" action from the Content page; no cron trigger the way GEO's
  `VisibilitySnapshotScheduler` runs on a cadence.
- **`ExpandContentAction`/`RewriteContentAction` are standalone, not
  scanner-mapped** — by design (see above), but this means Health/Content
  page "one-click fix" flows never surface them; they're only reachable via
  the Content page's own cards/bulk-optimize, not `FindingsTable`'s per-row
  fix button.
