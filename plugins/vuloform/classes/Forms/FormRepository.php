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
	 * Paginated list for the admin table, each with its submission counts.
	 *
	 * @param array $args search, status, page, per_page.
	 * @return array{data: array, total: int}
	 */
	public function query( array $args = array() ) {
		global $wpdb;

		$where  = array( '1=1' );
		$params = array();

		if ( ! empty( $args['search'] ) ) {
			$where[]  = 'title LIKE %s';
			$params[] = '%' . $wpdb->esc_like( $args['search'] ) . '%';
		}

		if ( in_array( $args['status'] ?? '', self::STATUSES, true ) ) {
			$where[]  = 'status = %s';
			$params[] = $args['status'];
		}

		$where = array_merge( $where, $this->plugin_clauses( (string) ( $args['plugin'] ?? '' ), $params ) );

		$where_sql = implode( ' AND ', array_merge( $where, $this->hidden_template_clauses( $params ) ) );
		$per_page  = (int) ( $args['per_page'] ?? 0 );
		$per_page  = $per_page > 0 ? min( 100, $per_page ) : 10;
		$offset    = ( max( 1, (int) ( $args['page'] ?? 1 ) ) - 1 ) * $per_page;

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- $where_sql holds only the fixed fragments built above; values go through prepare().
		$total = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM %i WHERE {$where_sql}", array_merge( array( $this->table() ), $params ) ) );

		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT id, title, status, created_at, updated_at FROM %i WHERE {$where_sql} ORDER BY updated_at DESC, id DESC LIMIT %d OFFSET %d",
				array_merge( array( $this->table() ), $params, array( $per_page, $offset ) )
			),
			ARRAY_A
		);
		// phpcs:enable

		return array(
			'data'  => $rows ? $rows : array(),
			'total' => $total,
		);
	}

	/**
	 * The oldest form made from a template, 0 when there is none.
	 *
	 * @param string $template Template id.
	 * @return int
	 */
	public function id_for_template( $template ) {
		global $wpdb;

		if ( '' === $template ) {
			return 0;
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return (int) $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM %i WHERE form_schema LIKE %s ORDER BY id ASC LIMIT 1', $this->table(), '%' . $wpdb->esc_like( '"template":' . wp_json_encode( $template ) ) . '%' ) );
	}

	/**
	 * Conditions for the plugin filter of the list: '' for every form, 'vuloform' for the forms that
	 * belong to no plugin, or a plugin's name for the forms made from its templates.
	 *
	 * @param string $plugin Filter value.
	 * @param array  $params Query values; the conditions' values are appended.
	 * @return string[]
	 */
	private function plugin_clauses( $plugin, array &$params ) {
		global $wpdb;

		$plugins = Templates::plugins();

		if ( '' === $plugin || 'all' === $plugin ) {
			return array();
		}

		$like = static function ( $id ) use ( $wpdb ) {
			return '%' . $wpdb->esc_like( '"template":' . wp_json_encode( $id ) ) . '%';
		};

		if ( 'vuloform' === $plugin ) {
			$clauses = array();

			foreach ( array_merge( array(), ...array_values( $plugins ) ) as $id ) {
				$clauses[] = 'form_schema NOT LIKE %s';
				$params[]  = $like( $id );
			}

			return $clauses;
		}

		$ids = $plugins[ $plugin ] ?? array();

		if ( ! $ids ) {
			// A plugin that is not offering templates has no forms in the list.
			return array( '1=0' );
		}

		$or = array();

		foreach ( $ids as $id ) {
			$or[]     = 'form_schema LIKE %s';
			$params[] = $like( $id );
		}

		return array( '(' . implode( ' OR ', $or ) . ')' );
	}

	/**
	 * Ids of every form made from a template.
	 *
	 * @param string $template Template id.
	 * @return int[]
	 */
	public function ids_for_template( $template ) {
		global $wpdb;

		if ( '' === $template ) {
			return array();
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare( 'SELECT id FROM %i WHERE form_schema LIKE %s', $this->table(), '%' . $wpdb->esc_like( '"template":' . wp_json_encode( $template ) ) . '%' ) ) );
	}

	/**
	 * Conditions that leave out forms made from a template of a plugin that is switched off. The
	 * forms are kept, and come back when the plugin does.
	 *
	 * @param array $params Query values; the conditions' values are appended.
	 * @return string[]
	 */
	private function hidden_template_clauses( array &$params ) {
		global $wpdb;

		$clauses = array();

		foreach ( Templates::unavailable() as $id ) {
			$clauses[] = 'form_schema NOT LIKE %s';
			$params[]  = '%' . $wpdb->esc_like( '"template":' . wp_json_encode( $id ) ) . '%';
		}

		return $clauses;
	}

	/**
	 * @return array<int, array{id: string, title: string}> Published forms, for the block and shortcode pickers.
	 */
	public function published() {
		global $wpdb;

		$params  = array( $this->table(), 'published' );
		$clauses = $this->hidden_template_clauses( $params );
		$extra   = $clauses ? ' AND ' . implode( ' AND ', $clauses ) : '';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- $extra holds only the fixed fragments built above.
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT id, title FROM %i WHERE status = %s{$extra} ORDER BY title ASC LIMIT 500", $params ), ARRAY_A );

		return $rows ? $rows : array();
	}

	/**
	 * Creates a form.
	 *
	 * @param string $title  Title.
	 * @param mixed  $schema Schema, sanitized here.
	 * @param string $status draft or published.
	 * @return int New form id, 0 on failure.
	 */
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
			/**
			 * Fires after a form is deleted.
			 *
			 * @param int $id Form id.
			 */
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
