<?php
/**
 * HttpClient class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Security;

defined( 'ABSPATH' ) || exit;

/**
 * The one place provider adapters make outbound HTTP requests from. HTTPS-only, never follows redirects
 * (would forward the credential to another host), and goes through wp_safe_remote_request() so private/loopback addresses are refused.
 */
class HttpClient {

	/**
	 * Sends a POST request.
	 *
	 * @param string       $url     HTTPS endpoint.
	 * @param array        $headers Request headers.
	 * @param array|string $body    Form fields (array) or a raw body (string).
	 * @return array|\WP_Error {
	 *     @type int    $code    HTTP status code.
	 *     @type string $body    Raw response body.
	 *     @type array  $json    Decoded JSON body, or an empty array.
	 *     @type array  $headers Response headers, lower-cased names.
	 * }
	 */
	public function post( $url, array $headers, $body ) {
		if ( 'https' !== wp_parse_url( $url, PHP_URL_SCHEME ) ) {
			return new \WP_Error( 'vulomail_insecure_endpoint', __( 'Provider endpoints must use HTTPS.', 'vulomail' ) );
		}

		$response = wp_safe_remote_request(
			$url,
			array(
				'method'      => 'POST',
				'timeout'     => (int) apply_filters( 'vulomail_http_timeout', 15 ),
				'redirection' => 0,
				'headers'     => $headers,
				'body'        => $body,
				'user-agent'  => 'VuloMail/' . VULOMAIL_PLUGIN_VERSION . '; ' . home_url( '/' ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$raw     = (string) wp_remote_retrieve_body( $response );
		$decoded = json_decode( $raw, true );
		$headers = array();

		foreach ( wp_remote_retrieve_headers( $response ) as $name => $value ) {
			$headers[ strtolower( (string) $name ) ] = is_array( $value ) ? implode( ', ', $value ) : (string) $value;
		}

		return array(
			'code'    => (int) wp_remote_retrieve_response_code( $response ),
			'body'    => $raw,
			'json'    => is_array( $decoded ) ? $decoded : array(),
			'headers' => $headers,
		);
	}
}
