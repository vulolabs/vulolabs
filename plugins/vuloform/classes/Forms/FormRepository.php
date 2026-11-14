<?php
/**
 * FormRepository class file.
 *
 * @package VuloForm
 */

namespace VuloForm\Forms;

use VuloForm\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Database access for forms. A form is a title, a status and a schema (Forms\Schema).
 */
class FormRepository {

	const STATUSES = array( 'draft', 'published' );

	/**
	 * Forms read during this request, so a page with the same form twice reads it once.
	 *
	 * @var array<int, array|null>
	 */
	private $cache = array();

	/**
	 * @return string
	 */
	private function table() {
		global $wpdb;

		return $wpdb->prefix . Utill::TABLES['form'];
	}

	/**
	 * @param int $id Form id.
	 * @return array|null id, title, status, schema (upgraded to the current version), created_at, updated_at.
	 */
	public function get( $id ) {
		global $wpdb;

		$id = (int) $id;

		if ( array_key_exists( $id, $this->cache ) ) {
			return $this->cache[ $id ];
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM %i WHERE id = %d', $this->table(), $id ), ARRAY_A );

		$this->cache[ $id ] = $row ? $this->hydrate( $row ) : null;

		return $this->cache[ $id ];
	}

	/**
	 * Paginated list for the admin table.
	 *
	 * @param array $args search, status, plugin, page, per_page.
	 * @return array{data: array, total: int}
	 */
	public function query( array $args = array() ) {
		global $wpdb;

		$table   = $this->table();
		$plugin  = (string) ( $args['plugin'] ?? '' );
		$plugins = Templates::plugins();
		$where   = array();
		$hidden  = Templates::unavailable();

		if ( ! empty( $args['search'] ) ) {
			$where[] = $wpdb->prepare( 'title LIKE %s', '%' . $wpdb->esc_like( $args['search'] ) . '%' );
		}

		if ( in_array( $args['status'] ?? '', self::STATUSES, true ) ) {
			$where[] = $wpdb->prepare( 'status = %s', $args['status'] );
		}

		if ( 'vuloform' === $plugin ) {
			// Forms that were not made from any plugin's template.
			$hidden = array_merge( $hidden, ...array_values( $plugins ) );
		} elseif ( '' !== $plugin && 'all' !== $plugin ) {
			// A plugin that offers no templates has no forms in the list.
			if ( empty( $plugins[ $plugin ] ) ) {
				return array(
					'data'  => array(),
					'total' => 0,
				);
			}

			$where[] = $this->template_sql( $plugins[ $plugin ] );
		}

		if ( $hidden ) {
			$where[] = $this->template_sql( $hidden, true );
		}

		$where_sql = $where ? 'WHERE ' . implode( ' AND ', $where ) : '';
		$per_page  = (int) ( $args['per_page'] ?? 0 );
		$per_page  = $per_page > 0 ? min( 100, $per_page ) : 10;
		$offset    = ( max( 1, (int) ( $args['page'] ?? 1 ) ) - 1 ) * $per_page;

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- the table name is ours, $where_sql is built from prepare() calls above and the numbers are integers.
		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} {$where_sql}" );
		$rows  = $wpdb->get_results( "SELECT id, title, status, created_at, updated_at FROM {$table} {$where_sql} ORDER BY updated_at DESC, id DESC LIMIT {$per_page} OFFSET {$offset}", ARRAY_A );
		// phpcs:enable

		return array(
			'data'  => $rows ? $rows : array(),
			'total' => $total,
		);
	}

	/**
	 * @param string $template Template id.
	 * @return int[] Forms made from that template, oldest first.
	 */
	public function ids_for_template( $template ) {
		global $wpdb;

		if ( '' === $template ) {
			return array();
		}

		$table = $this->table();
		$where = $this->template_sql( array( $template ) );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- the table name is ours, $where comes from prepare().
		$ids = $wpdb->get_col( "SELECT id FROM {$table} WHERE {$where} ORDER BY id ASC" );

		return array_map( 'intval', $ids );
	}

