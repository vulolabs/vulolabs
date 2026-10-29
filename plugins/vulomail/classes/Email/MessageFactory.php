<?php
/**
 * MessageFactory class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email;

use VuloMail\Settings\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Turns wp_mail() arguments into a Message, resolving headers and defaults the way core does so the message looks the same whichever connection delivers it.
 */
class MessageFactory {

	/**
	 * Plugin settings (sender overrides).
	 *
	 * @var Settings
	 */
	private $settings;

	/**
	 * Constructor.
	 *
	 * @param Settings $settings Plugin settings (sender overrides).
	 */
	public function __construct( Settings $settings ) {
		$this->settings = $settings;
	}

	/**
	 * Build a Message from wp_mail() arguments.
	 *
	 * @param array $atts wp_mail() arguments: to, subject, message, headers, attachments.
	 * @return Message
	 */
	public function from_wp_mail( array $atts ) {
		$message          = new Message();
		$message->to      = self::parse_addresses( $atts['to'] ?? array() );
		$message->subject = (string) ( $atts['subject'] ?? '' );
		$message->body    = (string) ( $atts['message'] ?? '' );

		$from_email   = '';
		$from_name    = '';
		$content_type = '';
		$charset      = '';

		foreach ( self::split_headers( $atts['headers'] ?? array() ) as $name => $values ) {
			foreach ( $values as $value ) {
				switch ( strtolower( $name ) ) {
					case 'from':
						$from = self::parse_addresses( $value );

						if ( $from ) {
							$from_email = $from[0]['email'];
							$from_name  = $from[0]['name'];
						}
						break;

					case 'content-type':
						$parts        = array_map( 'trim', explode( ';', $value ) );
						$content_type = strtolower( (string) array_shift( $parts ) );

						foreach ( $parts as $part ) {
							if ( 0 === stripos( $part, 'charset=' ) ) {
								$charset = trim( substr( $part, 8 ), " \t\"'" );
							}
						}
						break;

					case 'cc':
						$message->cc = array_merge( $message->cc, self::parse_addresses( $value ) );
						break;

					case 'bcc':
						$message->bcc = array_merge( $message->bcc, self::parse_addresses( $value ) );
						break;

					case 'reply-to':
						$message->reply_to = array_merge( $message->reply_to, self::parse_addresses( $value ) );
						break;

					case 'mime-version':
					case 'x-mailer':
						// Set by the transport.
						break;

					default:
						$message->headers[ $name ] = $value;
				}
			}
		}

		// Core's defaults and filters, in core's order.
		$from_email = (string) apply_filters( 'wp_mail_from', '' === $from_email ? self::default_from_email() : $from_email ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core hook, applied for parity with wp_mail().
		$from_name  = (string) apply_filters( 'wp_mail_from_name', '' === $from_name ? 'WordPress' : $from_name ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound

		$from_email = $this->resolve_from_email( $from_email );
		$from_name  = $this->resolve_from_name( $from_name );

		$message->from_email = $from_email;
		$message->from_name  = trim( preg_replace( '/[\r\n]+/', ' ', $from_name ) );

		$content_type = (string) apply_filters( 'wp_mail_content_type', '' === $content_type ? 'text/plain' : $content_type ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound

		$message->content_type = strtolower( trim( $content_type ) );
		$message->charset      = (string) apply_filters( 'wp_mail_charset', '' === $charset ? get_bloginfo( 'charset' ) : $charset ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound

		$message->attachments = self::parse_attachments( $atts['attachments'] ?? array() );

		return $message;
	}

	/**
	 * Applies the configured sender address: always when forced, else only in place of core's default (or an invalid one).
	 *
	 * @param string $from_email Address resolved so far.
	 * @return string
	 */
	public function resolve_from_email( $from_email ) {
		$configured = (string) $this->settings->get( 'from_email' );

		if ( '' !== $configured && ( $this->settings->get( 'force_from_email' ) || self::default_from_email() === $from_email || ! is_email( $from_email ) ) ) {
			return $configured;
		}

		return $from_email;
	}

	/**
	 * Applies the configured sender name: always when forced, else only in place of core's default.
	 *
	 * @param string $from_name Name resolved so far.
	 * @return string
	 */
	public function resolve_from_name( $from_name ) {
		$configured = (string) $this->settings->get( 'from_name' );

		if ( '' !== $configured && ( $this->settings->get( 'force_from_name' ) || 'WordPress' === $from_name ) ) {
			return $configured;
		}

		return $from_name;
	}

	/**
	 * Core's fallback sender: wordpress@ the site's host.
	 *
	 * @return string
	 */
	public static function default_from_email() {
		$host = (string) wp_parse_url( network_home_url(), PHP_URL_HOST );

		if ( 0 === strpos( $host, 'www.' ) ) {
			$host = substr( $host, 4 );
		}

		return 'wordpress@' . ( '' !== $host ? $host : 'localhost' );
	}

	/**
	 * Parses `a@b.c`, `Name <a@b.c>`, a comma-separated string of those, or an array. Drops invalid ones.
	 *
	 * @param string|array $input Address input.
	 * @return array<int, array{email: string, name: string}>
	 */
	public static function parse_addresses( $input ) {
		if ( ! is_array( $input ) ) {
			// Split on commas that aren't inside a quoted display name.
			$input = preg_split( '/,(?=(?:[^"]*"[^"]*")*[^"]*$)/', (string) $input );
		}

		$addresses = array();

		foreach ( $input as $entry ) {
			$entry = trim( (string) $entry );
			$name  = '';

			if ( preg_match( '/^(.*)<([^<>]+)>$/', $entry, $matches ) ) {
				$name  = trim( $matches[1], " \t\"'" );
				$entry = trim( $matches[2] );
			}

			// Injection guard: address/name must never span lines.
			if ( '' === $entry || preg_match( '/[\r\n]/', $entry . $name ) || ! is_email( $entry ) ) {
				continue;
			}

			$addresses[] = array(
				'email' => $entry,
				'name'  => $name,
			);
		}

		return $addresses;
	}

	/**
	 * Parse wp_mail() headers into a name => values map.
	 *
	 * @param string|array $headers wp_mail() headers.
	 * @return array<string, string[]> Header name => values, names as first written.
	 */
	private static function split_headers( $headers ) {
		if ( ! is_array( $headers ) ) {
			$headers = explode( "\n", str_replace( "\r\n", "\n", (string) $headers ) );
		}

		$parsed = array();

		foreach ( $headers as $key => $header ) {
			// Associative form: array( 'Reply-To' => 'a@b.c' ).
			if ( is_string( $key ) ) {
				$header = $key . ': ' . ( is_array( $header ) ? implode( ', ', $header ) : $header );
			}

			$header = trim( (string) $header );

			if ( false === strpos( $header, ':' ) ) {
				continue;
			}

			list( $name, $value ) = explode( ':', $header, 2 );

			$name  = trim( $name );
			$value = trim( $value );

			// Header name must be a token; anything else is malformed or an injection attempt.
			if ( ! preg_match( '/^[A-Za-z0-9\-]+$/', $name ) || preg_match( '/[\r\n]/', $value ) ) {
				continue;
			}

			$parsed[ $name ][] = $value;
		}

		return $parsed;
	}

	/**
	 * Parse wp_mail() attachments into a file name => path map.
	 *
	 * @param string|array $attachments wp_mail() attachments.
	 * @return array<string, string> File name => readable absolute path.
	 */
	private static function parse_attachments( $attachments ) {
		if ( ! is_array( $attachments ) ) {
			$attachments = explode( "\n", str_replace( "\r\n", "\n", (string) $attachments ) );
		}

		$files = array();

		foreach ( $attachments as $name => $path ) {
			$path = trim( (string) $path );

			if ( '' === $path || ! is_file( $path ) || ! is_readable( $path ) ) {
				continue;
			}

			$name = is_string( $name ) && '' !== trim( $name ) ? sanitize_file_name( $name ) : basename( $path );

			// Two attachments with one name: keep both.
			$unique = $name;
			$index  = 1;

			while ( isset( $files[ $unique ] ) ) {
				$unique = $index . '-' . $name;
				++$index;
			}

			$files[ $unique ] = $path;
		}

		return $files;
	}
}
