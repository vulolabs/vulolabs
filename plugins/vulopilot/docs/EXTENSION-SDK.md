# VuloPilot — Extension SDK

Companion to [`SCANNERS.md`](SCANNERS.md), [`RULE-ENGINE.md`](RULE-ENGINE.md), and
[`AI-ACTIONS.md`](AI-ACTIONS.md). Covers every real extension point in this plugin — PHP, REST,
React, and CLI — and the `ExtensionInterface`/`ExtensionManager` layer that ties the PHP ones
together with a real version-compatibility gate.

## What this is (and isn't)

Before this pass, extending VuloPilot meant knowing which of 8 separate filters to hook, with no
shared identity, no version declared, and no compatibility check — a scanner class registered via
`vulopilot_scanner_sources` against a VuloPilot version that removed a method it relies on would
simply fatal at scan time. `Sdk\ExtensionInterface`/`Sdk\ExtensionManager` don't replace those 8
filters — an extension's own `register()` method still calls them, exactly as before. What's new is
one place to declare *who this is, what version it is, and what core version it needs*, checked
once, honestly, before any of the extension's own registrations run.

This is not a module system. `module-architecture.md`'s folder-scan/reflection discovery
(`Module.php` + `Frontend.php`/`Rest.php`/…) is a different, heavier mechanism for a different job
(vulolabs-pro/catalogx-pro's `modules/` trees) that VuloPilot deliberately doesn't have — see
`plugin-families.md`. An `ExtensionInterface` implementation is a single class, not a folder.

## PHP extension points

| Filter | Registry | Registers |
|---|---|---|
| `vulopilot_extension_sources` | `Sdk\ExtensionManager` | `ExtensionInterface` implementations — the entry point everything below is normally reached through |
| `vulopilot_scanner_sources` | `Scanners\ScannerRegistry` | `ScannerInterface` implementations (`SCANNERS.md`) |
| `vulopilot_rule_sources` | `RuleEngine\RuleRegistry` | `RuleInterface` implementations (`RULE-ENGINE.md`) |
| `vulopilot_trigger_sources` | `VuloPilotPro\Automation\TriggerRegistry` | `TriggerInterface` implementations |
| `vulopilot_automation_action_sources` | `VuloPilotPro\Automation\ActionRegistry` | Automation `ActionInterface` implementations |
| `vulopilot_report_type_sources` | `Reports\ReportTypeRegistry` | `ReportTypeInterface` implementations |
| `vulopilot_report_exporter_sources` | `Reports\ReportExporterRegistry` | `ReportExporterInterface` implementations |
| `vulopilot_ai_action_sources` | `AiCopilot\ActionRegistry` | `AIActionInterface` implementations (`AI-ACTIONS.md`) |
| `vulopilot_rest_controllers` | `RestAPI\Rest` | Extra `\WP_REST_Controller` instances, keyed by an id, added to the central dispatcher |

All ten follow the same shape: a class-string (or, for `vulopilot_rest_controllers`, an instance)
added to the filtered array, checked against the right interface, silently skipped if it doesn't
match — one broken third-party registration never takes the rest down with it.

**`vulopilot_trigger_sources` and `vulopilot_automation_action_sources` are the two exceptions to
"Free applies every filter in this table."** Every other row's registry class lives in Free
(`vulolabs/plugins/vulopilot/classes/`) and `apply_filters()`s unconditionally on every request.
These two don't — `apply_filters('vulopilot_trigger_sources', …)` and
`apply_filters('vulopilot_automation_action_sources', …)` only exist inside
`vulopilot-pro/modules/Automation/TriggerRegistry.php`/`ActionRegistry.php` (namespace
`VuloPilotPro\Automation`, not `AutomationEngine` — there's no `AutomationEngine` namespace
anywhere in this codebase; `Contracts\Automation\TriggerInterface`'s own docblock phrasing predates
where the registry actually ended up). Free ships the `TriggerInterface`/`ActionInterface`
contracts and Free's own separate, smaller `Automation\ActionRegistry`
(`vulopilot_manual_action_sources` — a different filter again, backing only
`ManualActionRunner`'s "run one action against one open finding, right now," not the full
trigger→rule→action engine), but the two full-engine registries these two filters feed are only
ever instantiated when `vulopilot-pro`'s own `Automation` module is active. Registering a trigger
or automation-action class into either filter is a no-op on a Free-only install — there's nothing
there yet to read the filtered array back.

### Writing an extension

```php
namespace MyCompany\VuloPilotWidgets;

use VuloPilot\Contracts\Extension\ExtensionInterface;

class Extension implements ExtensionInterface {

    public function get_id(): string {
        return 'my-company-widgets';
    }

    public function get_name(): string {
        return 'My Company Widgets for VuloPilot';
    }

    public function get_version(): string {
        return '1.0.0';
    }

    public function get_minimum_vulopilot_version(): string {
        return '1.1.0';
    }

    public function register(): void {
        add_filter( 'vulopilot_scanner_sources', function ( $classes ) {
            $classes[] = MyScanner::class;
            return $classes;
        } );
    }
}

add_filter( 'vulopilot_extension_sources', function ( $classes ) {
    $classes[] = \MyCompany\VuloPilotWidgets\Extension::class;
    return $classes;
} );
```

`Sdk\ExtensionManager` instantiates `Extension`, compares `get_minimum_vulopilot_version()` against
the running core version via `Sdk\VersionGuard::meets_minimum()`, and only calls `register()` if
that passes — otherwise it's logged (`vulopilot_activity_logs`, event `extension.incompatible`) and
surfaced as an admin notice, never silently ignored. A `register()` call that throws is caught,
logged (event `extension.registration_failed`), and doesn't take any other extension down with it.

### `Sdk\VersionGuard`

Compatibility-check helpers so an extension doesn't hand-roll its own `version_compare()` (an easy
place to get the comparison direction backwards): `meets_minimum( $current, $required )`,
`is_php_compatible( $required )`, `is_wp_compatible( $required )`,
`is_woocommerce_compatible( $required = null )`.

