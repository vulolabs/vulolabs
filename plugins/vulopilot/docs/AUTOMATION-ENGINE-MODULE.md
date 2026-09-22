# VuloPilot — Automation Engine

Companion to [`DATABASE.md`](DATABASE.md), [`RULE-ENGINE.md`](RULE-ENGINE.md),
and [`SCANNERS.md`](SCANNERS.md), and to `vulopilot-pro`'s own
[`AUTOMATION-ENGINE-MODULE.md`](../../../../plugins/vulopilot-pro/docs/AUTOMATION-ENGINE-MODULE.md)
(the Pro-side file — every file in `modules/Automation/`, in full detail;
read this one first). Unlike every other module doc in this folder, this
one covers a subsystem that was **already substantially built** before this
pass (12 triggers, 4 actions, cooldown, run history, a bare-bones Workflow
Builder UI, all in `vulopilot-pro`'s own `Automation` module) — the audit
below establishes exactly what existed, what this pass closed, and what's
still genuinely new.

## Audit: what already existed

`Contracts\Automation\TriggerInterface`/`ActionInterface` (Free), and
`vulopilot-pro`'s `Automation\TriggerRegistry`/`ActionRegistry`/
`AutomationEngine`/`Scheduler`/`AutomationsRest`/`AutomationRunsRest`/
`AutomationPanel.tsx`, were all real, working code: a `vulopilot_automations`
row binds a trigger type + an optional bound rule (`trigger_config.rule_key`,
a `RuleInterface::get_id()`) to an ordered list of actions;
`AutomationEngine` matches currently-open `RuleEngine`-generated
`Recommendation`s against enabled automations, respects a cooldown, and
logs every run to `vulopilot_automation_runs`. `readme.txt`'s "Manual
Actions Only" (Free) / "Triggers, Conditions, Actions, Schedules, Email,
Workflow Builder, Automation Dashboard, Logs, Retries" (Pro) split maps
onto this existing engine as follows:

| Spec item | Status before this pass |
|---|---|
| Triggers | Already fully built (12 triggers — `TriggerRegistry`'s own docblock notes this count grew by one after this audit was first written) — untouched by this pass. |
| Actions | Already fully built (4 actions) — untouched. |
| Schedules | Already fully built (`Scheduler`, hourly/daily/weekly/monthly cron) — untouched. |
| Email | Already fully built (`Actions\SendEmailAction`) — untouched. |
| Conditions | **Did not exist at all** — no `ConditionInterface`, no config beyond the single bound rule. |
| Workflow Builder | Existed only as a single-action, no-conditions create form. |
| Automation Dashboard | Existed only as Free's own small `AutomationStatusWidget` (enabled/disabled counts). |
| Logs | `GET /automation-runs` existed (read-only), but had **no UI** — `AutomationPanel.tsx` only ever showed `last_triggered_at` on the automations table itself. |
| Retries | **Did not exist at all** — a failed run just stayed `failed`. |
| Manual Actions Only (Free) | **Did not exist at all** — Free's own `Controllers\Automations::run_item()` hard-coded a 501 "not implemented yet" regardless of site state. |

One real, pre-existing bug was also found and fixed in this pass:
`AutomationRunRepository::get_breakdown_by_automation_for_period()`'s SQL
and `Reports\Types\AutomationReport::generate()` both checked for
`status = 'success'`/`'failure'`, but `AutomationEngine` has only ever
written `running`/`completed`/`failed` — every automation report's
succeeded/failed counts were silently always zero. Fixed by correcting
both to the real status strings.

## Free — "Manual Actions Only"

Free's entire automation capability is `Automation\ManualActionRunner`:
run one registered action against one specific, already-open Finding,
right now, by hand — no trigger, no bound rule, no cooldown, no
`vulopilot_automations` row, no run history. Those are exactly the axes
`vulopilot-pro`'s Automation module adds on top.

`ActionInterface::execute()` takes a `Recommendation`, not a `Finding` —
since a manual run has no `RuleInterface` match behind it,
`ManualActionRunner::build_recommendation()` builds a synthetic one
directly off the real Finding row (`rule_id = 'manual'`), the same kind of
honest synthetic marker `KNOWLEDGE-GRAPH-MODULE.md`'s synthetic entity ids
already establish for "there's no real matched-rule here, and pretending
there is would be dishonest."

Free ships exactly one concrete action of its own,
`Automation\Actions\SnoozeFindingAction` (`snooze-finding`) — `'snoozed'`
has been a valid Finding status since it was first introduced
(`FindingRepository::get_status_counts()`, the FindingsTable status
filter), but nothing had ever actually set it; `FindingsTable.tsx` only
ever wired "Mark resolved"/"Ignore"/"Reopen". This is deliberately
distinct from `resolve-finding` (Pro, permanent "this is fixed") and
`create-notification` (Pro, an FYI with no state change): a temporary
"not now, but don't forget it either." Registered via Free's own
`Automation\ActionRegistry`, filter `vulopilot_manual_action_sources` —
a separate registry and filter from Pro's own
`vulopilot_automation_action_sources`, since the two serve genuinely
different concerns (one action manually, vs. binding many into a
persisted workflow) and mixing their discovery would only invite a class
meant for one engine being silently picked up by the other.

`POST /findings/{id}/actions/{action_id}` (`Controllers\Findings::run_manual_action()`)
backs `FindingsTable.tsx`'s new "Snooze" row action — the first thing in
this codebase to invoke `ActionInterface::execute()` outside
`vulopilot-pro`'s own engine.

## Pro (`modules/Automation/`)

### Conditions — a flat, ANDed layer, not a condition tree

`VuloPilotPro\Automations\Contracts\ConditionInterface` (Pro — moved out of
Free, since only Pro's `Conditions/` implement it; mirrors
`ActionInterface`'s shape) + `Automation\ConditionRegistry` (Pro, same
filter-based discovery as `TriggerRegistry`/`ActionRegistry`, filter
`vulopilot_automation_condition_sources`). Four built-in conditions
(`Conditions/`): `MinPriorityCondition`, `CategoryCondition`,
`ImpactCondition`, `FixableOnlyCondition`. Same "no condition tree"
reasoning `RULE-ENGINE.md` already gives for `RuleInterface` itself —
an ordered, ANDed list (matching how `actions` are already a flat ordered
list, not a tree) is enough to express "match this rule AND priority ≥ 50
AND category is one of X"; nothing here needs OR/nesting yet.

Stored in a new `conditions` column on `vulopilot_automations` (Free-owned
migration, `Install::add_automations_conditions_column()` — self-healing,
column-existence-guarded since `ALTER TABLE ... ADD COLUMN` isn't
naturally idempotent the way `CREATE TABLE IF NOT EXISTS` is).
`AutomationEngine::filter_matching_recommendations()` now ANDs every
configured condition on top of the existing bound-rule check;
`AutomationsRest::create_item()` validates each condition's `type`
against the registry before storing.

### Automation Dashboard — a richer Pro-only summary

Free's own `AutomationStatusWidget` (a Dashboard-page widget) already
shows enabled/disabled counts. `AutomationDashboardCard.tsx` is a
different, Pro-only card at the top of the Automation *page* itself
(inside `AutomationPanel.tsx`, not the Dashboard grid), backed by a new
dedicated endpoint, `GET /automation-dashboard-stats`
(`AutomationDashboardRest.php`) — today's run/succeeded/failed counts in
addition to the enabled/disabled split, deliberately its own endpoint
rather than overloading `GET /automations`/`GET /automation-runs`, neither
of which returns "today" stats or needed a shape change to their own
established paginated-list contracts.

### Logs — real UI over an endpoint that already existed

`GET /automation-runs` (`AutomationRunsRest.php`) already existed,
read-only; this pass adds `AutomationLogsPanel.tsx`, a real run-history
view (toggled from the automations table via `AutomationPanel.tsx`'s
"Show logs" button) — status, triggered-by, retry count, and an
expandable per-action result breakdown read straight from
`result_log`/`AutomationRunResult::to_array()`. `AutomationRunsRest::get_items()`
now also annotates each row with `automation_name` (one lookup query per
distinct `automation_id` in the page, not an N+1 per row, same
`performance.md` discipline `get_breakdown_by_automation_for_period()`'s
own join already follows) — the run rows previously only exposed a bare
`automation_id`.

### Retries — re-attempt in place, not a new run

A failed run previously just stayed `failed` forever. Two new site-wide
settings (`automation_max_retries`, default `0` = off;
`automation_retry_delay_minutes`, default `5`) gate a delayed single
`wp_schedule_single_event()` (`Scheduler::schedule_once()`, a one-off
counterpart to the existing `schedule_recurring()` — no new
queue/scheduling library, same "wp-cron, not Action Scheduler" restraint
`Scheduler`'s own docblock already states) firing
`AutomationEngine::RETRY_HOOK`, handled by `AutomationEngine::retry_run()`.

Recommendations are never persisted (`RuleEngine`'s own docblock) — a
retry can't replay the *exact* original `Recommendation` object. Rather
than adding a new persistence layer just for this, `retry_run()` re-asks
`RuleEngine` the same question `run_now()` already does (does this
automation's rule + conditions still match a currently-open finding right
now) and re-attempts on whatever it finds. If the underlying finding was
resolved or changed in the meantime, there's honestly nothing left to
retry — the run stays `failed` rather than fabricating a result. Retries
re-attempt the *same* `vulopilot_automation_runs` row in place
(`retry_count` column, new — `Install::add_automation_runs_retry_count_column()`,
same self-healing column-existence-guard as `conditions` above), not a
new row, so a run's full retry history stays on one line in Logs.
`AutomationEngine::execute_actions()` is the shared "loop this
automation's actions against this recommendation" helper both a fresh run
and a retry now call, extracted from the original single `run_automation()`
method so retry logic doesn't duplicate it.

### Workflow Builder — exposing what the engine already supported

`AutomationEngine`/`AutomationsRest` already accepted an ordered `actions`
array (any number of actions), but `AutomationPanel.tsx`'s create form only
ever built a single-element array. This pass's rebuilt form is a real
multi-row builder: add/remove any number of action rows (each with
whichever of that action's own config fields are worth exposing —
`send-email`'s optional recipient override, `run-ai-action`'s required
`ai_action_id`) and any number of condition rows (each with its own
condition-specific config field), reusing the same "hardcoded options
array matching the backend registry's defaults 1:1" convention this file
already used for triggers/actions, applied consistently to conditions too.

## What's not here yet

- **A generic condition-tree/AND-OR builder.** Deliberately out of scope,
  same reasoning `RULE-ENGINE.md` already gives for `RuleInterface` itself
  — nothing here needs composable boolean logic yet, just a flat ANDed
  list.
- **Retry backoff strategies** (exponential, jitter). `automation_retry_delay_minutes`
  is a single fixed delay reused for every retry attempt of a given run,
  not an increasing one — a real, simple v1, not a full backoff policy.
- **A dedicated GET /automation-conditions endpoint.** `AutomationPanel.tsx`
  hardcodes `CONDITION_TYPE_OPTIONS` client-side, matching how
  `TRIGGER_TYPE_OPTIONS`/`ACTION_TYPE_OPTIONS` already do — not fetched
  from `ConditionRegistry` over REST.
