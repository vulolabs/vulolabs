<?php
namespace VuloPilot\AiAssistant;

defined( 'ABSPATH' ) || exit;

/**
 * Handles the Connect broker's real redirect back to this site
 * (`admin-post.php?action=vulopilot_connect_broker_callback` -
 * AiCreditsConnection::get_broker_redirect_uri()'s own exact URL). Kept as
 * its own tiny class for the same reason GoogleSearchConsoleOAuthCallbackHandler
 * is: this hook must be registered unconditionally at plugin boot
 * (VuloPilot.php's init_classes()), not lazily inside a REST controller
 * that's only ever instantiated on `rest_api_init` - a request to
 * `admin-post.php` never fires that hook at all, so a REST-controller-only
 * registration would silently 404 every real return redirect.
 *
 * @class       ConnectBrokerCallbackHandler class
 * @version     1.0.0
 * @author      VuloLabs
 */
class ConnectBrokerCallbackHandler {

	public function __construct() {
		add_action( 'admin_post_vulopilot_connect_broker_callback', array( $this, 'handle_callback' ) );
	}

	/**
	 * Verifies the real `state` nonce, exchanges the real `code` for a
	 * ConnectedSite credential (AiCreditsConnection::exchange_broker_code()),
	 * then redirects back to Settings → Integrations with a real
	 * success/error query flag. Never renders its own page, same
	 * "redirect back into the SPA" shape GoogleSearchConsoleOAuthCallbackHandler
	 * already uses.
	 *
	 * @return void
	 */
	public function handle_callback(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'vulopilot' ) );
		}

		$redirect_base = admin_url( 'admin.php?page=vulopilot#&tab=settings&subtab=integrations' );
		$connection    = new AiCreditsConnection();

		// `state` is the nonce this flow put on the authorize URL; nothing else in
		// the request is read until it checks out.
		if ( ! isset( $_GET['state'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['state'] ) ), 'vulopilot_connect_broker' ) ) {
			wp_safe_redirect( $redirect_base . '&connect_status=error' );
			exit;
		}

		$error = isset( $_GET['error'] ) ? sanitize_text_field( wp_unslash( $_GET['error'] ) ) : '';
		$code  = isset( $_GET['code'] ) ? sanitize_text_field( wp_unslash( $_GET['code'] ) ) : '';

		if ( '' !== $error || '' === $code ) {
			wp_safe_redirect( $redirect_base . '&connect_status=error' );
			exit;
		}

		$result = $connection->exchange_broker_code( $code );

		wp_safe_redirect( $redirect_base . '&connect_status=' . ( is_wp_error( $result ) ? 'error' : 'connected' ) );
		exit;
	}
}
