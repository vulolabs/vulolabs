# VuloPilot — AI Actions

Companion to [`AI-ARCHITECTURE.md`](AI-ARCHITECTURE.md), [`RULE-ENGINE.md`](RULE-ENGINE.md),
[`SCANNERS.md`](SCANNERS.md), and [`DATABASE.md`](DATABASE.md). Covers the action contract, the
8-stage lifecycle, all **21** built-in Free actions (up from the original 4), persistence, and the
extension strategy.

## What an AI Action is

Everything up through the Rule Engine pass produces *advice* — a `Recommendation` telling a site
owner what to do. An AI Action is what actually **does** it: a complete, safe, undoable workflow
from "here's the input" to "here's what changed on the site," with a mandatory human approval gate
in between and a recorded way back out.

```
Input → Prompt Builder → (AI call, via AiRequestSender) → Validator → Preview → Approval → Execution → Rollback → Logging
```

Worked example (`GenerateAltAction`):

| Stage | What happens |
|---|---|
| Input | `attachment_id` validated — must exist and be an image |
| Prompt Builder | Filename + the post it's attached to become a chat prompt |
| *(AI call)* | Sent through `AI\AiRequestSender::send()` — safety-validates the prompt, checks the VuloCloud connection and request budget, sends to VuloCloud (retrying transient failures), records one history row, sanitizes the response (see [`AI-ARCHITECTURE.md`](AI-ARCHITECTURE.md)) |
| Validator | Rejects an empty or absurdly long answer |
| Preview | "Set alt text for photo.jpg" + before/after text |
| Approval | A site owner clicks Approve (or Reject) — nothing has changed yet |
| Execution | `update_post_meta()` writes the new alt text |
| Rollback | Restores the exact previous value from a stored snapshot |
| Logging | Every stage transition above is a `vulopilot_activity_logs` row |

## Why this supersedes `AIJobHandlerInterface`

The AI-architecture pass built `AIJobHandlerInterface` (context/prompt/parse for one AI
conversation) keyed to a `Recommendation`. Given a concrete spec for what a complete action needs
— Preview, Approval, Execution, Rollback — that assumption breaks: **`GenerateBlogAction` has no
Recommendation to build context from at all.** A site owner types a topic and clicks Generate;
there was no Finding, no Rule, no scan involved. Tying every AI conversation to a Recommendation
was already too narrow the moment a second, genuinely different kind of AI-assisted workflow
existed.

So this pass replaces it rather than running two parallel "how do we talk to AI" systems side by
side (`AIJobHandlerInterface`'s two implementations, `AltTextJobHandler`/`SeoTitleRewriteJobHandler`,
and the now-unused `JobHandlerRegistry`/`AIJobRunner`, were deleted — not deprecated in place —
along with `AIJobHandlerInterface` itself). `AIActionInterface`'s `validate_input()` takes a plain
array, not a `Recommendation`, which is what makes both cases — "derived from a Finding" and
"typed by a user" — first-class instead of one being a workaround.

## Contracts (`vulolabs/plugins/vulopilot/classes/`)

These, like every other contract in this codebase, used to live in a separate Composer path
package, `vulolabs/packages/php/vulopilot-core` — that package no longer exists (see
`SCANNERS.md`'s and `RULE-ENGINE.md`'s own "Contracts" sections for the same correction). Every
class below lives directly in the plugin under `VuloPilot\`:

```
classes/
├── Contracts/AI/
│   └── AIActionInterface.php   get_id/get_label/get_tier + 6 lifecycle methods (below)
├── ValueObjects/
│   ├── ActionPreview.php            summary + before/after + format — what stage 4 produces
│   └── ActionExecutionResult.php    success + object_type/ref + snapshot — what stage 6 produces
└── Exceptions/
    ├── InvalidActionInputException.php   thrown by validate_input(), before any AI call
    └── InvalidActionOutputException.php  thrown by validate_output(), before a Preview is built
