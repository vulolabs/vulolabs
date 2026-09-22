<?php
/**
 * ScanPersistenceListener class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\ValueObjects\Finding;
use VuloPilot\ValueObjects\ScanResult;
use VuloPilot\ValueObjects\Severity;
use VuloPilot\Repositories\ActivityLogRepository;
use VuloPilot\Repositories\FindingRepository;
use VuloPilot\Repositories\ScanRepository;
use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot ScanPersistenceListener class.
 *
 * The first real occupant of the "Services" layer ARCHITECTURE.md
 * describes — self-hooks `vulopilot_scan_completed` (fired by
 * Scanners\ScanRunner, which deliberately never persists anything itself;
 * see its own docblock) and is the thing that turns a ScanResult into
 * real vulopilot_scans/vulopilot_scan_findings rows. Neither ScanRunner
 * nor RuleEngine has any idea this class exists — the hook is the only
 * coupling, same one-way-dependency shape used throughout.
 *
 * Fires `vulopilot_scan_persisted` after its own persistence work — the
 * seam vulopilot-pro's AdvancedReports module hooks to recalculate and
 * upsert today's site-health snapshot (historical trend data is Pro
 * business logic; this class only owns "did the scan's own rows get
 * written," not what anyone else derives from that afterward).
 *
 * @class       ScanPersistenceListener class
 * @version     1.0.0
 * @author      VuloLabs
 */
class ScanPersistenceListener {

    /**
     * Scanner ids that never dedupe on rescan — always inserted fresh,
     * every run, even if the exact same object_type/object_ref/title
     * combination is already open. This used to be an ALLOWLIST (only
     * `broken-links`/`broken-images`, later also `core-file-integrity`,
     * deduped; every other scanner always inserted fresh) — flipped to a
     * denylist after a real environment showed the allowlist approach
     * doesn't scale: virtually every scanner that re-checks a bounded,
     * identifiable set of objects (posts, plugins, themes, URLs, ...) hits
     * the identical pileup broken-links was originally fixed for, just
     * under a different scanner_id each time (basic-vulnerabilities,
     * canonical-url, thin-content, meta-description, seo, geo-author-info,
     * geo-trust-signals, internal-linking, seo-images, images, plugins,
     * themes, cdn, and more — confirmed live, up to 24 duplicate open rows
     * for one object). Deduping is now the default for every scanner,
     * regardless of whether a finding carries a real `object_type`/
     * `object_ref` — find_open_duplicate() matches those two columns
     * NULL-safely, so a purely sitewide check with nothing to match on
     * (e.g. `php-warnings`) dedupes on `scanner_id`+`title` alone the same
     * way an object-scoped finding dedupes on the full four-column key.
     * This list only exists for a scanner that genuinely wants more than
     * one simultaneously-open row for the same object+title — none do
     * today, but the mechanism stays available rather than assuming
     * that'll never be true.
     *
     * @var string[]
     */
    private const NEVER_DEDUPE_ON_RESCAN = array();

    /**
     * Maps a "Notify me about" checklist type (Settings → Notifications →
     * Website Alerts, 'critical_alert_types') to the real finding
     * categories that back it. A category not listed here (e.g.
     * 'woocommerce', 'database', 'links') falls under the 'other' catch-all
     * instead of its own checkbox — see that setting's own Utill.php
     * docblock.
     *
     * @var array<string, string[]>
     */
    private const CRITICAL_ALERT_CATEGORIES = array(
        'security'     => array( 'security', 'ssl' ),
        'availability' => array( 'availability' ),
        'performance'  => array( 'performance' ),
        'seo'          => array( 'seo', 'geo' ),
    );

    /**
     * Real scanner categories `maybe_log_security_scan_activity()` scopes
     * to — same 'security'/'ssl' pairing CRITICAL_ALERT_CATEGORIES['security']
     * already uses (SslMonitoringScanner's own real category is 'ssl', not
     * 'security').
     *
     * @var string[]
     */
    private const SECURITY_SCOPED_CATEGORIES = array( 'security', 'ssl' );

    /**
     * @var ScanRepository
     */
    private ScanRepository $scans;

    /**
     * @var FindingRepository
     */
    private FindingRepository $findings;

    /**
     * @var ActivityLogRepository
     */
    private ActivityLogRepository $activity_logs;

