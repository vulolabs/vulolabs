<?php
/**
 * Utill class file.
 *
 * @package VuloMail
 */

namespace VuloMail;

defined( 'ABSPATH' ) || exit;

/**
 * VuloMail Utill class - shared constants.
 *
 * @class       Utill class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Utill {

	/**
	 * Custom table names, without the `$wpdb->prefix`.
	 *
	 * @var array<string, string>
	 */
	const TABLES = array(
		'log'      => 'vulomail_logs',
		'log_link' => 'vulomail_log_links',
	);

	/**
	 * Option holding every admin-editable setting.
	 */
	const SETTINGS_KEY = 'vulomail_settings';

	/**
	 * Option holding the saved email and SMS connections (secrets encrypted).
	 */
	const CONNECTIONS_KEY = 'vulomail_connections';

	/**
	 * Internal bookkeeping options.
	 *
	 * @var array<string, string>
	 */
	const OTHER_SETTINGS = array(
		'run_installer'     => 'vulomail_run_installer',
		'plugin_db_version' => 'vulomail_plugin_db_version',
		'db_schema_version' => 'vulomail_db_schema_version',
	);

	/**
	 * Capability required for every VuloMail admin screen and REST route.
	 */
	const CAPABILITY = 'manage_options';

	const CHANNEL_EMAIL = 'email';
	const CHANNEL_SMS   = 'sms';

	/**
	 * Shape of random_token(): 128 random bits, hex-encoded.
	 */
	const TOKEN_PATTERN = '/^[a-f0-9]{32}$/';

	/**
	 * An unguessable token for links and one-time states.
	 *
	 * @return string 32 hex characters.
	 */
	public static function random_token() {
		return bin2hex( random_bytes( 16 ) );
	}

	/**
	 * URL-safe base64 without padding (RFC 4648 §5), for values carried in URLs.
	 *
	 * @param string $bytes Raw bytes.
	 * @return string
	 */
	public static function base64url_encode( $bytes ) {
		return rtrim( strtr( base64_encode( (string) $bytes ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- transport encoding, not obfuscation.
	}

	/**
	 * Reverses base64url_encode().
	 *
	 * @param string $encoded URL-safe base64.
	 * @return string|false False when it isn't valid base64.
	 */
	public static function base64url_decode( $encoded ) {
		return base64_decode( strtr( (string) $encoded, '-_', '+/' ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- transport encoding, not obfuscation.
	}

	/**
	 * Formats a stored UTC datetime per Settings → General's date/time format and timezone.
	 *
	 * @param string $utc_datetime UTC `Y-m-d H:i:s`.
	 * @return string
	 */
	public static function format_datetime( $utc_datetime ) {
		$timestamp = strtotime( $utc_datetime . ' UTC' );

		if ( false === $timestamp ) {
			return (string) $utc_datetime;
		}

		return wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $timestamp );
	}

	/**
	 * Adds display-ready `created_at_display`, `created_at_time` and `created_at_day` to log rows.
	 *
	 * @param array $rows Log rows, each with a UTC `created_at`.
	 * @return array
	 */
	public static function with_display_dates( array $rows ) {
		foreach ( $rows as $index => $row ) {
			$timestamp = strtotime( $row['created_at'] . ' UTC' );

			$rows[ $index ]['created_at_display'] = self::format_datetime( (string) $row['created_at'] );
			// For day-grouped lists: time alone, and day as "Today"/"Yesterday"/a date.
			$rows[ $index ]['created_at_time'] = false === $timestamp ? '' : wp_date( get_option( 'time_format' ), $timestamp );
			$rows[ $index ]['created_at_day']  = false === $timestamp ? '' : self::day_label( $timestamp );
		}

		return $rows;
	}

	/**
	 * Names a day relative to today in the site's timezone.
	 *
	 * @param int $timestamp Unix timestamp.
	 * @return string "Today", "Yesterday", or the date in the site's date format.
	 */
	private static function day_label( $timestamp ) {
		$day = wp_date( 'Y-m-d', $timestamp );

		if ( wp_date( 'Y-m-d' ) === $day ) {
			return __( 'Today', 'vulomail' );
		}

		if ( wp_date( 'Y-m-d', time() - DAY_IN_SECONDS ) === $day ) {
			return __( 'Yesterday', 'vulomail' );
		}

		return wp_date( get_option( 'date_format' ), $timestamp );
	}
}
