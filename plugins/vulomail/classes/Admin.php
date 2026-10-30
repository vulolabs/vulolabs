<?php
/**
 * Admin class file.
 *
 * @package VuloMail
 */

namespace VuloMail;

defined( 'ABSPATH' ) || exit;

/**
 * VuloMail Admin class.
 *
 * @class       Admin class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Admin {

	/**
	 * Admin constructor.
	 */
	public function __construct() {
		add_action( 'admin_menu', array( $this, 'add_menus' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_script' ) );
		add_filter( 'plugin_action_links_' . VuloMail()->plugin_base, array( $this, 'add_action_links' ) );
	}

	/**
	 * Registers the VuloMail top-level menu and its submenu tabs.
	 *
	 * @return void
	 */
	public function add_menus() {
		add_menu_page(
			'VuloMail',
			'VuloMail',
			Utill::CAPABILITY,
			'vulomail',
			array( $this, 'create_admin_page' ),
			'dashicons-email-alt',
			57
		);

		// Each entry is a hash tab of the one React screen (src/routes.ts).
		$submenus = apply_filters(
			'vulomail_submenus',
			array(
				'dashboard'  => array(
					'name'     => __( 'Dashboard', 'vulomail' ),
					'priority' => 10,
				),
				'sms-alerts' => array(
					'name'     => __( 'SMS Alerts', 'vulomail' ),
					'priority' => 20,
				),
				'email-templates' => array(
					'name'     => __( 'Email Templates', 'vulomail' ),
					'priority' => 25,
				),
				'logs'       => array(
					'name'     => __( 'Logs', 'vulomail' ),
					'priority' => 30,
				),
				'tools'      => array(
					'name'     => __( 'Tools', 'vulomail' ),
					'priority' => 50,
				),
				'settings'   => array(
					'name'     => __( 'Settings', 'vulomail' ),
					'priority' => 60,
				),
			)
		);

		uasort(
			$submenus,
			function ( $a, $b ) {
				return ( $a['priority'] ?? 0 ) <=> ( $b['priority'] ?? 0 );
			}
		);

		foreach ( $submenus as $slug => $submenu ) {
			add_submenu_page(
				'vulomail',
				$submenu['name'],
				$submenu['name'],
				Utill::CAPABILITY,
				'vulomail#&tab=' . $slug,
				'__return_null'
			);
		}

		// add_menu_page() auto-registers a duplicate first submenu for the top-level item.
		remove_submenu_page( 'vulomail', 'vulomail' );
	}

	/**
	 * Renders the empty mount point the React app renders into.
	 *
	 * @return void
	 */
	public function create_admin_page() {
		echo '<div id="admin-main-wrapper" class="admin-main-wrapper"></div>';
	}

	/**
	 * Loads the admin app on VuloMail's own admin screen only.
	 *
	 * @return void
	 */
	public function enqueue_admin_script() {
		$screen = get_current_screen();

		if ( ! $screen || 'toplevel_page_vulomail' !== $screen->id ) {
			return;
		}

		FrontendScripts::admin_load_scripts();
		FrontendScripts::enqueue_script( 'vulomail-vendor-script' );
		FrontendScripts::enqueue_script( 'vulomail-admin-script' );
		FrontendScripts::enqueue_style( 'vulomail-admin-style' );
		FrontendScripts::localize_scripts( 'vulomail-admin-script' );
	}

	/**
	 * Adds a "Settings" link on the Plugins screen.
	 *
	 * @param array $links Existing links.
	 * @return array
	 */
	public function add_action_links( $links ) {
		array_unshift(
			$links,
			sprintf( '<a href="%s">%s</a>', esc_url( admin_url( 'admin.php?page=vulomail#&tab=settings&subtab=connections' ) ), esc_html__( 'Settings', 'vulomail' ) )
		);

		return $links;
	}
}