    /**
     * ScanPersistenceListener constructor.
     */
    public function __construct() {
        $this->scans         = new ScanRepository();
        $this->findings      = new FindingRepository();
        $this->activity_logs = new ActivityLogRepository();

        add_action( 'vulopilot_scan_completed', array( $this, 'handle_scan_completed' ) );
    }

    /**
     * @param ScanResult $scan_result The completed scan.
     * @return void
     */
    public function handle_scan_completed( ScanResult $scan_result ): void {
        $scan_id = $this->scans->insert(
            array(
                'scanner_id'      => $scan_result->get_scanner_id(),
                'status'          => $scan_result->get_status(),
                'duration_ms'     => (int) $scan_result->get_duration_ms(),
                'summary'         => wp_json_encode( $scan_result->get_summary() ),
                'scanned_objects' => wp_json_encode( $scan_result->get_scanned_post_ids() ),
                'error_message'   => $scan_result->get_error_message(),
                'started_at'      => current_time( 'mysql', true ),
                'finished_at'     => current_time( 'mysql', true ),
            )
        );

        // Real auto-resolve step (see this method's own end, after the
        // loop, for why) — every id this scanner currently has open,
        // captured BEFORE this run touches anything, so it's a clean
        // "what was open coming in" snapshot to diff against once the
        // loop below finishes. A row this loop refreshes (still a real,
        // ongoing problem) gets removed from this set as it's touched;
        // whatever's left at the end genuinely wasn't reproduced by this
        // run and gets marked resolved.
        $previously_open_ids = ! in_array( $scan_result->get_scanner_id(), self::NEVER_DEDUPE_ON_RESCAN, true )
            ? array_flip( $this->findings->get_open_finding_ids_for_scanner( $scan_result->get_scanner_id() ) )
            : array();

        foreach ( $scan_result->get_findings() as $finding ) {
            $duplicate = ! in_array( $scan_result->get_scanner_id(), self::NEVER_DEDUPE_ON_RESCAN, true )
                ? $this->findings->find_open_duplicate(
                    $scan_result->get_scanner_id(),
                    $finding->get_object_type(),
                    $finding->get_object_ref(),
                    $finding->get_title(),
                    $finding->get_dedupe_key()
                )
                : null;

            if ( null !== $duplicate ) {
                // Same problem is still present as of this run — refresh
                // the existing open row's own scan-run-specific fields
                // rather than inserting a second identical one (see
                // FindingRepository::find_open_duplicate()'s own
                // docblock). `created_at`/`id` deliberately untouched, so
                // this stays "first detected" for the finding, not
                // "detected again" — real historical queries
                // (get_severity_breakdown_for_category_as_of() and
                // friends) depend on `created_at` meaning that. `last_seen_at`
                // DOES move to this run's timestamp, though: it's what the
                // Issues table's "Affected" list actually displays
                // ("Detected {date}"), so a still-open, still-recurring
                // finding shows when it was last reconfirmed rather than
                // looking stale the moment it was first found. `title`
                // DOES move too (unlike everything above, this wasn't true
                // before `dedupe_key` existed): a finding matched via a
                // stable `dedupe_key` can have a `title` that legitimately
                // drifts every run (a word count, a score) — refreshing it
                // here is what keeps the number a site owner sees current
                // instead of frozen at whatever it was on first detection.
                $this->findings->update(
                    (int) $duplicate['id'],
                    array(
                        'scan_id'      => $scan_id,
                        'severity'     => $finding->get_severity(),
                        'category'     => $finding->get_category(),
                        'title'        => $finding->get_title(),
                        'description'  => $finding->get_description(),
                        'meta'         => wp_json_encode( $finding->get_meta() ),
                        'last_seen_at' => current_time( 'mysql', true ),
                    )
                );
                unset( $previously_open_ids[ (int) $duplicate['id'] ] );
                continue;
            }

            $new_finding_id = $this->findings->insert(
                array(
                    'scan_id'     => $scan_id,
                    'scanner_id'  => $scan_result->get_scanner_id(),
                    'severity'    => $finding->get_severity(),
                    'category'    => $finding->get_category(),
                    'title'       => $finding->get_title(),
                    'description' => $finding->get_description(),
                    'object_type' => $finding->get_object_type(),
                    'object_ref'  => $finding->get_object_ref(),
                    'dedupe_key'  => $finding->get_dedupe_key(),
                    'meta'        => wp_json_encode( $finding->get_meta() ),
                )
            );

            /**
             * Fires only for a genuinely NEW finding — the branch above
             * (an existing open duplicate refreshed instead) never reaches
             * here, so a still-recurring problem doesn't re-fire this on
             * every scan. vulopilot-pro's Automations\Triggers\
             * NewFindingTrigger's own extension point — "trigger decides
             * WHEN, conditions decide whether to continue" (same posture
             * every other trigger in that registry already follows): this
             * fires for every new finding regardless of severity/category,
             * and a real automation narrows it down to "critical" or
             * "broken link" etc. via its own existing min-priority/
             * category/min-impact conditions, same GEO/security/visibility
             * score-drop triggers' own "no built-in threshold" posture,
             * rather than this codebase growing a separate hardcoded
             * trigger per severity/category combination.
             *
             * @param int    $finding_id  The just-inserted `vulopilot_findings` row id.
             * @param string $severity    Severity::* constant.
             * @param string $category    Real finding category.
             * @param string|null $object_type From the triggering Finding, if any.
             * @param string|null $object_ref  From the triggering Finding, if any.
             */
            do_action(
                'vulopilot_finding_created',
                $new_finding_id,
                $finding->get_severity(),
                $finding->get_category(),
                $finding->get_object_type(),
                $finding->get_object_ref()
            );
        }

        // Auto-resolve every finding this scanner previously had open that
        // this run didn't reproduce — real, confirmed live: a stale
        // "WordPress core update available" row (and, separately, a stale
        // malware-scanner false positive) kept showing as open in Issues
        // days after the real underlying problem was gone, because nothing
        // anywhere in this codebase ever marked a finding resolved just
        // because a later scan stopped finding it — `find_open_duplicate()`
        // above only ever refreshes or inserts, never closes. Every real
        // scan run here checks its whole relevant scope fresh each time
        // (ScanRunner::run() takes no partial/subset argument), so
        // "previously open, not reproduced this run" reliably means fixed,
        // not "wasn't checked this time." Only runs for a genuinely
        // completed scan — a failed run (`STATUS_FAILED`, e.g. a fatal
        // mid-scan) didn't actually finish verifying anything, so it
        // must never be read as "nothing's wrong anymore."
        if ( ScanResult::STATUS_COMPLETED === $scan_result->get_status() ) {
            foreach ( array_keys( $previously_open_ids ) as $stale_id ) {
                $this->findings->update(
                    $stale_id,
                    array(
                        'status'      => 'resolved',
                        'resolved_at' => current_time( 'mysql', true ),
                    )
                );
            }
        }

        $this->activity_logs->log(
            'scan.completed',
            sprintf(
                /* translators: 1: scanner id, 2: number of findings. */
                __( 'Scan "%1$s" completed with %2$d finding(s).', 'vulopilot' ),
                $scan_result->get_scanner_id(),
                count( $scan_result->get_findings() )
            ),
            ScanResult::STATUS_FAILED === $scan_result->get_status() ? Severity::HIGH : Severity::INFO,
            'system',
            'scan',
            (string) $scan_id
        );

        $this->maybe_log_security_scan_activity( $scan_result, $scan_id );
        $this->maybe_notify_critical_findings( $scan_result );

        /**
         * Fires after a scan's own rows are persisted — vulopilot-pro's
         * AdvancedReports module hooks this to recalculate and upsert
         * today's site-health snapshot (historical trend data). Free
         * itself doesn't do anything with $scan_id beyond handing it out;
         * a hooked callback can re-query FindingRepository itself for
         * current open-finding counts, the same way this class used to.
         *
         * @param ScanResult $scan_result The completed scan.
         * @param int        $scan_id     The just-inserted `vulopilot_scans` row id.
         */
        do_action( 'vulopilot_scan_persisted', $scan_result, $scan_id );
    }

