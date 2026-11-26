<?php
/**
 * Base REST controller file.
 *
 * @package VuloForm
 */

namespace VuloForm\Rest;

use VuloForm\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Base REST controller for VuloForm's own routes: the shared permission check (capability +
 * translated forbidden message), a `route()` helper for registering routes, and a shared
 * `not_found()` error.
 */
abstract class Controller extends \WP_REST_Controller {

	/**
	 * Checks that the current user may manage VuloForm. Core's REST cookie authentication
	 * verifies the `wp_rest` nonce before this runs, so a logged-in admin's browser can't be
	 * tricked into calling these routes cross-site.
	 *
	 * @return bool|\WP_Error
	 */
	public function check_permission() {
		if ( ! current_user_can( Utill::CAPABILITY ) ) {
			return new \WP_Error( 'rest_forbidden', __( 'You are not allowed to manage VuloForm.', 'vuloform' ), array( 'status' => rest_authorization_required_code() ) );
		}

		return true;
	}

	/**
	 * Registers one route under VuloForm's own namespace.
	 *
	 * @param string $path     Route path under the namespace.
	 * @param string $methods  HTTP methods.
	 * @param string $callback Method name on this controller.
	 * @param bool   $is_open  Whether the route is open to visitors.
	 * @return void
	 */
	protected function route( $path, $methods, $callback, $is_open = false ) {
		register_rest_route(
			VuloForm()->rest_namespace,
			$path,
			array(
				array(
					'methods'             => $methods,
					'callback'            => array( $this, $callback ),
					'permission_callback' => $is_open ? '__return_true' : array( $this, 'check_permission' ),
				),
			)
		);
	}

	/**
	 * A standard "that item no longer exists" error.
	 *
	 * @return \WP_Error
	 */
	protected function not_found() {
		return new \WP_Error( 'vuloform_not_found', __( 'That item no longer exists.', 'vuloform' ), array( 'status' => 404 ) );
	}
}
