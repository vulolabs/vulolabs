<?php
/**
 * FrontendScripts class file.
 *
 * @package VuloForm
 */

namespace VuloForm;

use VuloForm\Fields\Registry;
use VuloForm\Forms\Schema;
use VuloForm\Forms\Templates;
use VuloForm\Notifications\Notifier;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the admin app's assets and the data it boots with.
 */
class FrontendScripts {

	/**
	 * Registers the admin assets.
	 *
	 * @return void
	 */
	public static function admin_load_scripts() {
		$path = VuloForm()->plugin_path . 'assets/js/';
		$url  = VuloForm()->plugin_url . 'assets/';

		$fallback = array(
			'dependencies' => array( 'wp-element', 'wp-i18n', 'wp-hooks', 'wp-components' ),
			'version'      => VULOFORM_PLUGIN_VERSION,
		);

		$index  = file_exists( $path . 'index.asset.php' ) ? include $path . 'index.asset.php' : $fallback;
		$vendor = file_exists( $path . 'vendors.asset.php' ) ? include $path . 'vendors.asset.php' : array_merge( $fallback, array( 'dependencies' => array() ) );

		wp_register_script( 'vuloform-vendor-script', $url . 'js/vendors.js', $vendor['dependencies'], $vendor['version'], true );
		wp_register_script( 'vuloform-admin-script', $url . 'js/index.js', array_merge( $index['dependencies'], array( 'vuloform-vendor-script' ) ), $index['version'], true );
		wp_set_script_translations( 'vuloform-admin-script', 'vuloform' );

		wp_register_style( 'vuloform-admin-style', $url . 'styles/index.css', array( 'wp-components' ), VULOFORM_PLUGIN_VERSION );
	}

	/**
	 * Passes the React app what it needs to boot and call the REST API.
	 *
	 * @param string $handle Handle to attach the data to.
	 * @return void
	 */
	public static function localize_scripts( $handle ) {
		$field_types = array();

		foreach ( Registry::types() as $id => $type ) {
			$field_types[] = array_merge( array( 'id' => $id ), $type );
		}

		$templates = array();

		foreach ( Templates::all() as $id => $template ) {
			$templates[] = array(
				'id'     => $id,
				'title'  => $template['title'],
				'desc'   => $template['desc'],
				'icon'   => $template['icon'],
				'plugin' => $template['plugin'] ?? '',
				// Id of the one form a single-form template allows, once it exists.
				'exists' => ! empty( $template['single'] ) ? VuloForm()->forms->id_for_template( $id ) : 0,
				'fields' => count( $template['schema']['fields'] ),
			);
		}

		/**
		 * Filters the data handed to the admin app. Extensions add what their own screens need.
		 *
		 * @param array $data Localized data.
		 */
		$data = apply_filters(
			'vuloform_localize_data',
			array(
				'apiUrl'           => untrailingslashit( get_rest_url() ),
				'restUrl'          => VuloForm()->rest_namespace,
				'nonce'            => wp_create_nonce( 'wp_rest' ),
				'plugin_url'       => VuloForm()->plugin_url,
				'admin_url'        => admin_url( 'admin.php?page=vuloform' ),
				'version'          => VuloForm()->version,
				'admin_email'      => get_option( 'admin_email' ),
				'date_format_js'   => 'YYYY-MM-DD',
				'field_types'      => $field_types,
				'templates'        => $templates,
				'palettes'         => Templates::palettes(),
				'locked'           => Templates::locked_fields(),
				'default_settings' => Schema::default_settings(),
				'file_types'       => array_keys( Schema::FILE_TYPES ),
				'name_parts'       => Registry::part_labels( 'name' ),
				'address_parts'    => Registry::part_labels( 'address' ),
				// Whether email goes through VuloMail, and whether SMS notifications can be sent at all.
				'has_vulomail'     => function_exists( 'vulomail_send_email' ),
				'sms_available'    => Notifier::sms_available(),
				// Where to go for VuloMail (WordPress.org slug `vulomail`): its connections when it is
				// active, the Plugins screen when it is installed but off, otherwise Add Plugins.
				'vulomail_url'     => self::vulomail_url(),
				// Whether the reCAPTCHA keys are saved, so a form's spam settings can say so.
				'recaptcha_ready'  => \VuloForm\Security\Recaptcha::is_configured(),
				// zyra's shared components read these two keys on every VuloLabs admin screen.
				'khali_dabba'      => false,
				'active_modules'   => VuloForm()->modules->get_active_modules(),
			)
		);

		wp_localize_script( $handle, 'vuloformAppLocalizer', (array) $data );
	}

	/**
	 * @return string Admin URL for setting up VuloMail, whatever state it is in on this site.
	 */
	private static function vulomail_url() {
		if ( function_exists( 'vulomail_send_email' ) ) {
			return admin_url( 'admin.php?page=vulomail#&tab=settings&subtab=connections' );
		}

		if ( file_exists( WP_PLUGIN_DIR . '/vulomail/vulomail.php' ) ) {
			return admin_url( 'plugins.php?s=vulomail' );
		}

		return admin_url( 'plugin-install.php?s=vulomail&tab=search&type=term' );
	}
}
