<?php
/**
 * Email template registry file.
 *
 * @package VuloMail
 */

namespace VuloMail\Templates;

defined( 'ABSPATH' ) || exit;

/**
 * Email templates, registered the way Gutenberg registers blocks: each has a namespaced name
 * (`multivendorx/store-pending-approval`), a title, a category and its content.
 *
 * A plugin registers templates with the `vulomail_email_templates` filter (or
 * `vulomail_register_email_template()`), and categories with `vulomail_email_template_categories`.
 * A template's arguments:
 *
 * - `title`         Name shown in the list and the editor.
 * - `description`   One line about when the email is sent.
 * - `category`      A category slug (see `vulomail_email_template_categories`).
 * - `icon`          adminfont icon name, without the `adminfont-` prefix.
 * - `group`         Section the email is listed under (for example "Orders"). Default "General".
 * - `recipients`    Who receives it: any of `store`, `customer`, `admin`.
 * - `enabled_callback` `function ( $name, $template )`: whether the email is switched on.
 * - `toggle_callback`  `function ( $name, $enabled, $template )`: switches it on or off, so a plugin keeps
 *                   its own on/off setting. Without these VuloMail keeps the switch itself.
 * - `subject`       Default subject.
 * - `content`       Default email as HTML, or
 * - `blocks`        Default email as editor blocks, or
 * - `file`          Path to a JSON file holding `blocks`.
 * - `load_callback` `function ( $name, $template )`: returns `array( 'subject' => '', 'content' => '' )`
 *                   or `array( 'blocks' => array() )` for the saved email, so a plugin can keep its
 *                   emails where it already stores them.
 * - `save_callback` `function ( $name, $data, $template )`: saves `$data` (`subject`, `content`, `blocks`)
 *                   and returns true. Without one VuloMail keeps the edited email in its own option.
 */
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

	/**
	 * Registers a template.
	 *
	 * @param string $name Namespaced name, such as `plugin/template`.
	 * @param array  $args Template arguments.
	 * @return bool False for an invalid name.
	 */
	public static function register( $name, array $args = array() ) {
		if ( ! self::is_valid_name( $name ) ) {
			return false;
		}

		self::$registered[ $name ] = $args;

		return true;
	}

	/**
	 * The templates VuloMail ships, in its own category.
	 *
	 * @return array<string, array>
	 */
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

	/**
	 * @param string $name Template name.
	 * @return bool
	 */
	public static function is_valid_name( $name ) {
		return is_string( $name ) && 1 === preg_match( '#^[a-z0-9_-]+/[a-z0-9_-]+$#', $name );
	}

	/**
	 * Every registered template, by name.
	 *
	 * @return array<string, array>
	 */
	public static function all() {
		$templates = array_merge( self::built_in(), self::$registered );

		/**
		 * Filters the registered email templates.
		 *
		 * @param array $templates Template name => arguments.
		 */
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

	/**
	 * @param string $name Template name.
	 * @return array|null
	 */
	public static function get( $name ) {
		$all = self::all();

		return $all[ $name ] ?? null;
	}

	/**
	 * Template categories: slug => label.
	 *
	 * @return array<string, string>
	 */
	public static function categories() {
		/**
		 * Filters the email template categories.
		 *
		 * @param array $categories Slug => label.
		 */
		return (array) apply_filters(
			'vulomail_email_template_categories',
			array( 'vulomail' => 'VuloMail' )
		);
	}

	/**
	 * The email to edit or send for a template: the saved one, else the registered default.
	 *
	 * @param string $name Template name.
	 * @return array|null `subject`, plus `content` (HTML) or `blocks`; null for an unknown template.
	 */
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

	/**
	 * The registered default email, ignoring anything saved.
	 *
	 * @param string $name Template name.
	 * @return array|null
	 */
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

	/**
	 * Saves an edited email.
	 *
	 * @param string $name Template name.
	 * @param array  $data `subject`, `content` (HTML) and `blocks`.
	 * @return bool
	 */
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
			/**
			 * Fires after an email template is saved.
			 *
			 * @param string $name Template name.
			 * @param array  $data Saved email.
			 */
			do_action( 'vulomail_email_template_saved', $name, $data );
		}

		return $saved;
	}

	/**
	 * Whether a template's email is switched on.
	 *
	 * @param string $name Template name.
	 * @return bool
	 */
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

	/**
	 * Switches a template's email on or off.
	 *
	 * @param string $name    Template name.
	 * @param bool   $enabled Whether it should be on.
	 * @return bool
	 */
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

	/**
	 * @param string $name Template name.
	 * @return string
	 */
	private static function option_name( $name ) {
		return self::OPTION_PREFIX . str_replace( '/', '__', $name );
	}
}
