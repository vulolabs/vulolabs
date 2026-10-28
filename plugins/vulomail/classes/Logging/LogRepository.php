<?php
/**
 * LogRepository class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Logging;

use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Database access for the delivery log table.
 */
class LogRepository {

	/**
	 * Columns a list request may sort by.
	 */
	const SORTABLE = array( 'id', 'created_at', 'status', 'provider', 'channel' );

	/**
	 * Get the fully prefixed log table name.
	 *
	 * @return string
	 */
	private function table() {
		global $wpdb;

		return $wpdb->prefix . Utill::TABLES['log'];
	}

	/**
	 * Get the fully prefixed clicked-links table name.
	 *
	 * @return string
	 */
	private function links_table() {
		global $wpdb;

		return $wpdb->prefix . Utill::TABLES['log_link'];
	}

	/**
	 * Insert a log row.
	 *
	 * @param array $row Column => value.
	 * @return int Inserted row id, 0 on failure.
	 */
	public function insert( array $row ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$inserted = $wpdb->insert( $this->table(), $row );

		return $inserted ? (int) $wpdb->insert_id : 0;
	}

	/**
	 * Get one log row by id.
	 *
	 * @param int $id Row id.
	 * @return array|null
	 */
	public function get( $id ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM %i WHERE id = %d', $this->table(), $id ), ARRAY_A );

		return $row ? $row : null;
	}

