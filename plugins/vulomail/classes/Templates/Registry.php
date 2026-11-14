<?php
/**
 * Email template registry file.
 */

namespace VuloMail\Templates;

defined( 'ABSPATH' ) || exit;

class Registry {

	/**
	 * Option prefix for emails VuloMail itself stores.
	 */
	const OPTION_PREFIX = 'vulomail_email_template_';

	/**
	 * Option listing the templates VuloMail itself has switched off.
	 */
	const OFF_OPTION = 'vulomail_email_templates_off';

	/**
	 * Templates registered directly, by name.
	 *
	 * @var array<string, array>
	 */
	private static $registered = array();

	public static function register( $name, array $args = array() ) {
		if ( ! self::is_valid_name( $name ) ) {
			return false;
		}

		self::$registered[ $name ] = $args;

		return true;
	}

	private static function built_in() {
		return array(
			'vulomail/basic-notification' => array(
				'title'       => __( 'Basic notification', 'vulomail' ),
				'description' => __( 'A short message with a heading and a button, to start a new email from.', 'vulomail' ),
				'category'    => 'vulomail',
				'group'       => __( 'General', 'vulomail' ),
				'recipients'  => array( 'customer' ),
				'subject'     => __( 'A message from {siteName}', 'vulomail' ),
				'content'     => '<h2>' . esc_html__( 'Hello,', 'vulomail' ) . '</h2><p>' . esc_html__( 'Write your message here.', 'vulomail' ) . '</p>',
			),
		);
	}


	public static function is_valid_name( $name ) {
		return is_string( $name ) && 1 === preg_match( '#^[a-z0-9_-]+/[a-z0-9_-]+$#', $name );
	}

	/**
	 * Every registered template, by name. */
	public static function all() {
		$templates = array_merge( self::built_in(), self::$registered );

		/**  Filters the registered email templates. */
		$templates = (array) apply_filters( 'vulomail_email_templates', $templates );
		$out       = array();

		foreach ( $templates as $name => $args ) {
			if ( ! self::is_valid_name( $name ) || ! is_array( $args ) ) {
				continue;
			}

			$out[ $name ] = array_merge(
				array(
					'title'         => $name,
					'description'   => '',
					'category'      => (string) strstr( $name, '/', true ),
					'icon'          => 'mail',
					'group'         => __( 'General', 'vulomail' ),
					'recipients'    => array(),
					'enabled_callback' => null,
					'toggle_callback'  => null,
					'subject'       => '',
					'load_callback' => null,
					'save_callback' => null,
				),
				$args
			);
		}

		return $out;
	}
	public static function get( $name ) {
		$all = self::all();

		return $all[ $name ] ?? null;
	}
	public static function categories() {
		return (array) apply_filters(
			'vulomail_email_template_categories',
			array( 'vulomail' => 'VuloMail' )
		);
	}
	public static function load( $name ) {
		$template = self::get( $name );

		if ( ! $template ) {
			return null;
		}

		if ( is_callable( $template['load_callback'] ) ) {
			$loaded = call_user_func( $template['load_callback'], $name, $template );

			if ( is_array( $loaded ) && ( ! empty( $loaded['content'] ) || ! empty( $loaded['blocks'] ) ) ) {
				return array_merge( array( 'subject' => $template['subject'] ), $loaded );
			}
		} else {
			$saved = get_option( self::option_name( $name ), null );

			if ( is_array( $saved ) && ( ! empty( $saved['content'] ) || ! empty( $saved['blocks'] ) ) ) {
				return array_merge( array( 'subject' => $template['subject'] ), $saved );
			}
		}

		return self::defaults( $name );
	}

	public static function defaults( $name ) {
		$template = self::get( $name );

		if ( ! $template ) {
			return null;
		}

		$out = array( 'subject' => (string) $template['subject'] );

		if ( ! empty( $template['content'] ) ) {
			$out['content'] = (string) $template['content'];
		} elseif ( ! empty( $template['blocks'] ) ) {
			$out['blocks'] = (array) $template['blocks'];
		} elseif ( ! empty( $template['file'] ) && is_readable( $template['file'] ) ) {
			$data = json_decode( (string) file_get_contents( $template['file'] ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents

			$out['blocks'] = is_array( $data ) ? (array) ( $data['blocks'] ?? $data ) : array();
		} else {
			$out['content'] = '';
		}

		return $out;
	}

	public static function save( $name, array $data ) {
		$template = self::get( $name );

		if ( ! $template ) {
			return false;
		}

		$data = array(
			'subject' => isset( $data['subject'] ) ? sanitize_text_field( (string) $data['subject'] ) : (string) $template['subject'],
			'content' => isset( $data['content'] ) ? wp_kses_post( (string) $data['content'] ) : '',
			'blocks'  => isset( $data['blocks'] ) && is_array( $data['blocks'] ) ? $data['blocks'] : array(),
		);

		if ( is_callable( $template['save_callback'] ) ) {
			$saved = (bool) call_user_func( $template['save_callback'], $name, $data, $template );
		} else {
			update_option( self::option_name( $name ), $data, false );
			$saved = true;
		}

		if ( $saved ) {
			do_action( 'vulomail_email_template_saved', $name, $data );
		}

		return $saved;
	}

	public static function is_enabled( $name ) {
		$template = self::get( $name );

		if ( ! $template ) {
			return false;
		}

		if ( is_callable( $template['enabled_callback'] ) ) {
			return (bool) call_user_func( $template['enabled_callback'], $name, $template );
		}

		return ! in_array( $name, (array) get_option( self::OFF_OPTION, array() ), true );
	}
	public static function set_enabled( $name, $enabled ) {
		$template = self::get( $name );

		if ( ! $template ) {
			return false;
		}

		if ( is_callable( $template['toggle_callback'] ) ) {
			return (bool) call_user_func( $template['toggle_callback'], $name, (bool) $enabled, $template );
		}

		$off = array_diff( (array) get_option( self::OFF_OPTION, array() ), array( $name ) );

		if ( ! $enabled ) {
			$off[] = $name;
		}

		update_option( self::OFF_OPTION, array_values( array_unique( $off ) ), false );

		return true;
	}

	private static function option_name( $name ) {
		return self::OPTION_PREFIX . str_replace( '/', '__', $name );
	}
}
