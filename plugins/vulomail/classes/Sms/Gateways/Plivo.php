<?php
/**
 * Plivo gateway class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Sms\Gateways;

use VuloMail\Delivery\Result;
use VuloMail\Sms\AbstractGateway;

defined( 'ABSPATH' ) || exit;

/**
 * Plivo Message API.
 */
class Plivo extends AbstractGateway {

	const ENDPOINT = 'https://api.plivo.com/v1/Account/%s/Message/';

	/**
	 * Gateway and connection field descriptions.
	 *
	 * @return array
	 */
	public static function definition() {
		return array(
			'label'  => __( 'Plivo', 'vulomail' ),
			'desc'   => __( 'Plivo Message API.', 'vulomail' ),
			'fields' => array(
				array(
					'key'      => 'auth_id',
					'label'    => __( 'Auth ID', 'vulomail' ),
					'type'     => 'text',
					'required' => true,
				),
				array(
					'key'      => 'auth_token',
					'label'    => __( 'Auth token', 'vulomail' ),
					'type'     => 'password',
					'secret'   => true,
					'required' => true,
				),
				array(
					'key'      => 'from',
					'label'    => __( 'Sender', 'vulomail' ),
					'type'     => 'text',
					'required' => true,
					'help'     => __( 'A Plivo number or an alphanumeric sender ID.', 'vulomail' ),
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
		$auth_id = $this->config( 'auth_id' );

		// Auth ID becomes part of the request path.
		if ( ! preg_match( '/^[A-Za-z0-9]{10,40}$/', $auth_id ) ) {
			return Result::fail( 'invalid_auth_id', __( 'The Plivo Auth ID is not valid.', 'vulomail' ) );
		}

		$response = $this->http->post(
			sprintf( self::ENDPOINT, $auth_id ),
			array(
				'Authorization' => 'Basic ' . base64_encode( $auth_id . ':' . $this->config( 'auth_token' ) ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- HTTP Basic auth.
				'Content-Type'  => 'application/json',
			),
			wp_json_encode(
				array(
					'src'  => ltrim( $this->config( 'from' ), '+' ),
					'dst'  => ltrim( $to, '+' ),
					'text' => $body,
				)
			)
		);

		if ( is_wp_error( $response ) || 202 !== $response['code'] ) {
			return $this->failure( $response, '', is_wp_error( $response ) ? '' : (string) ( $response['json']['error'] ?? '' ) );
		}

		return Result::ok( $response['json']['message_uuid'][0] ?? '' );
	}
}
