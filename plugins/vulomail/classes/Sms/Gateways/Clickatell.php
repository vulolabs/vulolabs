<?php
/**
 * Clickatell gateway class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Sms\Gateways;

use VuloMail\Delivery\Result;
use VuloMail\Sms\AbstractGateway;

defined( 'ABSPATH' ) || exit;

/**
 * Clickatell Platform (One API) messaging.
 */
class Clickatell extends AbstractGateway {

	const ENDPOINT = 'https://platform.clickatell.com/messages';

	/**
	 * Gateway and connection field descriptions.
	 *
	 * @return array
	 */
	public static function definition() {
		return array(
			'label'  => __( 'Clickatell', 'vulomail' ),
			'desc'   => __( 'Clickatell Platform SMS API.', 'vulomail' ),
			'fields' => array(
				array(
					'key'      => 'api_key',
					'label'    => __( 'API key', 'vulomail' ),
					'type'     => 'password',
					'secret'   => true,
					'required' => true,
				),
				array(
					'key'   => 'from',
					'label' => __( 'Sender (optional)', 'vulomail' ),
					'type'  => 'text',
					'help'  => __( 'Only needed for two-way integrations; leave blank otherwise.', 'vulomail' ),
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
		$payload = array(
			'to'      => array( ltrim( $to, '+' ) ),
			'content' => $body,
		);

		if ( '' !== $this->config( 'from' ) ) {
			$payload['from'] = ltrim( $this->config( 'from' ), '+' );
		}

		$response = $this->http->post(
			self::ENDPOINT,
			array(
				'Authorization' => $this->config( 'api_key' ),
				'Content-Type'  => 'application/json',
				'Accept'        => 'application/json',
			),
			wp_json_encode( $payload )
		);

		if ( is_wp_error( $response ) || 202 !== $response['code'] ) {
			return $this->failure(
				$response,
				is_wp_error( $response ) ? '' : (string) ( $response['json']['errorCode'] ?? $response['json']['error']['code'] ?? '' ),
				is_wp_error( $response ) ? '' : (string) ( $response['json']['errorDescription'] ?? $response['json']['error']['description'] ?? '' )
			);
		}

		$first = $response['json']['messages'][0] ?? array();

		// 202 can still carry a per-message rejection.
		if ( isset( $first['accepted'] ) && ! $first['accepted'] ) {
			return $this->failure( $response, (string) ( $first['errorCode'] ?? 'rejected' ), (string) ( $first['errorDescription'] ?? $first['error'] ?? '' ) );
		}

		return Result::ok( $first['apiMessageId'] ?? '' );
	}
}
