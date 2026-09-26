<?php
/**
 * RepositoryUtil class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Utill;

use VuloPilot\Utill as CoreUtill;

defined( 'ABSPATH' ) || exit;

/**
 * Shared $wpdb CRUD implementation for every VuloPilot custom table.
 * Concrete repositories only declare which CoreUtill::TABLES key they own and
 * which columns find_all() may filter on by exact match - the actual
 * prepare()/query boilerplate lives here once instead of being repeated
 * per entity (database.md's "always $wpdb->prepare() for any query with a
 * variable", applied uniformly).
 *
 * Per-id in-request cache follows the same pattern database.md points to
 * (Store.php's static-cache-by-id) rather than introducing a new caching
 * layer.
 *
 * @class       RepositoryUtil class
 * @version     1.0.0
 * @author      VuloLabs
 */
abstract class RepositoryUtil implements RepositoryInterface {

    /**
     * @var array<int, array<string, mixed>|null>
     */
    private array $cache = array();

    /**
     * @var string[] Columns find_all() accepts as exact-match filters.
     */
    protected array $filterable_columns = array();

    /**
     * @var string[] Text columns an incoming `search` arg is LIKE-matched against (OR'd together).
     */
    protected array $searchable_columns = array();

    /**
     * @return string CoreUtill::TABLES key this repository owns.
     */
    abstract protected function get_table_key(): string;

    /**
     * @return string Fully-prefixed table name.
     */
    protected function get_table(): string {
        global $wpdb;
        return $wpdb->prefix . CoreUtill::TABLES[ $this->get_table_key() ];
    }

