<?php
/**
 * Module class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\KnowledgeGraph;

use VuloPilot\KnowledgeGraph\EntityExtractor;
use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot KnowledgeGraph module.
 *
 * @class       Module class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Module {

	/**
	 * @var EntityExtractor
	 */
	private EntityExtractor $extractor;

	/** Module constructor. */
	public function __construct() {
		new Abilities();
		$this->extractor = new EntityExtractor();

		add_action( 'save_post', array( $this, 'clear_cache' ) );
		add_action( 'deleted_post', array( $this, 'clear_cache' ) );
		add_action( 'created_term', array( $this, 'clear_cache' ) );
		add_action( 'edited_term', array( $this, 'clear_cache' ) );
		add_action( 'delete_term', array( $this, 'clear_cache' ) );
		add_action( 'update_option_' . Utill::VULOPILOT_SETTINGS_KEY, array( $this, 'maybe_clear_cache_on_settings_change' ), 10, 2 );
	}

	/**
	 * `update_option_{$option}` fires with the old and new full settings array whenever `vulopilot_settings` actually changes.
	 *
	 * @param mixed $old_value Previously stored `vulopilot_settings` value.
	 * @param mixed $new_value Newly stored `vulopilot_settings` value.
	 * @return void
	 */
	public function maybe_clear_cache_on_settings_change( $old_value, $new_value ): void {
		$old_value = is_array( $old_value ) ? $old_value : array();
		$new_value = is_array( $new_value ) ? $new_value : array();

		foreach ( array( 'entity_business_type', 'entity_service_pages', 'entity_business_locations' ) as $key ) {
			if ( ( $old_value[ $key ] ?? '' ) !== ( $new_value[ $key ] ?? '' ) ) {
				$this->clear_cache();

				return;
			}
		}
	}

	/**
	 * @return void
	 */
	public function clear_cache(): void {
		$this->extractor->clear_cache();
	}
}