### `Sdk\AbstractServiceProvider`

Optional base class for organizing an extension's *own* internal service wiring — the same
lazy-factory container shape every plugin bootstrap in this codebase already uses
(`php-wordpress.md`), given a name so an SDK consumer can extend it instead of re-deriving it.
Deliberately not a real DI container (no autowiring, no reflection) — that would be new tooling the
root `CLAUDE.md`'s "Out of scope" section says to flag, not add. Nothing in VuloPilot core resolves
anything through a provider; it exists purely for an extension's own use inside its own
`register()`.

```php
class MyServiceProvider extends \VuloPilot\Sdk\AbstractServiceProvider {
    public function register(): void {
        $this->bind( 'my.client', fn() => new ApiClient() );
    }
}

$provider = new MyServiceProvider();
$provider->register();
$client = $provider->make( 'my.client' ); // lazily constructed, cached after first call
```

### Other PHP filters — shaping a value, not registering a class

The ten filters in the table above all share one shape: a class-string added to an array, checked
against an interface. A handful of other filters exist that don't fit that shape — they let an
extension shape or override a single value instead of registering a whole class:

| Filter | Where | Lets an extension… |
|---|---|---|
| `vulopilot_finding_list_response` | `Controllers/Findings.php` | Annotate the `GET /findings` response before it's returned — e.g. `vulopilot-pro`'s `OneClickFix` module adds a `fix_action_id` to each row without Free knowing anything about AI-action-to-scanner mapping |
| `vulopilot_custom_report_type` | `Reports/ReportGenerator.php` | Supply a report type the built-in `ReportTypeRegistry` doesn't recognize, given the registry and any other requested type ids as context |
| `vulopilot_crawler_bot_signatures` | `Services/CrawlerTrafficLogger.php` | Extend the User-Agent-substring → bot-name map `AiCrawlerBlockedPagesScanner` and the crawler-traffic logger both read from, without editing that class |
| `vulopilot_crawler_log_retention_days` | `Services/CrawlerTrafficLogger.php` | Override how many days of `vulopilot_crawler_visits` rows (`DATABASE.md`, table 14) the daily cleanup cron keeps — Free's own default is the site's "Log retention" setting (30 by default) |
| `kothay_dabba_vulopilot` | `Utill::is_khali_dabba()` | Tell Free whether Pro is active — `VuloPilotPro::check_pro_active()` is the only real hook, mirroring `VuloLabs\Utill::is_khali_dabba()`'s identical role for the free/Pro relationship elsewhere in this family; the odd literal name is this family's own established convention, not a typo |

None of these are documented elsewhere, and none replace anything in the class-registration table
above — they're narrower, single-value extension points worth knowing about for the same reason:
each is a real, currently-applied `apply_filters()` call a third party can hook.

### PHP action hooks — observing an event, not changing anything

