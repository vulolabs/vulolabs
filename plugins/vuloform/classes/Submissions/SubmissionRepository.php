<?php
/**
 * SubmissionRepository class file.
 *
 * @package VuloForm
 */

namespace VuloForm\Submissions;

use VuloForm\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Database access for submissions. `data` is field key => value; `meta` holds what VuloForm itself
 * recorded (page, IP when enabled, notification and webhook results).
 */
class SubmissionRepository {

	const STATUSES = array( 'unread', 'read', 'spam' );

	/**
	 * @return string
	 */
	private function table() {
		global $wpdb;

		return $wpdb->prefix . Utill::TABLES['submission'];
	}

	/**
	 * @param int    $form_id Form id.
	 * @param array  $data    Field key => value.
	 * @param array  $meta    Extra details.
	 * @param string $status  unread, read or spam.
	 * @return int New submission id, 0 on failure.
	 */
	public function insert( $form_id, array $data, array $meta = array(), $status = 'unread' ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$inserted = $wpdb->insert(
			$this->table(),
			array(
				'form_id'     => (int) $form_id,
				'status'      => in_array( $status, self::STATUSES, true ) ? $status : 'unread',
				'user_id'     => (int) get_current_user_id(),
				'data'        => wp_json_encode( $data ),
				'meta'        => wp_json_encode( $meta ),
				'search_text' => self::search_text( $data ),
				'created_at'  => gmdate( 'Y-m-d H:i:s' ),
			)
		);

		return $inserted ? (int) $wpdb->insert_id : 0;
	}

	/**
	 * @param int $id Submission id.
	 * @return array|null
	 */
	public function get( $id ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM %i WHERE id = %d', $this->table(), (int) $id ), ARRAY_A );

		return $row ? self::hydrate( $row ) : null;
	}

	/**
	 * Paginated, filtered list.
	 *
	 * @param array $args form_id, status, search, after, before (UTC datetimes), page, per_page, order.
	 * @return array{data: array, total: int, status_counts: array<string, int>}
	 */
	public function query( array $args ) {
		global $wpdb;

		$table = $this->table();
		$where = array();

		if ( ! empty( $args['form_id'] ) ) {
			$where[] = $wpdb->prepare( 'form_id = %d', $args['form_id'] );
		}

		if ( ! empty( $args['search'] ) ) {
			$where[] = $wpdb->prepare( 'search_text LIKE %s', '%' . $wpdb->esc_like( $args['search'] ) . '%' );
		}

		if ( ! empty( $args['after'] ) ) {
			$where[] = $wpdb->prepare( 'created_at >= %s', $args['after'] );
		}

		if ( ! empty( $args['before'] ) ) {
			$where[] = $wpdb->prepare( 'created_at <= %s', $args['before'] );
		}

		// Counted before the status filter, so each status pill shows its own total.
		$base_where = $where ? 'WHERE ' . implode( ' AND ', $where ) : '';

		$status = $args['status'] ?? '';

		if ( in_array( $status, self::STATUSES, true ) ) {
			$where[] = $wpdb->prepare( 'status = %s', $status );
		} elseif ( 'inbox' === $status ) {
			$where[] = "status <> 'spam'";
		}

		$where_sql = $where ? 'WHERE ' . implode( ' AND ', $where ) : '';
		$order     = 'asc' === strtolower( (string) ( $args['order'] ?? '' ) ) ? 'ASC' : 'DESC';
		$per_page  = (int) ( $args['per_page'] ?? 0 );
		$per_page  = $per_page > 0 ? min( 500, $per_page ) : 10;
		$offset    = ( max( 1, (int) ( $args['page'] ?? 1 ) ) - 1 ) * $per_page;

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- the table name is ours, the WHERE strings are built from prepare() calls above, $order is ASC or DESC and the numbers are integers.
		$counts = $wpdb->get_results( "SELECT status, COUNT(*) AS total FROM {$table} {$base_where} GROUP BY status", ARRAY_A );
		$total  = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} {$where_sql}" );
		$rows   = $wpdb->get_results( "SELECT * FROM {$table} {$where_sql} ORDER BY created_at {$order}, id {$order} LIMIT {$per_page} OFFSET {$offset}", ARRAY_A );
		// phpcs:enable

		$status_counts = array_fill_keys( self::STATUSES, 0 );

		foreach ( (array) $counts as $count ) {
			$status_counts[ $count['status'] ] = (int) $count['total'];
		}

