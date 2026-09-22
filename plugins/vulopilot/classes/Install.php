<?php
/**
 * Install class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot Install class.
 *
 * Creates every VuloPilot custom table, dbDelta()-based like
 * VuloLabs\Install. VuloPilot resets its baseline to 1.0.0 here — this
 * plugin has never actually shipped to a real site under any earlier
 * version, so there is no live "upgrade from an older release" case to
 * support. The incremental, version-gated do_migration() this class used
 * to carry (real ADD COLUMN/CREATE TABLE steps layered on top of an
 * already-installed 1.0.0/1.1.0 site) has been removed for that reason —
 * every table and column it used to add on top now ships directly in
 * create_database_tables() below instead, and every module it used to
 * seed active on top now ships directly in VuloPilot::activate()'s own
 * add_option() call. A future schema change on top of a real 1.0.0
 * release will need its own do_migration()-shaped mechanism again; this
 * is a reset, not a permanent removal of the concept. Schema design and
 * the rationale for every table/index below is documented in
 * vulolabs/plugins/vulopilot/DATABASE.md.
 *
 * @class       Install class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Install {

    /**
     * Class constructor — runs migration immediately.
     *
     * Unlike VuloLabs\Install (which defers to the 'init' hook because
     * it can be constructed as early as register_activation_hook), this is
     * only ever constructed from VuloPilot::init_classes() and
     * VuloPilot::activate(), both of which already run at/after 'init', so
     * running synchronously here is safe and avoids double-registering the
     * same callback on 'init'.
     */
    public function __construct() {
        $this->install();
    }

    /**
     * Runs the database install process. No more branching on a stored
     * previous version — see this class's own docblock for why: every
     * table create_database_tables() creates is guarded by dbDelta()'s
     * own `CREATE TABLE IF NOT EXISTS`, so calling it unconditionally is
     * exactly as safe on a site that already has every table as it is on
     * a genuinely fresh one, and simpler than tracking a version to
     * decide which path to take.
     *
     * @return void
     */
    public function install() {
        $this->create_database_tables();

        update_option( Utill::VULOPILOT_OTHER_SETTINGS['plugin_db_version'], VULOPILOT_PLUGIN_VERSION );
        do_action( 'vulopilot_after_installed' );
    }

    /**
     * Creates every VuloPilot custom table (schema version 1.0.0).
     *
     * @return void
     */
    private static function create_database_tables() {
        global $wpdb;

        $collate = $wpdb->get_charset_collate();

        if ( ! function_exists( 'dbDelta' ) ) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        // No "IF NOT EXISTS" here (unlike the table below) — dbDelta()
        // misparses the table name off of "IF" when that clause is present
        // on an already-existing table, silently skipping the ALTER path
        // that would otherwise add `scanned_objects` for existing installs.
        // Same bug, same fix as ai_history's own CREATE (Install.php's own
        // history there).
        $sql_scans = "CREATE TABLE `{$wpdb->prefix}" . Utill::TABLES['scan'] . "` (
            `id`               bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `scanner_id`       varchar(100) NOT NULL,
            `scanner_tier`     varchar(20) NOT NULL DEFAULT 'free',
            `status`           varchar(20) NOT NULL DEFAULT 'queued',
            `trigger_type`     varchar(20) NOT NULL DEFAULT 'manual',
            `triggered_by`     bigint(20) unsigned DEFAULT NULL,
            `started_at`       datetime DEFAULT NULL,
            `finished_at`      datetime DEFAULT NULL,
            `duration_ms`      int(10) unsigned DEFAULT NULL,
            `summary`          longtext DEFAULT NULL,
            `scanned_objects`  longtext DEFAULT NULL,
            `error_message`    text DEFAULT NULL,
            `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_scanner` (`scanner_id`),
            KEY `idx_status` (`status`),
            KEY `idx_created` (`created_at`)
        ) $collate;";

        // No "IF NOT EXISTS" here — same dbDelta table-name-parsing bug
        // $sql_redirects/$sql_not_found_logs's own docblock documents
        // (`preg_match( '|CREATE TABLE ([^ ]*)|', ... )` captures "IF" as
        // the table name, so dbDelta never diffs against the real table
        // and a new column added here would silently never reach an
        // already-installed site). Confirmed live the same way that
        // docblock did: `array( 'IF' => 'Created table IF' )` against a
        // database that already had this exact table, while adding
        // `last_seen_at` below. Every OTHER `CREATE TABLE IF NOT EXISTS`
        // in this class still has this same latent bug — not fixed here,
        // since none of them are adding a new column in this pass; see
        // that docblock for the full explanation if one of them ever needs
        // a schema change on top of an already-installed site.
        $sql_scan_findings = "CREATE TABLE `{$wpdb->prefix}" . Utill::TABLES['scan_finding'] . "` (
            `id`           bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `scan_id`      bigint(20) unsigned NOT NULL,
            `scanner_id`   varchar(100) NOT NULL,
            `severity`     varchar(20) NOT NULL DEFAULT 'info',
            `category`     varchar(50) NOT NULL,
            `title`        varchar(255) NOT NULL,
            `description`  longtext DEFAULT NULL,
            `object_type`  varchar(50) DEFAULT NULL,
            `object_ref`   varchar(255) DEFAULT NULL,
            `dedupe_key`   varchar(255) DEFAULT NULL,
            `status`       varchar(20) NOT NULL DEFAULT 'open',
            `resolved_at`  datetime DEFAULT NULL,
            `meta`         longtext DEFAULT NULL,
            `created_at`   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `last_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_scan` (`scan_id`),
            KEY `idx_severity` (`severity`),
            KEY `idx_status` (`status`),
            KEY `idx_category` (`category`)
        ) $collate;";

        $sql_automations = "CREATE TABLE IF NOT EXISTS `{$wpdb->prefix}" . Utill::TABLES['automations'] . "` (
            `id`                bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `name`              varchar(191) NOT NULL,
            `rule_id`           bigint(20) unsigned DEFAULT NULL,
            `category`          varchar(30) NOT NULL DEFAULT 'monitoring',
            `trigger_type`      varchar(50) NOT NULL,
            `trigger_config`    longtext DEFAULT NULL,
            `conditions`        longtext DEFAULT NULL,
            `actions`           longtext NOT NULL,
            `status`            varchar(20) NOT NULL DEFAULT 'enabled',
            `last_triggered_at` datetime DEFAULT NULL,
            `created_by`        bigint(20) unsigned DEFAULT NULL,
            `created_at`        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at`        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_rule` (`rule_id`),
            KEY `idx_status` (`status`),
            KEY `idx_trigger_type` (`trigger_type`),
            KEY `idx_category` (`category`)
        ) $collate;";

        $sql_automations_runs = "CREATE TABLE IF NOT EXISTS `{$wpdb->prefix}" . Utill::TABLES['automations_run'] . "` (
            `id`               bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `automation_id`    bigint(20) unsigned NOT NULL,
            `triggered_by`     varchar(50) NOT NULL,
            `trigger_ref_id`   bigint(20) unsigned DEFAULT NULL,
            `status`           varchar(20) NOT NULL DEFAULT 'running',
            `actions_executed` int(10) unsigned NOT NULL DEFAULT 0,
            `actions_failed`   int(10) unsigned NOT NULL DEFAULT 0,
            `changes_made`     int(10) unsigned NOT NULL DEFAULT 0,
            `result_log`       longtext DEFAULT NULL,
            `retry_count`      tinyint(3) unsigned NOT NULL DEFAULT 0,
            `started_at`       datetime NOT NULL,
            `finished_at`      datetime DEFAULT NULL,
            `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_automation` (`automation_id`),
            KEY `idx_status` (`status`),
            KEY `idx_started` (`started_at`)
        ) $collate;";

        // No "IF NOT EXISTS" here (unlike every other CREATE TABLE in this
        // file) — dbDelta() itself already only ever issues a CREATE for a
        // table that doesn't exist yet, and its own column-diff/ALTER path
        // for a table that DOES already exist misparses the table name
        // when "IF NOT EXISTS" is present, silently failing to detect (and
        // add) new columns like `prompt_excerpt` below on any site that
        // already has this table — confirmed via a direct dbDelta() call:
        // with "IF NOT EXISTS" it reports "Created table IF" (parsed "IF"
        // as the table name) and adds nothing; without it, it correctly
        // reports "Added column ...prompt_excerpt". This is a real,
        // wider-reaching dbDelta limitation (WordPress core's own docs warn
        // against combining dbDelta with "IF NOT EXISTS") that likely
        // affects every other table below too — out of scope to fix
        // wholesale here, but this table needed it for this change to
        // actually apply on an upgrade, not just a fresh install.
        $sql_ai_history = "CREATE TABLE `{$wpdb->prefix}" . Utill::TABLES['ai_history'] . "` (
            `id`                bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `provider`          varchar(50) NOT NULL,
            `model`             varchar(100) DEFAULT NULL,
            `object_type`       varchar(50) DEFAULT NULL,
            `object_id`         bigint(20) unsigned DEFAULT NULL,
            `surface`           varchar(30) DEFAULT NULL,
            `prompt_tokens`     int(10) unsigned DEFAULT NULL,
            `completion_tokens` int(10) unsigned DEFAULT NULL,
            `cost_estimate`     decimal(10,4) DEFAULT NULL,
            `status`            varchar(20) NOT NULL,
            `prompt_excerpt`    text DEFAULT NULL,
            `response_excerpt`  text DEFAULT NULL,
            `requested_by`      bigint(20) unsigned DEFAULT NULL,
            `created_at`        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_provider` (`provider`),
            KEY `idx_created` (`created_at`),
            KEY `idx_object` (`object_type`, `object_id`),
            KEY `idx_surface` (`surface`)
        ) $collate;";

        $sql_reports = "CREATE TABLE IF NOT EXISTS `{$wpdb->prefix}" . Utill::TABLES['report'] . "` (
            `id`            bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `report_type`   varchar(50) NOT NULL,
            `format`        varchar(10) NOT NULL DEFAULT 'pdf',
            `period_start`  date DEFAULT NULL,
            `period_end`    date DEFAULT NULL,
            `status`        varchar(20) NOT NULL DEFAULT 'generating',
            `file_path`     varchar(255) DEFAULT NULL,
            `generated_by`  bigint(20) unsigned DEFAULT NULL,
            `meta`          longtext DEFAULT NULL,
            `created_at`    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_type` (`report_type`),
            KEY `idx_status` (`status`),
            KEY `idx_period` (`period_start`, `period_end`)
        ) $collate;";

        $sql_activity_logs = "CREATE TABLE IF NOT EXISTS `{$wpdb->prefix}" . Utill::TABLES['activity_log'] . "` (
            `id`          bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `event_type`  varchar(100) NOT NULL,
            `object_type` varchar(50) DEFAULT NULL,
            `object_id`   bigint(20) unsigned DEFAULT NULL,
            `actor_type`  varchar(20) NOT NULL DEFAULT 'system',
            `actor_id`    bigint(20) unsigned DEFAULT NULL,
            `message`     text NOT NULL,
            `severity`    varchar(20) NOT NULL DEFAULT 'info',
            `meta`        longtext DEFAULT NULL,
            `created_at`  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_event` (`event_type`),
            KEY `idx_object` (`object_type`, `object_id`),
            KEY `idx_created` (`created_at`)
        ) $collate;";

        // No "IF NOT EXISTS" here — same dbDelta()/"IF NOT EXISTS" ALTER-path
        // bug documented above ai_history's own CREATE — needed so
        // `approval_method`/`risk_level` actually get added on an upgrade,
        // not just a fresh install.
        $sql_ai_action_runs = "CREATE TABLE `{$wpdb->prefix}" . Utill::TABLES['ai_action_run'] . "` (
            `id`              bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `action_id`       varchar(100) NOT NULL,
            `status`          varchar(20) NOT NULL DEFAULT 'pending_approval',
            `object_type`     varchar(50) DEFAULT NULL,
            `object_ref`      varchar(255) DEFAULT NULL,
            `input`           longtext DEFAULT NULL,
            `output`          longtext DEFAULT NULL,
            `preview`         longtext DEFAULT NULL,
            `snapshot`        longtext DEFAULT NULL,
            `error_message`   text DEFAULT NULL,
            `requested_by`    bigint(20) unsigned DEFAULT NULL,
            `approved_by`     bigint(20) unsigned DEFAULT NULL,
            `approval_method` varchar(20) NOT NULL DEFAULT 'manual',
            `risk_level`      varchar(10) NOT NULL DEFAULT 'medium',
            `created_at`      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `approved_at`     datetime DEFAULT NULL,
            `executed_at`     datetime DEFAULT NULL,
            `rolled_back_at`  datetime DEFAULT NULL,
            PRIMARY KEY (`id`),
            KEY `idx_action` (`action_id`),
            KEY `idx_status` (`status`),
            KEY `idx_object` (`object_type`, `object_ref`)
        ) $collate;";

        dbDelta( $sql_scans );
        dbDelta( $sql_scan_findings );
        dbDelta( $sql_automations );
        dbDelta( $sql_automations_runs );
        dbDelta( $sql_ai_history );
        dbDelta( $sql_reports );
        dbDelta( $sql_activity_logs );
        dbDelta( $sql_ai_action_runs );

        self::create_snapshots_table();
        self::create_crawler_visits_table();
        self::create_redirect_tables();
        self::create_performance_samples_table();
        self::create_page_speed_table();
        self::create_security_events_table();
        self::create_backups_table();
        self::create_ai_conversations_table();
    }


    /**
     * Creates `vulopilot_ai_conversations` — AI Copilot's own persisted chat
     * threads (Controllers\Copilot.php, RecentConversationsCard.tsx's
     * "click to load full history" feature). Deliberately a separate table
     * from `vulopilot_ai_history` (that one stays a permanent, excerpt-only
     * audit trail by design, never full text, never grouped into threads —
     * see its own DATABASE.md entry): this table exists specifically to
     * hold the full, untruncated `turns` array a real conversation needs to
     * be reloaded and continued.
     *
     * `title` is set once, from the conversation's first user message
     * (truncated) — cheap to read for the "Recent conversations" list
     * without decoding the full `turns` blob for every row.
     *
     * `turns` is `longtext`, `wp_json_encode()`d/`json_decode()`d in
     * Repositories\AiConversationRepository — same convention
     * `vulopilot_ai_action_runs`' own `input`/`output`/`preview` columns
     * already use for structured data (no native MySQL JSON column type is
     * used anywhere in this codebase).
     *
     * `user_id` scopes each conversation to the admin who had it — every
     * read/append is ownership-checked against it (AiConversationRepository's
     * own find_full()/append_turns()), since `manage_options` alone doesn't
     * imply one admin should silently read or append to another's thread.
     *
     * @return void
     */
    private static function create_ai_conversations_table() {
        global $wpdb;

        if ( ! function_exists( 'dbDelta' ) ) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        $collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE IF NOT EXISTS `{$wpdb->prefix}" . Utill::TABLES['ai_conversation'] . "` (
            `id`         bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `user_id`    bigint(20) unsigned NOT NULL,
            `title`      varchar(255) NOT NULL,
            `turns`      longtext NOT NULL,
            `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_user_id` (`user_id`),
            KEY `idx_updated_at` (`updated_at`)
        ) $collate;";

        dbDelta( $sql );
    }

    /**
     * Creates `vulopilot_redirects` and `vulopilot_not_found_logs` — own
     * method, same shape as create_crawler_visits_table() below.
     *
     * `vulopilot_redirects.source_path` is UNIQUE — Services\RedirectManager
     * looks a request path up by exact match, and only one active target
     * makes sense per source path (a second row for the same path would be
     * ambiguous, not a legitimate A/B case this feature is for).
     * `vulopilot_not_found_logs.requested_path` is likewise UNIQUE —
     * Services\NotFoundLogger upserts (increment `hit_count`, bump
     * `last_seen_at`) rather than inserting one row per visit, so repeat
     * 404s to the same missing URL don't grow this table unboundedly the
     * way a per-visit log would.
     *
     * `vulopilot_redirects.last_accessed_at` is deliberately its own
     * column, not a reuse of `updated_at` — `updated_at` bumps on ANY row
     * change (editing the target URL, toggling active/inactive from
     * RedirectsTab.tsx), which would make "Last accessed" lie about a row
     * a visitor never actually hit. Only
     * RedirectRepository::increment_hit_count() — called from
     * Services\RedirectManager::maybe_apply_redirect(), the one place a
     * real visitor request actually matched this row — ever writes it, so
     * it stays null until a real hit happens instead of defaulting to the
     * row's creation time.
     *
     * `vulopilot_not_found_logs.is_system` (Services\NotFoundLogger's own
     * `is_noise_path()`) distinguishes a real missing CONTENT page from a
     * request under `/wp-content/themes/`, `/wp-content/plugins/`,
     * `/wp-includes/`, `/wp-admin/`, or a static asset extension — a stale
     * theme/plugin asset URL, or a browser/tooling auto-probe. These used
     * to be dropped outright (never logged at all); now they're logged
     * with `is_system = 1` instead, so RedirectsTab.tsx's own "System
     * 404s" link can show them separately rather than either cluttering
     * the main missing-page list or losing them entirely.
     *
     * $sql_redirects and $sql_not_found_logs both deliberately do NOT use
     * `CREATE TABLE IF NOT EXISTS` (every other statement in this class
     * still does, unchanged) — dbDelta() finds the table name via
     * `preg_match( '|CREATE TABLE ([^ ]*)|', ... )`, so with "IF NOT
     * EXISTS" present it captures the literal word "IF" as the table name
     * instead. On a fresh install that's harmless (dbDelta just runs the
     * CREATE verbatim, and MySQL's own IF NOT EXISTS makes it a no-op if
     * something with that name already raced it into existence), but on
     * any site that already has the table, dbDelta's real job — diffing
     * the live column set against this SQL and emitting `ALTER TABLE ADD
     * COLUMN` for whatever's missing — never runs, because it's diffing
     * against nonexistent table "IF" instead of the real one.
     * `last_accessed_at`/`is_system` above would silently never reach an
     * already-installed site's tables without this fix. Confirmed live:
     * with "IF NOT EXISTS" still in place, dbDelta() reported
     * `array( 'IF' => 'Created table IF' )` on this exact SQL against a
     * database that already had the real table.
     *
     * @return void
     */
    private static function create_redirect_tables() {
        global $wpdb;

        if ( ! function_exists( 'dbDelta' ) ) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        $collate = $wpdb->get_charset_collate();

        $sql_redirects = "CREATE TABLE `{$wpdb->prefix}" . Utill::TABLES['redirect'] . "` (
            `id`            bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `source_path`   varchar(255) NOT NULL,
            `target_url`    varchar(255) NOT NULL,
            `redirect_type` smallint(3) unsigned NOT NULL DEFAULT 301,
            `hit_count`     int(10) unsigned NOT NULL DEFAULT 0,
            `is_active`     tinyint(1) NOT NULL DEFAULT 1,
            `created_by`    bigint(20) unsigned DEFAULT NULL,
            `created_at`    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at`    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            `last_accessed_at` datetime DEFAULT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uniq_source_path` (`source_path`),
            KEY `idx_active` (`is_active`)
        ) $collate;";

        // No "IF NOT EXISTS" here either — see $sql_redirects's own comment
        // above for why: dbDelta() would misparse the table name off of
        // "IF" and silently skip adding `is_system` for a site that
        // already has this table.
        $sql_not_found_logs = "CREATE TABLE `{$wpdb->prefix}" . Utill::TABLES['not_found_log'] . "` (
            `id`             bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `requested_path` varchar(255) NOT NULL,
            `referrer`       varchar(255) DEFAULT NULL,
            `hit_count`      int(10) unsigned NOT NULL DEFAULT 1,
            `last_seen_at`   datetime NOT NULL,
            `created_at`     timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `is_system`      tinyint(1) NOT NULL DEFAULT 0,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uniq_requested_path` (`requested_path`),
            KEY `idx_last_seen` (`last_seen_at`),
            KEY `idx_is_system` (`is_system`)
        ) $collate;";

        dbDelta( $sql_redirects );
        dbDelta( $sql_not_found_logs );
    }

    /**
     * Creates `vulopilot_snapshots` — every feature's daily score history in
     * one table: one row per (`snapshot_type`, `snapshot_date`), the day's
     * values together as JSON in `data` (Repositories\SnapshotRepository).
     * Types: `performance`, `security` (free trend cards), `site_health`,
     * `accessibility`, `store_trends`, `brand_score`, `geo_visibility`,
     * `kg_health` (Pro modules). Each was a date plus a few numbers, only
     * ever read back as a time series — no reason for eight tables.
     *
     * @return void
     */
    private static function create_snapshots_table() {
        global $wpdb;

        if ( ! function_exists( 'dbDelta' ) ) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        $collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE IF NOT EXISTS `{$wpdb->prefix}" . Utill::TABLES['snapshot'] . "` (
            `id`            bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `snapshot_type` varchar(30) NOT NULL,
            `snapshot_date` date NOT NULL,
            `data`          longtext NOT NULL,
            `created_at`    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uniq_type_date` (`snapshot_type`, `snapshot_date`)
        ) $collate;";

        dbDelta( $sql );
    }

    /**
     * Creates `vulopilot_performance_samples` — "Performance" Overview's
     * real-time data, one row per sample, `sample_type` saying which kind:
     *
     * - `request` — a response-time sample per real front-end request
     *   (Services\PerformanceRequestLogger; Real-time Monitoring card).
     *   Deliberately no visitor-identifying column at all.
     * - `vital` — a real-visitor Core Web Vitals report
     *   (Services\CoreWebVitalsBeacon's public beacon). A metric the browser
     *   couldn't measure (e.g. no interaction yet for INP) is NULL, never a
     *   fabricated zero. `cls` is stored ×1000 as a smallint
     *   (`cls_thousandths`), matching this codebase's preference for integer
     *   ms/thousandths columns over floats. `page_load_ms`/`transfer_bytes`
     *   come from the same beacon's Navigation/Resource Timing read.
     *
     * Both kinds are short-retention, append-only, timestamp-indexed sample
     * logs, so they share one table; each has a thin repository that pins
     * its own `sample_type`.
     *
     * @return void
     */
    private static function create_performance_samples_table() {
        global $wpdb;

        if ( ! function_exists( 'dbDelta' ) ) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        $collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE IF NOT EXISTS `{$wpdb->prefix}" . Utill::TABLES['performance_sample'] . "` (
            `id`               bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `sample_type`      varchar(10) NOT NULL,
            `response_time_ms` smallint(5) unsigned DEFAULT NULL,
            `lcp_ms`           smallint(5) unsigned DEFAULT NULL,
            `cls_thousandths`  smallint(5) unsigned DEFAULT NULL,
            `inp_ms`           smallint(5) unsigned DEFAULT NULL,
            `page_load_ms`     smallint(5) unsigned DEFAULT NULL,
            `transfer_bytes`   int(10) unsigned DEFAULT NULL,
            `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_type_created` (`sample_type`, `created_at`)
        ) $collate;";

        dbDelta( $sql );
    }

    /**
     * Creates `vulopilot_page_speed` — "Performance" › Slow Pages'
     * per-page speed table (Services\PageSpeedScanner writes here, one row
     * per real page it has checked, replaced on every rescan). `url`/
     * `title`/`page_type` describe a real WP page, post, or WooCommerce
     * page/product/category (never a fabricated entry). `load_time_ms` is
     * a real measured `wp_remote_get()` response time, same idiom as
     * SlowPageScanner's own homepage timing. `score` is derived from
     * `load_time_ms` via a documented formula (see PageSpeedScanner) — not
     * a Lighthouse score. `status` ('slow'/'needs_improvement'/'good') is
     * the same score banded into the real thresholds Slow Pages' own "What's
     * considered slow?" legend states, stored as its own column purely so
     * PageSpeedRepository can filter/count by it the same way every other
     * AbstractRepository-backed list does for its own status-count pill bar.
     * `mobile_score`/`desktop_score` stay NULL unless a
     * real Google PageSpeed Insights API key is configured and that page
     * has actually been checked against it, matching Part A's own
     * PSI-key-gated fallback posture — never a fabricated device split.
     * `main_issue` is either a real Google Lighthouse opportunity-audit
     * title (from a real PSI response) or a plain load-time-based label;
     * NULL when neither is available, never invented text.
     * `page_size_bytes`/`requests_count` are the real `total-byte-weight`/
     * `network-requests` Lighthouse audits from that same real PSI
     * response; `lcp_ms`/`inp_ms`/`cls_thousandths` + their `_rating`
     * ('FAST'/'AVERAGE'/'SLOW') are real Chrome UX Report field data from
     * PSI's own `loadingExperience` block — Google's real measured
     * visitor experience for that URL, not Lighthouse's simulated lab
     * run, and NULL whenever CrUX has no real field data for a
     * low-traffic page (a real "not enough data" case, not fabricated).
     * All eight stay NULL without a PSI key, same PSI-key-gated fallback
     * posture as `mobile_score`/`desktop_score`. Own method, same shape as
     * create_performance_samples_table() above.
     *
     * @return void
     */
    private static function create_page_speed_table() {
        global $wpdb;

        if ( ! function_exists( 'dbDelta' ) ) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        $collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE IF NOT EXISTS `{$wpdb->prefix}" . Utill::TABLES['page_speed'] . "` (
            `id`               bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `url`              varchar(500) NOT NULL,
            `title`            varchar(255) NOT NULL DEFAULT '',
            `page_type`        varchar(40) NOT NULL DEFAULT 'page',
            `load_time_ms`     int(10) unsigned DEFAULT NULL,
            `score`            tinyint(3) unsigned DEFAULT NULL,
            `status`           varchar(20) DEFAULT NULL,
            `mobile_score`     tinyint(3) unsigned DEFAULT NULL,
            `desktop_score`    tinyint(3) unsigned DEFAULT NULL,
            `main_issue`       varchar(255) DEFAULT NULL,
            `page_size_bytes`  int(10) unsigned DEFAULT NULL,
            `requests_count`   smallint(5) unsigned DEFAULT NULL,
            `lcp_ms`           int(10) unsigned DEFAULT NULL,
            `lcp_rating`       varchar(20) DEFAULT NULL,
            `inp_ms`           int(10) unsigned DEFAULT NULL,
            `inp_rating`       varchar(20) DEFAULT NULL,
            `cls_thousandths`  smallint(5) unsigned DEFAULT NULL,
            `cls_rating`       varchar(20) DEFAULT NULL,
            `scanned_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_url` (`url`(191)),
            KEY `idx_page_type` (`page_type`),
            KEY `idx_score` (`score`),
            KEY `idx_status` (`status`)
        ) $collate;";

        dbDelta( $sql );
    }

    /**
     * Creates `vulopilot_security_events` — Protect My Site's IP-based event
     * log, one row per event, `event_type` saying which kind:
     *
     * - `login_attempt` — a real login attempt (Services\LoginProtectionGuard):
     *   `username_attempted` + `success`. Backs the rolling lockout check
     *   and the Login Protection scanner.
     * - `firewall_block` — a request the firewall rules matched
     *   (Services\FirewallGuard): `request_uri`, `rule_matched`, `action`
     *   (`blocked` or `logged`). Backs the Firewall scanner.
     *
     * Both are short, append-only, per-IP logs queried the same way (count
     * by IP within a time window), so they share one table and one index;
     * each has a thin repository that pins its own `event_type`. Columns
     * the other kind doesn't use stay NULL.
     *
     * @return void
     */
    private static function create_security_events_table() {
        global $wpdb;

        if ( ! function_exists( 'dbDelta' ) ) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        $collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE IF NOT EXISTS `{$wpdb->prefix}" . Utill::TABLES['security_event'] . "` (
            `id`                 bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `event_type`         varchar(20) NOT NULL,
            `ip_address`         varchar(45) NOT NULL,
            `username_attempted` varchar(60) DEFAULT NULL,
            `success`            tinyint(1) unsigned DEFAULT NULL,
            `request_uri`        text DEFAULT NULL,
            `rule_matched`       varchar(100) DEFAULT NULL,
            `action`             varchar(10) DEFAULT NULL,
            `created_at`         datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_type_ip_time` (`event_type`, `ip_address`, `created_at`),
            KEY `idx_type_time` (`event_type`, `created_at`)
        ) $collate;";

        dbDelta( $sql );
    }

    /**
     * Creates `vulopilot_backups` — Protect My Site's "Backups"/"Recovery"
     * tiles (Services\BackupManager/BackupScheduler). One row per backup
     * run (manual, scheduled, or the automatic pre-restore safety snapshot
     * a real Restore always takes first); `file_path` stores only the
     * archive's basename, never a full or web-reachable path, same
     * DATABASE.md convention Reports.php's own `vulopilot_reports.file_path`
     * already established — the real path is always re-derived server-side
     * from `wp_upload_dir()`, never trusted from the client.
     *
     * `destination`/`destination_status`/`destination_error`/`remote_path`
     * (Services\BackupStorageManager) — real remote-upload tracking on top
     * of the local file above, added alongside the storage-destination
     * settings/credentials feature. `destination` defaults to `'local'`
     * (every backup already saves locally regardless of any remote
     * destination) and only becomes `'s3'`/`'google_drive'` for a backup
     * actually started while that destination was the active one;
     * `destination_status` stays NULL for a `'local'`-only row (nothing
     * else to track) and is one of `'uploading'`/`'uploaded'`/`'failed'`/
     * `'skipped_not_configured'` (the destination was selected but no
     * valid credentials were on file when this backup finished — a real,
     * honest state, not the same as a real upload attempt failing) once a
     * remote destination is involved. `remote_path` is that provider's own
     * real object key (S3) or file id (Google Drive), never a client-
     * trusted path — same `resolve_file_path()`-style re-derivation
     * posture `file_path` above already established, just there is no
     * local re-derivation needed since it's never used to open a local
     * file.
     *
     * No `IF NOT EXISTS` here (unlike this table's own original CREATE) —
     * same dbDelta()/"IF NOT EXISTS" parsing bug `create_redirect_tables()`'s
     * own docblock documents in detail: with that clause present, dbDelta()
     * misparses the table name off the literal word "IF" on a site that
     * already has this table, so the real ALTER TABLE ADD COLUMN path that
     * adds these 4 new columns to an already-installed site would silently
     * never run. Harmless on a genuinely fresh install either way (MySQL's
     * own IF NOT EXISTS still applies if dbDelta's plain CREATE races
     * something into existing first).
     *
     * @return void
     */
    private static function create_backups_table() {
        global $wpdb;

        if ( ! function_exists( 'dbDelta' ) ) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        $collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE `{$wpdb->prefix}" . Utill::TABLES['backup'] . "` (
            `id`                  bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `status`              varchar(20) NOT NULL DEFAULT 'queued',
            `trigger_type`        varchar(20) NOT NULL DEFAULT 'manual',
            `file_path`           varchar(255) DEFAULT NULL,
            `file_size`           bigint(20) unsigned DEFAULT NULL,
            `destination`         varchar(20) NOT NULL DEFAULT 'local',
            `destination_status`  varchar(30) DEFAULT NULL,
            `destination_error`   text DEFAULT NULL,
            `remote_path`         varchar(500) DEFAULT NULL,
            `started_at`          datetime DEFAULT NULL,
            `finished_at`         datetime DEFAULT NULL,
            `error_message`       text DEFAULT NULL,
            `created_at`          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_status` (`status`),
            KEY `idx_created` (`created_at`),
            KEY `idx_destination` (`destination`)
        ) $collate;";

        dbDelta( $sql );
    }

    /**
     * Creates `vulopilot_crawler_visits` — its own method, same shape as
     * every other create_*_table() method below create_database_tables().
     * No IP address or user column, ever — readme.txt's own FAQ promises
     * AI Crawler Traffic Monitoring "does not track human visitors, IP
     * addresses, or personal data," enforced by the schema itself, not
     * just application code.
     *
     * @return void
     */
    private static function create_crawler_visits_table() {
        global $wpdb;

        if ( ! function_exists( 'dbDelta' ) ) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        $collate = $wpdb->get_charset_collate();

        // No "IF NOT EXISTS" — same dbDelta()-misparses-the-table-name
        // limitation documented at length on create_backups_table() below;
        // `is_404` needed the ALTER-diff path to actually reach sites that
        // already had this table before AI Crawler Alerts' "access
        // limited" check (CrawlerAlertMonitor::find_bots_with_high_404_rate())
        // needed it.
        $sql_crawler_visits = "CREATE TABLE `{$wpdb->prefix}" . Utill::TABLES['crawler_visit'] . "` (
            `id`             bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `bot_name`       varchar(50) NOT NULL,
            `user_agent`     varchar(255) NOT NULL,
            `requested_url`  varchar(255) NOT NULL,
            `is_404`         tinyint(1) unsigned NOT NULL DEFAULT 0,
            `created_at`     timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_bot` (`bot_name`),
            KEY `idx_created` (`created_at`)
        ) $collate;";

        dbDelta( $sql_crawler_visits );
    }




}
