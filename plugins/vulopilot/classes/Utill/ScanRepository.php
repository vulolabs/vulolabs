<?php
/**
 * ScanRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Utill;


defined( 'ABSPATH' ) || exit;

/**
 * Persistence for vulopilot_scans (DATABASE.md).
 *
 * @class       ScanRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class ScanRepository extends RepositoryUtil {

    /**
     * @var string[]
     */
    protected array $filterable_columns = array( 'status', 'scanner_id' );

    /**
     * @inheritDoc
     */
    protected function get_table_key(): string {
        return 'scan';
    }

    /**
     * Scan-run counts by status for one date range - what
     * Reports\Types\ScanSummaryReport's headline summary reads.
     *
     * @param string $period_start Y-m-d, inclusive.
     * @param string $period_end   Y-m-d, inclusive.
     * @return array{total: int, by_status: array<string, int>}
     */
    public function get_stats_for_period( string $period_start, string $period_end ): array {
        global $wpdb;

        $rows = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- {$this->get_table()} is this plugin's own table name, not user input.
            $wpdb->prepare(
                "SELECT status, COUNT(*) AS total FROM %i WHERE DATE(created_at) BETWEEN %s AND %s GROUP BY status", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $period_start,
                $period_end
            ),
            ARRAY_A
        );

        $by_status = array();

        foreach ( (array) $rows as $row ) {
            $by_status[ $row['status'] ] = (int) $row['total'];
        }

        return array(
            'total'     => array_sum( $by_status ),
            'by_status' => $by_status,
        );
    }

    /**
     * Most recent successfully-finished `vulopilot_scans` row for any of
     * the given scanner ids - what BrokenLinksStats::get_stats() reads to
     * back a real "last scan took Xs" figure. `finished_at`/`duration_ms`
     * only exist for a run ScanRunner actually completed (ScanResult::
     * STATUS_COMPLETED), so a failed or still-running scan is deliberately
     * excluded rather than showing a stale/zero duration.
     *
     * @param string[] $scanner_ids e.g. array( 'broken-links', 'broken-images' ).
     * @return array{duration_ms: int, finished_at: int}|null Null when neither scanner has ever completed a run.
     */
    public function get_latest_completed( array $scanner_ids ): ?array {
        if ( ! $scanner_ids ) {
            return null;
        }

        global $wpdb;

        $placeholders = implode( ', ', array_fill( 0, count( $scanner_ids ), '%s' ) );

        $row = $wpdb->get_row( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- {$this->get_table()} is this plugin's own table name, not user input.
            $wpdb->prepare( // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- $placeholders expands to exactly count($scanner_ids) %s placeholders (built above via array_fill), and ...$scanner_ids spreads that many values; the sniff can't statically count either the dynamic placeholder string or the spread args.
                "SELECT duration_ms, finished_at FROM %i WHERE status = %s AND scanner_id IN ({$placeholders}) AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- the table and optional filters are picked from fixed literals and every value is a bound placeholder; only the placeholder count varies at runtime.
                $this->get_table(),
                'completed',
                ...$scanner_ids
            ),
            ARRAY_A
        );

        if ( ! $row ) {
            return null;
        }

        return array(
            'duration_ms' => (int) $row['duration_ms'],
            'finished_at' => (int) strtotime( $row['finished_at'] . ' UTC' ),
        );
    }
}