```

`AIActionInterface` covers 6 of the 8 lifecycle stages directly:

| Stage | Interface method |
|---|---|
| 1. Input | `validate_input( array $input ): array` |
| 2. Prompt Builder | `build_prompt( array $input ): array` |
| — (AI call) | not on this interface — `AiCopilot\ActionRunner::propose()` calls it via an injected `AI\AiRequestSender`, which itself resolves `AIProviderInterface::send()` through `ProviderRegistry`'s fallback chain, never re-implemented per-action |
| — (parsing) | `parse_response( AIResponse $response ): array` |
| 3. Validator | `validate_output( array $output, array $input ): void` |
| 4. Preview | `build_preview( array $output, array $input ): ActionPreview` |
| 6. Execution | `execute( array $output, array $input ): ActionExecutionResult` |
| 7. Rollback | `rollback( array $snapshot ): void` |

**Stage 5 (Approval) and stage 8 (Logging) are deliberately not methods on the interface** — both
are identical across every action (a yes/no gate; a `vulopilot_activity_logs` write), so putting
either on the per-action contract would mean every new action re-implementing the same logic.
`ActionRunner` owns both generically instead.

## Persistence: `vulopilot_ai_action_runs`

Approval is a genuine pause — `propose()` and `approve()`/`reject()` are always two separate HTTP
requests, sometimes by two different people. A table (confirmed still exactly as designed, in
`Install.php`'s `create_database_tables()`) bridges them:

```sql
CREATE TABLE vulopilot_ai_action_runs (
    id             bigint(20) unsigned AUTO_INCREMENT,
    action_id      varchar(100),          -- e.g. 'generate-alt'
    status         varchar(20),           -- pending_approval|approved|rejected|executed|failed|rolled_back
    object_type    varchar(50),           -- set once executed, e.g. 'attachment'
    object_ref     varchar(255),
    input          longtext,              -- JSON, validate_input()'s output
    output         longtext,              -- JSON, parse_response()'s output
    preview        longtext,              -- JSON, ActionPreview::to_array()
    snapshot       longtext,              -- JSON, ActionExecutionResult::get_snapshot()
    error_message  text,
    requested_by   bigint(20) unsigned,
    approved_by    bigint(20) unsigned,
    created_at, approved_at, executed_at, rolled_back_at
);
```

Added directly to `Install.php`'s baseline schema (`create_database_tables()`), not a
version-gated migration — there is no real deployed prior install of this still-in-development
plugin to stay backward-compatible with. `Repositories\ActionRunRepository` is a thin
`AbstractRepository` subclass, same shape as every other repository in this codebase
(`Repositories/` now holds 15 concrete repositories total, covering scans, findings, action runs,
activity logs, AI history, AI provider configs, automations, and more).

## `ActionRunner` — the orchestrator

Four public methods, not one `run()`, because of the approval pause:

```
propose( action_id, raw_input )   Stages 1-4. Persists 'pending_approval'. Nothing on the site changes.
approve( run_id )                 Stage 6. Persists 'executed' or 'failed'.
reject( run_id )                  Stage 5's negative branch. Persists 'rejected'. execute() never runs.
rollback( run_id )                Stage 7. Persists 'rolled_back'.
```

`ActionRunner`'s constructor takes an `ActionRegistry` and an `AI\AiRequestSender`
(plus optional injectable `ActionRunRepository`/`ActivityLogRepository` for tests) — `propose()`
itself no longer inlines "safety-validate → build a fallback chain → send → sanitize"; that
sequence was extracted into `AiRequestSender` once [`GEO-MODULE.md`](GEO-MODULE.md)'s
`GeoAnalysis\GeoAnalyzer` needed the identical sequence for a read-only call that isn't an
`AIAction` at all. See [`AI-ARCHITECTURE.md`](AI-ARCHITECTURE.md) for `AiRequestSender` itself.

Every one of the four writes a `vulopilot_activity_logs` row (stage 8) via the existing
`ActivityLogRepository` — reused, not a second logging mechanism. `approve()` refuses to run twice
on the same `run_id` (only proceeds from `pending_approval`), and `rollback()` only proceeds from
`executed` — both enforced by checking `status` before doing anything, not left to the caller to
get right.

**Considerably more than three callers exist today**, all calling `propose()` only — never
`approve()`/`reject()`/`rollback()` themselves, since those three stay human-only actions taken
from the Dashboard. An earlier pass of this doc named exactly three; grepping the current codebase
for `->propose(` turns up at least six distinct call sites, all in `vulopilot-pro`:
`OneClickFix\FindingFixRest`/`BulkFixRest` (a human clicks "Fix this" on a specific,
already-scanned Finding), `OneClickFix\PostSeoFixRest` (the post-editor metabox's own "Fix with
AI"/"Generate with AI" buttons — distinct from `FindingFixRest` because the metabox has no
persisted Finding row to resolve a fix from at all), `ContentIntelligence\ContentBulkOptimizeRest`
and `WooCommerceAi\BulkOptimizeRest` (bulk "optimize all" flows, proposing one object at a time),
`Automation\Actions\RunAiActionAction` (an automation's own configured action), and
`McpServer\Tools\AbstractActionProposalTool` — a shared base class
[`MCP-SERVER-MODULE.md`](MCP-SERVER-MODULE.md)'s Content/SEO/Visibility/WooCommerce Tools all
extend, each concrete tool only declaring which existing action id it wraps. All of these exist
specifically so the approval pause this section describes can never be skipped, regardless of what
triggered the proposal.

## The built-in actions (`modules/AiCopilot/Actions/`)

The original 4 were chosen to cover every distinct kind of WordPress mutation + rollback shape, not
to cover all 11 examples from the original spec. Every one of those examples has since been built,
plus several more not in the original spec at all — 21 concrete Free actions total today, all
registered in `ActionRegistry::get_default_action_classes()`:

**The original 4:**

| Action | Mutation pattern | Writes to | Rollback |
|---|---|---|---|
| `GenerateAltAction` | Metadata-only write | `_wp_attachment_image_alt` postmeta | Restore previous meta value |
| `ImproveReadabilityAction` | Existing-content rewrite | `post_content` via `wp_update_post()` | Restore previous `post_content` (also gets a bonus WP revision for free) |
| `GenerateSchemaAction` | Content-append (structured data) | `_vulopilot_schema_json` postmeta | Restore previous value, or delete if there wasn't one |
| `GenerateBlogAction` | New-content creation | `wp_insert_post()`, always `post_status = 'draft'` | `wp_trash_post()` (WordPress's own trash/restore is a second safety net) |

**[`SEO-MODULE.md`](SEO-MODULE.md)'s 1** (closes `MissingMetaDescriptionRule`'s fix loop):

| Action | Mutation pattern | Writes to | Rollback |
|---|---|---|---|
| `WriteMetaDescriptionAction` | Existing-field rewrite | `post_excerpt` via `wp_update_post()` | Restore previous `post_excerpt` |

**[`GEO-MODULE.md`](GEO-MODULE.md)'s 2**, introducing the append/prepend content-mutation shapes:

| Action | Mutation pattern | Writes to | Rollback |
|---|---|---|---|
| `GenerateFaqAction` | Content-append (visible HTML) | `post_content` via `wp_update_post()` | Restore previous `post_content` |
| `GenerateSummaryBlockAction` | Content-prepend (visible HTML) | `post_content` via `wp_update_post()` | Restore previous `post_content` |

**GEO's second pass, 6 more** — closing every remaining GEO scanner's fix loop
(`OneClickFix`'s `ScannerFixMap` previously left these unmapped entirely):

| Action | Mutation pattern | Writes to | Rollback |
|---|---|---|---|
| `GenerateAuthorBioAction` | Metadata-only write | `description` user meta | Restore previous bio |
| `CreateTrustPageAction` | New-content creation (possibly multiple pages) | `wp_insert_post()` per missing page (About/Contact), always `post_status = 'publish'` | `wp_trash_post()` for every page this run created; a mid-loop failure trashes whatever it had already created before returning |
| `SoftenUnsourcedClaimsAction` | Existing-content rewrite | `post_content` via `wp_update_post()` | Restore previous `post_content` |
| `SplitLongParagraphsAction` | Existing-content rewrite | `post_content` via `wp_update_post()` | Restore previous `post_content` |
| `FixHeadingHierarchyAction` | Existing-content rewrite | `post_content` via `wp_update_post()` | Restore previous `post_content` |
| `NormalizeEntityNamingAction` | Existing-content rewrite | `post_content` via `wp_update_post()` | Restore previous `post_content` |

**"AI SEO Assistant"/"AI Content Assistant" (readme), 6 more** — undocumented by any sibling
`docs/*.md` pass, same "readme, not a numbered pass" status as several `SCANNERS.md`/
`RULE-ENGINE.md` additions:

| Action | Mutation pattern | Writes to | Rollback |
|---|---|---|---|
| `WriteMetaTitleAction` | Existing-field rewrite | `post_title` via `wp_update_post()` | Restore previous `post_title` |
| `SuggestInternalLinksAction` | Content-append (visible HTML) | `post_content` (appends a links block) via `wp_update_post()` | Restore previous `post_content` |
| `GenerateSocialContentAction` | Metadata-only write, no matching scanner/rule | A dedicated social-captions postmeta key | Restore previous meta value, or delete if there wasn't one |
| `GenerateProductDescriptionAction` | New-content creation | `wp_insert_post()`, `post_type` = `product` if WooCommerce is active else `post`, always `post_status = 'draft'` | `wp_trash_post()` |
| `GenerateExcerptAction` | Existing-field rewrite | `post_excerpt` via `wp_update_post()` | Restore previous `post_excerpt` |
| `GenerateComparisonPageAction` | New-content creation from two source posts | `wp_insert_post()`, `post_type = 'post'`, always `post_status = 'draft'` | `wp_trash_post()` |

**"One-Click Fix coverage pass for SEO", 2 more** — closes `HeadingStructureScanner`'s and
`DuplicateContentScanner`'s fix loops, the two remaining SEO findings judged safely automatable at
the single-post level (as opposed to a site-config/structural issue — see `ScannerFixMap`'s own
docblock for the rest):

| Action | Mutation pattern | Writes to | Rollback |
|---|---|---|---|
| `AddSubheadingsAction` | Existing-content rewrite | `post_content` via `wp_update_post()` | Restore previous `post_content` |
| `DifferentiateDuplicateTitleAction` | Existing-field rewrite | `post_title` via `wp_update_post()` | Restore previous `post_title` |

`GenerateAltAction` is still deliberately the one built to naturally pair with
`RuleEngine\Rules\MissingAltTextRule`'s recommendations — see "Recommendations as an input
source" below.

### `GenerateBlogAction`/`GenerateProductDescriptionAction`/`GenerateComparisonPageAction` never auto-publish

Approving any of these three only approves *generating a draft* — none put AI-written content
live. A human still has to open the draft and hit Publish themselves. This is a deliberate safety
choice, not a missing feature: the approval gate covers "should the AI attempt this," not "should
this go live unsupervised." `CreateTrustPageAction` is the one new-content action that's the
exception — it publishes immediately, on the reasoning that a missing About/Contact page is itself
the finding being fixed, and a draft trust page fixes nothing a site visitor (or an AI crawler)
would see.

### `GenerateSchemaAction`'s saved JSON-LD is now rendered on the frontend

An earlier pass of this doc listed this as a gap — it validates and saves valid JSON-LD to
`_vulopilot_schema_json` postmeta, but "actually outputting that on the frontend" was still
needed. That's since been built: `Services\SchemaJsonLdRenderer` hooks `wp_head` and outputs the
saved JSON-LD directly. See "What's not here yet" below.

## Pro actions (`modules/*/Actions/`)

Per the extension strategy above: a Pro action implements `AIActionInterface`
directly via its own `VuloPilotPro\AIActions\AbstractBasicAction`
(`get_tier()` returns `'pro'`, a separate class from Free's — both implement
the same `AIActionInterface`), registered via `vulopilot_ai_action_sources`
from inside its own module. Two were added by
[`CONTENT-INTELLIGENCE-MODULE.md`](CONTENT-INTELLIGENCE-MODULE.md)'s pass:

| Action | Module | Mutation pattern | Safety check | Rollback |
|---|---|---|---|---|
| `ExpandContentAction` (`expand-content`) | `ContentIntelligence` | Existing-content rewrite | `MIN_GROWTH_RATIO = 1.15` — output must be ≥15% *longer* than the original (rejects a paraphrase) | Restore previous `post_content` |
| `RewriteContentAction` (`rewrite-content`) | `ContentIntelligence` | Existing-content rewrite, user-directed via a required free-text `goal` input | `MIN_LENGTH_RATIO = 0.5` — same shrink guard `ImproveReadabilityAction` uses | Restore previous `post_content` |

Both are deliberately **not** entries in `OneClickFix`'s `ScannerFixMap` —
there's no deterministic scanner finding that means "this content wants more
depth" or "this content wants a tone change," so both stay standalone,
manually-invoked actions (same posture `GenerateBlogAction` already has),
reachable from the Content page's own cards/bulk-optimize (`ContentBulkOptimizeRest`,
see "Three callers" above, no longer accurate as a count) rather than
`FindingsTable`'s per-row fix button.

## Recommendations as an input source

A `Recommendation` with `requires_ai() === true` (e.g. `MissingAltTextRule`'s) is one way an
action's `raw_input` gets built — a caller constructs
`['attachment_id' => $recommendation->get_object_ref()]` from the Recommendation and calls
`propose('generate-alt', $input)`. There's no hard-coded field linking a `RuleInterface` to an
`AIActionInterface` — the connection today is by convention (matching id/concept, e.g.
`missing-alt-text` ↔ `generate-alt`), not an enforced mapping — the same status this doc originally
described, still true. In practice, `Findings`'s own `/{id}/actions/{action_id}` REST sub-route
(see `SCANNERS.md`'s "What's not here yet") and `OneClickFix`'s `ScannerFixMap` are what actually
wire a Finding to an action id today, both keeping that mapping in application code rather than in
either engine's own contract.

## Extension strategy

Identical shape to `SCANNERS.md`/`RULE-ENGINE.md`/`AI-ARCHITECTURE.md`:

1. **A new Free action**: extend `AbstractBasicAction`, add it to
   `ActionRegistry::get_default_action_classes()`.
2. **A Pro action**: implement `AIActionInterface` directly via `vulopilot-pro`'s own
   `VuloPilotPro\AIActions\AbstractBasicAction` (`get_tier()` returns `'pro'` — not `'premium'`;
   an earlier pass of this section had that wrong, inconsistent with the "Pro actions" section
   above it, which already had it right), register via
   `add_filter( 'vulopilot_ai_action_sources', ... )`, license-gated like every other Pro
   capability (`plugin-families.md`).
3. **A third-party action**: same filter, from any other plugin — no more privileged a path for
   Pro than a third party.

## What's not here yet

- ~~**REST endpoints** for `propose`/`approve`/`reject`/`rollback` and an admin UI to trigger
  them~~ — **built, on both sides.** For `propose()`: considerably more purpose-built call sites
  than the three this doc originally named; see "Three callers" above. For
  `approve()`/`reject()`/`rollback()` specifically: a dedicated, generic
  `RestAPI\Controllers\AiActionRuns` controller (`GET /ai-action-runs`, `POST /ai-action-runs/{id}/approve|reject|rollback`)
  backs a real "Pending Approval" tab in the Dashboard's `NeedsAttentionWidget` — a site owner can
  approve or reject any pending run from one place without knowing which of the many `propose()`
  call sites created it. `get_items()` reads straight from `ActionRunRepository::find_all()`,
  filterable by `status`/`action_id`. There is still no generic `propose` route, though — every
  `propose()` caller is its own purpose-built REST route or MCP tool (see "Three callers"), not a
  thin `POST /ai-actions/{id}/propose` pass-through to the raw `ActionRunner` API.
- ~~**Rendering `GenerateSchemaAction`'s saved JSON-LD** on the frontend.~~ — **built**, via
  `Services\SchemaJsonLdRenderer`'s `wp_head` hook; see above.
- **A formal Recommendation → Action mapping** (still by-convention id matching only, per
  "Recommendations as an input source" above).
- **Multimodal input** — `GenerateAltAction` is still context-based, not vision-based, for the
  same reason noted in `AI-ARCHITECTURE.md`.