	/**
	 * A form remembers its template as `"template":"id"` inside its schema, so that is what we match.
	 *
	 * @param string[] $ids Template ids, at least one.
	 * @param bool     $not True for forms made from none of them, false for any of them.
	 * @return string Already-prepared SQL condition.
	 */
	private function template_sql( array $ids, $not = false ) {
		global $wpdb;

		$conditions = array();

		foreach ( $ids as $id ) {
			$like         = '%' . $wpdb->esc_like( '"template":' . wp_json_encode( $id ) ) . '%';
			$conditions[] = $wpdb->prepare( $not ? 'form_schema NOT LIKE %s' : 'form_schema LIKE %s', $like );
		}

		return '(' . implode( $not ? ' AND ' : ' OR ', $conditions ) . ')';
	}

	/**
	 * @return array<int, array{id: string, title: string}> Published forms, for the block and shortcode pickers.
	 */
	public function published() {
		global $wpdb;

		$table  = $this->table();
		$hidden = Templates::unavailable();
		$extra  = $hidden ? ' AND ' . $this->template_sql( $hidden, true ) : '';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- the table name is ours, $extra comes from prepare().
		$rows = $wpdb->get_results( "SELECT id, title FROM {$table} WHERE status = 'published'{$extra} ORDER BY title ASC LIMIT 500", ARRAY_A );

		return $rows ? $rows : array();
	}

	public function create( $title, $schema = array(), $status = 'draft' ) {
		global $wpdb;

		$now = gmdate( 'Y-m-d H:i:s' );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$inserted = $wpdb->insert(
			$this->table(),
			array(
				'title'       => $this->title( $title ),
				'status'      => in_array( $status, self::STATUSES, true ) ? $status : 'draft',
				'form_schema' => wp_json_encode( Schema::sanitize( $schema ) ),
				'created_at'  => $now,
				'updated_at'  => $now,
			)
		);

		return $inserted ? (int) $wpdb->insert_id : 0;
	}

	/**
	 * Updates a form. Only the keys given are changed.
	 *
	 * @param int   $id      Form id.
	 * @param array $changes title, status, schema.
	 * @return bool
	 */
	public function update( $id, array $changes ) {
		global $wpdb;

		$row = array( 'updated_at' => gmdate( 'Y-m-d H:i:s' ) );

		if ( isset( $changes['title'] ) ) {
			$row['title'] = $this->title( $changes['title'] );
		}

		if ( isset( $changes['status'] ) && in_array( $changes['status'], self::STATUSES, true ) ) {
			$row['status'] = $changes['status'];
		}

		if ( array_key_exists( 'schema', $changes ) ) {
			$row['form_schema'] = wp_json_encode( Schema::sanitize( $changes['schema'] ) );
		}

		unset( $this->cache[ (int) $id ] );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return false !== $wpdb->update( $this->table(), $row, array( 'id' => (int) $id ) );
	}

	/**
	 * @param int $id Form id.
	 * @return int New form id.
	 */
	public function duplicate( $id ) {
		$form = $this->get( $id );

		if ( ! $form ) {
			return 0;
		}

		/* translators: %s: form title. */
		return $this->create( sprintf( __( '%s (copy)', 'vuloform' ), $form['title'] ), $form['schema'], 'draft' );
	}

	/**
	 * Deletes a form. Its submissions are removed by the caller (Rest\Forms), which also cleans up
	 * their uploaded files.
	 *
	 * @param int $id Form id.
	 * @return bool
	 */
	public function delete( $id ) {
		global $wpdb;

		unset( $this->cache[ (int) $id ] );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$deleted = (bool) $wpdb->delete( $this->table(), array( 'id' => (int) $id ) );

		if ( $deleted ) {
			do_action( 'vuloform_form_deleted', (int) $id );
		}

		return $deleted;
	}

	/**
	 * @param array $row Database row.
	 * @return array
	 */
	private function hydrate( array $row ) {
		return array(
			'id'         => (int) $row['id'],
			'title'      => $row['title'],
			'status'     => $row['status'],
			'schema'     => Schema::upgrade( json_decode( (string) $row['form_schema'], true ) ),
			'created_at' => $row['created_at'],
			'updated_at' => $row['updated_at'],
		);
	}

	/**
	 * @param mixed $title Raw title.
	 * @return string
	 */
	private function title( $title ) {
		$title = mb_substr( sanitize_text_field( (string) $title ), 0, 200 );

		return '' !== $title ? $title : __( 'Untitled form', 'vuloform' );
	}
}
