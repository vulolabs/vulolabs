<?php
/**
 * ConnectionRepository class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Connections;

use VuloMail\Security\Secrets;
use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Stores the site's email and SMS connections in one option, with secret fields encrypted.
 */
class ConnectionRepository {

	/**
	 * Credential encryption.
	 *
	 * @var Secrets
	 */
	private $secrets;

	/**
	 * Provider definitions.
	 *
	 * @var ProviderRegistry
	 */
	private $providers;

	/**
	 * Constructor.
	 *
	 * @param Secrets          $secrets   Credential encryption.
	 * @param ProviderRegistry $providers Provider definitions.
	 */
	public function __construct( Secrets $secrets, ProviderRegistry $providers ) {
		$this->secrets   = $secrets;
		$this->providers = $providers;
	}

	/**
	 * Get every stored connection.
	 *
	 * @return array<string, array> Connection id => stored record (secrets still encrypted).
	 */
	public function all() {
		$stored = get_option( Utill::CONNECTIONS_KEY, array() );

		return is_array( $stored ) ? $stored : array();
	}

	/**
	 * Get one connection by id.
	 *
	 * @param string $id Connection id.
	 * @return array|null Stored record.
	 */
	public function get( $id ) {
		$all = $this->all();

		return isset( $all[ $id ] ) ? $all[ $id ] : null;
	}

	/**
	 * Returns a connection's settings with secrets decrypted, ready to hand to an adapter.
	 *
	 * @param array $connection Stored record.
	 * @return array
	 */
	public function config( array $connection ) {
		$definition = $this->providers->definition( $connection['channel'], $connection['provider'] );
		$config     = $connection['settings'] ?? array();

		foreach ( $definition ? $definition['fields'] : array() as $field ) {
			if ( ! empty( $field['secret'] ) && isset( $config[ $field['key'] ] ) ) {
				$config[ $field['key'] ] = $this->secrets->decrypt( $config[ $field['key'] ] );
			}
		}

		return $config;
	}

	/**
	 * Names of required fields that are empty, or whose secret can no longer be decrypted.
	 *
	 * @param array $connection Stored record.
	 * @return string[] Field labels.
	 */
	public function missing_fields( array $connection ) {
		$definition = $this->providers->definition( $connection['channel'], $connection['provider'] );

		if ( ! $definition ) {
			return array( __( 'Provider', 'vulomail' ) );
		}

		$config  = $this->config( $connection );
		$missing = array();

		foreach ( $definition['fields'] as $field ) {
			if ( ! empty( $field['required'] ) && '' === (string) ( $config[ $field['key'] ] ?? '' ) && $this->field_applies( $field, $config ) ) {
				$missing[] = $field['label'];
			}
		}

		return $missing;
	}

	/**
	 * A connection is usable when it is enabled and has every required field.
	 *
	 * @param array|null $connection Stored record.
	 * @return bool
	 */
	public function is_usable( $connection ) {
		return is_array( $connection ) && ! empty( $connection['enabled'] ) && ! $this->missing_fields( $connection );
	}

	/**
	 * Shape sent to the admin UI: secrets are replaced by a mask, never returned.
	 *
	 * @param array $connection Stored record.
	 * @return array
	 */
	public function for_display( array $connection ) {
		$definition = $this->providers->definition( $connection['channel'], $connection['provider'] );
		$config     = $this->config( $connection );
		$settings   = array();

		foreach ( $definition ? $definition['fields'] : array() as $field ) {
			$value = $config[ $field['key'] ] ?? ( $field['default'] ?? '' );

			$settings[ $field['key'] ] = empty( $field['secret'] ) ? $value : Secrets::mask( $value );
		}

		return array(
			'id'             => $connection['id'],
			'channel'        => $connection['channel'],
			'provider'       => $connection['provider'],
			'provider_label' => $definition ? $definition['label'] : $connection['provider'],
			'label'          => $connection['label'],
			'enabled'        => ! empty( $connection['enabled'] ),
			'settings'       => $settings,
			'missing'        => $this->missing_fields( $connection ),
		);
	}