    /**
     * @inheritDoc
     */
    public function find( int $id ): ?array {
        if ( array_key_exists( $id, $this->cache ) ) {
            return $this->cache[ $id ];
        }

        global $wpdb;

        $row = $wpdb->get_row(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare( "SELECT * FROM %i WHERE id = %d", $this->get_table(), $id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            ARRAY_A
        );

        $this->cache[ $id ] = $row ?: null;

        return $this->cache[ $id ];
    }

    /**
     * @inheritDoc
     */
    public function find_all( array $args = array() ): array {
        global $wpdb;

        $table    = $this->get_table();
        $page     = max( 1, (int) ( $args['page'] ?? 1 ) );
        $per_page = max( 1, min( 100, (int) ( $args['per_page'] ?? 20 ) ) );
        $offset   = ( $page - 1 ) * $per_page;
        $orderby  = preg_replace( '/[^a-zA-Z_]/', '', (string) ( ! empty( $args['orderby'] ) ? $args['orderby'] : 'id' ) );
        $order    = 'asc' === strtolower( (string) ( $args['order'] ?? 'desc' ) ) ? 'ASC' : 'DESC';

        $where_clauses = array( '1 = 1' );
        $where_values  = array();

        foreach ( $this->filterable_columns as $column ) {
            if ( ! isset( $args[ $column ] ) || '' === $args[ $column ] ) {
                continue;
            }

            // A plain scalar is an exact match; an array (e.g. a findings table
            // section grouping several scanner_id values together) becomes IN (...).
            if ( is_array( $args[ $column ] ) ) {
                $values = array_values( array_filter( array_map( 'strval', $args[ $column ] ), fn( $item ) => '' !== $item ) );

                if ( ! $values ) {
                    continue;
                }

                $where_clauses[] = '%i IN (' . implode( ', ', array_fill( 0, count( $values ), '%s' ) ) . ')';
                $where_values[]  = $column;
                array_push( $where_values, ...$values );
            } else {
                $where_clauses[] = '%i = %s';
                $where_values[]  = $column;
                $where_values[]  = (string) $args[ $column ];
            }
        }

        if ( ! empty( $args['search'] ) && $this->searchable_columns ) {
            $like = '%' . $wpdb->esc_like( (string) $args['search'] ) . '%';

            foreach ( $this->searchable_columns as $column ) {
                $where_values[] = $column;
                $where_values[] = $like;
            }

            $search_sql      = implode( ' OR ', array_fill( 0, count( $this->searchable_columns ), '%i LIKE %s' ) );
            $where_clauses[] = "({$search_sql})";
        }

        $where_sql = implode( ' AND ', $where_clauses );

        $count_sql = $wpdb->prepare( "SELECT COUNT(*) FROM %i WHERE {$where_sql}", $table, ...$where_values ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- the table and optional filters are picked from fixed literals and every value is a bound placeholder; only the placeholder count varies at runtime.

        if ( 'ASC' === $order ) {
            $rows_sql = $wpdb->prepare( "SELECT * FROM %i WHERE {$where_sql} ORDER BY %i ASC LIMIT %d OFFSET %d", $table, ...array_merge( $where_values, array( $orderby, $per_page, $offset ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- the table and optional filters are picked from fixed literals and every value is a bound placeholder; only the placeholder count varies at runtime.
        } else {
            $rows_sql = $wpdb->prepare( "SELECT * FROM %i WHERE {$where_sql} ORDER BY %i DESC LIMIT %d OFFSET %d", $table, ...array_merge( $where_values, array( $orderby, $per_page, $offset ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- the table and optional filters are picked from fixed literals and every value is a bound placeholder; only the placeholder count varies at runtime.
        }

        $total = (int) $wpdb->get_var( $count_sql ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared -- the query above is prepared.
        $rows  = $wpdb->get_results( $rows_sql, ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared -- the query above is prepared.

        return array(
            'data'  => $rows ?: array(),
            'total' => $total,
        );
    }

    /**
     * Row counts grouped by one column, scoped by any other already-declared
     * filterable_columns present in $args (e.g. scoping a findings status
     * breakdown to one category) - never scoped by $column itself (that's
     * what's being counted) or by 'search' (count badges reflect the fixed
     * dataset, not the search box, matching the sibling vulolabs plugin's
     * StoreTable.tsx/Stores.php, which also computes its status counts
     * unconditionally on every list fetch).
     *
     * @param string               $column Column to GROUP BY.
     * @param array<string, mixed> $args   Same shape as find_all()'s $args.
     * @return array<string, int> value => count, only for values with >=1 row.
     */
    public function count_by_column( string $column, array $args = array() ): array {
        global $wpdb;

        $table         = $this->get_table();
        $safe_column   = preg_replace( '/[^a-zA-Z_]/', '', $column );
        $where_clauses = array( '1 = 1' );
        $where_values  = array();

        foreach ( $this->filterable_columns as $filter_column ) {
            if ( $filter_column === $column ) {
                continue;
            }

            if ( ! isset( $args[ $filter_column ] ) || '' === $args[ $filter_column ] ) {
                continue;
            }

            if ( is_array( $args[ $filter_column ] ) ) {
                $values = array_values( array_filter( array_map( 'strval', $args[ $filter_column ] ), fn( $item ) => '' !== $item ) );

                if ( ! $values ) {
                    continue;
                }

                $where_clauses[] = '%i IN (' . implode( ', ', array_fill( 0, count( $values ), '%s' ) ) . ')';
                $where_values[]  = $filter_column;
                array_push( $where_values, ...$values );
            } else {
                $where_clauses[] = '%i = %s';
                $where_values[]  = $filter_column;
                $where_values[]  = (string) $args[ $filter_column ];
            }
        }

        $where_sql = implode( ' AND ', $where_clauses );

        $sql  = $wpdb->prepare( "SELECT %i AS bucket, COUNT(*) AS total FROM %i WHERE {$where_sql} GROUP BY %i", ...array_merge( array( $safe_column, $table ), $where_values, array( $safe_column ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- the table and optional filters are picked from fixed literals and every value is a bound placeholder; only the placeholder count varies at runtime.
        $rows = $wpdb->get_results( $sql, ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared -- the query above is prepared.

        $counts = array();

        foreach ( (array) $rows as $row ) {
            $counts[ $row['bucket'] ] = (int) $row['total'];
        }

        return $counts;
    }

    /**
     * @inheritDoc
     */
    public function insert( array $data ): int {
        global $wpdb;

        $wpdb->insert( $this->get_table(), $data );  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.

        return (int) $wpdb->insert_id;
    }

    /**
     * @inheritDoc
     */
    public function update( int $id, array $data ): bool {
        global $wpdb;

        unset( $this->cache[ $id ] );

        return false !== $wpdb->update( $this->get_table(), $data, array( 'id' => $id ) );  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
    }

    /**
     * Applies the same update to a bounded set of rows (e.g. rows checked
     * via a table's bulk-action UI) - loops the existing single-row
     * update() rather than building a fresh bulk SQL statement, since the
     * id list is always small (whatever fits on one page) and this reuses
     * update()'s own cache-invalidation for free.
     *
     * @param int[]                $ids  Row ids to update.
     * @param array<string, mixed> $data Column => value pairs to set on every row.
     * @return int Number of rows actually updated.
     */
    public function bulk_update( array $ids, array $data ): int {
        $updated_count = 0;

        foreach ( $ids as $id ) {
            if ( $this->update( (int) $id, $data ) ) {
                ++$updated_count;
            }
        }

        return $updated_count;
    }

    /**
     * @inheritDoc
     */
    public function delete( int $id ): bool {
        global $wpdb;

        unset( $this->cache[ $id ] );

        return false !== $wpdb->delete( $this->get_table(), array( 'id' => $id ) );  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
    }
}
