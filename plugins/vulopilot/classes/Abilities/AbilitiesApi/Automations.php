<?php
/**
 * Automations abilities controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Abilities\AbilitiesApi;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Automation abilities controller.
 *
 * @class       Automations class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Automations {

	/**
	 * Register VuloPilot automation abilities.
	 *
	 * @return void
	 */
	public function register_abilities() {
		wp_register_ability(
			'vulopilot/get-automations',
			array(
				'label'               => __( 'Get Automations', 'vulopilot' ),
				'description'         => __( 'List VuloPilot automations with their status and last/next run details.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'status'   => array(
							'type'        => 'string',
							'description' => __( 'One of enabled, disabled, draft.', 'vulopilot' ),
						),
						'search'   => array(
							'type'        => 'string',
							'description' => __( 'Search automations by name.', 'vulopilot' ),
						),
						'page'     => array(
							'type'        => 'integer',
							'description' => __( 'Page number. Defaults to 1.', 'vulopilot' ),
						),
						'per_page' => array(
							'type'        => 'integer',
							'description' => __( 'Rows per page. Defaults to 20.', 'vulopilot' ),
						),
					),
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'get_automations' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);
	}

	/**
	 * List automations.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_automations( $input ) {
		$response = VuloPilot()->rest->automations->prepare_get_items_response( (array) $input );

		return Utill::ability_response( $response );
	}
}