    /**
     * A second, additional real activity-log row for the exact same
     * completion this method's caller just logged as the generic
     * 'scan.completed' event — under a distinct, always-on event type
     * ('scan.completed.security') whenever the just-completed scanner's
     * own real category is security-relevant (SECURITY_SCOPED_CATEGORIES
     * above). What "Security" tab's own RecentActivityCard.tsx needs to
     * filter on: the Pro-only 'security.alert' event type
     * (vulopilot-pro\SecurityMonitoring\AlertDispatcher) only exists with
     * an active Pro license AND the site's own `security_alerts_enabled`
     * setting turned on (default off) — meaning on Free-only installs,
     * unlicensed Pro installs, and licensed-but-unconfigured Pro installs
     * (the large majority of real sites), that card would stay
     * permanently empty no matter how many open security findings exist.
     * This fires every real security-category scan completion, findings
     * or not, zero configuration required — resolved via the real
     * ScannerRegistry singleton (`VuloPilot()->scanner_registry`, already
     * populated by the time any real scan can complete — scans only ever
     * run well after `init` priority 20) rather than the completed scan's
     * own findings, so a clean scan (0 findings) still logs real activity
     * instead of this card only ever showing up when something's wrong.
     *
     * @param ScanResult $scan_result The completed scan.
     * @param int        $scan_id     The just-inserted `vulopilot_scans` row id.
     * @return void
     */
    private function maybe_log_security_scan_activity( ScanResult $scan_result, int $scan_id ): void {
        $scanner = VuloPilot()->scanner_registry->get_scanner( $scan_result->get_scanner_id() );

        if ( ! $scanner || ! in_array( $scanner->get_category(), self::SECURITY_SCOPED_CATEGORIES, true ) ) {
            return;
        }

        $this->activity_logs->log(
            'scan.completed.security',
            sprintf(
                /* translators: 1: scanner id, 2: number of findings. */
                __( 'Scan "%1$s" completed with %2$d finding(s).', 'vulopilot' ),
                $scan_result->get_scanner_id(),
                count( $scan_result->get_findings() )
            ),
            ScanResult::STATUS_FAILED === $scan_result->get_status() ? Severity::HIGH : Severity::INFO,
            'system',
            'scan',
            (string) $scan_id
        );
    }

