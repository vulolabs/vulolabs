<?php
namespace VuloPilot\Performance;

use VuloPilot\Performance\PerformanceRequestRepository;

defined( 'ABSPATH' ) || exit;

/**
 * Real-time "Performance" telemetry - logs one response-time sample for
 * a real front-end request, the data RealTimeMonitoringCard.tsx's "Server
 * Response Time"/"Page Views (Last 5 Min)" tiles and MetricsGrid.tsx's
 * "Performance Monitor" tile all read via GET /performance-realtime.
 *
 * Deliberately logs **no visitor-identifying data at all** - no IP, no
 * user agent, no cookie-based session id. An earlier design considered
 * hashing IP+UA for a real "active users" count, but that conflicts with
 * this codebase's own stated privacy posture (Services\CrawlerTrafficLogger's
 * own docblock: "never an IP address... per readme.txt's own FAQ
 * promise"), and setting a cookie to track visitors would risk breaking
 * full-page-cache-plugin compatibility (a known page-cache gotcha) - the
 * one thing a *speed* feature must never do. "Active Users" is instead
 * honestly relabeled "Page Views (Last 5 Min)", a plain unique-free count.
 *
 * Hooked on `shutdown` (not `template_redirect`, which fires before the
 * template even renders) so `timer_float()`
 * captures the full real request lifecycle. Requests served by a
 * full-page-cache plugin's early (pre-WP-bootstrap) drop-in never reach
 * this hook at all, so the resulting average reflects "server time for
 * non-cached requests" - real and useful, just narrower than every single
 * visit. ~20% sampled (`wp_rand()`) purely to bound write volume on
 * high-traffic sites, not for privacy (there's nothing sensitive in a
 * single integer). Daily cron purges rows older than 3 days - only the
 * last hour/5 minutes are ever displayed; the long-term trend is a
 * separate concern (Services\PerformanceScoreSnapshotRecorder).
 *
 * @class       PerformanceRequestLogger class
 * @version     1.0.0
 * @author      VuloLabs
 */
class PerformanceRequestLogger {

    private const CLEANUP_HOOK = 'vulopilot_performance_request_cleanup';

    private const SAMPLE_RATE = 5; // 1 in 5 real requests, ~20%.

    private const RETENTION_DAYS = 3;

    /**
     * PerformanceRequestLogger constructor.
     */
    public function __construct() {
        add_action( 'shutdown', array( $this, 'maybe_log' ) );
        add_action( 'init', array( $this, 'ensure_cleanup_scheduled' ) );
        add_action( self::CLEANUP_HOOK, array( $this, 'run_cleanup' ) );
    }

    /**
     * @return void
     */
    public function maybe_log(): void {
        if ( ! $this->is_real_front_end_request() ) {
            return;
        }

        if ( 1 !== wp_rand( 1, self::SAMPLE_RATE ) ) {
            return;
        }

        // Core's own "seconds since the PHP script started" (WP 5.8+).
        $response_time_ms = (int) round( timer_float() * 1000 );

        if ( $response_time_ms <= 0 || $response_time_ms > 65535 ) {
            // Out of the column's smallint unsigned range, or clearly
            // bogus (a clock anomaly) - skip rather than truncate silently.
            return;
        }

        ( new PerformanceRequestRepository() )->insert( array( 'response_time_ms' => $response_time_ms ) );
    }

    /**
     * @return bool
     */
    private function is_real_front_end_request(): bool {
        return ! is_admin()
            && ! wp_doing_ajax()
            && ! wp_doing_cron()
            && ! ( defined( 'REST_REQUEST' ) && REST_REQUEST )
            && ! ( defined( 'WP_CLI' ) && WP_CLI )
            && ! is_feed();
    }

    /**
     * Standard wp_next_scheduled()-guarded wp_schedule_event() pattern -
     * same shape Services\CrawlerTrafficLogger already uses.
     *
     * @return void
     */
    public function ensure_cleanup_scheduled(): void {
        if ( ! wp_next_scheduled( self::CLEANUP_HOOK ) ) {
            wp_schedule_event( time(), 'daily', self::CLEANUP_HOOK );
        }
    }

    /**
     * @return void
     */
    public function run_cleanup(): void {
        ( new PerformanceRequestRepository() )->delete_older_than( self::RETENTION_DAYS );
    }
}
