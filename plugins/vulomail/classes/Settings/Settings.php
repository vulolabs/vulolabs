<?php
/**
 * Settings class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Settings;

use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Reads, validates and stores the single `vulomail_settings` option.
 *
 * Every key has a default and a type, and anything not listed in DEFAULTS is dropped on save.
 */
class Settings {

	/**
	 * Default value for every known setting key.
	 *
	 * @var array<string, mixed>
	 */
	const DEFAULTS = array(
		// Email.
		'email_enabled'       => true,
		'from_email'          => '',
		'from_name'           => '',
		'force_from_email'    => false,
		'force_from_name'     => false,
		'email_primary'       => '',
		'email_backup'        => '',
		'fallback_to_default' => true,
		// SMS.
		'sms_enabled'         => true,
		'sms_primary'         => '',
		'sms_backup'          => '',
		'sms_country_code'    => '',
		'sms_admin_phone'     => '',
		'sms_triggers'        => array(),
		// Logging.
		'log_enabled'         => true,
		'log_content'         => false,
		'mask_recipients'     => false,
		'log_retention_days'  => 30,
		// Engagement tracking. Both need the log, and both stay off until the site owner opts in.
		'track_opens'         => false,
		'track_clicks'        => false,
		// Data.
		'keep_data_uninstall' => 'keep_data',
	);

	/**
	 * Cached merged settings.
	 *
	 * @var array|null
	 */
	private $cache = null;

	/**
	 * Get every setting, merged with its defaults.
	 *
	 * @return array<string, mixed>
	 */
	public function all() {
		if ( null === $this->cache ) {
			$stored      = get_option( Utill::SETTINGS_KEY, array() );
			$this->cache = array_merge( self::DEFAULTS, array_intersect_key( is_array( $stored ) ? $stored : array(), self::DEFAULTS ) );
		}

		return $this->cache;
	}

	/**
	 * Get one setting value.
	 *
	 * @param string $key Setting key.
	 * @return mixed
	 */
	public function get( $key ) {
		$all = $this->all();

		return $all[ $key ] ?? null;
	}

	/**
	 * Merges validated values into the stored settings.
	 *
	 * @param array $input Raw values, typically a REST request body.
	 * @return array<string, mixed> The full settings after the update.
	 */
	public function update( array $input ) {
		$settings = $this->all();

		foreach ( $input as $key => $value ) {
			if ( array_key_exists( $key, self::DEFAULTS ) ) {
				$settings[ $key ] = $this->sanitize( $key, $value );
			}
		}

		update_option( Utill::SETTINGS_KEY, $settings, false );
		$this->cache = $settings;

		return $settings;
	}

	/**
	 * Sanitize a raw value for a given setting key.
	 *
	 * @param string $key   Setting key.
	 * @param mixed  $value Raw value.
	 * @return mixed
	 */
	private function sanitize( $key, $value ) {
		switch ( $key ) {
			case 'from_email':
				$email = sanitize_email( (string) $value );

				return is_email( $email ) ? $email : '';

			case 'from_name':
				// Line breaks would allow header injection through the From header.
				return trim( preg_replace( '/[\r\n]+/', ' ', sanitize_text_field( (string) $value ) ) );

			case 'email_primary':
			case 'email_backup':
			case 'sms_primary':
			case 'sms_backup':
				return sanitize_key( (string) $value );

			case 'sms_country_code':
				return substr( preg_replace( '/\D/', '', (string) $value ), 0, 4 );

			case 'sms_admin_phone':
				return substr( preg_replace( '/[^\d+]/', '', (string) $value ), 0, 20 );

			case 'log_retention_days':
				return max( 0, min( 3650, (int) $value ) );

			case 'keep_data_uninstall':
				return 'delete_everything' === $value ? 'delete_everything' : 'keep_data';

			case 'sms_triggers':
				$clean = array();

				foreach ( is_array( $value ) ? $value : array() as $id => $trigger ) {
					$clean[ sanitize_key( (string) $id ) ] = array(
						'enabled'  => ! empty( $trigger['enabled'] ),
						'template' => sanitize_textarea_field( (string) ( $trigger['template'] ?? '' ) ),
					);
				}

				return $clean;

			default:
				return (bool) $value;
		}
	}
}