    /**
     * Emails the site's notification address when this scan raised any
     * critical-severity finding, gated behind the Settings screen's
     * Notifications tab (`notify_on_critical_findings`, default off — this
     * is opt-in, not a change to a previously-silent default).
     *
     * @param ScanResult $scan_result The completed scan.
     * @return void
     */
    private function maybe_notify_critical_findings( ScanResult $scan_result ): void {
        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['notify_on_critical_findings'] ) ) {
            return;
        }

        $enabled_types = (array) ( $settings['critical_alert_types'] ?? array() );

        $critical_findings = array_values(
            array_filter(
                $scan_result->get_findings(),
                fn( Finding $finding ) =>
                    Severity::CRITICAL === $finding->get_severity()
                    && $this->is_critical_alert_type_enabled( $finding->get_category(), $enabled_types )
            )
        );

        if ( empty( $critical_findings ) ) {
            return;
        }

        $message = implode(
            "\n",
            array_map(
                static fn( Finding $finding ): string => '- ' . $finding->get_title(),
                $critical_findings
            )
        );

        $channels = (array) ( $settings['alert_channels'] ?? array() );

        if ( in_array( 'dashboard', $channels, true ) ) {
            $this->activity_logs->log(
                'critical_alert',
                sprintf(
                    /* translators: %d is the number of critical findings. */
                    __( 'VuloPilot found %d critical issue(s).', 'vulopilot' ),
                    count( $critical_findings )
                ),
                'critical',
                'system'
            );
        }

        if ( ! in_array( 'email', $channels, true ) ) {
            return;
        }

        $recipient = $settings['notification_email'] ?: get_option( 'admin_email' );
        $headers   = array();

        if ( ! empty( $settings['email_from_address'] ) && is_email( $settings['email_from_address'] ) ) {
            $from_name = $settings['email_from_name'] ?: get_bloginfo( 'name' );
            $headers[] = sprintf( 'From: %s <%s>', $from_name, $settings['email_from_address'] );
        }

        wp_mail(
            $recipient,
            sprintf(
                /* translators: 1: site name, 2: number of critical findings. */
                __( '[%1$s] VuloPilot found %2$d critical issue(s)', 'vulopilot' ),
                get_bloginfo( 'name' ),
                count( $critical_findings )
            ),
            $message,
            $headers
        );
    }

    /**
     * Whether $category is allowed to alert, per the "Notify me about" checklist.
     *
     * @param string   $category      The finding's own real category.
     * @param string[] $enabled_types Enabled 'critical_alert_types' values.
     * @return bool
     */
    private function is_critical_alert_type_enabled( string $category, array $enabled_types ): bool {
        foreach ( self::CRITICAL_ALERT_CATEGORIES as $type => $categories ) {
            if ( in_array( $category, $categories, true ) ) {
                return in_array( $type, $enabled_types, true );
            }
        }

        return in_array( 'other', $enabled_types, true );
    }
}
