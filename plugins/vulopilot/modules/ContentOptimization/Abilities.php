<?php
/**
 * ContentOptimization Abilities class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\ContentOptimization;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * ContentOptimization abilities. Registered on the shared `vulopilot` category, only while this module is active.
 *
 * @class       Abilities class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Abilities {

	/** Abilities constructor. */
	public function __construct() {
		add_action( 'wp_abilities_api_init', array( $this, 'register_abilities' ) );
	}

	/**
	 * Register ContentOptimization abilities.
	 *
	 * @return void
	 */
	public function register_abilities() {
		wp_register_ability(
			'vulopilot/get-content-score',
			array(
				'label'               => __( 'Get Content Score', 'vulopilot' ),
				'description'         => __( 'Content quality score across the site.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'                 => 'object',
					'properties'           => array(),
					'additionalProperties' => false,
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'get_content_score' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);
	}

	/**
	 * Content quality score across the site.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_content_score( $input ) {
		$response = \VuloPilot()->rest->content_score->prepare_get_score_response( (array) $input );

		return Utill::ability_response( $response );
	}
}
