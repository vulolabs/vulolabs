<?php
/**
 * KnowledgeGraph Abilities class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\KnowledgeGraph;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * KnowledgeGraph abilities. Registered on the shared `vulopilot` category, only while this module is active.
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
	 * Register KnowledgeGraph abilities.
	 *
	 * @return void
	 */
	public function register_abilities() {
		wp_register_ability(
			'vulopilot/get-entities',
			array(
				'label'               => __( 'Get Entities', 'vulopilot' ),
				'description'         => __( 'Entities VuloPilot extracted from the site: organization, people, products, categories, and contact details.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'                 => 'object',
					'properties'           => array(),
					'additionalProperties' => false,
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'get_entities' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);
	}

	/**
	 * Entities VuloPilot extracted from the site: organization, people, products, categories, and contact details.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_entities( $input ) {
		$response = \VuloPilot()->rest->entities->prepare_get_items_response( (array) $input );

		return Utill::ability_response( $response );
	}
}
