<?php
/**
 * Utill class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot Utill class.
 *
 * Central registry of custom table names and installation-tracking option
 * keys, mirroring VuloLabs\Utill's role for the vulolabs family.
 *
 * @class       Utill class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Utill {

    /**
     * Custom $wpdb table names, keyed by short entity id.
     *
     * @var array
     */
    const TABLES = array(
        'scan'                       => 'vulopilot_scans',
        'scan_finding'               => 'vulopilot_scan_findings',
        'automations'                => 'vulopilot_automations',
        'automations_run'            => 'vulopilot_automations_runs',
        'ai_history'                 => 'vulopilot_ai_history',
        // Full, untruncated AI Copilot chat threads (RecentConversationsCard.tsx's
        // "click to load full history" feature) — deliberately separate
        // from 'ai_history' above, which is a permanent, excerpt-only audit
        // trail by design (see that table's own DATABASE.md entry) and was
        // never meant to store full text or group rows into threads.
        'ai_conversation'            => 'vulopilot_ai_conversations',
        'report'                     => 'vulopilot_reports',
        'activity_log'               => 'vulopilot_activity_logs',
        'ai_action_run'              => 'vulopilot_ai_action_runs',
        'crawler_visit'              => 'vulopilot_crawler_visits',
        'redirect'                   => 'vulopilot_redirects',
        'not_found_log'              => 'vulopilot_not_found_logs',
        'snapshot'                   => 'vulopilot_snapshots',
        'performance_sample'         => 'vulopilot_performance_samples',
        'page_speed'                 => 'vulopilot_page_speed',
        // Protect My Site's Malware/Firewall/Login Protection/Backups/
        // Recovery tiles — real, always-on core features, not a Modules-page
        // module. Malware has no table of its own (its Finding rows are the
        // whole persisted record, same as every other scanner); these three
        // back the always-on guards/manager that actually enforce/archive.
        'security_event'             => 'vulopilot_security_events',
        'backup'                     => 'vulopilot_backups',
    );

    /**
     * Option keys used by the bootstrap/Install flow.
     *
     * @var array
     */
    const VULOPILOT_OTHER_SETTINGS = array(
        'run_installer'     => 'vulopilot_run_installer',
        'plugin_db_version' => 'vulopilot_version',
        // AI Crawler Alerts' own system-managed state — not a user-facing
        // setting (no field ever writes these), so it lives here rather
        // than in VULOPILOT_SETTINGS_DEFAULTS below. Read/written only by
        // vulopilot-pro's CrawlerAlertMonitor.
        // 'new crawler detected' diffs the real bot names seen so far
        // (CrawlerVisitRepository::get_all_bot_names_ever_seen()) against
        // this stored list to find ones never alerted on before.
        'crawler_alert_known_bots'   => 'vulopilot_crawler_alert_known_bots',
        // Per alert-type digest bookkeeping (last-sent timestamp + pending
        // items accumulated since then) for the "Daily digest"/"Weekly
        // digest" frequency options — see CrawlerAlertMonitor's own
        // docblock for the batching this backs.
        'crawler_alert_digest_state' => 'vulopilot_crawler_alert_digest_state',
    );

    /**
     * Option name for VuloPilot's plain settings — deliberately a single
     * wp_options row (an array), not a custom table, per
     * backward-compatibility.md: "New settings should be added through
     * the existing ... registered-settings-keys mechanism ... rather than
     * a new bespoke get_option() call." VULOPILOT_SETTINGS_DEFAULTS is
     * that registry: every known setting key and its default, so a
     * missing/never-saved key still has a sane value instead of null.
     *
     * @var string
     */
    const VULOPILOT_SETTINGS_KEY = 'vulopilot_settings';

    /**
     * @var array
     */
    const VULOPILOT_SETTINGS_DEFAULTS = array(
        // General. Previously only `scan_frequency` had a default here —
        // the other 3 General tab fields round-tripped through Settings
        // with no default and no PHP consumer anywhere.
        // `automatic_site_scan` is now Automations\Scheduler's own real
        // whole-scan kill switch (vulopilot-pro) — 'enabled' is the
        // non-surprising default, matching `scan_frequency` already
        // running unconditionally before this pass. `keep_data_uninstall`
        // is read by this plugin's own uninstall.php (the safe default —
        // an uninstall keeps data unless the exact 'delete_everything'
        // value is stored). `anonymous_usage_data` still has no real
        // telemetry collector anywhere in this codebase to gate — this
        // default alone doesn't change that; see the field's own
        // settingDescription in General.ts.
        'automatic_site_scan'                   => 'enabled',
        'scan_frequency'                        => 'daily',
        'keep_data_uninstall'                   => 'keep_data',
        'anonymous_usage_data'                  => 'disabled',
        // A short, freeform phrase describing this site's writing voice,
        // sent as a `site_tone` hint on every AI request
        // (AI\AiRequestSender). Lives in this
        // flat option (not its own dedicated one) so General.ts's own
        // field autosaves through the same debounced InputRenderer path
        // every other General setting already uses — no separate "Save"
        // button needed. `site_tone_source` ('auto' — Services\SiteToneLearner's
        // own freshly-learned phrase; 'manual' — a site owner's own saved
        // override, never auto-overwritten) is flipped to 'manual' by
        // Controllers\Settings::update_item() the moment `site_tone`
        // itself is present in a save — see that method's own comment.
        'site_tone'                              => '',
        'site_tone_source'                       => 'auto',
        // Notifications.
        'notification_email'                    => '',
        // "Last test email sent successfully on ..." — set by
        // Controllers\Settings::send_test_email(), read back by
        // SendTestEmailButton.tsx on load so that line survives a page
        // refresh instead of only showing right after a click. Same real
        // shape 'report_last_test_sent' below already establishes.
        'email_last_test_sent'                  => '',
        'notify_on_critical_findings'           => array(),
        // Settings → Notifications → Website Alerts' own "Notify me about"
        // checklist — which category of critical finding
        // Services\ScanPersistenceListener::maybe_notify_critical_findings()
        // should actually alert on (gated behind `notify_on_critical_findings`
        // above either way). Maps to real finding categories; 'other' is
        // the honest catch-all for every category not called out by its
        // own checkbox (woocommerce, database, links, etc.) — same
        // "unmapped scanner isn't gated by the checklist" passthrough
        // AlertDispatcher::TYPE_SCANNER_MAP's own docblock documents, just
        // inverted here (an unmapped category always falls under 'other'
        // rather than always alerting). All on by default, same "off is
        // the surprising state" posture every other Notifications
        // checklist in this file already uses.
        'critical_alert_types'                  => array( 'security', 'availability', 'performance', 'seo', 'other' ),
        // Read by vulopilot-pro's AiCrawlerAnalytics\CrawlerAlertMonitor —
        // comma-separated category ids to email/log about; see that
        // class's own docblock.
        'email_on_crawler_alerts'               => array(),
        // Settings → Notifications → Visibility Alerts' own master switch —
        // gates all three panels of 'visibility_alerts' below without
        // touching any of their own stored `enable`/`threshold` values;
        // flipping this back on restores exactly what each was already set
        // to. On by default — same "off is the surprising state" posture
        // 'crawler_alerts' uses for its own per-type toggles — but each of
        // the three panels below still defaults its own `enable` to off,
        // so this alone changes no existing install's actual email volume.
        'email_on_visibility_alerts'            => array( 'email_on_visibility_alerts' ),
        // Settings → Notifications → Visibility Alerts' own `expandable-panel`
        // field — same nested-object-keyed-by-id shape 'crawler_alerts'
        // above already uses, not three separate flat settings. Read by
        // GeoAnalysis\GeoAnalyzer::analyze() and vulopilot-pro's
        // GeoInsights\VisibilityMonitor ('geo' — one scores a single post,
        // the other the sitewide sampled average, same threshold either
        // way), vulopilot-pro's BrandIntelligence\BrandMonitor ('brand'),
        // and vulopilot-pro's KnowledgeGraph\KnowledgeGraphHealthMonitor
        // ('kg') — each checks its own `[id]['enable']` before emailing,
        // and the drop must be at least `[id]['threshold']` points.
        'visibility_alerts'                     => array(
            'geo'   => array(
                'enable'    => false,
                'threshold' => 5,
            ),
            'brand' => array(
                'enable'    => false,
                'threshold' => 5,
            ),
            'kg'    => array(
                'enable'    => false,
                'threshold' => 5,
            ),
        ),
        'email_from_name'                       => '',
        'email_from_address'                    => '',
        // Automation — replaces AutomationEngine's previously-hardcoded
        // COOLDOWN_MINUTES constant (ARCHITECTURE.md's Prompt 12 pass
        // shipped a fixed 60-minute rate limit as a pragmatic v1; this
        // makes it a real, per-site setting instead).
        'automation_cooldown_minutes'           => 60,
        // Read by vulopilot-pro's Automations\AutomationEngine — 0 (the
        // default) means retries are off; an automation run with at least
        // one failed action simply stays 'failed', same as before this
        // setting existed.
        'automation_max_retries'                => 0,
        'automation_retry_delay_minutes'        => 5,
        // Automations' "Automation modes" card — same "setting lives
        // here, only meaningfully acted on by vulopilot-pro" split as
        // automation_max_retries above. Read by vulopilot-pro's
        // RunAiActionAction: 'monitor' skips proposing an AI fix entirely
        // (notify-only), 'suggest' is today's existing propose-then-wait-
        // for-a-human behavior (default — 'monitor'/'auto_fix' both
        // require Pro, so defaulting to either would be a dead default on
        // most installs), 'auto_fix' additionally auto-approves a proposed
        // fix when its estimated_impact is at/below auto_fix_max_impact.
        'automation_mode'                       => 'suggest',
        'auto_fix_max_impact'                   => 'low',
        // Settings → Automation → Approval Settings' "Ask before applying
        // AI changes" — read by AiCopilot\ActionRunner::propose() itself
        // (not vulopilot-pro-only), so unlike automation_mode above this
        // one is meaningfully acted on by the free plugin too: 'always'
        // (default — today's existing behavior, unchanged) always creates
        // a pending_approval row and waits for a human; 'risk_based' skips
        // that wait only for a proposed change whose own action
        // (AIActionInterface::get_risk_level()) is Impact::LOW; 'never' —
        // Pro-gated the same way automation_mode's own 'auto_fix' is,
        // real-enforced server-side via Utill::is_khali_dabba() rather
        // than trusting the stored value — skips the wait unconditionally.
        // Replaces the previous `require_approval_before_ai_change`
        // boolean, which had no default here and nothing ever actually
        // read.
        'ai_change_approval_mode'               => 'always',
        // SECURITY-MODULE.md's "Scheduled Security Monitoring"/"Alerts"/
        // "Integrity Monitoring" — same "setting lives here, only
        // meaningfully acted on by vulopilot-pro's SecurityMonitoring
        // module" split as scan_frequency/automation_* above.
        'security_scan_frequency'               => 'daily',
        'security_alerts_enabled'               => array(),
        'security_alert_email'                  => '',
        'security_alert_min_severity'           => 'high',
        // Settings → Notifications → Security Alerts' own "Notify me
        // about" checklist — which alert types vulopilot-pro's
        // AlertDispatcher should actually raise. Five of the six map to
        // real scanner ids (AlertDispatcher::TYPE_SCANNER_MAP); 'new_user'
        // has no scanner behind it at all — it gates a real `user_register`
        // hook directly, a genuine WP event rather than a scan finding. All
        // on by default, same "off is the surprising state" posture
        // 'crawler_alerts' above already uses for its own per-type toggles.
        'security_alert_types'                  => array( 'vulnerabilities', 'malware', 'failed_login', 'new_user', 'file_changes', 'ssl_certificate' ),
        'enable_integrity_monitoring'           => array( 'enable_integrity_monitoring' ),
        'integrity_monitoring_max_files'        => 2000,
        // ACCESSIBILITY-MODULE.md's "WCAG Scanner" — same granular
        // per-scanner toggle shape as the SECURITY-MODULE.md scanners
        // above, default on (a WCAG link-text check makes no outbound
        // request, so there's no WAF-flagging reason to ship it off).
        'enable_wcag_scanner'                   => array( 'enable_wcag_scanner' ),
        // ACCESSIBILITY-MODULE.md's "Scheduled Audits" — same "setting
        // lives here, only meaningfully acted on by vulopilot-pro's
        // AccessibilityAudits module" split as security_scan_frequency above.
        'accessibility_audit_frequency'         => 'daily',
        // Settings → Scanning → Accessibility's own "WCAG level" row. Real
        // consumer: Scanners\Basic\AccessibilityScanner (the one check
        // among the 5 accessibility scanners that maps to a Level AA
        // success criterion, WCAG 2.4.6) skips itself when this is
        // '2.1_a'. The other 4 scanners (form labels, ARIA roles, keyboard
        // focus order, link text) all map to Level A criteria, so they run
        // unconditionally regardless of this setting — and 'AAA' currently
        // behaves identically to 'AA', since no check in this codebase yet
        // maps to a genuine Level AAA criterion (previously an orphaned
        // UI-only field in Scanning → Security with no PHP consumer at
        // all; this is its first real read).
        'target_wcag_level'                     => '2.1_aa',
        // WOOCOMMERCE-INTELLIGENCE-MODULE.md's "Inventory Intelligence" —
        // same "setting lives here, only meaningfully acted on by
        // vulopilot-pro's WooCommerceIntelligence module" split as
        // integrity_monitoring_max_files above. Read by
        // InventoryIntelligenceScanner as the "projected to run out within
        // this many days" threshold.
        'inventory_stockout_threshold_days'     => 7,
        // MCP-SERVER-MODULE.md's MCP Server — same "setting lives here,
        // only meaningfully acted on by vulopilot-pro's McpServer module"
        // split as the settings above. Off by default: this gates an
        // endpoint external AI clients can reach with a valid WordPress
        // Application Password, so it's an explicit opt-in rather than
        // silently available the moment Pro's module is toggled on.
        'enable_mcp_server'                     => array(),
        // Reports.
        'default_report_format'                 => 'pdf',
        'default_report_period_days'            => 30,
        // "Last test report sent on ..." — set by
        // Controllers\Settings::send_test_report(), read back by
        // ReportTestPanel.tsx on load so that line survives a page refresh,
        // same "system-set, never user-edited" role
        // 'crawler_alert_last_test_sent' below already plays.
        'report_last_test_sent'                 => '',
        // Security. Checkbox-type defaults are zyra's own wire shape (an
        // array containing the field's own key when on, or an empty array
        // when off — matches every checkbox option's own `key`/`value` in
        // the *.ts settings configs) rather than a PHP boolean — every PHP
        // consumer already reads these with empty()/!empty(), which is
        // true for a non-empty array and false for an empty one, so this
        // shape works everywhere a boolean did.
        'enable_rest_api_scanner'               => array( 'enable_rest_api_scanner' ),
        'enable_xmlrpc_scanner'                 => array( 'enable_xmlrpc_scanner' ),
        'enable_security_headers_scanner'       => array( 'enable_security_headers_scanner' ),
        'enable_exposed_files_scanner'          => array( 'enable_exposed_files_scanner' ),
        // SECURITY-MODULE.md's Free scanners — same granular per-scanner
        // toggle shape as the four above, default on (unlike those four,
        // none of these three make an anonymous request a WAF is likely to
        // flag, so there's no reason to ship them off-by-default).
        'enable_weak_password_scanner'          => array( 'enable_weak_password_scanner' ),
        'enable_basic_vulnerabilities_scanner'  => array( 'enable_basic_vulnerabilities_scanner' ),
        'enable_core_file_integrity_scanner'    => array( 'enable_core_file_integrity_scanner' ),
        // Protect My Site's Malware/Firewall/Login Protection/Backups tiles —
        // same granular-toggle shape as the three scanners above, each
        // unconditionally free/core (no moduleEnabled gate anywhere these are
        // read). Read by Scanners\Basic\MalwareScanner.
        'enable_malware_scanner'                => array( 'enable_malware_scanner' ),
        // Read by Services\LoginProtectionGuard — real brute-force lockout
        // enforced via the `authenticate` filter, not just detection.
        'enable_login_protection'               => array( 'enable_login_protection' ),
        'login_max_attempts'                    => 5,
        'login_lockout_minutes'                 => 15,
        // Read by Services\FirewallGuard — `enable_firewall` always logs
        // matched requests (safe, never blocks anyone); `enable_firewall_blocking`
        // is the separate, explicit opt-in that turns real 403 blocking on.
        // Defaults kept split and blocking OFF by default so a false-positive
        // rule can't lock out a legitimate request the moment this ships.
        'enable_firewall'                       => array( 'enable_firewall' ),
        'enable_firewall_blocking'               => array(),
        // Read by Services\BackupManager/BackupScheduler — real DB+file
        // archives. Off by default: this touches disk space and shouldn't
        // silently start writing archives the moment this version's code
        // runs on an existing site.
        'enable_automatic_backups'              => array(),
        'backup_frequency'                      => 'disabled',
        'backup_retention_count'                => 5,
        // Which real storage destination a just-completed backup uploads
        // to, on top of always staying on this server too
        // (Services\BackupStorageManager, hooked on 'vulopilot_backup_completed').
        // 'local' is a real, meaningful default (no destination configured
        // yet), not a placeholder — every backup already stores locally
        // regardless of this setting. Credentials for 's3'/'google_drive'
        // live in their own encrypted 'vulopilot_backup_storage_credentials' option, never
        // this flat option (see that table's own docblock in Utill::TABLES).
        'backup_storage_destination'             => 'local',
        // Scanner-category kill switches — each gates every scanner
        // registered under that category string (SCANNERS.md), not just
        // one check, since that's what these settings-page groupings
        // actually correspond to (e.g. disabling "WooCommerce" turns off
        // both the original WooCommerceScanner and the 11 Product*
        // scanners from the WooCommerce AI pass — all category `woocommerce`).
        // SEO no longer has one of these — see the granular
        // flag_*/Scanning/Seo.ts entries below, same "no whole-category
        // switch, only granular ones" posture GEO already uses.
        'enable_accessibility_scanning'         => array( 'enable_accessibility_scanning' ),
        'enable_woocommerce_scanning'           => array( 'enable_woocommerce_scanning' ),
        // Scanning > SEO — granular, per-check toggles (readme's SEO
        // Optimization pillar), replacing the old whole-category
        // enable_seo_scanning switch. Each is read directly by the one
        // scanner it corresponds to; there's no "seo" category kill
        // switch to fall back on above, same posture GEO's scanners
        // already use.
        'flag_orphan_pages'                     => array( 'flag_orphan_pages' ),
        // Read by Seo\Scanners\ThinContentScanner as its minimum word
        // count instead of a hardcoded constant.
        'thin_content_word_threshold'           => 300,
        'flag_missing_featured_image'           => array( 'flag_missing_featured_image' ),
        // Moved back OUT of the nested `content_search_scans.seo` row (see
        // that setting's own docblock below) and into flat, standalone
        // keys — same shape as flag_orphan_pages/flag_missing_featured_image
        // right above — per direct instruction to relocate these two
        // toggles' own UI from Scanning → Content & Search's "SEO checks"
        // card into Scanning → SEO & Content's "Titles & meta" section
        // (SeoContent.ts), which only ever renders flat top-level fields,
        // not `content_search_scans`' nested-by-id shape. Read directly by
        // MetaDescriptionScanner/DuplicateContentScanner now — no longer
        // ANDed with `content_search_scans.seo.enable` (the "SEO checks"
        // card's own master switch stays behind in Content & Search and no
        // longer covers these two; SeoScanner/HeadingStructureScanner,
        // which have no granular flag of their own, are still the only
        // scanners that master switch gates).
        'flag_missing_meta_description'         => array( 'flag_missing_meta_description' ),
        'flag_duplicate_titles'                  => array( 'flag_duplicate_titles' ),
        // Same "moved back out to a flat key" story as the two directly
        // above, for the 'images' row's own two granular flags —
        // Seo\Scanners\ImagesScanner/BrokenImagesScanner now read these
        // directly; Scanning → SEO & Content's own "Images" section
        // (SeoContent.ts) is where they live now, not Content & Search's
        // "Image checks" card (`content_search_scans.images.enable` there
        // stays LargeImagesScanner's own master switch only).
        'flag_missing_alt_text'                  => array( 'flag_missing_alt_text' ),
        'flag_broken_images'                     => array( 'flag_broken_images' ),
        // Same "moved back out to a flat key" story again, for the
        // 'links' row's own one granular flag — Scanners\Basic\
        // BrokenLinksScanner now reads this directly; Scanning → SEO &
        // Content's own "Links & schema" section (SeoContent.ts) is where
        // it lives now, not Content & Search's "Broken link checks" card
        // (`content_search_scans.links.enable` there stays
        // RedirectAnalysisScanner/NotFoundScanner's own master switch
        // only).
        'flag_broken_links'                      => array( 'flag_broken_links' ),
        // Scanning > Content & Search — Settings → Scanning →
        // "Content & Search" tab's own 5 toggle-card rows (seo/images/
        // links/schema/readability), same nested-object-keyed-by-id shape
        // `ai_visibility_scans` below already uses. Migrated from 8
        // previously-flat keys (flag_missing_meta_description,
        // flag_duplicate_titles, flag_missing_alt_text, flag_broken_links,
        // broken_link_check_frequency, flag_broken_images,
        // broken_image_check_frequency, flag_missing_schema,
        // content_readability_min_score) — each row's own `enable` is a
        // genuinely new master switch (previously SeoScanner,
        // HeadingStructureScanner, LargeImagesScanner,
        // RedirectAnalysisScanner, NotFoundScanner,
        // StructuredDataValidationScanner, and ReadabilityScanner had no
        // on/off setting of their own at all), layered on top of the
        // pre-existing granular flags (now nested) rather than replacing
        // them, so a scanner with its own flag only runs when BOTH its
        // row's `enable` and that flag are true. `missing_meta_description`/
        // `duplicate_titles` themselves moved back out to their own flat
        // keys above — the 'seo' row below now only carries its own
        // `enable` master switch, same shape the 'schema' row already had
        // (no formFields of its own). `missing_alt_text`/`broken_images`
        // made the same trip back out to their own flat keys below, per a
        // later, separate direct instruction — the 'images' row now only
        // carries its own `enable` master switch too.
        'content_search_scans'                  => array(
            'seo'         => array(
                'enable'                   => true,
            ),
            'images'      => array(
                'enable'           => true,
            ),
            'links'       => array(
                'enable'       => true,
            ),
            // Covers both SchemaScanner (presence) and
            // StructuredDataValidationScanner (validity) — the mockup
            // this card was built from has one "Structured data checks"
            // toggle for both, not two.
            'schema'      => array(
                'enable' => true,
            ),
            'readability' => array(
                'enable'    => true,
            ),
        ),
        // Same "moved back out to a flat key" story again, for the
        // 'readability' row's own one granular field — this time a
        // number, not a boolean, but the same relocation: Scanners\Basic\
        // ReadabilityScanner now reads this directly; a new "Readability"
        // section on Scanning → SEO & Content (SeoContent.ts) is where it
        // lives now, not Content & Search's "Readability" card
        // (`content_search_scans.readability.enable` there stays that
        // scanner's own master switch). 50 is the Flesch Reading Ease
        // scale's own published "Fairly Difficult" boundary, not an
        // arbitrary VuloPilot-specific number.
        'content_readability_min_score'         => 50,
        // Read by Seo\Scanners\BrokenLinksScanner to self-rate-limit —
        // 'daily'/'weekly', since this codebase's scan scheduling is one
        // global cadence (`scan_frequency` above), not a per-scanner cron;
        // this setting doesn't change *when* the shared scan runs, only
        // whether this specific scanner's own check actually re-runs that
        // time or skips (based on when it last genuinely ran).
        'broken_link_check_frequency'           => 'daily',
        // Read by Seo\Scanners\BrokenImagesScanner — same real
        // gate/frequency shape as broken_link_check_frequency directly
        // above, for `<img src>` instead of `<a href>`.
        'broken_image_check_frequency'          => 'daily',
        // Scanning > Sitemap — moved out of the SEO tab into its own
        // dedicated Settings sub-tab (Scanning/Sitemap.ts), matching the
        // mockup's own tab boundary. Read by Services\SitemapManager — real
        // toggles/filters over WordPress core's own native `/wp-sitemap.xml`
        // (`wp_sitemaps_enabled`, `wp_sitemaps_max_urls`,
        // `wp_sitemaps_post_types`, `wp_sitemaps_taxonomies`,
        // `wp_sitemaps_posts_query_args`, `wp_sitemaps_taxonomies_query_args`),
        // not a from-scratch sitemap generator; see that class's own docblock.
        'sitemap_enabled'                       => array( 'sitemap_enabled' ),
        // Max URLs per sitemap page — core's own default is 2000; this
        // overrides `wp_sitemaps_max_urls` when set.
        'sitemap_links_per_page'                => 200,
        // Neither of these has a real backing implementation — WordPress
        // core's native XML sitemaps (unlike Yoast/RankMath's own
        // from-scratch generators) have no `<image:image>` sitemap
        // extension support at all, and SitemapManager.php's own docblock
        // deliberately rejects building a second, competing sitemap
        // implementation just to add one. Persisted only, same honest
        // "round-trips through Settings but nothing reads it yet" posture
        // Seo.ts's own Redirects & 404s section documents for the same
        // reason (a real from-scratch generator is a separate, larger
        // feature this codebase hasn't taken on).
        'sitemap_include_images'                => array(),
        'sitemap_include_featured_images'       => array(),
        // Comma-separated post/term IDs — read by Services\SitemapManager
        // and applied via `wp_sitemaps_posts_query_args`/
        // `wp_sitemaps_taxonomies_query_args` (`post__not_in`/`exclude`).
        'sitemap_exclude_posts'                 => '',
        'sitemap_exclude_terms'                 => '',
        // Which real post types/taxonomies are included — shared by both
        // the XML sitemap (`wp_sitemaps_post_types`/`wp_sitemaps_taxonomies`)
        // and the HTML sitemap (Services\HtmlSitemapRenderer's
        // `[vulopilot_html_sitemap]` shortcode, which reads these same 2
        // keys directly). One real control each in Settings →
        // GetStarted\Sitemap.ts now, not a separate XML/HTML pair — the
        // former `sitemap_html_post_types`/`sitemap_html_taxonomies` are
        // gone, merged into these per direct instruction. Real WP
        // post_type/taxonomy slugs, not the mockup's fictional
        // "knowledgebase"/"megamenu" entries (this codebase registers no
        // custom post types of its own — confirmed via grep).
        // `product`/`product_cat`/`product_tag` are only ever effective
        // when WooCommerce is active (`post_type_exists( 'product' )`),
        // same conditional-effectiveness pattern
        // GeoAnalysis\LlmsTxtGenerator::generate() already uses for its own
        // `products` entry — harmless to list here unconditionally since
        // the PHP consumer is what actually gates on WooCommerce, not this
        // default.
        'sitemap_xml_post_types'                => array( 'post', 'page', 'attachment', 'product' ),
        'sitemap_xml_taxonomies'                => array( 'category', 'post_tag', 'product_cat', 'product_tag' ),
        // Read by Services\HtmlSitemapRenderer — a real, human-readable
        // `[vulopilot_html_sitemap]` shortcode (mockup's own "Shortcode"
        // settings row), not a dedicated page/template.
        'html_sitemap_enabled'                  => array( 'html_sitemap_enabled' ),
        'html_sitemap_display_format'           => 'list',
        'html_sitemap_sort_by'                  => 'published_date',
        'html_sitemap_show_dates'               => array( 'html_sitemap_show_dates' ),
        // 'post_title' or 'seo_title' — the latter reads
        // Services\PostSeoMetaFields::META_KEYS['social_title'] per post/term
        // when set (the closest real "SEO title" field this codebase has;
        // there is no separate meta box "SEO title" distinct from the
        // social/OG title), falling back to the normal title when empty.
        'html_sitemap_item_titles'              => 'post_title',
        // Scanning > SEO & Content > Tag Manager. Read by
        // Services\TagManagerService — real Google Tag Manager `<script>`
        // (wp_head) + `<noscript><iframe>` (wp_body_open) output, same
        // self-registers-own-hook/setting-gates-output shape as
        // WebmasterToolsManager/CanonicalUrlManager. Same `array('key')`
        // on/off toggle convention as `ga_install_tracking_code` below —
        // an empty container id (or the toggle off) means nothing is
        // output at all.
        'tag_manager_enabled'                   => array(),
        'tag_manager_container_id'              => '',
        // Scanning > Webmaster Tools. Read by Services\WebmasterToolsManager —
        // outputs each configured verification `<meta>` tag on `wp_head`,
        // same self-registers-own-hook/setting-gates-output shape as
        // CanonicalUrlManager/SocialMetaTagsManager. Empty string = that
        // provider's tag isn't output at all.
        'webmaster_google_verification'         => '',
        // Connections > Google Services (GoogleServicesPanel.tsx). Read by
        // Services\GoogleAnalyticsTracker — real `gtag.js` output on
        // `wp_head`, gated on `ga_install_tracking_code` and a connected
        // GA4 property (GoogleServicesConnection's own `ga4_measurement_id`,
        // stored separately — see that class's own docblock for why).
        // Same `array('key')`-means-on/`array()`-means-off toggle-checkbox
        // convention `flag_missing_meta_description` etc. already use
        // above (zyra's own ToggleInput only renders as a real toggle
        // switch in single-select mode when driven this way — a plain
        // boolean would render as a radio button instead), even though
        // this tab is a hand-built escape-hatch panel, not InputRenderer-
        // driven.
        'ga_install_tracking_code'              => array(),
        'ga_anonymize_ip'                       => array(),
        'ga_self_hosted_js'                     => array(),
        'ga_exclude_logged_in_users'             => array(),
        'webmaster_bing_verification'           => '',
        'webmaster_baidu_verification'          => '',
        'webmaster_yandex_verification'         => '',
        'webmaster_pinterest_verification'      => '',
        'webmaster_norton_verification'         => '',
        // Free-form custom `<meta>` tags — WebmasterToolsManager sanitizes
        // this with an allowlist limited to `<meta ...>` tags only (mockup's
        // own "Only <meta> tags are allowed" copy) before echoing it.
        'webmaster_custom_tags'                 => '',
        // Connections > Site Verification (SiteVerificationPanel.tsx) —
        // set only by Controllers\Settings::verify_webmaster_tool(), never
        // user-edited directly, same "system-set, survives a page refresh"
        // role `crawler_alert_last_test_sent` plays elsewhere. A real,
        // honest self-check: this plugin fetches its OWN homepage and
        // confirms the matching `<meta>` tag actually renders there — it
        // does NOT call Google/Bing/Pinterest to ask whether THEY consider
        // the site verified (no such API is integrated here), so "Verified"
        // in this tab means the tag is live on your homepage, not that
        // Google/Bing/Pinterest have confirmed account ownership.
        'webmaster_google_verified_at'          => '',
        'webmaster_bing_verified_at'            => '',
        'webmaster_pinterest_verified_at'       => '',
        // Scanning > Instant Indexing (IndexNow). Read by
        // Services\IndexNowClient/IndexNowAutoSubmitter/IndexNowKeyFileServer.
        // Empty `indexnow_post_types` means auto-submit-on-publish is off;
        // manual submission from the Instant Indexing tab's textarea always
        // works regardless of this setting.
        'indexnow_post_types'                   => array( 'post', 'page', 'product' ),
        // Generated lazily (Controllers\Settings::get_stored_settings(),
        // same "can't call a method inside a class const array" reasoning
        // llms_txt_content's own comment gives) rather than defaulted here —
        // an empty string means it hasn't been generated yet.
        'indexnow_api_key'                      => '',
        // "Performance" Overview's PerformanceScoreCard.tsx — a real,
        // user-supplied Google PageSpeed Insights API key (free tier
        // available). Read by Services\PageSpeedInsightsFetcher; empty
        // means no key configured, so the card falls back to the single
        // real unified category_scores.performance number instead of a
        // fabricated Mobile/Desktop split.
        'psi_api_key'                           => '',
        // Settings → Connections → PageSpeed Insights' own "Daily API
        // Limit" — a real soft cap Services\PageSpeedInsightsFetcher
        // checks before making a real request to Google's API, protecting
        // the site owner's own PSI quota from "Test Connection" clicks
        // stacking on top of the daily cron's own 2 real requests/day.
        // Google's real free-tier PSI quota is far higher than this
        // default (25,000/day per Cloud project) — 1000 is just a sane,
        // mockup-matching default a site owner can raise or lower, not a
        // reflection of any real Google-side limit this plugin knows about.
        'psi_daily_limit'                       => 1000,
        // Read by Services\RobotsTxtManager — appends a `Sitemap:` line to
        // WordPress core's own virtual robots.txt via the `robots_txt`
        // filter; see that class's own docblock for why this isn't a
        // from-scratch robots.txt file generator.
        'robots_auto_generate'                  => array( 'robots_auto_generate' ),
        // Read by Seo\Scanners\AiCrawlerBlockedPagesScanner
        // (AI-CRAWLER-ANALYTICS-MODULE.md) — flags real published pages
        // robots.txt disallows for one specific known AI bot.
        'flag_ai_crawler_blocked_pages'         => array( 'flag_ai_crawler_blocked_pages' ),
        // Read by Services\CanonicalUrlManager — WordPress core already
        // outputs a canonical tag by default (rel_canonical() on wp_head),
        // so this defaults OFF; it exists as a safety net a site owner (or
        // vulopilot-pro's OneClickFix "Fix" action) can turn on when a
        // theme/caching plugin is found to be stripping it, per
        // Seo\Scanners\CanonicalUrlScanner's own finding.
        'canonical_url_enabled'                 => array(),
        // Read by Services\SocialMetaTagsManager — outputs Open Graph +
        // Twitter Card meta tags. Defaults OFF since many sites already
        // have another plugin/theme outputting these; exists so
        // vulopilot-pro's OneClickFix "Fix" action has something real to
        // turn on for Seo\Scanners\OpenGraphScanner/TwitterCardScanner's
        // findings.
        'social_meta_tags_enabled'              => array(),
        // Settings → Site Identity → Title Formats, read by
        // Services\TitleFormatter (`pre_get_document_title`). Same
        // "setting gates OUTPUT, not construction" posture as
        // CanonicalUrlManager/SocialMetaTagsManager above — 'enabled' by
        // default since a title format is a strict improvement over
        // whatever the active theme's own document-title logic already
        // produces (WordPress core always has one; this only replaces it
        // once a real, non-empty template exists for the current context).
        // Each `title_format_*` is a free-text template using
        // TitleFormatter::VARIABLES (`%site_title%`, `%post_title%`, ...,
        // `%sep%`); `title_separator` is what `%sep%` itself resolves to.
        'site_identity_enabled'                 => 'enabled',
        'title_separator'                       => '|',
        'title_format_home'                     => '%site_title% %sep% %site_description%',
        'title_format_post'                     => '%post_title% %sep% %site_title%',
        'title_format_page'                     => '%page_title% %sep% %site_title%',
        'title_format_category'                 => '%category_title% %sep% %site_title%',
        'title_format_tag'                      => '%tag_title% %sep% %site_title%',
        'title_format_search'                   => 'Search results for "%search_term%" %sep% %site_title%',
        'title_format_archive'                  => '%archive_title% %sep% %site_title%',
        // Same feature, same `TitleFormatter::resolve()`/`%variable%` engine
        // as `title_format_*` above, just feeding a real `<meta name="description">`
        // tag (`wp_head`, TitleFormatter::maybe_output_description()) instead
        // of the document title. For `post`/`page`, this is only ever a
        // FALLBACK — a real, non-empty `post_excerpt` (this codebase's
        // already-established "meta description" field, see
        // Seo\Scanners\MetaDescriptionScanner's own docblock) always wins
        // when one exists; these templates only render when there's no
        // excerpt to use instead.
        'description_format_home'               => '%site_description%',
        'description_format_post'               => '%post_title% %sep% %site_description%',
        'description_format_page'               => '%page_title% %sep% %site_description%',
        'description_format_category'           => '%category_title% %sep% %site_description%',
        'description_format_tag'                => '%tag_title% %sep% %site_description%',
        'description_format_search'             => 'Search results for "%search_term%" %sep% %site_description%',
        'description_format_archive'            => '%archive_title% %sep% %site_description%',
        // Read by Services\RedirectManager (the first two) and
        // Services\NotFoundLogger (the third) — a real 301 redirect
        // manager (a user-managed old-path -> new-path table, applied at
        // request time via `vulopilot_redirects`) and a real 404-visit log
        // (distinct from Scanners\Basic\NotFoundScanner, which only checks
        // this site's OWN published permalinks for 404s, not visitor
        // traffic to missing URLs), backed by `vulopilot_not_found_logs`.
        'enable_redirect_manager'               => array( 'enable_redirect_manager' ),
        'auto_redirect_on_slug_change'          => array( 'auto_redirect_on_slug_change' ),
        'log_404s'                              => array( 'log_404s' ),
        // AI Visibility / GEO.
        'enable_llms_txt'                       => array( 'enable_llms_txt' ),
        // Empty means "not customized yet" — Controllers\Settings::get_stored_settings()
        // fills this with GeoAnalysis\LlmsTxtGenerator::generate()'s live
        // output for display until an admin edits and saves their own.
        'llms_txt_content'                      => '',
        // Read by modules/Geo/Module.php's save_post hook — regenerates
        // and re-writes llms.txt automatically on publish/update, only
        // while the Geo module (Modules page) is active.
        'llms_auto_regen'                       => array( 'llms_auto_regen' ),
        // Read by GeoAnalysis\LlmsTxtGenerator::generate() to decide which
        // sections to build at all.
        'llms_include_types'                    => array( 'pages', 'posts' ),
        // Settings → Scanning → AI Visibility's own `expandable-panel`
        // field (AiVisibility.ts) — one row per scan category, each with
        // a real Active/Inactive `enable` toggle and that category's own
        // threshold as a `formFields` entry. Replaces 7 previously-flat
        // keys (`flag_missing_semantic`, `flag_weak_entity`,
        // `minimum_entity_mentions`, `flag_missing_ai_summary`,
        // `answer_first_words`, `min_data_points`, `stale_content_months`)
        // with this nested-object-keyed-by-id shape — same migration
        // `visibility_alerts` above already went through for its own 3
        // rows. All 5 default `enable` to `true` (unlike
        // `visibility_alerts`'s own rows, which default off): these are
        // existing, already-always-on checks gaining an off switch, not
        // new opt-in alerts, so "on" is the non-surprising default that
        // changes no existing install's findings.
        'ai_visibility_scans'                   => array(
            // Read by Geo\Scanners\GeoSemanticStructureScanner. Its own
            // "AI-readable structure" row on the AI Visibility settings
            // panel was removed per direct instruction — always `true` now
            // with no UI control left to turn it off, so the scanner just
            // always runs (Free and Pro alike).
            'structure'    => array(
                'enable' => true,
            ),
            // `enable` gates whether GeoAnalysis\GeoAnalyzer's AI-judged
            // "entity_coverage" dimension is scored at all for a post
            // (Entity Coverage needs AI judgment per GEO-MODULE.md's
            // "Splitting 12 checks into two honest categories," so this
            // can't be a deterministic scanner's kill switch the way
            // 'structure' above is). `min_mentions` is passed to the AI as
            // the minimum number of times a page should mention its
            // primary entity before "entity_coverage" scores well — only
            // used while `enable` is true.
            'entity'       => array(
                'enable'       => true,
                'min_mentions' => 2,
            ),
            // Read by vulopilot-pro's GeoInsights\Scanners\StaleContentScanner
            // (its `enable`) and GeoAnalysis\GeoAnalyzer::calculate_content_freshness()
            // (`stale_months` only — that deterministic per-post sub-score
            // always runs regardless of `enable`, see that method's own
            // docblock).
            'freshness'    => array(
                'enable'       => true,
                'stale_months' => 12,
            ),
            // Read by Geo\Scanners\GeoSummaryBlockScanner — GEO scanning
            // has no whole-category kill switch (unlike SEO/Accessibility/
            // WooCommerce above), so `enable` is that scanner's only
            // on/off switch. `min_words` is how many words from the top of
            // a page/post its summary marker must appear within.
            'answer_first' => array(
                'enable'    => true,
                'min_words' => 200,
            ),
            // `enable` gates Geo\Scanners\GeoCitationOpportunityScanner
            // (its own findings-list check). `min_data_points` only ever
            // fed GeoAnalysis\GeoAnalyzer::calculate_evidence_density()'s
            // per-post "Data Point & Evidence Density" sub-score (stats/
            // citations per 500 words a page needs to score well) — a
            // separate concern from whether the scanner itself runs.
            'evidence'     => array(
                'enable'          => true,
                'min_data_points' => 3,
            ),
        ),
        // Read by vulopilot-pro's GeoInsights\CompetitorVisibilityAnalyzer —
        // newline-separated competitor URLs to fetch and compare structural
        // GEO-readiness signals against (schema/author/heading structure),
        // real HTTP requests with no AI cost. Persisted here (Free owns the
        // setting/interface) even though only Pro ever reads it — same
        // "setting round-trips through Settings regardless of which tier
        // reads it" posture every other Pro-gated setting in this file
        // already takes.
        'geo_competitor_urls'                   => '',
        // Scanning > Brand Intelligence. Read by
        // BrandIntelligence\Scanners\AboutPageAnalysisScanner — the minimum real word
        // count an existing About-shaped page needs before it counts as
        // substantive rather than a placeholder, not a claim about ideal
        // About-page length.
        'brand_about_page_min_words'            => 80,
        // AI Crawler Traffic Monitoring.
        'enable_crawler_tracking'               => array( 'enable_crawler_tracking' ),
        // Read by Services\CrawlerTrafficLogger::run_cleanup() as the base
        // value passed through the `vulopilot_crawler_log_retention_days`
        // filter (30, matching this class's own prior hardcoded default) —
        // vulopilot-pro's AdvancedReports module extends it further.
        'log_retention'                         => '30',
        // Scanning > Crawler Analytics. Read by vulopilot-pro's
        // AiCrawlerAnalytics\CrawlerAlertMonitor — the minimum percentage
        // drop in daily AI crawler visit volume (vs. the trailing 7-day
        // average) that triggers `email_on_crawler_alerts`. Same
        // "setting round-trips through Settings regardless of which tier
        // reads it" posture as 'geo_competitor_urls' above.
        'crawler_volume_drop_threshold_percent' => 50,
        // Notifications > AI Crawler Alerts' "Notify me about" — one real
        // zyra `expandable-panel` field (AiCrawlerAlerts.ts), all 5 rows in
        // a single panel group, one nested object keyed by alert type
        // rather than N flat keys (that field type's own value shape,
        // `{ [methodId]: { ...formFields } }`). Each `enable` gates one
        // specific real check within CrawlerAlertMonitor::run_daily_check(),
        // independent of (but still subordinate to) the master
        // `email_on_crawler_alerts` switch above.
        //
        // 'blocked' reuses the existing "bot ignoring its own robots.txt
        // block" check (count_bots_ignoring_blocked_pages(), now
        // find_bots_ignoring_blocked_pages()) rather than a new one.
        // 'access_limited' is a new check (CrawlerAlertMonitor::find_bots_with_high_404_rate(),
        // reads CrawlerVisitRepository::get_404_rate_for_bot()) — no
        // dedicated threshold field on the tab (the mockup only exposes a
        // frequency dropdown for this row, not a % control like traffic
        // drop gets), so HIGH_404_RATE_THRESHOLD_PERCENT in
        // CrawlerAlertMonitor is a fixed internal cutoff instead.
        // 'traffic_drop' only nests its own `enable` here — its actual
        // threshold stays the flat `crawler_volume_drop_threshold_percent`
        // just above, since that field is ALSO independently exposed on
        // Scanning → AI Visibility (that tab's own field, predates this
        // one): nesting the threshold itself here too would either
        // duplicate that number under a second, driftable key, or make
        // two unrelated tabs read/write the same nested blob through two
        // different UI shapes. Its panel body just links to where the
        // threshold is actually set, rather than a second control for it.
        // 'inactive' is a new check (find_newly_inactive_bots(), reads
        // CrawlerVisitRepository::get_bot_last_seen()) that only
        // re-notifies if a bot goes active again and then falls inactive a
        // second time — not every day it stays quiet. 'new_bot' is a new
        // check (find_newly_detected_bots(), reads
        // CrawlerVisitRepository::get_all_bot_names_ever_seen() against
        // the stored 'crawler_alert_known_bots' list, VULOPILOT_OTHER_SETTINGS)
        // — defaults to weekly digest, matching the mockup's own selected
        // value, since a brand-new crawler showing up isn't as
        // time-sensitive as a block or a traffic drop.
        // Settings → Notifications → Alerts Settings' own single shared
        // "Notification channels" control — shown once, above all four
        // alert sections on that tab (AI Crawler/Security/Visibility/
        // Critical issue alerts), rather than repeating an identical
        // multi-checkbox per section (per direct instruction; replaces the
        // former per-section 'crawler_alert_channels'/'security_alert_channels'/
        // 'visibility_alert_channels'/'critical_alert_channels' keys — same
        // real values, just one setting instead of four). 'email' always
        // goes through wp_mail(); 'dashboard' additionally writes a real
        // ActivityLogRepository entry, visible under Settings → History —
        // not a decorative toggle. No 'mobile' value: no real push-delivery
        // mechanism exists anywhere in this codebase yet, so the tab just
        // says so rather than offering a control that can never do
        // anything.
        'alert_channels'                         => array( 'email', 'dashboard' ),
        'crawler_alerts'                         => array(
            'blocked'        => array(
                'enable'    => true,
                'frequency' => 'immediate',
            ),
            'access_limited' => array(
                'enable'    => true,
                'frequency' => 'immediate',
            ),
            'traffic_drop'   => array(
                'enable' => true,
            ),
            'inactive'       => array(
                'enable'         => true,
                'days_threshold' => '7',
            ),
            'new_bot'        => array(
                'enable'    => true,
                'frequency' => 'weekly_digest',
            ),
        ),
        // "Last test alert sent successfully on ..." — set by
        // Controllers\Settings::send_test_crawler_alert(), read back by
        // CrawlerAlertTestPanel.tsx on load so that line survives a page
        // refresh instead of only showing right after a click.
        'crawler_alert_last_test_sent'           => '',
        // Scanning > Entity Extraction (KNOWLEDGE-GRAPH-MODULE.md). Read by
        // Services\EntityExtractor. Free text — no schema.org @type or
        // WooCommerce/existing setting anywhere in this codebase implies a
        // business type, so the site owner provides it directly. Shown
        // as-is on the Business Profile card; never written into any real
        // Organization/LocalBusiness JSON-LD.
        'entity_business_type'                  => '',
        // Newline-separated page URLs/ids — this codebase has no existing
        // Service concept to derive these from automatically, so the site
        // owner explicitly curates which real published pages are
        // "services."
        'entity_service_pages'                  => '',
        // Newline-separated `Name | Address` lines — same reasoning as
        // 'entity_service_pages' above, for Location entities (no
        // LocalBusiness address field is ever written anywhere in this
        // codebase to derive this from automatically).
        'entity_business_locations'             => '',
        // Advanced / Debug.
        'enable_debug_logging'                  => array(),
    );

    /**
     * Canonical widget ids for the Dashboard's drag-and-drop layout
     * (src/dashboard-widgets/registry.ts's DEFAULT_DASHBOARD_WIDGETS,
     * kept in sync with this list by convention — same id-matching
     * convention AI-ACTIONS.md already uses between Rule ids and Action
     * ids). `Controllers\DashboardLayout` validates against this list so
     * a saved layout can never contain an id the client made up; new
     * widgets (Free or, via `vulopilot_dashboard_widgets`, Pro) get added
     * here so an existing user's saved layout doesn't silently drop them.
     *
     * @var string[]
     */
    const DASHBOARD_WIDGET_IDS = array(
        // The newer Dashboard mockup's own top section (registry.ts's
        // MOCKUP_WIDGETS), in its order. `overall-score`/`score-breakdown`
        // were 1 combined widget until split into 2 (registry.ts's own
        // docblock on `score-breakdown` has the real reasoning).
        'overall-score',
        'score-breakdown',
        'vulopilot-activity',
        'needs-attention',
        'key-pages',
        'site-snapshot',
        'recent-activity',
        // Pre-existing widgets the newer mockup doesn't depict as their own
        // card — kept real and selectable, just appended after the above in
        // registry.ts's own default order (see that file's own docblock).
        // `ai-suggestions`/`todays-tasks` are deliberately NOT here anymore —
        // both were retired as real content duplicates of `needs-attention`/
        // `recent-activity` respectively (registry.ts's own docblock has the
        // full reasoning); removing them from this whitelist means a saved
        // layout's now-meaningless entry for either is dropped on its next
        // reconciliation, and neither can be re-added via "Customize
        // dashboard".
        'run-audit',
        'recent-changes',
        'automation-status',
        'crawler-traffic',
        // Registered by vulopilot-pro's AiCrawlerAnalytics module via
        // `vulopilot_dashboard_widgets` (AI-CRAWLER-ANALYTICS-MODULE.md).
        'ai-monitoring',
        'knowledge-graph',
        // Registered by vulopilot-pro's KnowledgeGraph module via
        // `vulopilot_dashboard_widgets` (KNOWLEDGE-GRAPH-MODULE.md).
        'knowledge-graph-health',
        // Registered by vulopilot-pro's McpServer module via
        // `vulopilot_dashboard_widgets` (MCP-SERVER-MODULE.md).
        'mcp-server-status',
        // Health timeline / Latest reports / Brand Visibility breakdown
        // are a deliberate one-row group in registry.ts (each grid:4) —
        // kept adjacent here too, since this array (not registry.ts's
        // order) is what a never-customized user's layout actually
        // reconciles against (DashboardLayout.php::get_reconciled_layout()).
        'health-timeline',
        'latest-reports',
        'brand-breakdown',
    );

    /**
     * User meta key the Dashboard's widget layout (order + enabled flags)
     * is stored under — per-user, like WordPress core's own
     * `meta-box-order_{screen}` dashboard widget layout, since a widget
     * arrangement is a personal UI preference, not site-wide config (so
     * it belongs in user meta, not VULOPILOT_SETTINGS_KEY's shared
     * wp_options row).
     *
     * @var string
     */
    const DASHBOARD_LAYOUT_META_KEY = 'vulopilot_dashboard_widget_layout';

    /**
     * Option name the active-modules list is stored under — mirrors
     * VuloLabs\Utill::ACTIVE_MODULES_DB_KEY's role for this product
     * line's own `modules/` addon system (module-architecture.md's
     * discovery/loading mechanism, added here for VuloPilot via
     * `Modules::load_active_modules()`).
     *
     * @var string
     */
    const ACTIVE_MODULES_DB_KEY = 'vulopilot_all_active_module_list';

    /**
     * Records an unexpected exception — Modules::load_active_modules()'s
     * catch-and-skip path calls this so one broken module's constructor
     * (Free's own, vulopilot-pro's, or a third party's) doesn't take the
     * whole site down. Writes to PHP's own error log only when the
     * Advanced tab's debug-logging setting is on — the same opt-in gate
     * Reports\ReportGenerator::maybe_log_debug() already uses, kept
     * consistent rather than introducing a second logging convention.
     *
     * @param \Throwable $exception The exception to record.
     * @return void
     */
    public function log( \Throwable $exception ): void {
        $settings = wp_parse_args( get_option( self::VULOPILOT_SETTINGS_KEY, array() ), self::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['enable_debug_logging'] ) ) {
            return;
        }

        // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- gated behind an explicit, opt-in admin setting (Advanced tab), matching Reports\ReportGenerator::maybe_log_debug()'s existing pattern.
        error_log( sprintf( '[VuloPilot] %s', $exception->getMessage() ) );
    }

    /**
     * Whether VuloPilot Pro is installed, active, and license-active —
     * mirrors VuloLabs\Utill::is_khali_dabba()'s role for this product
     * line. VuloPilotPro::check_pro_active() is the only thing that ever
     * hooks `kothay_dabba_vulopilot` (default false when Pro isn't
     * present), same filter-based "ask Pro, don't check for it directly"
     * pattern the vulolabs family uses.
     *
     * @return bool
     */
    public function is_khali_dabba(): bool {
        return (bool) apply_filters( 'kothay_dabba_vulopilot', false );
    }
}
