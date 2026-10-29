<?php
/**
 * TestCase class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Tests;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Mockery\Adapter\Phpunit\MockeryPHPUnitIntegration;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

/**
 * Shared base: Brain\Monkey set-up plus working stand-ins for the WordPress functions the plugin's
 * delivery code calls (options are kept in memory per test).
 */
abstract class TestCase extends PHPUnitTestCase {

	use MockeryPHPUnitIntegration;

	/**
	 * In-memory wp_options.
	 *
	 * @var array
	 */
	protected $options = array();

	/**
	 * In-memory transients.
	 *
	 * @var array
	 */
	protected $transients = array();

	/**
	 * Sets up Brain Monkey and a fresh test container before each test.
	 *
	 * @return void
	 */
	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		$this->options                      = array();
		$this->transients                   = array();
		$GLOBALS['vulomail_test_container'] = new \stdClass();

		Functions\when( 'get_option' )->alias(
			function ( $key, $fallback = false ) {
				return array_key_exists( $key, $this->options ) ? $this->options[ $key ] : $fallback;
			}
		);
		Functions\when( 'update_option' )->alias(
			function ( $key, $value ) {
				$this->options[ $key ] = $value;

				return true;
			}
		);
		Functions\when( 'add_option' )->alias(
			function ( $key, $value ) {
				if ( ! array_key_exists( $key, $this->options ) ) {
					$this->options[ $key ] = $value;
				}

				return true;
			}
		);

		Functions\when( 'get_transient' )->alias(
			function ( $key ) {
				return $this->transients[ $key ] ?? false;
			}
		);
		Functions\when( 'set_transient' )->alias(
			function ( $key, $value ) {
				$this->transients[ $key ] = $value;

				return true;
			}
		);
		Functions\when( 'delete_transient' )->alias(
			function ( $key ) {
				unset( $this->transients[ $key ] );

				return true;
			}
		);

		Functions\when( '__' )->returnArg();
		Functions\when( '_n' )->alias(
			static function ( $single, $plural, $number ) {
				return 1 === (int) $number ? $single : $plural;
			}
		);
		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'wp_salt' )->justReturn( 'unit-test-salt' );
		Functions\when( 'home_url' )->justReturn( 'https://shop.example.com/' );
		Functions\when( 'network_home_url' )->justReturn( 'https://www.shop.example.com' );
		Functions\when( 'get_bloginfo' )->alias(
			static function ( $show = '' ) {
				return 'charset' === $show ? 'UTF-8' : 'Example Shop';
			}
		);
		Functions\when( 'wp_parse_url' )->alias( 'parse_url' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'wp_specialchars_decode' )->returnArg();
		Functions\when( 'wp_normalize_path' )->returnArg();
		Functions\when( 'get_theme_root' )->justReturn( '/var/www/wp-content/themes' );
		Functions\when( 'wp_strip_all_tags' )->alias(
			static function ( $text ) {
				return trim( strip_tags( (string) $text ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.strip_tags_strip_tags
			}
		);
		Functions\when( 'sanitize_text_field' )->alias(
			static function ( $text ) {
				return trim( preg_replace( '/[\r\n\t ]+/', ' ', strip_tags( (string) $text ) ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.strip_tags_strip_tags
			}
		);
		Functions\when( 'sanitize_textarea_field' )->alias(
			static function ( $text ) {
				return trim( strip_tags( (string) $text ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.strip_tags_strip_tags
			}
		);
		Functions\when( 'sanitize_key' )->alias(
			static function ( $key ) {
				return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
			}
		);
		Functions\when( 'sanitize_file_name' )->returnArg();
		Functions\when( 'sanitize_email' )->alias(
			static function ( $email ) {
				return trim( (string) $email );
			}
		);
		Functions\when( 'is_email' )->alias(
			static function ( $email ) {
				return false !== filter_var( $email, FILTER_VALIDATE_EMAIL ) ? $email : false;
			}
		);
		Functions\when( 'is_wp_error' )->alias(
			static function ( $thing ) {
				return $thing instanceof \WP_Error;
			}
		);
		Functions\when( 'wp_check_filetype' )->justReturn(
			array(
				'ext'  => 'txt',
				'type' => 'text/plain',
			)
		);

		$counter = 0;

		Functions\when( 'wp_generate_password' )->alias(
			static function ( $length = 12 ) use ( &$counter ) {
				++$counter;

				return substr( str_pad( 'id' . $counter, $length, 'x' ), 0, $length );
			}
		);
	}

	/**
	 * Reads the query arguments of a URL.
	 *
	 * @param string $url URL.
	 * @return array
	 */
	protected static function query_args( $url ) {
		parse_str( (string) parse_url( $url, PHP_URL_QUERY ), $args ); // phpcs:ignore WordPress.WP.AlternativeFunctions.parse_url_parse_url

		return $args;
	}

	/**
	 * Tears down Brain Monkey after each test.
	 *
	 * @return void
	 */
	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}
}
