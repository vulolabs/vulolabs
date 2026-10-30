<?php
/**
 * FrontendScripts class file.
 *
 * @package VuloMail
 */

namespace VuloMail;

defined( 'ABSPATH' ) || exit;

/**
 * VuloMail FrontendScripts class.
 *
 * @class       FrontendScripts class
 * @version     1.0.0
 * @author      VuloLabs
 */
class FrontendScripts {

	/**
	 * Returns the URL to the built assets directory.
	 *
	 * @return string
	 */
	public static function get_asset_url() {
		return VuloMail()->plugin_url . 'assets/';
	}

	/**
	 * Registers the admin assets.
	 *
	 * @return void
	 */
	public static function admin_load_scripts() {
		$index_asset_path  = VuloMail()->plugin_path . 'assets/js/index.asset.php';
		$vendor_asset_path = VuloMail()->plugin_path . 'assets/js/vendors.asset.php';

		$index_asset = file_exists( $index_asset_path )
			? include $index_asset_path
			: array(
				'dependencies' => array( 'wp-element', 'wp-i18n', 'wp-hooks', 'wp-components' ),
				'version'      => VULOMAIL_PLUGIN_VERSION,
			);

		$vendor_asset = file_exists( $vendor_asset_path )
			? include $vendor_asset_path
			: array(
				'dependencies' => array(),
				'version'      => VULOMAIL_PLUGIN_VERSION,
			);

		wp_register_script(
			'vulomail-vendor-script',
			self::get_asset_url() . 'js/vendors.js',
			$vendor_asset['dependencies'],
			$vendor_asset['version'],
			true
		);

		wp_register_script(
			'vulomail-admin-script',
			self::get_asset_url() . 'js/index.js',
			array_merge( $index_asset['dependencies'], array( 'vulomail-vendor-script' ) ),
			$index_asset['version'],
			true
		);
		wp_set_script_translations( 'vulomail-admin-script', 'vulomail' );

		wp_register_style(
			'vulomail-admin-style',
			self::get_asset_url() . 'styles/index.css',
			array( 'wp-components' ),
			VULOMAIL_PLUGIN_VERSION
		);
	}

	/**
	 * Enqueues a previously registered handle.
	 *
	 * @param string $handle Registered handle.
	 * @return void
	 */
	public static function enqueue_script( $handle ) {
		wp_enqueue_script( $handle );
	}

	/**
	 * Enqueues a previously registered CSS handle.
	 *
	 * @param string $handle Registered handle.
	 * @return void
	 */
	public static function enqueue_style( $handle ) {
		wp_enqueue_style( $handle );
	}

	/**
	 * Passes the React app what it needs to boot and call the REST API. No credential is ever
	 * included here.
	 *
	 * @param string $handle Handle to attach the data to.
	 * @return void
	 */
	public static function localize_scripts( $handle ) {
		wp_localize_script(
			$handle,
			'vulomailAppLocalizer',
			array(
				'apiUrl'         => untrailingslashit( get_rest_url() ),
				'restUrl'        => VuloMail()->rest_namespace,
				'nonce'          => wp_create_nonce( 'wp_rest' ),
				'plugin_url'     => VuloMail()->plugin_url,
				'admin_url'      => admin_url( 'admin.php?page=vulomail' ),
				'site_url'       => site_url(),
				'version'        => VuloMail()->version,
				'plugin_slug'    => VuloMail()->plugin_slug,
				'text_domain'    => VULOMAIL_PLUGIN_TEXTDOMAIN,
				'admin_email'    => wp_get_current_user()->user_email,
				'default_from'   => Email\MessageFactory::default_from_email(),
				'providers'      => VuloMail()->providers->definitions(),
				'sms_triggers'   => self::sms_trigger_definitions(),
				// Other plugins (e.g. MultiVendorX, CatalogX) register
				// themselves here on `plugins_loaded` when active, each as
				// `{ plugin, label, rest_namespace }` — the Email
				// Templates screen reads this to know which plugins' own
				// `GET {rest_namespace}/email-templates` to list, without
				// vulomail storing any of that data itself.
				'email_sources'  => apply_filters( 'vulomail_email_sources', array() ),
				// Settings → General → Date Format, in the token syntax zyra's date picker uses.
				'date_format_js' => self::convert_date_format_to_js( (string) get_option( 'date_format' ) ),
				// zyra's settings form locks a field whose `dependentPlugin` isn't in this list.
				'active_plugins' => class_exists( 'WooCommerce' ) ? array( 'woocommerce' ) : array(),
				'plugins_url'    => admin_url( 'plugin-install.php?s=woocommerce&tab=search&type=term' ),
				// zyra's HeaderComponent reads these two keys on every VuloLabs admin screen.
				'khali_dabba'    => false,
				'active_modules' => array(),
			)
		);
	}

	/**
	 * Get the catalog of SMS trigger definitions.
	 *
	 * @return array<int, array>
	 */
	private static function sms_trigger_definitions() {
		$triggers = array();

		foreach ( Sms\Triggers::definitions() as $id => $definition ) {
			$triggers[] = array_merge(
				array(
					'id'       => $id,
					'requires' => '',
				),
				$definition
			);
		}

		return $triggers;
	}

	/**
	 * Converts a PHP date() format into zyra's token syntax (YYYY/MM/DD...). zyra has no am/pm token,
	 * so those are dropped.
	 *
	 * @param string $php_format PHP date format.
	 * @return string
	 */
	private static function convert_date_format_to_js( $php_format ) {
		$token_map = array(
			'Y' => 'YYYY',
			'y' => 'YY',
			'F' => 'MMMM',
			'M' => 'MMM',
			'm' => 'MM',
			'n' => 'MM',
			'd' => 'DD',
			'j' => 'D',
		);

		$js_format = '';
		$length    = strlen( $php_format );

		for ( $i = 0; $i < $length; $i++ ) {
			$char = $php_format[ $i ];

			// A backslash makes the next character a literal in PHP's date() syntax.
			if ( '\\' === $char && $i + 1 < $length ) {
				$js_format .= $php_format[ ++$i ];
				continue;
			}

			$js_format .= isset( $token_map[ $char ] ) ? $token_map[ $char ] : $char;
		}

		$js_format = trim( $js_format );

		return '' !== $js_format ? $js_format : 'YYYY-MM-DD';
	}
}
