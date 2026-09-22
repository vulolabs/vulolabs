# VuloPilot — Rule Engine

Companion to [`SCANNERS.md`](SCANNERS.md) and [`DATABASE.md`](DATABASE.md).
Covers the contracts, the engine, the original 5 built-in rules, and how a
new rule gets added. [`SEO-MODULE.md`](SEO-MODULE.md) added 3 more rules
(`MissingMetaDescriptionRule`, `MissingFeaturedImageRule`,
`RobotsBlockingCrawlersRule`) and fixed a real bug this table's
`SeoTitleRewriteRule` row exposed once more scanners shared its category —
see that doc's "Fixing a category collision this pass introduced".
[`GEO-MODULE.md`](GEO-MODULE.md) added 2 more (`FaqOpportunityRule`,
`MissingSummaryBlockRule`), following the same scanner-specific-meta-key
matching discipline from the start. A further **9 rules** were added for
"WooCommerce Optimization" (per `RuleRegistry`'s own source comment — the
readme's feature list, not a numbered `docs/*.md` pass; no sibling doc
claims them, so this file is their accurate record) —
`MissingProductDescriptionRule`, `MissingProductShortDescriptionRule`,
`MissingProductAttributesRule`, `DuplicateProductSkuRule`,
`MissingProductPriceRule`, `ProductInventoryIssueRule`,
`DuplicateProductRule`, `LowProductCompletenessRule`,
`MissingProductCategoryRule` — bringing the total to **19 built-in rules**,
all still `tier = 'free'`, all still registered the same
`vulopilot_rule_sources` way. See "The 19 built-in rules" below.

## What a rule does

