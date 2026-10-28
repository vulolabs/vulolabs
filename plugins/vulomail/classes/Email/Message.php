<?php
/**
 * Message class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email;

defined( 'ABSPATH' ) || exit;

/**
 * A fully resolved email, independent of how it will be delivered.
 *
 * Addresses are `array{email: string, name: string}`.
 */
class Message {

	/**
	 * Primary recipients.
	 *
	 * @var array<int, array{email: string, name: string}>
	 */
	public $to = array();

	/**
	 * Carbon-copy recipients.
	 *
	 * @var array<int, array{email: string, name: string}>
	 */
	public $cc = array();

	/**
	 * Blind carbon-copy recipients.
	 *
	 * @var array<int, array{email: string, name: string}>
	 */
	public $bcc = array();

	/**
	 * Reply-to addresses.
	 *
	 * @var array<int, array{email: string, name: string}>
	 */
	public $reply_to = array();

	/**
	 * Sender email address.
	 *
	 * @var string
	 */
	public $from_email = '';

	/**
	 * Sender display name.
	 *
	 * @var string
	 */
	public $from_name = '';

	/**
	 * Message subject.
	 *
	 * @var string
	 */
	public $subject = '';

	/**
	 * Message body.
	 *
	 * @var string
	 */
	public $body = '';

	/**
	 * 'text/plain' or 'text/html'.
	 *
	 * @var string
	 */
	public $content_type = 'text/plain';

	/**
	 * Character encoding.
	 *
	 * @var string
	 */
	public $charset = 'UTF-8';

	/**
	 * Extra headers (name => value) that aren't modelled above.
	 *
	 * @var array<string, string>
	 */
	public $headers = array();

	/**
	 * Attachments: file name => absolute path.
	 *
	 * @var array<string, string>
	 */
	public $attachments = array();

	/**
	 * Slug of the plugin or theme that sent the message, for the log.
	 *
	 * @var string
	 */
	public $source = '';

	/**
	 * Open/click tracking applied to this message, set once by Tracking::prepare() so a failover
	 * resends the same tracked copy: `array{token: string, opens: bool, clicks: bool}`, or null when
	 * the message isn't tracked.
	 *
	 * @var array|null
	 */
	public $tracking = null;

	/**
	 * Whether the message body is HTML.
	 *
	 * @return bool
	 */
	public function is_html() {
		return 'text/html' === $this->content_type;
	}

	/**
	 * Formats an address as `Name <email>`.
	 *
	 * @param array{email: string, name: string} $address Address.
	 * @return string
	 */
	public static function format( array $address ) {
		$name = trim( str_replace( array( '"', "\r", "\n", '<', '>' ), '', (string) $address['name'] ) );

		return '' === $name ? $address['email'] : sprintf( '"%s" <%s>', $name, $address['email'] );
	}

	/**
	 * Formats a list of addresses as a comma-separated string.
	 *
	 * @param array<int, array{email: string, name: string}> $addresses Addresses.
	 * @return string Comma-separated `Name <email>` list.
	 */
	public static function format_list( array $addresses ) {
		return implode( ', ', array_map( array( self::class, 'format' ), $addresses ) );
	}

	/**
	 * Every recipient address (To, Cc and Bcc), for the log.
	 *
	 * @return string[]
	 */
	public function all_recipients() {
		return array_column( array_merge( $this->to, $this->cc, $this->bcc ), 'email' );
	}
}
