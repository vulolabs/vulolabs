<?php
/**
 * PerformanceScoreSnapshotRecorder class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Repositories\FindingRepository;
use VuloPilot\Repositories\ScoreSnapshotRepository;

defined( 'ABSPATH' ) || exit;

/**
 * Writes today's real performance-category score into
 * `vulopilot_score_snapshots` (category `performance`) — the data SpeedHistoryCard.tsx's
 * chart reads. Hooked on `vulopilot_scan_completed` at priority 20 (after
 * Services\ScanPersistenceListener's own default-priority-10 handler has
 * already written that scanner's findings to the database) so the score
 * this recomputes reflects the findings that scan just produced; a
 * `run_all()` scan fires this once per scanner, which means it recomputes
 * and upserts several times in a row during a full scan — harmless
 * (idempotent, cheap single-row upsert) and simpler than inspecting each
 * ScanResult's own category to skip non-'performance' runs, since the
 * final call in the sequence always leaves the correct value either way.
 * A daily cron is a second write path, so the trend stays continuous even
 * on days nobody manually triggers a scan — the score itself is always
 * computed live from current open findings, the same way GET /dashboard's
 * `category_scores.performance` already is (Dashboard.php's own
 * calculate_category_score(), whose weighting is duplicated here rather
 * than made reusable there — same "duplicate small shared logic across
 * scopes" precedent this session's ContentIntelligence.php work already
 * used).
 *
 * @class       PerformanceScoreSnapshotRecorder class
 * @version     1.0.0
 * @author      VuloLabs
 */
class PerformanceScoreSnapshotRecorder {

    private const CRON_HOOK = 'vulopilot_performance_snapshot_daily';

    /**
     * PerformanceScoreSnapshotRecorder constructor.
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
        $breakdown = $findings->get_severity_breakdown_for_category( 'performance' );

        $score = 100
            - ( $breakdown['critical'] * 15 )
            - ( $breakdown['high'] * 8 )
            - ( $breakdown['medium'] * 3 )
            - ( $breakdown['low'] * 1 );

        $score = max( 0, min( 100, $score ) );

        ( new ScoreSnapshotRepository( 'performance' ) )->upsert_today( $score );
    }

    /**
     * Standard wp_next_scheduled()-guarded wp_schedule_event() pattern —
     * same shape Services\CrawlerTrafficLogger already uses.
     *
     * @return void
     */
    public function ensure_daily_snapshot_scheduled(): void {
        if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
            wp_schedule_event( time(), 'daily', self::CRON_HOOK );
        }
    }
}
