# VuloPilot — MCP Server

Companion to [`DATABASE.md`](DATABASE.md), [`SCANNERS.md`](SCANNERS.md), and
[`WOOCOMMERCE-INTELLIGENCE-MODULE.md`](WOOCOMMERCE-INTELLIGENCE-MODULE.md).

**This entire feature is Pro-only.** There is no Free-side MCP server, no
Free-side MCP code of any kind, and nothing in this file describes something
Free ships. Confirmed by grepping this plugin's own source tree: no `Mcp*`
class, no `/mcp` route, no MCP-related file exists anywhere under
`vulolabs/plugins/vulopilot/`. Every file that implements this feature lives
in `vulopilot-pro/modules/McpServer/` — see that plugin's own
[`MCP-SERVER-MODULE.md`](../../../../plugins/vulopilot-pro/docs/MCP-SERVER-MODULE.md)
for the full audit (every file, the protocol handler, all 16 tools, the
constructor-ordering bug that made an early draft silently register zero
tools, and more). Read that doc for the real detail; what follows here is
this file's actual job — an honestly-scoped pointer, not a duplicate.

## Why this doc still exists on the Free side at all

Every other module doc in this folder — `RULE-ENGINE.md`, `SCANNERS.md`,
`GEO-MODULE.md`, `AI-CRAWLER-ANALYTICS-MODULE.md`, etc. — documents a real
capability split across both tiers, or at minimum a Free-owned engine that
Pro extends. MCP Server is neither: the entire module (contract, registry,
protocol handler, every one of its 16 tools) is Pro-exclusive, per
`modules/McpServer/Module.php`'s own docblock: "No Free-side equivalent
exists at all." This file exists specifically so someone browsing Free's own
`docs/` folder doesn't come away thinking Free exposes an MCP endpoint — it
doesn't — and so the *Free-owned* pieces this Pro-only module reuses (below)
are documented from the side that actually owns them.

## What Free owns that this Pro-only module reuses, unmodified

| Free-owned piece | What it already does | How MCP Server (Pro) reuses it |
|---|---|---|
| `AiCopilot\ActionRunner::propose()` | Validates input → builds an AI prompt → calls the provider → validates the output → persists a `pending_approval` row in `vulopilot_ai_action_runs` and returns its preview. Never applies anything itself. | The entire mechanism behind "Approval-based execution only" — every Content/SEO/Visibility/WooCommerce tool calls this and nothing else. |
| `FindingRepository` / `Reports\ReportTypeInterface` | Pure, already-existing read/aggregate queries over `vulopilot_scan_findings` and registered report types. | The two Report tools (`get_findings`/`get_report`) are read-only wrappers around these — no new query logic exists in Pro for them. |
| `AutomationRepository` (Free-owned table/repository; `TriggerRegistry`/`ActionRegistry`/`ConditionRegistry` are Pro, see [`AUTOMATION-ENGINE-MODULE.md`](AUTOMATION-ENGINE-MODULE.md)) | Already backs `Automation\AutomationsRest::create_item()`'s own validation. | `create_automation` mirrors that same validation, forcing the created row's `status` to `'disabled'`. |
| WordPress Application Passwords (WP core, 5.6+) | Already-built, already-secure, per-user, revocable REST credentials. | The only authentication this module uses to let an external MCP client call `POST /mcp` — no new credential storage was written. |
| `enable_mcp_server` setting | A normal `VULOPILOT_SETTINGS_DEFAULTS` entry (Free-owned, `Utill.php`, **off by default**) like every other feature-gate setting in this plugin. | Read by Pro's `McpServerRest` to decide whether `POST /mcp` does anything beyond reporting itself disabled. |
| `mcp-server-status` dashboard widget id | Added to Free's own `Utill::DASHBOARD_WIDGET_IDS` — required, or a saved dashboard layout would silently drop the widget. | Backs Pro's `McpServerStatusWidget.tsx`, registered into Free's grid via `vulopilot_dashboard_widgets`. |

No JSON-RPC or MCP SDK exists anywhere in this monorepo's dependency tree —
confirmed by checking every `composer.json`/`composer.lock` in the repo. The
wire protocol itself is hand-implemented in Pro, scoped to only the four
JSON-RPC methods a tools-only server needs (`initialize`,
`notifications/initialized`, `tools/list`, `tools/call`, plus `ping`),
targeting MCP protocol version `2024-11-05`. Full breakdown of that protocol
handler, the transport route, all 16 tools and which action/repository each
one wraps, and the approval-gate mechanics: see the Pro-side doc linked
above.

## What's not here — and never will be, on this side

- **No MCP server code of any kind on the Free side.** Not a smaller/manual
  version, not a stub — nothing. This is a genuine tier boundary, not a gap.
- **No `resources`/`prompts` MCP capabilities**, on either side — Pro's own
  doc covers why (the spec this was built against names only "Tools"
  categories).
- **No `approve`/`reject`/`rollback` MCP tool**, on either side —
  deliberate, not an oversight; see Pro's doc for the full reasoning behind
  "Approval-based execution only."
