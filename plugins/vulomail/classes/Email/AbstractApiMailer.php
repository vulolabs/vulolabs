<?php
/**
 * AbstractApiMailer class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email;

use VuloMail\Delivery\Result;
use VuloMail\Security\HttpClient;
use VuloMail\Security\Redactor;

defined( 'ABSPATH' ) || exit;

/**
 * Shared plumbing for HTTP API email providers.
 */
abstract class AbstractApiMailer implements MailerInterface {

	/**
	 * Max total attachment payload per request (most providers cap near here).
	 */
	const MAX_ATTACHMENT_BYTES = 20971520;

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
	 * Reads the message's attachments.
	 *
	 * @param Message $message Message.
	 * @return array<int, array{name: string, content: string, type: string}>|\WP_Error
	 */
	protected function read_attachments( Message $message ) {
		$files = array();
		$total = 0;

		foreach ( $message->attachments as $name => $path ) {
			$content = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local attachment path already validated by MessageFactory.

			if ( false === $content ) {
				continue;
			}

			$total += strlen( $content );

			if ( $total > self::MAX_ATTACHMENT_BYTES ) {
				return new \WP_Error( 'vulomail_attachments_too_large', __( 'The attachments are too large to send through this provider.', 'vulomail' ) );
			}

			$type = wp_check_filetype( $name );

			$files[] = array(
				'name'    => $name,
				'content' => $content,
				'type'    => $type['type'] ? $type['type'] : 'application/octet-stream',
			);
		}

		return $files;
	}

	/**
	 * Builds a failed Result from a transport error or bad HTTP response.
	 *
	 * @param array|\WP_Error $response HttpClient::post() return value.
	 * @param string          $detail   Provider's own error text, if extracted.
	 * @return Result
	 */
	protected function failure( $response, $detail = '' ) {
		if ( is_wp_error( $response ) ) {
			return Result::fail( 'network_error', Redactor::scrub( $response->get_error_message(), $this->secrets() ) );
		}

		$detail = '' !== $detail ? $detail : substr( $response['body'], 0, 300 );

		return Result::fail(
			'http_' . $response['code'],
			Redactor::scrub(
				sprintf(
					/* translators: 1: HTTP status code, 2: provider error message. */
					__( 'The provider rejected the message (HTTP %1$d): %2$s', 'vulomail' ),
					$response['code'],
					$detail
				),
				$this->secrets()
			)
		);
	}

	/**
	 * Secret config values, scrubbed from error text.
	 *
	 * @return string[]
	 */
	protected function secrets() {
		$secrets = array();

		foreach ( static::definition()['fields'] as $field ) {
			if ( ! empty( $field['secret'] ) ) {
				$secrets[] = $this->config( $field['key'] );
			}
		}

		return $secrets;
	}
}
