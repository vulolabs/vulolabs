<?php
/**
 * CoreWebVitalsRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Repositories;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for `vulopilot_performance_samples` (type `vital`) — one row per real front-end
 * pageview that reported at least one metric, written by
 * Services\CoreWebVitalsBeacon's public REST endpoint. `get_p75_summary()`
 * computes the 75th percentile in PHP (over a bounded recent sample)
 * rather than relying on MySQL/MariaDB window-function `PERCENTILE_CONT`,
 * which isn't reliably available across this codebase's supported DB
 * range — the same real percentile CrUX/Google's own Core Web Vitals
 * methodology uses. `page_load_ms`/`transfer_bytes` use this exact same
 * p75 method, not a separate average — one consistent "typical real
 * visitor" statistic across every metric this table stores.
 *
 * @class       CoreWebVitalsRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class CoreWebVitalsRepository extends AbstractRepository {

    /**
     * This repository's `sample_type` in the shared `vulopilot_performance_samples` table.
     */
    private const SAMPLE_TYPE = 'vital';

    /**
     * How many of the most recent (within the retention window) samples
     * to pull for the p75 computation — bounded so a high-traffic site's
     * PHP-side sort() stays cheap.
     */
    private const MAX_SAMPLES = 1000;

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
     * @param int|null $lcp_ms          Milliseconds, or null if the browser never reported one.
     * @param int|null $cls_thousandths CLS ×1000, or null.
     * @param int|null $inp_ms          Milliseconds, or null.
     * @param int|null $page_load_ms    Milliseconds (real Navigation Timing `loadEventEnd`), or null if the `load` event hadn't fired before the beacon sent.
     * @param int|null $transfer_bytes  Real summed Navigation+Resource Timing `transferSize`, or null if unsupported.
     * @return void
     */
    public function record( ?int $lcp_ms, ?int $cls_thousandths, ?int $inp_ms, ?int $page_load_ms = null, ?int $transfer_bytes = null ): void {
        $this->insert(
            array(
                'lcp_ms'          => $lcp_ms,
                'cls_thousandths' => $cls_thousandths,
                'inp_ms'          => $inp_ms,
                'page_load_ms'    => $page_load_ms,
                'transfer_bytes'  => $transfer_bytes,
            )
        );
    }

    /**
     * @return array{lcp_ms: int|null, cls: float|null, inp_ms: int|null, page_load_ms: int|null, transfer_bytes: int|null, sample_count: int}
     */
    public function get_p75_summary(): array {
        global $wpdb;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT lcp_ms, cls_thousandths, inp_ms, page_load_ms, transfer_bytes FROM {$this->get_table()} WHERE sample_type = %s ORDER BY created_at DESC LIMIT %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                self::SAMPLE_TYPE,
                self::MAX_SAMPLES
            ),
            ARRAY_A
        );

        $rows = (array) $rows;

        return array(
            'lcp_ms'         => $this->percentile_75( array_column( $rows, 'lcp_ms' ) ),
            'cls'            => $this->percentile_75_cls( array_column( $rows, 'cls_thousandths' ) ),
            'inp_ms'         => $this->percentile_75( array_column( $rows, 'inp_ms' ) ),
            'page_load_ms'   => $this->percentile_75( array_column( $rows, 'page_load_ms' ) ),
            'transfer_bytes' => $this->percentile_75( array_column( $rows, 'transfer_bytes' ) ),
            'sample_count'   => count( $rows ),
        );
    }

    /**
     * @param array<int, string|null> $values Raw column values, possibly containing nulls.
     * @return int|null
     */
    private function percentile_75( array $values ): ?int {
        $numeric = array_values( array_filter( array_map( 'intval', array_filter( $values, 'is_numeric' ) ), fn( $v ) => $v >= 0 ) );

        if ( empty( $numeric ) ) {
            return null;
        }

        sort( $numeric );
        $index = max( 0, (int) ceil( 0.75 * count( $numeric ) ) - 1 );

        return $numeric[ $index ];
    }

    /**
     * Same percentile logic as percentile_75(), converting the stored
     * ×1000 integer back to a real CLS float (e.g. 80 → 0.08).
     *
     * @param array<int, string|null> $values Raw `cls_thousandths` column values.
     * @return float|null
     */
    private function percentile_75_cls( array $values ): ?float {
        $thousandths = $this->percentile_75( $values );

        return null !== $thousandths ? round( $thousandths / 1000, 3 ) : null;
    }

    /**
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
