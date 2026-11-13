<?php
/**
 * AiCopilot Abilities class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\AiCopilot;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * AiCopilot abilities. Registered on the shared `vulopilot` category, only while this module is active.
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
	 * Register AiCopilot abilities.
	 *
	 * @return void
	 */
	public function register_abilities() {
		wp_register_ability(
			'vulopilot/get-ai-action-runs',
			array(
				'label'               => __( 'Get AI Action Runs', 'vulopilot' ),
				'description'         => __( 'List AI Copilot action runs, optionally by status or action id.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'status' => array(
							'type'        => 'string',
							'description' => __( 'Run status (e.g. pending_approval, applied, rejected).', 'vulopilot' ),
						),
						'action_id' => array(
							'type'        => 'string',
							'description' => __( 'Registered AI action id.', 'vulopilot' ),
						),
						'page' => array(
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
				'execute_callback'    => array( $this, 'get_ai_action_runs' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);
	}

	/**
	 * List AI Copilot action runs, optionally by status or action id.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_ai_action_runs( $input ) {
		$response = \VuloPilot()->rest->ai_action_runs->prepare_get_items_response( (array) $input );

		return Utill::ability_response( $response );
	}
}
