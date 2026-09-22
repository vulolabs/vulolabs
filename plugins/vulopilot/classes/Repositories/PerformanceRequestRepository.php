<?php
/**
 * PerformanceRequestRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Repositories;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for `vulopilot_performance_samples` (type `request`) — one row per sampled
 * real front-end request, written by Services\PerformanceRequestLogger.
 * Read-only from this repository's own perspective (no insert helper here
 * — the logger writes directly via the inherited insert()); the one real
 * method is the aggregate "Real-time Monitoring" card needs.
 *
 * @class       PerformanceRequestRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class PerformanceRequestRepository extends AbstractRepository {

    /**
     * This repository's `sample_type` in the shared `vulopilot_performance_samples` table.
     */
    private const SAMPLE_TYPE = 'request';

    /**
     * Utill::TABLES key this repository owns.
     *
     * @inheritDoc
     */
    /**
     * @inheritDoc
     */
    public function insert( array $data ): int {
        $data['sample_type'] = self::SAMPLE_TYPE;

        return parent::insert( $data );
    }

    protected function get_table_key(): string {
        return 'performance_sample';
    }

    /**
     * @return array{avg_response_time_ms: int|null, page_views_last_5_min: int, samples_last_hour: int}
     */
    public function get_realtime_stats(): array {
        global $wpdb;

        $table = $this->get_table();

        $avg_response_time_ms = $wpdb->get_var( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                "SELECT AVG(response_time_ms) FROM {$table} WHERE sample_type = %s AND created_at >= %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                self::SAMPLE_TYPE,
                gmdate( 'Y-m-d H:i:s', time() - HOUR_IN_SECONDS )
            )
        );

        $page_views_last_5_min = (int) $wpdb->get_var( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE sample_type = %s AND created_at >= %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                self::SAMPLE_TYPE,
                gmdate( 'Y-m-d H:i:s', time() - 5 * MINUTE_IN_SECONDS )
            )
        );

        $samples_last_hour = (int) $wpdb->get_var( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE sample_type = %s AND created_at >= %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                self::SAMPLE_TYPE,
                gmdate( 'Y-m-d H:i:s', time() - HOUR_IN_SECONDS )
            )
        );

        return array(
            'avg_response_time_ms'  => null !== $avg_response_time_ms ? (int) round( (float) $avg_response_time_ms ) : null,
            'page_views_last_5_min' => $page_views_last_5_min,
            'samples_last_hour'     => $samples_last_hour,
        );
    }

    /**
     * Deletes rows older than the given retention window — called by
     * Services\PerformanceRequestLogger's own daily cleanup cron.
     *
     * @param int $days Retention window, in days.
     * @return void
     */
    public function delete_older_than( int $days ): void {
        global $wpdb;

        $wpdb->query( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                "DELETE FROM {$this->get_table()} WHERE sample_type = %s AND created_at < %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                self::SAMPLE_TYPE,
                gmdate( 'Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS )
            )
        );
    }
}
