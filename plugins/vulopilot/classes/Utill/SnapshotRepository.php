<?php
/**
 * SnapshotRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Utill;


defined( 'ABSPATH' ) || exit;

/**
 * Daily-snapshot storage shared by every "score history" feature - one row
 * per (`snapshot_type`, `snapshot_date`) in `vulopilot_snapshots`, with the
 * day's values kept together as JSON in `data`. Replaces what used to be
 * eight near-identical per-feature tables (performance/security score,
 * accessibility, site health, store trends, brand score, GEO visibility,
 * Knowledge Graph health): each was "a date plus a handful of numbers",
 * always read back as a time series, never filtered or sorted by a value.
 *
 * Each feature keeps its own thin repository (its own type and its own
 * `upsert_today()` signature) so callers and REST response shapes are
 * unchanged - rows still come back flat: `id`, `snapshot_date`,
 * `created_at`, plus every stored value as its own key.
 *
 * @class       SnapshotRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class SnapshotRepository extends RepositoryUtil {

    /**
     * @var string[]
     */
    protected array $filterable_columns = array( 'snapshot_type', 'snapshot_date' );

    /**
     * @var string
     */
    protected string $snapshot_type;

    /**
     * @param string $snapshot_type Which feature's snapshots this repository reads/writes.
     */
    public function __construct( string $snapshot_type ) {
        $this->snapshot_type = sanitize_key( $snapshot_type );
    }

    /**
     * @inheritDoc
     */
    protected function get_table_key(): string {
        return 'snapshot';
    }

    /**
     * Inserts or replaces one day's values.
     *
     * @param string               $date   `Y-m-d`.
     * @param array<string, mixed> $values Everything to store for that day.
     * @return void
     */
    protected function store( string $date, array $values ): void {
        global $wpdb;

        $wpdb->query( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- {$this->get_table()} is this plugin's own table name, not user input.
            $wpdb->prepare(
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- {$this->get_table()} is this plugin's own table name, not user input.
                'INSERT INTO %i (snapshot_type, snapshot_date, data) VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE data = VALUES(data)',
                $this->get_table(),
                $this->snapshot_type,
                $date,
                wp_json_encode( $values )
            )
        );
    }

    /**
     * Stores today's values (site-local date).
     *
     * @param array<string, mixed> $values Everything to store for today.
     * @return void
     */
    protected function store_today( array $values ): void {
        $this->store( current_time( 'Y-m-d' ), $values );
    }

    /**
     * Oldest-first rows for the last `$days` days.
     *
     * @param int $days Look-back window.
     * @return array<int, array<string, mixed>>
     */
    public function get_recent( int $days = 30 ): array {
        return $this->query_rows( 'recent', array( gmdate( 'Y-m-d', strtotime( "-{$days} days" ) ) ) );
    }

    /**
     * Oldest-first rows between two dates (inclusive).
     *
     * @param string $period_start `Y-m-d`.
     * @param string $period_end   `Y-m-d`.
     * @return array<int, array<string, mixed>>
     */
    public function get_between( string $period_start, string $period_end ): array {
        return $this->query_rows( 'between', array( $period_start, $period_end ) );
    }

    /**
     * @return array<string, mixed>|null Newest row, or null.
     */
    public function get_latest(): ?array {
        return $this->query_rows( 'latest', array() )[0] ?? null;
    }

    /**
     * @return array<string, mixed>|null The row before the newest, or null.
     */
    public function get_previous(): ?array {
        return $this->query_rows( 'previous', array() )[0] ?? null;
    }

    /**
     * Runs one of this class's own fixed snapshot queries and flattens each row.
     *
     * @param string            $query One of 'latest', 'previous', 'recent', 'between'.
     * @param array<int, mixed> $args  Values for that query's date placeholders.
     * @return array<int, array<string, mixed>>
     */
    private function query_rows( string $query, array $args ): array {
        global $wpdb;

        $table = $this->get_table();
        $type  = $this->snapshot_type;

        switch ( $query ) {
            case 'latest':
                $sql = $wpdb->prepare( 'SELECT id, snapshot_date, data, created_at FROM %i WHERE snapshot_type = %s ORDER BY snapshot_date DESC LIMIT 1', $table, $type );
                break;
            case 'previous':
                $sql = $wpdb->prepare( 'SELECT id, snapshot_date, data, created_at FROM %i WHERE snapshot_type = %s ORDER BY snapshot_date DESC LIMIT 1 OFFSET 1', $table, $type );
                break;
            case 'recent':
                $sql = $wpdb->prepare( 'SELECT id, snapshot_date, data, created_at FROM %i WHERE snapshot_type = %s AND snapshot_date >= %s ORDER BY snapshot_date ASC', $table, $type, $args[0] );
                break;
            case 'between':
                $sql = $wpdb->prepare( 'SELECT id, snapshot_date, data, created_at FROM %i WHERE snapshot_type = %s AND snapshot_date BETWEEN %s AND %s ORDER BY snapshot_date ASC', $table, $type, $args[0], $args[1] );
                break;
            default:
                return array();
        }

        $rows = $wpdb->get_results( $sql, ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared -- the query above is prepared.

        return array_map( array( $this, 'flatten' ), $rows ? $rows : array() );
    }

    /**
     * `{id, snapshot_date, data, created_at}` → one flat row.
     *
     * @param array<string, mixed> $row Raw table row.
     * @return array<string, mixed>
     */
    protected function flatten( array $row ): array {
        $values = json_decode( (string) $row['data'], true );

        return array_merge(
            array(
                'id'            => (int) $row['id'],
                'snapshot_date' => $row['snapshot_date'],
            ),
            is_array( $values ) ? $values : array(),
            array( 'created_at' => $row['created_at'] )
        );
    }
}
