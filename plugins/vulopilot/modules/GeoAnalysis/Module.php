<?php
/**
 * Module class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\GeoAnalysis;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot GeoAnalysis module.
 *
 * @class       Module class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Module {

	/** Module constructor. */
	public function __construct() {
		new Abilities();
		add_action( 'save_post', array( $this, 'maybe_regenerate_llms_txt' ), 10, 2 );
	}

	/**
	 * @param int      $post_id Post being saved.
	 * @param \WP_Post $post    Same post object.
	 * @return void
	 */
	public function maybe_regenerate_llms_txt( int $post_id, \WP_Post $post ): void {
		if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
			return;
		}

		if ( 'publish' !== $post->post_status ) {
			return;
		}

		$settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

		if ( empty( $settings['enable_llms_txt'] ) || empty( $settings['llms_auto_regen'] ) ) {
			return;
		}

		$content = VuloPilot()->llms_txt_generator->generate();

		VuloPilot()->llms_txt_generator->write_file( $content );

		// Keeps Settings → GEO's textarea showing the same content the live file now has, not the pre-publish version, next time an admin opens it.
		$settings['llms_txt_content'] = $content;
		update_option( Utill::VULOPILOT_SETTINGS_KEY, $settings );
	}

	/**
	 * @return self
	 */
	public static function init(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}
}
