<?php
/**
 * MailerInterface file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email;

use VuloMail\Delivery\Result;

defined( 'ABSPATH' ) || exit;

/**
 * Contract for an email provider adapter.
 *
 * Adapters are constructed with `( array $config, \VuloMail\Security\HttpClient $http )`, where
 * $config holds the connection's settings with secrets already decrypted.
 */
interface MailerInterface {

	/**
	 * Describes the provider and the fields its connection form needs.
	 *
	 * @return array {
	 *     @type string $label  Provider name.
	 *     @type string $desc   One-line description.
	 *     @type array  $fields Each: key, label, type (text|password|number|select|toggle), and
	 *                          optionally required, secret, default, options, help, show_if.
	 * }
	 */
	public static function definition();

	/**
	 * Sends one message. Must not throw: failures return as a failed Result with no credentials in it.
	 *
	 * @param Message $message Message to send.
	 * @return Result
	 */
	public function send( Message $message );
}
