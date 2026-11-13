<?php
/**
 * Dashboard abilities controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Abilities\AbilitiesApi;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Dashboard abilities controller.
 *
 * @class       Dashboard class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Dashboard {

	/**
	 * Register VuloPilot dashboard abilities.
	 *
	 * @return void
	 */
	public function register_abilities() {
		wp_register_ability(
			'vulopilot/get-dashboard-summary',
			array(
				'label'               => __( 'Get Dashboard Summary', 'vulopilot' ),
				'description'         => __( 'VuloPilot site overview: overall and per-category scores, open findings by severity, automations, AI usage, and site snapshot.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'                 => 'object',
					'properties'           => array(),
					'additionalProperties' => false,
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'get_dashboard_summary' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);
	}

	/**
	 * Site overview.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_dashboard_summary( $input ) {
		$response = VuloPilot()->rest->dashboard->prepare_get_items_response( (array) $input );

		return Utill::ability_response( $response );
	}
}
