<?php
/**
 * AbstractGateway class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Sms;

use VuloMail\Delivery\Result;
use VuloMail\Security\HttpClient;
use VuloMail\Security\Redactor;

defined( 'ABSPATH' ) || exit;

/**
 * Shared plumbing for HTTP SMS gateways.
 */
abstract class AbstractGateway implements GatewayInterface {

	/**
	 * Connection settings, secrets decrypted.
	 *
	 * @var array
	 */
	protected $config;

	/**
	 * HTTP client.
	 *
	 * @var HttpClient
	 */
	protected $http;

	/**
	 * Constructor.
	 *
	 * @param array      $config Connection settings, secrets decrypted.
	 * @param HttpClient $http   HTTP client.
	 */
	public function __construct( array $config, HttpClient $http ) {
		$this->config = $config;
		$this->http   = $http;
	}

	/**
	 * Trimmed config value.
	 *
	 * @param string $key Config key.
	 * @return string
	 */
	protected function config( $key ) {
		return trim( (string) ( $this->config[ $key ] ?? '' ) );
	}

	/**
	 * Builds a failed Result from a transport error or unexpected response.
	 *
	 * @param array|\WP_Error $response HttpClient::post() return value.
	 * @param string          $code     Gateway error code, if any.
	 * @param string          $detail   Gateway error text, if any.
	 * @return Result
	 */
	protected function failure( $response, $code = '', $detail = '' ) {
		$secrets = array();

		foreach ( static::definition()['fields'] as $field ) {
			if ( ! empty( $field['secret'] ) ) {
				$secrets[] = $this->config( $field['key'] );
			}
		}

		if ( is_wp_error( $response ) ) {
			return Result::fail( 'network_error', Redactor::scrub( $response->get_error_message(), $secrets ) );
		}

		$detail = '' !== $detail ? $detail : substr( $response['body'], 0, 300 );

		return Result::fail(
			'' !== (string) $code ? (string) $code : 'http_' . $response['code'],
			Redactor::scrub(
				sprintf(
					/* translators: 1: HTTP status code, 2: gateway error message. */
					__( 'The gateway rejected the message (HTTP %1$d): %2$s', 'vulomail' ),
					$response['code'],
					$detail
				),
				$secrets
			)
		);
	}
}
