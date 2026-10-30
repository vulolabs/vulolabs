<?php
/**
 * VuloMail public integration API.
 *
 * These functions are the supported way for other plugins to send through VuloMail. They are
 * versioned by VULOMAIL_API_VERSION and documented in docs/developer/INTEGRATION-API.md. Guard calls with
 * `function_exists( 'vulomail_send_sms' )` so your plugin keeps working without VuloMail.
 *
 * @package VuloMail
 */

defined( 'ABSPATH' ) || exit;

if ( ! function_exists( 'vulomail_api_version' ) ) {
	/**
	 * Version of this API, as "major.minor". The major number changes only on a breaking change.
	 *
	 * @since 1.0.0
	 * @return string
	 */
	function vulomail_api_version() {
		return VULOMAIL_API_VERSION;
	}
}

if ( ! function_exists( 'vulomail_is_email_ready' ) ) {
	/**
	 * Whether VuloMail has a usable email connection and is routing wp_mail() through it.
	 *
	 * @since 1.0.0
	 * @return bool
	 */
	function vulomail_is_email_ready() {
		return isset( VuloMail()->email ) && VuloMail()->email->is_ready();
	}
}

if ( ! function_exists( 'vulomail_is_sms_ready' ) ) {
	/**
	 * Whether VuloMail has a usable SMS connection.
	 *
	 * @since 1.0.0
	 * @return bool
	 */
	function vulomail_is_sms_ready() {
		return isset( VuloMail()->sms ) && VuloMail()->sms->is_ready();
	}
}

if ( ! function_exists( 'vulomail_send_email' ) ) {
	/**
	 * Sends an email.
	 *
	 * This is wp_mail() with a labelled log entry and a real error on failure. With no email
	 * connection configured the message goes out through WordPress's own mailer, so calling this
	 * is always safe.
	 *
	 * @since 1.0.0
	 *
	 * Arguments:
	 * - `to` (string|string[]) Recipient(s). Required.
	 * - `subject` (string) Subject. Required.
	 * - `message` (string) Body. Required.
	 * - `headers` (string|string[]) Optional. Same formats as wp_mail().
	 * - `attachments` (string|string[]) Optional. Absolute file paths.
	 * - `source` (string) Optional. Your plugin's slug, shown in the delivery log.
	 *
	 * @param array $args Email arguments, see above.
	 * @return true|WP_Error
	 */
	function vulomail_send_email( array $args ) {
		if ( empty( $args['to'] ) || ! isset( $args['subject'], $args['message'] ) ) {
			return new WP_Error( 'vulomail_invalid_args', __( 'An email needs "to", "subject" and "message".', 'vulomail' ) );
		}

		$interceptor = VuloMail()->wp_mail;
		$interceptor->set_next_source( isset( $args['source'] ) ? $args['source'] : '' );

		$sent = wp_mail(
			$args['to'],
			(string) $args['subject'],
			(string) $args['message'],
			isset( $args['headers'] ) ? $args['headers'] : '',
			isset( $args['attachments'] ) ? $args['attachments'] : array()
		);

		if ( $sent ) {
			return true;
		}

		$result = $interceptor->last_result();

		return $result && ! $result->success
			? $result->to_wp_error()
			: new WP_Error( 'vulomail_send_failed', __( 'The email could not be sent.', 'vulomail' ) );
	}
}

if ( ! function_exists( 'vulomail_send_sms' ) ) {
	/**
	 * Sends a text message through the site's SMS connection, with failover to the backup.
	 *
	 * @since 1.0.0
	 *
	 * @param string $to      Recipient. International format (+14155550123), or a national number
	 *                        when a default country code is set in VuloMail.
	 * @param string $message Message text. HTML is stripped.
	 * @param array  $args    Optional. `source` (string): your plugin's slug, shown in the delivery log.
	 * @return true|WP_Error
	 */
	function vulomail_send_sms( $to, $message, array $args = array() ) {
		$result = VuloMail()->sms->send( $to, $message, sanitize_key( isset( $args['source'] ) ? (string) $args['source'] : '' ) );

		return $result->success ? true : $result->to_wp_error();
	}
}

if ( ! function_exists( 'vulomail_register_email_template' ) ) {
	/**
	 * Registers an email template, like register_block_type() registers a block. Call it on or after
	 * `init`, or add the template with the `vulomail_email_templates` filter instead.
	 *
	 * @since 1.0.0
	 *
	 * @param string $name Namespaced name, such as `my-plugin/order-shipped`.
	 * @param array  $args Template arguments; see \VuloMail\Templates\Registry.
	 * @return bool False for an invalid name.
	 */
	function vulomail_register_email_template( $name, array $args = array() ) {
		return \VuloMail\Templates\Registry::register( $name, $args );
	}
}
