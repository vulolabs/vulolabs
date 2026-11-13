<?php
/**
 * GeoAnalysis Abilities class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\GeoAnalysis;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * GeoAnalysis abilities. Registered on the shared `vulopilot` category, only while this module is active.
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
	 * Register GeoAnalysis abilities.
	 *
	 * @return void
	 */
	public function register_abilities() {
		wp_register_ability(
			'vulopilot/get-geo-score',
			array(
				'label'               => __( 'Get GEO Score', 'vulopilot' ),
				'description'         => __( 'Generative Engine Optimization (AI search visibility) score.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'                 => 'object',
					'properties'           => array(),
					'additionalProperties' => false,
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'get_geo_score' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);

		wp_register_ability(
			'vulopilot/get-geo-top-pages',
			array(
				'label'               => __( 'Get GEO Top Pages', 'vulopilot' ),
				'description'         => __( 'Best and worst pages by open GEO findings.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'limit' => array(
							'type'        => 'integer',
							'description' => __( 'How many pages per list (1-20). Defaults to 5.', 'vulopilot' ),
						),
						'scope' => array(
							'type'        => 'string',
							'description' => __( 'Pass "all" to rank by open findings of any category.', 'vulopilot' ),
						),
						'scanner_ids' => array(
							'type'        => 'string',
							'description' => __( 'Comma-separated scanner ids to scope by.', 'vulopilot' ),
						),
					),
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'get_geo_top_pages' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);

		wp_register_ability(
			'vulopilot/generate-llms-txt',
			array(
				'label'               => __( 'Generate llms.txt', 'vulopilot' ),
				'description'         => __( 'Generate fresh llms.txt content for this site (returned, not written).', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'                 => 'object',
					'properties'           => array(),
					'additionalProperties' => false,
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'generate_llms_txt' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);
	}

	/**
	 * Generative Engine Optimization (AI search visibility) score.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_geo_score( $input ) {
		$response = \VuloPilot()->rest->geo_score->prepare_get_score_response( (array) $input );

		return Utill::ability_response( $response );
	}

	/**
	 * Best and worst pages by open GEO findings.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_geo_top_pages( $input ) {
		$response = \VuloPilot()->rest->geo_top_pages->prepare_get_top_pages_response( (array) $input );

		return Utill::ability_response( $response );
	}

	/**
	 * Generate fresh llms.txt content for this site (returned, not written).
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function generate_llms_txt( $input ) {
		$response = \VuloPilot()->rest->llms_txt->prepare_get_regenerated_content_response( (array) $input );

		return Utill::ability_response( $response );
	}
}
