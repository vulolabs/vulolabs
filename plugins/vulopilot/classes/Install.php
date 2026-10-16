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
 * @class       Install class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Install {

	/**
	 * Class constructor - runs the install immediately.
	 */
	public function __construct() {
		$this->install();
	}

	/**
	 * Runs the database install process.
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

		// No "IF NOT EXISTS" here (unlike the table below).
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

		// No "IF NOT EXISTS": dbDelta's `preg_match( '|CREATE TABLE ([^ ]*)|', ... )` would capture "IF" as
		// the table name (see $sql_redirects' docblock), never diffing the real table, so a new column
		// wouldn't reach an installed site.
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

		// No "IF NOT EXISTS" here (unlike every other CREATE TABLE in this file).
		$sql_ai_history = "CREATE TABLE `{$wpdb->prefix}" . Utill::TABLES['ai_history'] . "` (
            `id`                bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            `request_id`        varchar(64) DEFAULT NULL,
            `credits_used`      int(10) unsigned DEFAULT NULL,
            `object_type`       varchar(50) DEFAULT NULL,
            `object_id`         bigint(20) unsigned DEFAULT NULL,
            `surface`           varchar(30) DEFAULT NULL,
            `status`            varchar(20) NOT NULL,
            `prompt_excerpt`    text DEFAULT NULL,
            `response_excerpt`  text DEFAULT NULL,
            `requested_by`      bigint(20) unsigned DEFAULT NULL,
            `created_at`        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_request_id` (`request_id`),
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

		// No "IF NOT EXISTS" here - same dbDelta()/"IF NOT EXISTS" ALTER-path bug documented above
		// ai_history's own CREATE.
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
	 * Creates `vulopilot_ai_conversations` - AI Copilot's own persisted chat threads
	 * (Copilot.php, RecentConversationsCard.tsx's "click to load full history" feature).
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
	 * Creates `vulopilot_redirects` and `vulopilot_not_found_logs` - own method, same
	 * shape as create_crawler_visits_table() below.
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
            `match_type`    varchar(10) NOT NULL DEFAULT 'exact',
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

		// No "IF NOT EXISTS" here either - see $sql_redirects's own comment above for why.
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
	 * Creates `vulopilot_performance_samples` - "Performance" Overview's real-time data,
	 * one row per sample, `sample_type` saying which kind: - `request`.
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
	 * Creates `vulopilot_page_speed` - "Performance" › Slow Pages' per-page speed table
	 * (PageSpeedScanner writes here, one row per real page it has checked, replaced on
	 * every rescan).
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
	 * Creates `vulopilot_security_events` - Protect My Site's IP-based event log, one row
	 * per event, `event_type` saying which kind: - `login_attempt`.
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
	 * Creates `vulopilot_backups` - Protect My Site's "Backups"/"Recovery" tiles
	 * (BackupManager/BackupScheduler).
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
	 * Creates `vulopilot_crawler_visits` - its own method, same shape as every other
	 * create_*_table() method below create_database_tables().
	 *
	 * @return void
	 */
	private static function create_crawler_visits_table() {
		global $wpdb;

		if ( ! function_exists( 'dbDelta' ) ) {
			require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		}

		$collate = $wpdb->get_charset_collate();

		// No "IF NOT EXISTS" - same dbDelta()-misparses-the-table-name limitation documented at
		// length on create_backups_table() below.
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
