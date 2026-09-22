<?php
/**
 * SecurityScoreSnapshotRecorder class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Repositories\FindingRepository;
use VuloPilot\Repositories\ScoreSnapshotRepository;

defined( 'ABSPATH' ) || exit;

/**
 * Writes today's real security-category score into
 * `vulopilot_score_snapshots` (category `security`) — the data SecurityTrendCard.tsx's
 * chart reads. Not a reuse of `vulopilot_site_health_snapshots` — that
 * table's own `security_score` column is only ever written by Pro's
 * AdvancedReports module, so a Free-tier "Security Trend" card can't
 * depend on it (would stay empty on any site without that Pro module
 * active). Same trigger shape, same weighting, and same idempotent-upsert
 * reasoning as Services\PerformanceScoreSnapshotRecorder — hooked on
 * `vulopilot_scan_completed` at priority 20 (after
 * Services\ScanPersistenceListener's own default-priority-10 handler has
 * already written that scanner's findings) plus a daily cron so the trend
 * stays continuous even on days nobody triggers a scan. The score itself
 * is always computed live from current open findings, the same weighting
 * `Dashboard.php`'s own `calculate_category_score()` uses for
 * `category_scores.security` — duplicated here rather than made reusable
 * there, same "duplicate small shared logic across scopes" precedent
 * PerformanceScoreSnapshotRecorder's own docblock already documents.
 *
 * @class       SecurityScoreSnapshotRecorder class
 * @version     1.0.0
 * @author      VuloLabs
 */
class SecurityScoreSnapshotRecorder {

    private const CRON_HOOK = 'vulopilot_security_snapshot_daily';

    /**
     * SecurityScoreSnapshotRecorder constructor.
     */
    public function __construct() {
        add_action( 'vulopilot_scan_completed', array( $this, 'record_today' ), 20 );
        add_action( 'init', array( $this, 'ensure_daily_snapshot_scheduled' ) );
        add_action( self::CRON_HOOK, array( $this, 'record_today' ) );
    }

    /**
     * @return void
     */
    public function record_today(): void {
        $findings  = new FindingRepository();
        $breakdown = $findings->get_severity_breakdown_for_category( 'security' );

        $score = 100
            - ( $breakdown['critical'] * 15 )
            - ( $breakdown['high'] * 8 )
            - ( $breakdown['medium'] * 3 )
            - ( $breakdown['low'] * 1 );

        $score = max( 0, min( 100, $score ) );

        $repository     = new ScoreSnapshotRepository( 'security' );
        $previous_score = $this->find_previous_score( $repository );

        $repository->upsert_today( $score );

        /**
         * Fires after today's security-category score snapshot is written
         * — vulopilot-pro's Automations\Triggers\SecurityScoreDropTrigger
         * own extension point, same "fire the real number plus what it was
         * compared against" shape GeoInsights\VisibilitySnapshotBuilder's
         * own `vulopilot_pro_geo_visibility_snapshot_built` action already
         * established.
         *
         * @param int      $score          Today's real security_score (0-100).
         * @param int|null $previous_score The most recent prior day's security_score, or null before this site has a second day of history.
         */
        do_action( 'vulopilot_security_score_recorded', $score, $previous_score );
    }

    /**
     * @param ScoreSnapshotRepository $repository Repository to read history from.
     * @return int|null The most recent snapshot strictly before today, or null if none exists yet.
     */
    private function find_previous_score( ScoreSnapshotRepository $repository ): ?int {
        $today = current_time( 'Y-m-d' );

        foreach ( array_reverse( $repository->get_recent( 7 ) ) as $row ) {
            if ( $today !== $row['snapshot_date'] ) {
                return (int) $row['security_score'];
            }
        }

        return null;
    }

    /**
     * Standard wp_next_scheduled()-guarded wp_schedule_event() pattern —
     * same shape Services\PerformanceScoreSnapshotRecorder already uses.
     *
     * @return void
     */
    public function ensure_daily_snapshot_scheduled(): void {
        if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
            wp_schedule_event( time(), 'daily', self::CRON_HOOK );
        }
    }
}