		return array(
			'data'          => array_map( array( self::class, 'hydrate' ), $rows ? $rows : array() ),
			'total'         => $total,
			'status_counts' => $status_counts,
		);
	}

	/**
	 * @param int[]  $ids    Submission ids.
	 * @param string $status New status.
	 * @return int Rows changed.
	 */
	public function set_status( array $ids, $status ) {
		global $wpdb;

		$ids = array_values( array_filter( array_map( 'absint', $ids ) ) );

		if ( ! $ids || ! in_array( $status, self::STATUSES, true ) ) {
			return 0;
		}

		$id_list = implode( ',', $ids );
		$table   = $this->table();

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- $ids were cast with absint(), the table name is ours.
		return (int) $wpdb->query( $wpdb->prepare( "UPDATE {$table} SET status = %s WHERE id IN ({$id_list})", $status ) );
	}

	/**
	 * Stores what happened after a submission was saved (notification and webhook outcomes).
	 *
	 * @param int   $id   Submission id.
	 * @param array $meta Full meta to store.
	 * @return void
	 */
	public function update_meta( $id, array $meta ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->update( $this->table(), array( 'meta' => wp_json_encode( $meta ) ), array( 'id' => (int) $id ) );
	}

	/**
	 * Appends one entry to a submission's delivery log (email, webhook, or an extension's own event).
	 *
	 * @param int   $id    Submission id.
	 * @param array $event `type`, `name`, `status`, `detail`, `time`; optionally `label`,
	 *                     `status_label` and `color` for a type the core does not know.
	 * @return void
	 */
	public function add_event( $id, array $event ) {
		$submission = $this->get( $id );

		if ( ! $submission ) {
			return;
		}

		$meta           = $submission['meta'];
		$meta['events'] = array_merge( isset( $meta['events'] ) && is_array( $meta['events'] ) ? $meta['events'] : array(), array( $event ) );

		$this->update_meta( $id, $meta );
	}

	/**
	 * Deletes submissions and their uploaded files.
	 *
	 * @param int[] $ids Submission ids.
	 * @return int Rows deleted.
	 */
	public function delete( array $ids ) {
		global $wpdb;

		$ids = array_values( array_filter( array_map( 'absint', $ids ) ) );

		if ( ! $ids ) {
			return 0;
		}

		foreach ( $ids as $id ) {
			$submission = $this->get( $id );

			if ( $submission ) {
				Uploads::delete_for_submission( $submission );
			}
		}

		$id_list = implode( ',', $ids );
		$table   = $this->table();

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- $ids were cast with absint(), the table name is ours.
		return (int) $wpdb->query( "DELETE FROM {$table} WHERE id IN ({$id_list})" );
	}

	/**
	 * Ids matching a condition, oldest first, for batched clean-up.
	 *
	 * @param string $column `form_id`, `user_id` or `created_before`.
	 * @param mixed  $value  Value to match.
	 * @param int    $limit  Batch size.
	 * @return int[]
	 */
	public function ids_where( $column, $value, $limit = 200 ) {
		global $wpdb;

		$table = $this->table();
		$limit = (int) $limit;

		if ( 'created_before' === $column ) {
			$where = $wpdb->prepare( 'created_at < %s', (string) $value );
		} elseif ( 'user_id' === $column ) {
			$where = $wpdb->prepare( 'user_id = %d', $value );
		} else {
			$where = $wpdb->prepare( 'form_id = %d', $value );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- the table name is ours, $where comes from prepare().
		$ids = $wpdb->get_col( "SELECT id FROM {$table} WHERE {$where} ORDER BY id ASC LIMIT {$limit}" );

		return array_map( 'intval', (array) $ids );
	}

	/**
	 * Submission totals per form, for the forms list.
	 *
	 * @return array<int, array{total: int, unread: int}> Keyed by form id. Spam is not counted.
	 */
	public function counts_by_form() {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT form_id, status, COUNT(*) AS total FROM %i GROUP BY form_id, status', $this->table() ), ARRAY_A );

		$counts = array();

		foreach ( (array) $rows as $row ) {
			$form_id = (int) $row['form_id'];

			if ( ! isset( $counts[ $form_id ] ) ) {
				$counts[ $form_id ] = array(
					'total'  => 0,
					'unread' => 0,
				);
			}

			if ( 'spam' !== $row['status'] ) {
				$counts[ $form_id ]['total'] += (int) $row['total'];
			}

			if ( 'unread' === $row['status'] ) {
				$counts[ $form_id ]['unread'] += (int) $row['total'];
			}
		}

		return $counts;
	}

	/**
	 * @param array $row Database row.
	 * @return array
	 */
	private static function hydrate( array $row ) {
		$data = json_decode( (string) $row['data'], true );
		$meta = json_decode( (string) $row['meta'], true );

		return array(
			'id'         => (int) $row['id'],
			'form_id'    => (int) $row['form_id'],
			'status'     => $row['status'],
			'user_id'    => (int) $row['user_id'],
			'data'       => is_array( $data ) ? $data : array(),
			'meta'       => is_array( $meta ) ? $meta : array(),
			'created_at' => $row['created_at'],
		);
	}

	/**
	 * The text a search matches against: every plain value in the submission.
	 *
	 * @param array $data Field key => value.
	 * @return string
	 */
	private static function search_text( array $data ) {
		$parts = array();

		array_walk_recursive(
			$data,
			static function ( $value, $key ) use ( &$parts ) {
				// File records carry their stored path; only the visible name is searchable.
				if ( is_scalar( $value ) && ! in_array( $key, array( 'path', 'type', 'size' ), true ) ) {
					$parts[] = (string) $value;
				}
			}
		);

		return mb_substr( implode( ' ', $parts ), 0, 5000 );
	}
}
