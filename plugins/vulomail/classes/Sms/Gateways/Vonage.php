<?php
/**
 * Vonage gateway class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Sms\Gateways;

use VuloMail\Delivery\Result;
use VuloMail\Sms\AbstractGateway;

defined( 'ABSPATH' ) || exit;

/**
 * Vonage (formerly Nexmo) SMS API.
 */
class Vonage extends AbstractGateway {

	const ENDPOINT = 'https://rest.nexmo.com/sms/json';

	/**
	 * Gateway and connection field descriptions.
	 *
	 * @return array
	 */
	public static function definition() {
		return array(
			'label'  => __( 'Vonage', 'vulomail' ),
			'desc'   => __( 'Vonage (formerly Nexmo) SMS API.', 'vulomail' ),
			'fields' => array(
				array(
					'key'      => 'api_key',
					'label'    => __( 'API key', 'vulomail' ),
					'type'     => 'text',
					'required' => true,
				),
				array(
					'key'      => 'api_secret',
					'label'    => __( 'API secret', 'vulomail' ),
					'type'     => 'password',
					'secret'   => true,
					'required' => true,
				),
				array(
					'key'      => 'from',
					'label'    => __( 'Sender', 'vulomail' ),
					'type'     => 'text',
					'required' => true,
					'help'     => __( 'A Vonage number or an alphanumeric sender ID (up to 11 characters).', 'vulomail' ),
				),
			),
		);
	}

	/**
	 * Sends one text message.
	 *
	 * @param string $to   Recipient, E.164.
	 * @param string $body Message text.
	 * @return Result
	 */
	public function send( $to, $body ) {
		$fields = array(
			'api_key'    => $this->config( 'api_key' ),
			'api_secret' => $this->config( 'api_secret' ),
			'from'       => ltrim( $this->config( 'from' ), '+' ),
			'to'         => ltrim( $to, '+' ),
			'text'       => $body,
		);

		// Needed, or non-Latin text arrives as question marks.
		if ( preg_match( '/[^\x00-\x7F]/', $body ) ) {
			$fields['type'] = 'unicode';
		}

		$response = $this->http->post( self::ENDPOINT, array(), $fields );

		if ( is_wp_error( $response ) || 200 !== $response['code'] ) {
			return $this->failure( $response );
		}

		$first = $response['json']['messages'][0] ?? null;

		// Vonage returns HTTP 200 even for rejections; per-message status is what counts.
		if ( ! is_array( $first ) || ! isset( $first['status'] ) ) {
			return $this->failure( $response, 'invalid_response', __( 'Unexpected response from Vonage.', 'vulomail' ) );
		}

		if ( '0' !== (string) $first['status'] ) {
			return $this->failure( $response, 'vonage_' . $first['status'], (string) ( $first['error-text'] ?? '' ) );
		}

		return Result::ok( $first['message-id'] ?? '' );
	}
}
