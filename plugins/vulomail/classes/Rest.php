<?php
/**
 * Rest class file.
 *
 * @package VuloMail
 */

namespace VuloMail;

defined( 'ABSPATH' ) || exit;

/**
 * Registers REST controllers.
 */
class Rest {

	/**
	 * Constructor.
	 */
	public function __construct() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Instantiates every controller (own + filtered-in) and registers its routes.
	 *
	 * @return void
	 */
	public function register_routes() {
		$controllers = array(
			'overview'    => new Rest\Overview(),
			'settings'    => new Rest\Settings(),
			'connections' => new Rest\Connections(),
			'logs'        => new Rest\Logs(),
			'tools'       => new Rest\Tools(),
		);

		foreach ( (array) apply_filters( 'vulomail_rest_controllers', array() ) as $key => $controller ) {
			if ( $controller instanceof \WP_REST_Controller ) {
				$controllers[ $key ] = $controller;
			}
		}

		foreach ( $controllers as $controller ) {
			$controller->register_routes();
		}
	}
}
