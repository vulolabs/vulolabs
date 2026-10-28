<?php
/**
 * PhoneNumber class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Sms;

defined( 'ABSPATH' ) || exit;

/**
 * Phone number normalisation.
 */
class PhoneNumber {

	/**
	 * Normalises a number to E.164 (`+` and 8-15 digits).
	 *
	 * @param string $raw          Number as entered: spaces, dashes, brackets, a 00 prefix allowed.
	 * @param string $country_code Default country calling code digits, applied to national numbers.
	 * @return string E.164 number, or '' if not a valid phone number.
	 */
	public static function normalize( $raw, $country_code = '' ) {
		$raw           = trim( (string) $raw );
		$international = 0 === strpos( $raw, '+' );
		$digits        = preg_replace( '/\D/', '', $raw );

		if ( ! $international && 0 === strpos( $digits, '00' ) ) {
			$international = true;
			$digits        = substr( $digits, 2 );
		}

		if ( ! $international ) {
			$country_code = preg_replace( '/\D/', '', (string) $country_code );

			if ( '' === $country_code ) {
				return '';
			}

			// National numbers usually carry a leading trunk zero not dialled internationally.
			$digits = $country_code . ltrim( $digits, '0' );
		}

		$length = strlen( $digits );

		return $length >= 8 && $length <= 15 ? '+' . $digits : '';
	}
}
