<?php
/**
 * GatewayInterface file.
 *
 * @package VuloMail
 */

namespace VuloMail\Sms;

use VuloMail\Delivery\Result;

defined( 'ABSPATH' ) || exit;

/**
 * Contract for an SMS gateway adapter.
 *
 * Adapters are constructed with `( array $config, \VuloMail\Security\HttpClient $http )`, where
 * $config holds the connection's settings with secrets already decrypted.
 */
interface GatewayInterface {

	/**
	 * Gateway and connection form field descriptions. Same shape as
	 * VuloMail\Email\MailerInterface::definition().
	 *
	 * @return array
	 */
	public static function definition();

	/**
	 * Sends one text message. Must not throw: failures return as a failed Result
	 * whose message contains no credentials.
	 *
	 * @param string $to   Recipient, E.164, e.g. +14155550123.
	 * @param string $body Message text.
	 * @return Result
	 */
	public function send( $to, $body );
}