	/**
	 * Creates or updates a connection.
	 *
	 * A secret field left empty, or still holding its mask, keeps the stored value: the UI never has
	 * the real secret to send back.
	 *
	 * @param array $input Raw input: id (optional), channel, provider, label, enabled, settings.
	 * @return array|\WP_Error The stored record.
	 */
	public function save( array $input ) {
		$all      = $this->all();
		$id       = sanitize_key( (string) ( $input['id'] ?? '' ) );
		$existing = '' !== $id && isset( $all[ $id ] ) ? $all[ $id ] : null;

		if ( '' !== $id && ! $existing ) {
			return new \WP_Error( 'vulomail_connection_not_found', __( 'That connection no longer exists.', 'vulomail' ), array( 'status' => 404 ) );
		}

		// Channel and provider are fixed once a connection exists: its stored secrets belong to them.
		$channel  = $existing ? $existing['channel'] : sanitize_key( (string) ( $input['channel'] ?? '' ) );
		$provider = $existing ? $existing['provider'] : sanitize_key( (string) ( $input['provider'] ?? '' ) );

		$definition = $this->providers->definition( $channel, $provider );

		if ( ! $definition ) {
			return new \WP_Error( 'vulomail_unknown_provider', __( 'Unknown provider.', 'vulomail' ), array( 'status' => 400 ) );
		}

		$raw      = isset( $input['settings'] ) && is_array( $input['settings'] ) ? $input['settings'] : array();
		$old      = $existing ? $existing['settings'] : array();
		$settings = array();

		foreach ( $definition['fields'] as $field ) {
			$key   = $field['key'];
			$value = array_key_exists( $key, $raw ) ? $raw[ $key ] : ( $existing ? null : ( $field['default'] ?? '' ) );

			if ( ! empty( $field['secret'] ) ) {
				$value = is_string( $value ) ? trim( $value ) : '';

				// Untouched (empty or still the mask): keep what is stored.
				if ( '' === $value || 0 === strpos( $value, '••••' ) ) {
					$settings[ $key ] = $old[ $key ] ?? '';
				} else {
					$settings[ $key ] = $this->secrets->encrypt( $value );
				}

				continue;
			}

			if ( null === $value ) {
				$settings[ $key ] = $old[ $key ] ?? ( $field['default'] ?? '' );
				continue;
			}

			$settings[ $key ] = $this->sanitize_field( $field, $value );
		}

		$label = sanitize_text_field( (string) ( $input['label'] ?? ( $existing['label'] ?? '' ) ) );

		$record = array(
			'id'       => $existing ? $id : $this->new_id( $all ),
			'channel'  => $channel,
			'provider' => $provider,
			'label'    => '' !== $label ? $label : $definition['label'],
			'enabled'  => array_key_exists( 'enabled', $input ) ? ! empty( $input['enabled'] ) : ( $existing ? ! empty( $existing['enabled'] ) : true ),
			'settings' => $settings,
		);

		$all[ $record['id'] ] = $record;
		update_option( Utill::CONNECTIONS_KEY, $all, false );

		return $record;
	}

	/**
	 * Remove a connection.
	 *
	 * @param string $id Connection id.
	 * @return bool Whether a connection was removed.
	 */
	public function delete( $id ) {
		$all = $this->all();

		if ( ! isset( $all[ $id ] ) ) {
			return false;
		}

		unset( $all[ $id ] );
		update_option( Utill::CONNECTIONS_KEY, $all, false );

		return true;
	}

	/**
	 * Sanitize a raw value according to its field definition.
	 *
	 * @param array $field Field definition.
	 * @param mixed $value Raw value.
	 * @return mixed
	 */
	private function sanitize_field( array $field, $value ) {
		switch ( $field['type'] ?? 'text' ) {
			case 'toggle':
				return (bool) $value;

			case 'number':
				return (int) $value;

			case 'select':
				$allowed = array_column( $field['options'] ?? array(), 'value' );

				return in_array( (string) $value, $allowed, true ) ? (string) $value : ( $field['default'] ?? '' );

			default:
				// No line breaks in any stored value: several end up in SMTP commands or HTTP headers.
				return trim( preg_replace( '/[\r\n]+/', '', sanitize_text_field( (string) $value ) ) );
		}
	}

	/**
	 * A field with a `show_if` rule only applies while that other field has the given value, or one
	 * of the given values when the rule lists several.
	 *
	 * @param array $field  Field definition.
	 * @param array $config Current settings.
	 * @return bool
	 */
	private function field_applies( array $field, array $config ) {
		if ( empty( $field['show_if'] ) ) {
			return true;
		}

		foreach ( $field['show_if'] as $key => $expected ) {
			// Loose: toggles are stored as bools, schema values may be scalars.
			if ( ! in_array( $config[ $key ] ?? null, (array) $expected, false ) ) { // phpcs:ignore WordPress.PHP.StrictInArray.FoundNonStrictFalse
				return false;
			}
		}

		return true;
	}

	/**
	 * Generate a connection id that isn't already in use.
	 *
	 * @param array $all Existing connections.
	 * @return string
	 */
	private function new_id( array $all ) {
		do {
			$id = 'c' . strtolower( wp_generate_password( 10, false ) );
		} while ( isset( $all[ $id ] ) );

		return $id;
	}
}
