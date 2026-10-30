<?php
/**
 * Email templates REST controller file.
 *
 * @package VuloMail
 */

namespace VuloMail\Rest;

use VuloMail\Templates\Registry;

defined( 'ABSPATH' ) || exit;

/**
 * REST controller for vulomail/v1/templates: the registered email templates, and loading and saving
 * one. Names contain a slash (`plugin/template`), so they are passed as `?name=`.
 */
class Templates extends Controller {

	/**
	 * REST base for this controller.
	 *
	 * @var string
	 */
	protected $rest_base = 'templates';

	/**
	 * Registers this controller's routes.
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			VuloMail()->rest_namespace,
			'/' . $this->rest_base,
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_items' ),
					'permission_callback' => array( $this, 'check_permission' ),
				),
			)
		);

		register_rest_route(
			VuloMail()->rest_namespace,
			'/' . $this->rest_base . '/enabled',
			array(
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'set_enabled' ),
					'permission_callback' => array( $this, 'check_permission' ),
				),
			)
		);

		register_rest_route(
			VuloMail()->rest_namespace,
			'/' . $this->rest_base . '/item',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_item' ),
					'permission_callback' => array( $this, 'check_permission' ),
				),
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'save_item' ),
					'permission_callback' => array( $this, 'check_permission' ),
				),
			)
		);
	}

	/**
	 * The template list, with its categories.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function get_items( $request ) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.Found
		$categories = Registry::categories();
		$items      = array();

		foreach ( Registry::all() as $name => $template ) {
			$items[] = $this->summary( $name, $template, $categories );
		}

		return rest_ensure_response(
			array(
				'templates'  => $items,
				'categories' => $categories,
			)
		);
	}

	/**
	 * One template: its saved (or default) email, and every template as a starting point.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_item( $request ) {
		$name     = sanitize_text_field( (string) $request->get_param( 'name' ) );
		$template = Registry::get( $name );
		$email    = Registry::load( $name );

		if ( ! $template || ! $email ) {
			return new \WP_Error( 'vulomail_template_not_found', __( 'That email template is not registered.', 'vulomail' ), array( 'status' => 404 ) );
		}

		$starters = array();

		foreach ( Registry::all() as $other_name => $other ) {
			$default = Registry::defaults( $other_name );

			if ( $default ) {
				$starters[] = array(
					'id'          => $other_name,
					'name'        => $other['title'],
					'previewText' => (string) $other['subject'],
					'blocks'      => $default['blocks'] ?? null,
					'email_body'  => $default['content'] ?? null,
				);
			}
		}

		return rest_ensure_response(
			array_merge(
				$this->summary( $name, $template, Registry::categories() ),
				$email,
				array( 'starters' => $starters )
			)
		);
	}

	/**
	 * Saves an edited email through the template's own save callback.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function save_item( $request ) {
		$input = (array) $request->get_json_params();
		$name  = sanitize_text_field( (string) ( $input['name'] ?? $request->get_param( 'name' ) ) );

		if ( ! Registry::get( $name ) ) {
			return new \WP_Error( 'vulomail_template_not_found', __( 'That email template is not registered.', 'vulomail' ), array( 'status' => 404 ) );
		}

		if ( ! Registry::save( $name, $input ) ) {
			return new \WP_Error( 'vulomail_template_not_saved', __( 'The email template could not be saved.', 'vulomail' ), array( 'status' => 500 ) );
		}

		return rest_ensure_response( array( 'saved' => true ) );
	}

	/**
	 * Switches one or several templates on or off: `{ names: [], enabled: bool }`.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function set_enabled( $request ) {
		$input   = (array) $request->get_json_params();
		$enabled = ! empty( $input['enabled'] );
		$done    = array();

		foreach ( array_slice( (array) ( $input['names'] ?? array() ), 0, 200 ) as $name ) {
			$name = sanitize_text_field( (string) $name );

			if ( Registry::set_enabled( $name, $enabled ) ) {
				$done[] = $name;
			}
		}

		return rest_ensure_response(
			array(
				'names'   => $done,
				'enabled' => $enabled,
			)
		);
	}

	/**
	 * @param string $name       Template name.
	 * @param array  $template   Registered arguments.
	 * @param array  $categories Category slug => label.
	 * @return array
	 */
	private function summary( $name, array $template, array $categories ) {
		return array(
			'name'           => $name,
			'title'          => (string) $template['title'],
			'description'    => (string) $template['description'],
			'category'       => (string) $template['category'],
			'category_label' => (string) ( $categories[ $template['category'] ] ?? $template['category'] ),
			'icon'           => (string) $template['icon'],
			'subject'        => (string) $template['subject'],
			'group'          => (string) $template['group'],
			'recipients'     => array_values( array_intersect( array( 'store', 'customer', 'admin' ), (array) $template['recipients'] ) ),
			'enabled'        => Registry::is_enabled( $name ),
		);
	}
}
