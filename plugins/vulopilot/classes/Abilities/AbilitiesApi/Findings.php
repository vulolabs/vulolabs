<?php
/**
 * Findings abilities controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Abilities\AbilitiesApi;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Finding abilities controller.
 *
 * @class       Findings class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Findings {

	/**
	 * Register VuloPilot finding abilities.
	 *
	 * @return void
	 */
	public function register_abilities() {
		wp_register_ability(
			'vulopilot/get-findings',
			array(
				'label'               => __( 'Get Findings', 'vulopilot' ),
				'description'         => __( 'List VuloPilot scan findings (issues) with severity, status, category, and scanner filters.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'category'   => array(
							'type'        => 'string',
							'description' => __( 'Finding category (e.g. seo, performance, security, geo).', 'vulopilot' ),
						),
						'severity'   => array(
							'type'        => 'string',
							'description' => __( 'One of critical, high, medium, low, info.', 'vulopilot' ),
						),
						'priority'   => array(
							'type'        => 'string',
							'description' => __( 'One of high, medium, low. Ignored when severity is given.', 'vulopilot' ),
						),
						'status'     => array(
							'type'        => 'string',
							'description' => __( 'One of open, resolved, ignored, snoozed, all.', 'vulopilot' ),
						),
						'scanner_id' => array(
							'type'        => 'string',
							'description' => __( 'Comma-separated scanner ids.', 'vulopilot' ),
						),
						'search'     => array(
							'type'        => 'string',
							'description' => __( 'Free-text search.', 'vulopilot' ),
						),
						'page'       => array(
							'type'        => 'integer',
							'description' => __( 'Page number. Defaults to 1.', 'vulopilot' ),
						),
						'per_page'   => array(
							'type'        => 'integer',
							'description' => __( 'Rows per page. Defaults to 20.', 'vulopilot' ),
						),
					),
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'get_findings' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);

		wp_register_ability(
			'vulopilot/update-finding',
			array(
				'label'               => __( 'Update Finding', 'vulopilot' ),
				'description'         => __( 'Change a VuloPilot finding\'s status (open, resolved, ignored, snoozed).', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'                 => 'object',
					'properties'           => array(
						'id'     => array(
							'type'        => 'integer',
							'description' => __( 'Finding ID.', 'vulopilot' ),
						),
						'status' => array(
							'type'        => 'string',
							'description' => __( 'New status: open, resolved, ignored, or snoozed.', 'vulopilot' ),
						),
					),
					'required'             => array( 'id', 'status' ),
					'additionalProperties' => false,
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'update_finding' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);
	}

	/**
	 * List findings.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_findings( $input ) {
		$response = VuloPilot()->rest->findings->prepare_get_items_response( (array) $input );

		return Utill::ability_response( $response );
	}

	/**
	 * Update a finding's status.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function update_finding( $input ) {
		$response = VuloPilot()->rest->findings->prepare_update_item_response( (array) $input );

		return Utill::ability_response( $response );
	}
}
