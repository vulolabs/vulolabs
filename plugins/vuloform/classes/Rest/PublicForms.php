<?php
/**
 * PublicForms REST controller file.
 *
 * @package VuloForm
 */

namespace VuloForm\Rest;

use VuloForm\Frontend\Renderer;
use VuloForm\Security\Token;

defined( 'ABSPATH' ) || exit;

/**
 * vuloform/v1/public - the three routes a visitor's browser may call: get a token, submit a form,
 * load a form for embedding. Answer any origin (safe: no login use); the signed token, honeypot
 * and rate limit protect a submission instead.
 */
class PublicForms extends Controller {

	/**
	 * Registers this controller's routes.
	 *
	 * @return void
	 */
	public function register_routes() {
		$this->route( '/public/forms/(?P<id>\d+)/token', \WP_REST_Server::READABLE, 'token', true );
		$this->route( '/public/forms/(?P<id>\d+)/submit', \WP_REST_Server::CREATABLE, 'submit', true );
		$this->route( '/public/forms/(?P<id>\d+)/embed', \WP_REST_Server::READABLE, 'embed', true );

		add_filter( 'rest_pre_serve_request', array( $this, 'send_cors_headers' ), 20, 4 );
	}

	/**
	 * Opens the public routes, and only those, to other origins - without credentials.
	 *
	 * @param bool              $served  Whether the request has been served.
	 * @param \WP_HTTP_Response $result  Response.
	 * @param \WP_REST_Request  $request Request.
	 * @return bool
	 */
	public function send_cors_headers( $served, $result, $request ) {
		if ( 0 === strpos( $request->get_route(), '/' . VuloForm()->rest_namespace . '/public/' ) ) {
			header( 'Access-Control-Allow-Origin: *' );
			header( 'Access-Control-Allow-Methods: GET, POST, OPTIONS' );
			// Core may have sent "Allow-Credentials: true" for the visitor's own origin; with a
			// wildcard origin a browser must not send cookies.
			header_remove( 'Access-Control-Allow-Credentials' );
			header( 'Vary: Origin' );
		}

		return $served;
	}

	/**
	 * A fresh token, so a form on a cached page (or embedded elsewhere) never submits a stale one.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function token( $request ) {
		$form = $this->published( $request );

		if ( is_wp_error( $form ) ) {
			return $form;
		}

		$response = rest_ensure_response( array( 'token' => Token::issue( $form['id'] ) ) );
		$response->header( 'Cache-Control', 'no-store' );

		return $response;
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function submit( $request ) {
		$form = $this->published( $request );

		if ( is_wp_error( $form ) ) {
			return $form;
		}

		$result = VuloForm()->processor->handle( $form, (array) $request->get_body_params(), (array) $request->get_file_params(), get_current_user_id() );

		// The submission id is the site owner's business, not the visitor's.
		unset( $result['submission_id'] );

		$response = rest_ensure_response( $result );
		$response->header( 'Cache-Control', 'no-store' );

		return $response;
	}

	/**
	 * Everything another site needs to show a form: its HTML and where to load its script and
	 * stylesheet from. Only what a visitor to the form's own page would already receive.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function embed( $request ) {
		$form = $this->published( $request );

		if ( is_wp_error( $form ) ) {
			return $form;
		}

		$assets = VuloForm()->plugin_url . 'assets/';

		return rest_ensure_response(
			array(
				'html'   => Renderer::render( $form ),
				'style'  => $assets . 'styles/public/vuloform-form.min.css?ver=' . VULOFORM_PLUGIN_VERSION,
				'script' => $assets . 'js/public/vuloform-form.min.js?ver=' . VULOFORM_PLUGIN_VERSION,
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error A published form. A draft is indistinguishable from a missing form.
	 */
	private function published( $request ) {
		$form = VuloForm()->forms->get( absint( $request['id'] ) );

		return $form && 'published' === $form['status'] ? $form : $this->not_found();
	}
}
