<?php
/**
 * VuloMail public integration API.
 *
 * Supported way for other plugins to send through VuloMail. Versioned by VULOMAIL_API_VERSION, documented in
 * docs/developer/INTEGRATION-API.md. Guard calls with `function_exists( 'vulomail_send_sms' )`.
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
	 * This is wp_mail() with a labelled log entry and a real error on failure; with no email connection configured it goes out through WordPress's own mailer, so calling this is always safe.
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
	 * @param string $to      Recipient. International format (+14155550123), or national with a default country code set.
	 * @param string $message Message text. HTML is stripped.
	 * @param array  $args    Optional. `source` (string): your plugin's slug, shown in the delivery log.
	 * @return true|WP_Error
	 */
	function vulomail_send_sms( $to, $message, array $args = array() ) {
		$result = VuloMail()->sms->send( $to, $message, sanitize_key( isset( $args['source'] ) ? (string) $args['source'] : '' ) );

		return $result->success ? true : $result->to_wp_error();
	}
}

if ( ! function_exists( 'vulomail_get_template_edit_url' ) ) {
	/**
	 * The admin URL to edit a registered email template in VuloMail's own Email Customizer. Keeps
	 * knowledge of VuloMail's admin page/tab/query-arg structure in one place rather than each
	 * consumer (CatalogX, ...) hardcoding `admin.php?page=vulomail#&tab=email-templates&template=`
	 * itself.
	 *
	 * @since 1.1.0
	 *
	 * @param string $name `plugin/name` registered via `vulomail_register_email_template()`.
	 * @return string
	 */
	function vulomail_get_template_edit_url( $name ) {
		return admin_url( 'admin.php?page=vulomail#&tab=email-templates&template=' . $name );
	}
}

if ( ! function_exists( 'vulomail_register_email_template' ) ) {
	function vulomail_register_email_template( $name, array $args = array() ) {
		return \VuloMail\Templates\Registry::register( $name, $args );
	}
}

if ( ! function_exists( 'vulomail_substitute_tags' ) ) {
	/**
	 * Fills `{tag}` placeholders into a template registered via `vulomail_email_templates` (or any
	 * other string). Several VuloLabs plugins (CatalogX, MultiVendorX, Notifima, ...) send their
	 * own transactional email with their own subject/content and only hand the final string to
	 * `vulomail_send_email()` -- each one used to carry its own copy of this substitution, and
	 * they'd quietly drifted apart (one used case-sensitive `strtr()`, so a template edited in
	 * VuloMail's own editor with different tag casing silently kept the literal `{TAG}` text).
	 * This is the one substitution path all of them should call instead.
	 *
	 * @since 1.1.0
	 *
	 * @param string $text           Subject or content, `{tag}` placeholders intact.
	 * @param array  $tags           `{tag}` => replacement value.
	 * @param bool   $strip_newlines True for a subject line. A tag's value can come from an
	 *                               unauthenticated form submission (e.g. an enquiry form's
	 *                               name/email); CR/LF there becomes a real extra mail header once
	 *                               PHPMailer/wp_mail parses it, so it's stripped before the value
	 *                               ever lands in a subject. (The caller is still responsible for
	 *                               validating/newline-stripping anything it puts directly into a
	 *                               `headers` argument itself, e.g. a Reply-To built from submitter
	 *                               input.)
	 * @return string
	 */
	function vulomail_substitute_tags( $text, array $tags, $strip_newlines = false ) {
		if ( $strip_newlines ) {
			$tags = array_map(
				static function ( $value ) {
					return str_replace( array( "\r", "\n" ), ' ', (string) $value );
				},
				$tags
			);
		}

		// Case-insensitive: once a template's content/subject is edited in VuloMail's own editor,
		// its tags are whatever casing was typed/pasted there (e.g. a generic "{PRODUCT_NAME}"
		// placeholder), not necessarily the exact lowercase `{product_name}` the registering plugin
		// uses. A case-sensitive replace silently leaves an unmatched tag as literal text instead
		// of the real value.
		return str_ireplace( array_keys( $tags ), array_values( $tags ), (string) $text );
	}
}
