<?php
/**
 * BrandVisibility Abilities class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\BrandVisibility;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * BrandVisibility abilities. Registered on the shared `vulopilot` category, only while this module is active.
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
	 * Register BrandVisibility abilities.
	 *
	 * @return void
	 */
	public function register_abilities() {
		wp_register_ability(
			'vulopilot/get-brand-score',
			array(
				'label'               => __( 'Get Brand Score', 'vulopilot' ),
				'description'         => __( 'Brand visibility score.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'                 => 'object',
					'properties'           => array(),
					'additionalProperties' => false,
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'get_brand_score' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);
	}

	/**
	 * Brand visibility score.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_brand_score( $input ) {
		$response = \VuloPilot()->rest->brand_score->prepare_get_score_response( (array) $input );

		return Utill::ability_response( $response );
	}
}
