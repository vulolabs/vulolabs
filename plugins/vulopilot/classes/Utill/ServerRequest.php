<?php
/**
 * ServerRequest class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Reads web-server-provided request values (client IP, raw request URI,
 * user agent, server software) that WordPress core has no accessor for,
 * without touching the PHP superglobals directly - the same
 * `filter_input()` convention this plugin already uses for `INPUT_GET`.
 *
 * `filter_input( INPUT_SERVER )` returns null on some FastCGI setups, so
 * `getenv()` is the fallback: both read the SAPI's own request values,
 * so a firewall/login guard never silently sees an empty request.
 *
 * Values from `filter_input()`/`getenv()` are the original, un-slashed
 * SAPI data (unlike the magic-quoted superglobal), so they are
 * sanitized here but never `wp_unslash()`ed.
 *
 * @class       ServerRequest class
 * @version     1.0.0
 * @author      VuloLabs
 */
class ServerRequest {

	/**
	 * Sanitized value of a web-server variable.
	 *
	 * @param string $name Server variable name, e.g. 'REQUEST_URI'.
	 * @return string Sanitized value, or '' if unavailable.
	 */
	public static function get( string $name ): string {
		$value = filter_input( INPUT_SERVER, $name, FILTER_UNSAFE_RAW );

		if ( ! is_string( $value ) || '' === $value ) {
			$value = getenv( $name );
		}

		return is_string( $value ) ? sanitize_text_field( $value ) : '';
	}

	/**
	 * Real client IP - the connecting address only, never a client-supplied
	 * `X-Forwarded-For`-style header, which is trivially spoofable and would
	 * let an attacker blame (or exempt) an arbitrary IP.
	 *
	 * @return string Real IP, or '0.0.0.0' if genuinely unavailable (e.g. CLI context).
	 */
	public static function client_ip(): string {
		$valid = filter_var( self::get( 'REMOTE_ADDR' ), FILTER_VALIDATE_IP );

		return $valid ? $valid : '0.0.0.0';
	}
}
