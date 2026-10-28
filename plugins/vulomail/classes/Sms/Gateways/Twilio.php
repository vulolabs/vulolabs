<?php
/**
 * Twilio gateway class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Sms\Gateways;

use VuloMail\Delivery\Result;
use VuloMail\Sms\AbstractGateway;

defined( 'ABSPATH' ) || exit;

/**
 * Twilio Programmable Messaging.
 */
class Twilio extends AbstractGateway {

	const ENDPOINT = 'https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json';

	/**
	 * Gateway and connection field descriptions.
	 *
	 * @return array
	 */
	public static function definition() {
		return array(
			'label'  => __( 'Twilio', 'vulomail' ),
			'desc'   => __( 'Twilio Programmable Messaging.', 'vulomail' ),
			'fields' => array(
				array(
					'key'      => 'account_sid',
					'label'    => __( 'Account SID', 'vulomail' ),
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
					'help'     => __( 'A Twilio phone number (+14155550123), an alphanumeric sender ID, or a Messaging Service SID (MG…).', 'vulomail' ),
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
		$sid = $this->config( 'account_sid' );

		// SID becomes part of the request path.
		if ( ! preg_match( '/^AC[0-9a-fA-F]{32}$/', $sid ) ) {
			return Result::fail( 'invalid_account_sid', __( 'The Twilio Account SID should start with "AC" followed by 32 characters.', 'vulomail' ) );
		}

		$from   = $this->config( 'from' );
		$fields = array(
			'To'   => $to,
			'Body' => $body,
		);

		$sender_field            = 0 === strpos( $from, 'MG' ) ? 'MessagingServiceSid' : 'From';
		$fields[ $sender_field ] = $from;

		$response = $this->http->post(
			sprintf( self::ENDPOINT, $sid ),
			array(
				'Authorization' => 'Basic ' . base64_encode( $sid . ':' . $this->config( 'auth_token' ) ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- HTTP Basic auth.
			),
			$fields
		);

		if ( is_wp_error( $response ) || 201 !== $response['code'] ) {
			return $this->failure(
				$response,
				is_wp_error( $response ) ? '' : (string) ( $response['json']['code'] ?? '' ),
				is_wp_error( $response ) ? '' : (string) ( $response['json']['message'] ?? '' )
			);
		}

		return Result::ok( $response['json']['sid'] ?? '' );
	}
}