	/**
	 * Paginated, filtered list.
	 *
	 * @param array $args channel, status, search, after, before (UTC datetimes), page, per_page, orderby, order.
	 * @return array{data: array, total: int, status_counts: array<string, int>}
	 */
	public function query( array $args ) {
		global $wpdb;

		$where  = array( '1=1' );
		$params = array();

		if ( ! empty( $args['channel'] ) ) {
			$where[]  = 'channel = %s';
			$params[] = $args['channel'];
		}

		if ( ! empty( $args['search'] ) ) {
			$like     = '%' . $wpdb->esc_like( $args['search'] ) . '%';
			$where[]  = '(recipients LIKE %s OR subject LIKE %s)';
			$params[] = $like;
			$params[] = $like;
		}

		if ( ! empty( $args['after'] ) ) {
			$where[]  = 'created_at >= %s';
			$params[] = $args['after'];
		}

		if ( ! empty( $args['before'] ) ) {
			$where[]  = 'created_at <= %s';
			$params[] = $args['before'];
		}

		// Counted before the status filter, so the pill bar shows every status's own total.
		$base_where = implode( ' AND ', $where );

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- $base_where/$where_sql hold only the fixed fragments built above; values go through prepare().
		$counts = $wpdb->get_results(
			$wpdb->prepare( "SELECT status, COUNT(*) AS total FROM %i WHERE {$base_where} GROUP BY status", array_merge( array( $this->table() ), $params ) ),
			ARRAY_A
		);

		if ( ! empty( $args['status'] ) ) {
			$where[]  = 'status = %s';
			$params[] = $args['status'];
		}

		$where_sql = implode( ' AND ', $where );
		$orderby   = in_array( $args['orderby'] ?? '', self::SORTABLE, true ) ? $args['orderby'] : 'id';
		$order     = 'asc' === strtolower( (string) ( $args['order'] ?? '' ) ) ? 'ASC' : 'DESC';
		$per_page  = (int) ( $args['per_page'] ?? 0 );
		$per_page  = $per_page > 0 ? min( 100, $per_page ) : 10;
		$offset    = ( max( 1, (int) ( $args['page'] ?? 1 ) ) - 1 ) * $per_page;

		$total = (int) $wpdb->get_var(
			$wpdb->prepare( "SELECT COUNT(*) FROM %i WHERE {$where_sql}", array_merge( array( $this->table() ), $params ) )
		);

		// The body is left out of list responses: it can be large, and is fetched per row on demand.
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT id, channel, status, provider, used_fallback, recipients, subject, attachments, source, error_code, error_message, track_opens, track_clicks, open_count, click_count, created_at FROM %i WHERE {$where_sql} ORDER BY {$orderby} {$order}, id DESC LIMIT %d OFFSET %d",
				array_merge( array( $this->table() ), $params, array( $per_page, $offset ) )
			),
			ARRAY_A
		);
		// phpcs:enable

		$status_counts = array(
			'sent'   => 0,
			'failed' => 0,
		);

		foreach ( (array) $counts as $count ) {
			$status_counts[ $count['status'] ] = (int) $count['total'];
		}

		return array(
			'data'          => $rows ? $rows : array(),
			'total'         => $total,
			'status_counts' => $status_counts,
		);
	}

	/**
	 * The newest entries of one channel, for the diagnostics screen.
	 *
	 * @param string $channel Channel.
	 * @param int    $limit   How many rows.
	 * @return array<int, array{status: string, provider: string, error_message: string|null, created_at: string}> Newest first.
	 */
	public function recent( $channel, $limit ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$rows = $wpdb->get_results(
			$wpdb->prepare( 'SELECT status, provider, error_message, created_at FROM %i WHERE channel = %s ORDER BY id DESC LIMIT %d', $this->table(), $channel, $limit ),
			ARRAY_A
		);

		return $rows ? $rows : array();
	}

	/**
	 * The recorded attempts of several rows, in one query.
	 *
	 * @param int[] $ids Row ids.
	 * @return array<int, array> Row id => attempts, as Result::to_array() stored them.
	 */
	public function attempts( array $ids ) {
		global $wpdb;

		$ids = array_values( array_filter( array_map( 'absint', $ids ) ) );

		if ( ! $ids ) {
			return array();
		}

		$placeholders = implode( ',', array_fill( 0, count( $ids ), '%d' ) );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- $placeholders is a generated list of %d.
		$rows     = $wpdb->get_results( $wpdb->prepare( "SELECT id, attempts FROM %i WHERE id IN ({$placeholders})", array_merge( array( $this->table() ), $ids ) ), ARRAY_A );
		$attempts = array();

		foreach ( (array) $rows as $row ) {
			$decoded                      = json_decode( (string) $row['attempts'], true );
			$attempts[ (int) $row['id'] ] = is_array( $decoded ) ? $decoded : array();
		}

		return $attempts;
	}

	/**
	 * The row a tracking token belongs to (indexed lookup).
	 *
	 * @param string $token Tracking token.
	 * @return array{id: string, track_opens: string, track_clicks: string}|null
	 */
	public function find_by_token( $token ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$row = $wpdb->get_row(
			$wpdb->prepare( 'SELECT id, track_opens, track_clicks FROM %i WHERE tracking_token = %s LIMIT 1', $this->table(), $token ),
			ARRAY_A
		);

		return $row ? $row : null;
	}

	/**
	 * Counts an open, in one statement so concurrent requests can't lose one.
	 *
	 * @param int    $id  Log row id.
	 * @param string $now UTC `Y-m-d H:i:s`.
	 * @return bool
	 */
	public function record_open( $id, $now ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return (bool) $wpdb->query(
			$wpdb->prepare(
				'UPDATE %i SET open_count = open_count + 1, first_opened_at = COALESCE(first_opened_at, %s), last_opened_at = %s WHERE id = %d',
				$this->table(),
				$now,
				$now,
				$id
			)
		);
	}

	/**
	 * Counts a click on one of a message's links, on the message and on the link.
	 *
	 * @param int    $id       Log row id.
	 * @param int    $position Link position within the message.
	 * @param string $url      Link as shown in the log.
	 * @param string $now      UTC `Y-m-d H:i:s`.
	 * @return bool
	 */
	public function record_click( $id, $position, $url, $now ) {
		global $wpdb;

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$updated = $wpdb->query(
			$wpdb->prepare(
				'UPDATE %i SET click_count = click_count + 1, first_clicked_at = COALESCE(first_clicked_at, %s), last_clicked_at = %s WHERE id = %d',
				$this->table(),
				$now,
				$now,
				$id
			)
		);

		if ( $updated ) {
			$wpdb->query(
				$wpdb->prepare(
					'INSERT INTO %i (log_id, position, url, click_count, first_clicked_at, last_clicked_at) VALUES (%d, %d, %s, 1, %s, %s) ON DUPLICATE KEY UPDATE click_count = click_count + 1, last_clicked_at = VALUES(last_clicked_at)',
					$this->links_table(),
					$id,
					$position,
					$url,
					$now,
					$now
				)
			);
		}
		// phpcs:enable

		return (bool) $updated;
	}

	/**
	 * The clicked links of one message, most clicked first.
	 *
	 * @param int $id Log row id.
	 * @return array<int, array{position: string, url: string, click_count: string, first_clicked_at: string, last_clicked_at: string}>
	 */
	public function links( $id ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				'SELECT position, url, click_count, first_clicked_at, last_clicked_at FROM %i WHERE log_id = %d ORDER BY click_count DESC, position ASC',
				$this->links_table(),
				$id
			),
			ARRAY_A
		);

		return $rows ? $rows : array();
	}

	/**
	 * Delete specific log rows.
	 *
	 * @param int[] $ids Row ids.
	 * @return int Rows deleted.
	 */
	public function delete( array $ids ) {
		global $wpdb;

		$ids = array_values( array_filter( array_map( 'absint', $ids ) ) );

		if ( ! $ids ) {
			return 0;
		}

		$placeholders = implode( ',', array_fill( 0, count( $ids ), '%d' ) );

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- $placeholders is a generated list of %d.
		$deleted = (int) $wpdb->query( $wpdb->prepare( "DELETE FROM %i WHERE id IN ({$placeholders})", array_merge( array( $this->table() ), $ids ) ) );

		$wpdb->query( $wpdb->prepare( "DELETE FROM %i WHERE log_id IN ({$placeholders})", array_merge( array( $this->links_table() ), $ids ) ) );
		// phpcs:enable

		return $deleted;
	}

	/**
	 * Delete every log row.
	 *
	 * @return int Rows deleted.
	 */
	public function delete_all() {
		global $wpdb;

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$deleted = (int) $wpdb->query( $wpdb->prepare( 'DELETE FROM %i', $this->table() ) );

		$wpdb->query( $wpdb->prepare( 'DELETE FROM %i', $this->links_table() ) );
		// phpcs:enable

		return $deleted;
	}

	/**
	 * Delete log rows older than a given timestamp.
	 *
	 * @param string $before UTC `Y-m-d H:i:s`; older rows are removed.
	 * @return int Rows deleted.
	 */
	public function delete_before( $before ) {
		global $wpdb;

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		// The clicked links of the rows about to go, found through idx_created and (log_id, position).
		$wpdb->query(
			$wpdb->prepare(
				'DELETE links FROM %i AS links INNER JOIN %i AS logs ON logs.id = links.log_id WHERE logs.created_at < %s',
				$this->links_table(),
				$this->table(),
				$before
			)
		);

		$deleted = (int) $wpdb->query( $wpdb->prepare( 'DELETE FROM %i WHERE created_at < %s', $this->table(), $before ) );
		// phpcs:enable

		return $deleted;
	}

	/**
	 * Sent/failed totals per channel and per day since a date.
	 *
	 * @param string $since UTC `Y-m-d H:i:s`.
	 * @return array<int, array{day: string, channel: string, status: string, total: string}>
	 */
	public function daily_counts( $since ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				'SELECT DATE(created_at) AS day, channel, status, COUNT(*) AS total FROM %i WHERE created_at >= %s GROUP BY DATE(created_at), channel, status',
				$this->table(),
				$since
			),
			ARRAY_A
		);

		return $rows ? $rows : array();
	}
}
