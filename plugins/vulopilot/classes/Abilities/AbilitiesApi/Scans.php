<?php
/**
 * Scans abilities controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Abilities\AbilitiesApi;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Scan abilities controller.
 *
 * @class       Scans class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Scans {

	/**
	 * Register VuloPilot scan abilities.
	 *
	 * @return void
	 */
	public function register_abilities() {
		wp_register_ability(
			'vulopilot/get-scans',
			array(
				'label'               => __( 'Get Scans', 'vulopilot' ),
				'description'         => __( 'List past VuloPilot scan runs, optionally filtered by scanner, category, or status.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'scanner_id' => array(
							'type'        => 'string',
							'description' => __( 'Comma-separated scanner ids.', 'vulopilot' ),
						),
						'category'   => array(
							'type'        => 'string',
							'description' => __( 'Comma-separated scanner categories (e.g. seo, performance, security).', 'vulopilot' ),
						),
						'status'     => array(
							'type'        => 'string',
							'description' => __( 'Scan status filter.', 'vulopilot' ),
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
				'execute_callback'    => array( $this, 'get_scans' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);

		wp_register_ability(
			'vulopilot/run-scan',
			array(
				'label'               => __( 'Run Scan', 'vulopilot' ),
				'description'         => __( 'Queue a VuloPilot scan for every scanner, one scanner, or every scanner in the given categories.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'                 => 'object',
					'properties'           => array(
						'scanner_id' => array(
							'type'        => 'string',
							'description' => __( 'A scanner id, or "all". Ignored when category is given.', 'vulopilot' ),
						),
						'category'   => array(
							'type'        => 'string',
							'description' => __( 'Comma-separated scanner categories to run.', 'vulopilot' ),
						),
					),
					'additionalProperties' => false,
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'run_scan' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);

		wp_register_ability(
			'vulopilot/get-scan-status',
			array(
				'label'               => __( 'Get Scan Status', 'vulopilot' ),
				'description'         => __( 'Current state of the VuloPilot scan queue.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'                 => 'object',
					'properties'           => array(),
					'additionalProperties' => false,
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'get_scan_status' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);
	}

	/**
	 * List past scan runs.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_scans( $input ) {
		$response = VuloPilot()->rest->scans->prepare_get_items_response( (array) $input );

		return Utill::ability_response( $response );
	}

	/**
	 * Queue a scan run.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function run_scan( $input ) {
		$response = VuloPilot()->rest->scans->prepare_create_item_response( (array) $input );

		return Utill::ability_response( $response );
	}

	/**
	 * Current scan queue status.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_scan_status( $input ) {
		$response = VuloPilot()->rest->scans->prepare_get_status_response( (array) $input );

		return Utill::ability_response( $response );
	}
}