Distinct again from both tables above: these `do_action()` calls don't return a value an extension
can shape — they're notifications an extension can react to, the same "one-way dependency, no
callback return value" shape WordPress action hooks always have.

| Hook | Fired by | When |
|---|---|---|
| `vulopilot_loaded` | `VuloPilot.php`, end of `init_classes()` | Free has finished booting — the gate `vulopilot-pro`'s own bootstrap (and every Pro module) waits for before instantiating anything, per the root `CLAUDE.md`'s boot-order description |
| `vulopilot_after_installed` | `Install::run_migration()` | A fresh install or an upgrade's migration pass has just finished |
| `vulopilot_scan_completed( $result )` | `Scanners/ScanRunner.php` | One `ScannerInterface` run has finished — `$result` is a `ValueObjects\ScanResult`. `vulopilot-pro`'s `AccessibilityAudits` module self-hooks this to refresh `vulopilot_accessibility_snapshots` (`DATABASE.md`, table 23) |
| `vulopilot_scan_persisted( $scan_result, $scan_id )` | `Services/ScanPersistenceListener.php` | A scan's results have just been written to `vulopilot_scans`/`vulopilot_scan_findings` — `$scan_id` is the just-inserted row id. `vulopilot-pro`'s `AdvancedReports` module hooks this to recalculate/refresh its own data |
| `vulopilot_recommendations_generated( $recommendations, $findings )` | `RuleEngine/RuleEngine.php` | The Rule Engine has finished turning a batch of findings into recommendations, before any persistence layer reacts to them |

## React extension points

Already real, not part of this pass — listed here so the PHP-side points above aren't mistaken for
the whole story:

- **`vulopilot_settings_context`** (`@wordpress/hooks` filter, `src/services/templateService.ts`) —
  swaps in an additional `require.context` of declarative settings-tab configs
  (`EXTENSION-SDK.md`'s PHP-side analogy: this is the React settings framework's own extension
  point, same one the free vulolabs plugin's `Settings.tsx` uses).
- **`vulopilot_dashboard_widgets`** (`@wordpress/hooks` filter, `src/dashboard-widgets/registry.ts`,
  see `DASHBOARD-WIDGETS.md`) — adds a widget to the Dashboard page's reorderable grid.
- **Pro's own dynamic module loading** — Pro's `src/index.tsx` doesn't mount a React root
  (`react-frontend.md`); it `require.context`-loads each `modules/*/src/index.(ts|tsx)` entry gated
  on `appLocalizer.active_modules`. A third-party extension with its own React UI follows the same
  shape: register filters into the two points above rather than trying to mount a second root.

## CLI extension point

`classes/Cli/VuloPilotCommand.php` — the first WP-CLI commands in this codebase (zero existed
before this pass), registered on `cli_init` only when `WP_CLI` is actually the running process, so
`\WP_CLI`/`\WP_CLI\Utils` classes are never referenced on a normal web request.

| Command | Does |
|---|---|
| `wp vulopilot scan run [<scanner-id>] [--category=<category>]` | Runs one scanner, a whole category, or every scanner |
| `wp vulopilot scan list [--status=<status>] [--per-page=<n>]` | Lists recent `vulopilot_scans` rows |
| `wp vulopilot report generate --type=<type> [--format=<format>] [--period-days=<n>]` | Generates a report synchronously via `Reports\ReportGenerator` |
| `wp vulopilot extensions list` | Lists registered extensions and any skipped for a version mismatch |
| `wp vulopilot settings get [<key>]` | Prints one setting, or every setting as JSON |
| `wp vulopilot settings set <key> <value>` | Sets one setting |
| `wp vulopilot settings reset` | Resets every setting to its default |

A third party can register its own commands under the `vulopilot` namespace the same way —
`WP_CLI::add_command( 'vulopilot my-command', ... )` on `cli_init` — there's no separate discovery
filter for CLI commands (WP-CLI's own `cli_init` hook already *is* the discovery mechanism; adding
a second one on top would just be indirection).

## What's deliberately not here

- **No autowiring/reflection-based DI.** `AbstractServiceProvider` is explicit `bind()`/`make()`
  only, matching this codebase's existing container pattern rather than introducing one.
- **No extension marketplace/update-check mechanism.** This SDK is about *registering* an
  extension's code with a running site, not about discovering, installing, or updating extensions —
  that's WordPress.org's/a commercial licensing server's job, out of scope here.
- **No CLI command discovery filter.** See above — `cli_init` already is one.
