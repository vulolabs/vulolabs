<?php
/**
 * Forms REST controller file.
 *
 * @package VuloForm
 */

namespace VuloForm\Rest;

use VuloForm\Forms\Schema;
use VuloForm\Forms\Templates;
use VuloForm\Frontend\Renderer;
use VuloForm\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * vuloform/v1/forms - list, create, read, save, duplicate, delete, preview and export forms.
 */
class Forms extends Controller {

	/**
	 * Registers this controller's routes.
	 *
	 * @return void
	 */
	public function register_routes() {
		$this->route( '/forms', \WP_REST_Server::READABLE, 'get_items' );
		$this->route( '/forms', \WP_REST_Server::CREATABLE, 'create_item' );
		$this->route( '/forms/(?P<id>\d+)', \WP_REST_Server::READABLE, 'get_item' );
		$this->route( '/forms/(?P<id>\d+)', \WP_REST_Server::CREATABLE, 'update_item' );
		$this->route( '/forms/(?P<id>\d+)', \WP_REST_Server::DELETABLE, 'delete_item' );
		$this->route( '/forms/(?P<id>\d+)/duplicate', \WP_REST_Server::CREATABLE, 'duplicate_item' );
		$this->route( '/forms/bulk-delete', \WP_REST_Server::CREATABLE, 'bulk_delete' );
		$this->route( '/forms/preview', \WP_REST_Server::CREATABLE, 'preview' );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function get_items( $request ) {
		$result = VuloForm()->forms->query(
			array(
				'search'   => sanitize_text_field( (string) $request->get_param( 'search' ) ),
				'status'   => sanitize_key( (string) $request->get_param( 'status' ) ),
				'plugin'   => sanitize_text_field( (string) $request->get_param( 'plugin' ) ),
				'page'     => absint( $request->get_param( 'page' ) ),
				'per_page' => absint( $request->get_param( 'per_page' ) ),
			)
		);
		$counts    = VuloForm()->submissions->counts_by_form();
		$protected = Templates::protected_form_ids();
		$single    = array();

		// Forms of a one-per-site template can't be copied.
		foreach ( Templates::all() as $template_id => $template ) {
			if ( ! empty( $template['single'] ) ) {
				$single = array_merge( $single, VuloForm()->forms->ids_for_template( $template_id ) );
			}
		}

		foreach ( $result['data'] as $index => $row ) {
			$form_counts = $counts[ (int) $row['id'] ] ?? array(
				'total'  => 0,
				'unread' => 0,
			);

			$result['data'][ $index ]['id']                 = (int) $row['id'];
			$result['data'][ $index ]['protected']          = in_array( (int) $row['id'], $protected, true );
			$result['data'][ $index ]['single']             = in_array( (int) $row['id'], $single, true );
			$result['data'][ $index ]['submissions']        = $form_counts['total'];
			$result['data'][ $index ]['unread']             = $form_counts['unread'];
			$result['data'][ $index ]['updated_at_display'] = Utill::format_datetime( $row['updated_at'] );
		}

		$result['categories'] = $this->categories();

		return rest_ensure_response( $result );
	}

	/**
	 * The list's filter tabs: every form, the forms of VuloForm itself, and one tab per plugin that
	 * offers templates, each with its count.
	 *
	 * @return array<int, array{value: string, label: string, count: int}>
	 */
	private function categories() {
		$total      = (int) VuloForm()->forms->query( array( 'per_page' => 1 ) )['total'];
		$categories = array();
		$in_plugins = 0;

		foreach ( array_keys( Templates::plugins() ) as $name ) {
			$count       = (int) VuloForm()->forms->query(
				array(
					'plugin'   => $name,
					'per_page' => 1,
				)
			)['total'];
			$in_plugins += $count;

			$categories[] = array(
				'value' => $name,
				'label' => $name,
				'count' => $count,
			);
		}

		return array_merge(
			array(
				array(
					'value' => 'all',
					'label' => __( 'All', 'vuloform' ),
					'count' => $total,
				),
				array(
					'value' => 'vuloform',
					'label' => 'VuloForm',
					'count' => max( 0, $total - $in_plugins ),
				),
			),
			$categories
		);
	}

	/**
	 * Creates a form: blank, from a template, or from an exported schema.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function create_item( $request ) {
		$input     = (array) $request->get_json_params();
		$templates = Templates::all();
		$template  = sanitize_key( (string) ( $input['template'] ?? '' ) );
		$schema    = Schema::defaults();
		$title     = (string) ( $input['title'] ?? '' );

		if ( isset( $templates[ $template ] ) ) {
			$schema = $templates[ $template ]['schema'];
			$title  = '' !== $title ? $title : $templates[ $template ]['title'];
		} elseif ( isset( $input['schema'] ) && is_array( $input['schema'] ) ) {
			// An import. Schema::sanitize() rebuilds it, so a hand-edited file can't smuggle anything in.
			$schema = $input['schema'];
		} else {
			// A blank form still tells the site admin about each submission, like the templates do.
			$schema['settings']['notifications'][] = Templates::admin_notification();
		}

		$taken = $this->single_template_form( Schema::sanitize( $schema )['settings']['template'] );

		if ( $taken ) {
			return $taken;
		}

		$id = VuloForm()->forms->create( $title, $schema, 'draft' );

		if ( ! $id ) {
			return new \WP_Error( 'vuloform_create_failed', __( 'The form could not be created.', 'vuloform' ), array( 'status' => 500 ) );
		}

		return rest_ensure_response( $this->payload( $id ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_item( $request ) {
		$payload = $this->payload( absint( $request['id'] ) );

		return $payload ? rest_ensure_response( $payload ) : $this->not_found();
	}

	/**
	 * Saves a form. A form with problems is still saved as a draft, so no work is lost, but it is
	 * not published.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update_item( $request ) {
		$id    = absint( $request['id'] );
		$input = (array) $request->get_json_params();

		if ( ! VuloForm()->forms->get( $id ) ) {
			return $this->not_found();
		}

		$changes = array();

		if ( isset( $input['title'] ) ) {
			$changes['title'] = $input['title'];
		}

		if ( isset( $input['schema'] ) ) {
			$changes['schema'] = $input['schema'];
		}

		$problems = isset( $input['schema'] ) ? Schema::problems( Schema::sanitize( $input['schema'] ) ) : Schema::problems( VuloForm()->forms->get( $id )['schema'] );

		if ( isset( $input['status'] ) ) {
			$changes['status'] = 'published' === $input['status'] && ! $problems ? 'published' : 'draft';
		}

		VuloForm()->forms->update( $id, $changes );

		$payload             = $this->payload( $id );
		$payload['problems'] = $problems;
		// The same problems with where to fix each one; a problem an extension reported has no place.
		$known             = array_column( Schema::issues( $payload['schema'] ), null, 'message' );
		$payload['issues'] = array_map(
			static function ( $message ) use ( $known ) {
				return isset( $known[ $message ] ) ? $known[ $message ] : array(
					'message' => $message,
					'field'   => '',
					'group'   => '',
				);
			},
			$problems
		);

		return rest_ensure_response( $payload );
	}

	/**
	 * Deletes a form with its submissions and their files.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function delete_item( $request ) {
		$id = absint( $request['id'] );

		if ( ! VuloForm()->forms->get( $id ) ) {
			return $this->not_found();
		}

		if ( in_array( $id, Templates::protected_form_ids(), true ) ) {
			return $this->protected_error();
		}

		$this->remove( $id );

		return rest_ensure_response( array( 'deleted' => true ) );
	}

	/**
	 * Deletes several forms. Protected forms are skipped and counted, not treated as an error.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function bulk_delete( $request ) {
		$input     = (array) $request->get_json_params();
		$ids       = array_slice( array_unique( array_filter( array_map( 'absint', (array) ( $input['ids'] ?? array() ) ) ) ), 0, 100 );
		$protected = Templates::protected_form_ids();
		$deleted   = 0;
		$skipped   = 0;

		foreach ( $ids as $id ) {
			if ( ! VuloForm()->forms->get( $id ) ) {
				continue;
			}

			if ( in_array( $id, $protected, true ) ) {
				++$skipped;
				continue;
			}

			$this->remove( $id );
			++$deleted;
		}

		return rest_ensure_response(
			array(
				'deleted' => $deleted,
				'skipped' => $skipped,
			)
		);
	}

	/**
	 * Deletes a form with its submissions and their files.
	 *
	 * @param int $id Form id.
	 * @return void
	 */
	private function remove( $id ) {
		// In batches, so a form with a large history can't run the request out of memory.
		do {
			$ids = VuloForm()->submissions->ids_where( 'form_id', $id, 200 );

			if ( $ids ) {
				VuloForm()->submissions->delete( $ids );
			}
		} while ( $ids );

		VuloForm()->forms->delete( $id );
	}

	/**
	 * @return \WP_Error
	 */
	private function protected_error() {
		return new \WP_Error( 'vuloform_form_protected', __( 'This form is needed by a plugin and cannot be deleted.', 'vuloform' ), array( 'status' => 403 ) );
	}

	/**
	 * An error when the template allows one form per site and that form exists.
	 *
	 * @param string $template Template id.
	 * @return \WP_Error|null
	 */
	private function single_template_form( $template ) {
		$templates = Templates::all();

		if ( '' === $template || empty( $templates[ $template ]['single'] ) ) {
			return null;
		}

		$existing = VuloForm()->forms->id_for_template( $template );

		if ( ! $existing ) {
			return null;
		}

		return new \WP_Error(
			'vuloform_template_exists',
			/* translators: %s: template name. */
			sprintf( __( 'A "%s" form already exists. There can be only one.', 'vuloform' ), $templates[ $template ]['title'] ),
			array(
				'status'  => 409,
				'form_id' => $existing,
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function duplicate_item( $request ) {
		$source = VuloForm()->forms->get( absint( $request['id'] ) );
		$taken  = $source ? $this->single_template_form( (string) ( $source['schema']['settings']['template'] ?? '' ) ) : null;

		if ( $taken ) {
			return $taken;
		}

		$id = VuloForm()->forms->duplicate( absint( $request['id'] ) );

		return $id ? rest_ensure_response( $this->payload( $id ) ) : $this->not_found();
	}

	/**
	 * Renders an unsaved schema for the builder's preview. The result can't be submitted.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function preview( $request ) {
		$input = (array) $request->get_json_params();

		return rest_ensure_response(
			array(
				'html' => Renderer::render(
					array(
						'id'     => 0,
						'title'  => sanitize_text_field( (string) ( $input['title'] ?? '' ) ),
						'status' => 'draft',
						'schema' => Schema::sanitize( $input['schema'] ?? array() ),
					),
					array( 'preview' => true )
				),
			)
		);
	}

	/**
	 * @param int $id Form id.
	 * @return array|null The form as the builder needs it.
	 */
	private function payload( $id ) {
		$form = VuloForm()->forms->get( $id );

		if ( ! $form ) {
			return null;
		}

		$form['shortcode'] = '[vuloform id="' . (int) $form['id'] . '"]';

		// The snippet a site owner pastes into another site's HTML; it is shown as text, never
		// printed here, so the <script> markup is built with core's own tag-building function
		// rather than enqueued - there is no page of ours for wp_enqueue_script() to attach to.
		$script_tag = wp_get_script_tag(
			array(
				'src'   => add_query_arg( 'site', rawurlencode( untrailingslashit( rest_url() ) ), VuloForm()->plugin_url . 'assets/js/public/vuloform-embed.min.js' ),
				'async' => true,
			)
		);

		$form['embed'] = sprintf(
			'<div data-vuloform="%1$d"><noscript>%2$s</noscript></div>' . "\n" . '%3$s',
			(int) $form['id'],
			esc_html__( 'Please enable JavaScript to use this form.', 'vuloform' ),
			trim( $script_tag )
		);

		return $form;
	}
}