A rule turns a `Finding` (a scanner's raw output) into a `Recommendation`
(prioritized, actionable advice):

```
Finding                                    Recommendation
────────────────────────────────────────   ──────────────────────────────────────
category: images                           title: "Generate an ALT text suggestion"
object_type: attachment                     type: suggestion
title: "Image missing alt text: photo.jpg"  priority: 40
                                             fixable: true
                                             ai_required: true
                                             estimated_impact: medium
                                             estimated_time_minutes: 2
```

This is the worked example from the original spec — `ImagesScanner`
produces the Finding, `MissingAltTextRule` produces the Recommendation.

## Why this supersedes the original RuleEngine sketch in ARCHITECTURE.md

The first pass at `ARCHITECTURE.md` described a "Rule Engine" that
evaluated a stored condition tree against a Context to gate Automations
(`RuleEngine.php` + `ConditionRegistry.php` + `Conditions/`) — a
config-driven "if this condition matches, allow this automation to fire"
mechanism, closer to a generic rules-engine library.

Once given a concrete spec (this pass), it's clear that isn't what
"Rule Engine" needs to mean for VuloPilot. The real job is: interpret raw
scan findings into recommendations a site owner (or an automation) can act
on, with the specific metadata (type, priority, categories, tags,
fixability, AI requirement, impact, time) that make a recommendation list
usable. That's a Finding → Recommendation transform, not an abstract
condition evaluator — so this pass replaces the sketch rather than
building both. `Conditions/` (empty, never had files in it) is superseded
by `Rules/`. Automations, when built, would trigger off *Recommendations*
(the richer, already-prioritized output of this engine) rather than off a
separate condition-tree layer — see "What's not here yet" below for what
actually got built.

## Contracts (`vulolabs/plugins/vulopilot/classes/`)

These value objects and the `RuleInterface` contract used to live in a
separate Composer path package, `vulolabs/packages/php/vulopilot-core`
(see this doc's old "Operational note" below, now obsolete) — that package
no longer exists. It was folded directly into the plugin, under the
`VuloPilot\` namespace, where every class below actually lives today:

```
classes/
├── Contracts/RuleEngine/
│   └── RuleInterface.php   get_id/get_label/get_type/get_priority/get_categories/
│                           get_tags/is_fixable/requires_ai/get_estimated_impact/
│                           get_estimated_time_minutes/get_tier/applies_to()/get_recommendation()
└── ValueObjects/
    ├── RuleType.php         critical|error|warning|suggestion
    ├── Impact.php           high|medium|low
    └── Recommendation.php   the output: a rule's metadata + finding-specific content
```

- **`RuleType` and `Impact` are separate vocabularies from `Severity`.**
  `Severity` (already existed, for `Finding`) describes how bad the
  underlying problem is. `RuleType` describes the *nature* of the advice
  (is this flagging something broken, warning about risk, suggesting an
  improvement, or demanding immediate attention). `Impact` describes how
  much *fixing* it is expected to help. A low-severity Finding (one broken
  homepage link) can still produce a high-impact Suggestion; a
  medium-severity Finding (WordPress core update available) still produces
  an Error-type, high-impact recommendation. Collapsing these into one
  scale would lose real information the UI needs for sensible sorting.
- **No `ConditionInterface`.** The original sketch had one (matching
  `ScannerInterface`/`ScanResultInterface`'s planned shape); it's dropped
  here because `applies_to( Finding $finding ): bool` already *is* the
  matcher — pulling it out into a separate pluggable `Condition` object
  would only make sense if a rule needed to combine multiple independent
  conditions (AND/OR trees), which none of the 19 built-in rules do. Add
  it later if a real rule actually needs composable conditions, not
  preemptively.
- **`Recommendation` is not constructor-validated.** An earlier draft of
  this doc claimed it throws on an invalid `RuleType`/`Impact`, matching
  `Finding`'s claimed severity validation in `SCANNERS.md` — neither claim
  holds up against the actual code. `Recommendation::__construct()` just
  assigns its 13 constructor arguments straight to properties; there's no
  call to any validation helper and no exception path. `RuleType`/`Impact`
  are plain classes of string constants with no `is_valid()` helper at
  all (unlike `Severity`, which at least has one, even if nothing calls
  it). A rule returning an invalid type/impact string produces a
  `Recommendation` that silently carries it through to the dashboard.

## Engine (`vulolabs/plugins/vulopilot/classes/RuleEngine`)

```
classes/RuleEngine/
├── RuleRegistry.php   Instantiates every registered rule class, indexed by get_id()
├── RuleEngine.php      Runs rules against Findings, self-hooks vulopilot_scan_completed
└── Rules/
    ├── AbstractBasicRule.php   shared get_tier()='free' + sensible defaults
    └── (19 concrete rules)
```

- **`RuleRegistry` is structurally identical to `Scanners\ScannerRegistry`**
  — same filter-based discovery (`vulopilot_rule_sources` instead of
  `vulopilot_scanner_sources`), same "skip anything that doesn't exist or
  doesn't implement the interface" defensiveness, same reasoning for not
  copying `Modules.php`'s folder-scan mechanism. Once one engine in this
  plugin settled on a pattern, the second engine reusing it exactly is the
  point — consistency across VuloPilot's own subsystems, not just against
  the wider monorepo. Unlike `ScannerRegistry`, `RuleRegistry` has no
  category kill-switch logic and no module-gated subset — all 19 rules sit
  in one flat `get_default_rule_classes()` array, always registered.
- **`RuleEngine` self-hooks `vulopilot_scan_completed`** (the hook
  `Scanners\ScanRunner` fires) — every completed scan automatically flows
  into recommendation generation with zero coupling between the two
  engines: `ScanRunner` has never heard of `RuleEngine`; `RuleEngine` only
  depends on `ScanResult`, a shared value object both engines already
  know about. This is the concrete "extendable pipeline" the whole
  Scanners → RuleEngine → (future) AutomationEngine design has been
  building toward.
- **One rule throwing doesn't break the batch** — `generate_recommendations()`
  wraps each `applies_to()`/`get_recommendation()` call pair in a
  try/catch, same defensive posture `ScanRunner` takes toward scanners.
- **Recommendations sort by priority, highest first**, so the dashboard/AI
  Assistant can take the top of the list without re-sorting.
- **No persistence, again deliberately.** `RuleEngine` fires
  `vulopilot_recommendations_generated` and stops — writing recommendations
  anywhere durable is left to whatever's listening. Unlike `ScanResult`
  (which `Services\ScanPersistenceListener` now persists — see
  `SCANNERS.md`'s "What's not here yet"), nothing in this codebase
  currently listens for `vulopilot_recommendations_generated` to write
  `Recommendation`s anywhere durable; they're generated fresh, in memory,
  every time a caller asks.

## The 19 built-in rules (`classes/RuleEngine/Rules/`)

The original 5:

| Rule | `id` | type | priority | categories | fixable | AI required | impact | time |
|---|---|---|---|---|---|---|---|---|
| `MissingAltTextRule` | `missing-alt-text` | suggestion | 40 | `images` | yes | **yes** | medium | 2 min |
| `UnresolvedCriticalFindingRule` | `unresolved-critical-finding` | **critical** | 100 | *(any — see below)* | no | no | high | 15 min |
| `CoreUpdateAvailableRule` | `core-update-available` | error | 90 | `updates` | yes | no | high | 10 min |
| `DormantPluginRule` | `dormant-plugin` | warning | 20 | `plugins` | yes | no | low | 3 min |
| `SeoTitleRewriteRule` | `seo-title-rewrite` | suggestion | 30 | `seo` | yes | **yes** | medium | 5 min |

[`SEO-MODULE.md`](SEO-MODULE.md)'s 3:

| Rule | `id` | type | priority | categories | fixable | AI required | impact | time |
|---|---|---|---|---|---|---|---|---|
| `MissingMetaDescriptionRule` | `missing-meta-description` | suggestion | 35 | `seo` | yes | **yes** | medium | 2 min |
| `MissingFeaturedImageRule` | `missing-featured-image` | suggestion | 15 | `seo` | yes | no | low | 3 min |
| `RobotsBlockingCrawlersRule` | `robots-blocking-crawlers` | **critical** | 95 | `seo` | no | no | high | 10 min |

[`GEO-MODULE.md`](GEO-MODULE.md)'s 2:

| Rule | `id` | type | priority | categories | fixable | AI required | impact | time |
|---|---|---|---|---|---|---|---|---|
| `FaqOpportunityRule` | `faq-opportunity` | suggestion | 30 | `geo` | yes | **yes** | medium | 3 min |
| `MissingSummaryBlockRule` | `missing-summary-block` | suggestion | 30 | `geo` | yes | **yes** | medium | 3 min |

"WooCommerce Optimization" (readme, undocumented elsewhere)'s 9 — every
one of these is deliberately `is_fixable() === false`/`requires_ai() === false`
by default (inherited from `AbstractBasicRule`) unless its own docblock
argues a specific field is safe to automate; most explicitly say why
*not* (a business judgment call, not something an AI action should apply
unattended):

| Rule | `id` | type | priority | fixable | AI required | impact | time |
|---|---|---|---|---|---|---|---|
| `MissingProductPriceRule` | `missing-product-price` | **critical** | 95 | no | no | high | 3 min |
| `MissingProductAttributesRule` | `missing-product-attributes` | error | 80 | no | no | high | 10 min |
| `DuplicateProductSkuRule` | `duplicate-product-sku` | error | 75 | no | no | high | 5 min |
| `ProductInventoryIssueRule` | `product-inventory-issue` | error | 70 | no | no | high | 5 min |
| `MissingProductDescriptionRule` | `missing-product-description` | warning | 60 | **yes** | **yes** | high | 3 min |
| `DuplicateProductRule` | `duplicate-product` | warning | 55 | no | no | medium | 10 min |
| `MissingProductCategoryRule` | `missing-product-category` | suggestion | 50 | no | no | medium | 2 min |
| `LowProductCompletenessRule` | `low-product-completeness` | suggestion | 45 | no | **yes** | medium | 15 min |
| `MissingProductShortDescriptionRule` | `missing-product-short-description` | suggestion | 40 | **yes** | **yes** | medium | 2 min |

All 9 have `get_categories() === array('woocommerce')`. Two worked
examples of the "not fixable, on purpose" reasoning, straight from their
own docblocks: `MissingProductAttributesRule` — "deciding what attributes
a variable product should have (size, color, material, …) and what
variations to generate from them is a business decision, not something an
AI action can safely apply automatically. Still worth surfacing as a
recommendation: this scanner catches a product that looks published but
cannot actually be bought." `DuplicateProductRule` — "whether two
identically-titled products are a genuine accidental duplicate (merge/
delete one) or intentional (e.g. two different variations sold as
separate simple products) is a judgment call for the store owner, not
something to resolve automatically."

Across all 19, every `RuleType`, both `is_fixable()` states, both
`requires_ai()` states, and one cross-cutting rule alongside eighteen
category-scoped ones are represented — not an attempt to cover all 66
scanners' worth of findings (that's a natural, separate follow-up, same
way the original 5-rule pass didn't try to write a rule per scanner up
front).

`UnresolvedCriticalFindingRule.get_categories()` returns an empty array —
by convention (documented on `RuleInterface::get_categories()`), an empty
array means the rule is cross-cutting and matches on something other than
category (here, `Severity::CRITICAL`, regardless of what category the
Finding belongs to).

## Extension strategy

Identical shape to `SCANNERS.md`'s, on purpose — once a pattern exists in
this codebase, the second engine that could reuse it should, rather than
inventing a parallel-but-different extension mechanism:

1. **A new Free built-in rule**: add a class under `classes/RuleEngine/Rules/`
   extending `AbstractBasicRule`, add its `::class` reference to
   `RuleRegistry::get_default_rule_classes()`.
2. **A Pro premium rule**: implement `VuloPilot\Contracts\RuleEngine\RuleInterface`
   directly inside a Pro module (`get_tier()` would return `'pro'` — not
   `'premium'`, matching the correction in `SCANNERS.md`'s and
   `AI-ACTIONS.md`'s own extension-strategy sections — since Pro rules
   don't extend `AbstractBasicRule`, whose whole reason to exist is
   hard-coding `'free'`), hook `add_filter( 'vulopilot_rule_sources', ... )`
   from the module's `Module.php` to append the class name. **Unlike
   scanners and AI actions, no Pro module actually does this yet** —
   there's no `vulopilot-pro` class implementing `RuleInterface` and no
   `vulopilot_rule_sources` filter callback anywhere in that plugin today.
   The mechanism is real and ready; nothing has used it.
3. **A third-party rule**: same mechanism as step 2, from any other plugin
   or theme — no more privileged a path for Pro than for a third party.

## What's not here yet

- **Persistence** of `Recommendation`s. Unlike `SCANNERS.md`'s equivalent
  gap (now closed by `Services\ScanPersistenceListener`), this one is
  still open: nothing listens for `vulopilot_recommendations_generated` to
  write a `Recommendation` anywhere durable. `RestAPI\Controllers\Findings`'s
  `/{id}/actions/{action_id}` sub-route (see `SCANNERS.md`) lets the
  dashboard act on a Finding directly via `AI-ACTIONS.md`'s `propose()`
  without needing a persisted `Recommendation` row at all — which may be
  why this gap was never closed: the REST layer routed around it rather
  than through it.
- ~~The Automation Engine.~~ Built — see
  [`AUTOMATION-ENGINE-MODULE.md`](AUTOMATION-ENGINE-MODULE.md).
  `vulopilot-pro`'s `Automation\AutomationEngine` (confirmed present at
  `modules/Automation/AutomationEngine.php`) triggers off `Recommendation`s
  exactly as sketched here, plus a small, separately registered
  "Conditions" layer on top (composable, but still flat and ANDed — not
  the standalone condition-tree this doc already rejected). Free itself
  also gained a much smaller, engine-free counterpart since this doc's
  first pass — `Automation\ManualActionRunner` (`classes/Automation/`,
  "Manual Actions Only" per the readme) runs one registered action against
  one already-known Finding, by hand, building a synthetic `Recommendation`
  directly off that Finding rather than going through
  `RuleEngine::generate_recommendations()` at all, since a manual run has
  no rule that matched in the first place.
- **User-authored custom rules.** The former `vulopilot_rules` table was
  removed (nothing read or wrote it). A *different*, later feature — letting
  a site owner author or override rules from the dashboard — would add its
  own table. The 19 rules in this codebase are code-defined,
  like scanners; when the
  custom-rule-builder feature is built, it's an addition alongside these,
  not a replacement.

## A note on this doc's former "Operational note" section

An earlier pass of this document had a section here about `vulopilot-core`
being wired in via a Composer path repository with `symlink: false`, and a
caveat about `composer update` sometimes reusing a stale `vendor/` copy.
That entire package has since been folded into the plugin itself (see
"Contracts" above) — there is no longer a separate `vulopilot-core`
package, no path repository, and no `vendor/` copy to go stale. The
section is removed rather than left around describing infrastructure that
no longer exists.
