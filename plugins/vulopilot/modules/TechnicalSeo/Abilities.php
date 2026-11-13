<?php
/**
 * TechnicalSeo Abilities class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\TechnicalSeo;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * TechnicalSeo abilities. Registered on the shared `vulopilot` category, only while this module is active.
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
	 * Register TechnicalSeo abilities.
	 *
	 * @return void
	 */
	public function register_abilities() {
		wp_register_ability(
			'vulopilot/get-seo-score',
			array(
				'label'               => __( 'Get SEO Score', 'vulopilot' ),
				'description'         => __( 'Technical SEO score with per-category breakdown.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'                 => 'object',
					'properties'           => array(),
					'additionalProperties' => false,
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'get_seo_score' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);

		wp_register_ability(
			'vulopilot/get-seo-pages-needing-attention',
			array(
				'label'               => __( 'Get Pages Needing SEO Attention', 'vulopilot' ),
				'description'         => __( 'Pages ranked by open technical-SEO findings, with a 7-day delta.', 'vulopilot' ),
				'category'            => 'vulopilot',
				'input_schema'        => array(
					'type'                 => 'object',
					'properties'           => array(),
					'additionalProperties' => false,
				),
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => array( $this, 'get_seo_pages_needing_attention' ),
				'permission_callback' => array( Utill::class, 'ability_permissions_check' ),
				'meta'                => array( 'public' => true ),
			)
		);
	}

	/**
	 * Technical SEO score with per-category breakdown.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_seo_score( $input ) {
		$response = \VuloPilot()->rest->seo_score->prepare_get_score_response( (array) $input );

		return Utill::ability_response( $response );
	}

	/**
	 * Pages ranked by open technical-SEO findings, with a 7-day delta.
	 *
	 * @param array $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_seo_pages_needing_attention( $input ) {
		$response = \VuloPilot()->rest->seo_score->prepare_get_pages_needing_attention_response( (array) $input );

		return Utill::ability_response( $response );
	}
}
