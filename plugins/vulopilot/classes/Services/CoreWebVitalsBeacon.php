<?php
/**
 * CoreWebVitalsBeacon class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Repositories\CoreWebVitalsRepository;

defined( 'ABSPATH' ) || exit;

/**
 * Enqueues public/js/performance-vitals-beacon.js on real front-end pages
 * — this plugin's first ever `wp_enqueue_scripts` registration (confirmed
 * no other front-end-visitor-facing script exists anywhere in this
 * codebase today; every other enqueue is `admin_enqueue_scripts`-gated).
 * Also runs the daily cleanup cron that keeps `vulopilot_performance_samples` (type `vital`)
 * to a rolling 28-day window — the same window CrUX's own real Core Web
 * Vitals methodology uses.
 *
 * @class       CoreWebVitalsBeacon class
 * @version     1.0.0
 * @author      VuloLabs
 */
class CoreWebVitalsBeacon {

    private const CLEANUP_HOOK = 'vulopilot_cwv_cleanup';

    private const RETENTION_DAYS = 28;

    /**
     * CoreWebVitalsBeacon constructor.
     */
    public function __construct() {
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_beacon_script' ) );
        add_action( 'init', array( $this, 'ensure_cleanup_scheduled' ) );
        add_action( self::CLEANUP_HOOK, array( $this, 'run_cleanup' ) );
    }

    /**
     * @return void
     */
    public function enqueue_beacon_script(): void {
        if ( is_admin() ) {
            return;
        }

        wp_enqueue_script(
            'vulopilot-performance-vitals-beacon',
            VuloPilot()->plugin_url . 'assets/js/public/vulopilot-performance-vitals-beacon.min.js',
            array(),
            VuloPilot()->version,
            true
        );

        wp_localize_script(
            'vulopilot-performance-vitals-beacon',
            'vulopilotCwvBeacon',
            array(
                'endpoint' => untrailingslashit( get_rest_url() ) . '/' . VuloPilot()->rest_namespace . '/performance-vitals-beacon',
            )
        );
    }

    /**
     * Standard wp_next_scheduled()-guarded wp_schedule_event() pattern —
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
        ( new CoreWebVitalsRepository() )->delete_older_than( self::RETENTION_DAYS );
    }
}
