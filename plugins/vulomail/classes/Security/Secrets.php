<?php
/**
 * Secrets class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Security;

defined( 'ABSPATH' ) || exit;

/**
 * Encrypts provider credentials at rest and masks them for display. Key is derived from WordPress's
 * auth salt plus a random stored value, so neither a database dump nor wp-config.php alone is enough to read a credential. Override with VULOMAIL_ENCRYPTION_KEY.
 */
class Secrets {

	/**
	 * Option holding the random, per-site half of the key material.
	 */
	const KEY_OPTION = 'vulomail_key_material';

	/**
	 * Prefix marking a stored value as encrypted by this class.
	 */
	const PREFIX = 'vm1:';

	/**
	 * Cached derived encryption key.
	 *
	 * @var string|null
	 */
	private $key = null;

	/**
	 * Encrypts a credential for storage.
	 *
	 * @param string $plain Plain-text credential.
	 * @return string Encrypted value, or '' for an empty input.
	 */
	public function encrypt( $plain ) {
		$plain = (string) $plain;

		if ( '' === $plain ) {
			return '';
		}

		$nonce  = random_bytes( SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		$cipher = sodium_crypto_secretbox( $plain, $nonce, $this->key() );

		return self::PREFIX . base64_encode( $nonce . $cipher ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- binary-safe storage of ciphertext, not obfuscation.
	}

	/**
	 * Decrypts a stored credential.
	 *
	 * @param string $stored Value produced by encrypt().
	 * @return string Plain text, or '' when the value can't be decrypted (e.g. the salts changed).
	 */
	public function decrypt( $stored ) {
		$stored = (string) $stored;

		if ( 0 !== strpos( $stored, self::PREFIX ) ) {
			return '';
		}

		$raw = base64_decode( substr( $stored, strlen( self::PREFIX ) ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- see encrypt().

		if ( false === $raw || strlen( $raw ) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ) {
			return '';
		}

		$nonce = substr( $raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		$plain = sodium_crypto_secretbox_open( substr( $raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ), $nonce, $this->key() );

		return false === $plain ? '' : $plain;
	}

	/**
	 * Returns a display-safe hint for a credential: bullets plus its last four characters.
	 *
	 * @param string $plain Plain-text credential.
	 * @return string
	 */
	public static function mask( $plain ) {
		$plain = (string) $plain;

		if ( '' === $plain ) {
			return '';
		}

		$tail = strlen( $plain ) > 8 ? substr( $plain, -4 ) : '';

		return str_repeat( '•', 8 ) . $tail;
	}

	/**
	 * Derives and caches the site's encryption key.
	 *
	 * @return string 32-byte key.
	 */
	private function key() {
		if ( null !== $this->key ) {
			return $this->key;
		}

		$material = get_option( self::KEY_OPTION );

		if ( ! is_string( $material ) || '' === $material ) {
			$material = bin2hex( random_bytes( 32 ) );
			add_option( self::KEY_OPTION, $material, '', false );
		}

		$secret = defined( 'VULOMAIL_ENCRYPTION_KEY' ) && VULOMAIL_ENCRYPTION_KEY
			? (string) VULOMAIL_ENCRYPTION_KEY
			: wp_salt( 'auth' );

		$this->key = hash( 'sha256', $secret . '|' . $material, true );

		return $this->key;
	}
}
