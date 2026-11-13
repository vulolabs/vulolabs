<?php
/**
 * BrandIntelligence controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\BrandVisibility\Rest;

use VuloPilot\Utill\FindingRepository;

defined( 'ABSPATH' ) || exit;

/**
 * REST controller for Brand Intelligence's deterministic scores.
 *
 * @class       BrandIntelligence controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class BrandIntelligence extends \WP_REST_Controller {

	/**
	 * @var string
	 */
	protected $rest_base = 'brand-intelligence';

	/**
	 * @var string[]
	 */
	private const TRUST_SCANNER_IDS = array( 'geo-trust-signals', 'about-page-analysis' );

	/**
	 * @var string[]
	 */
	private const AUTHORITY_SCANNER_IDS = array( 'geo-eeat-signals', 'geo-author-info', 'author-schema' );

	/**
	 * @var string[]
	 */
	private const ENTITY_SCANNER_IDS = array( 'geo-entity-naming-consistency', 'organization-schema' );

	/**
	 * @inheritDoc
	 */
	public function register_routes() {
		register_rest_route(
			VuloPilot()->rest_namespace,
			'/' . $this->rest_base . '/score',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_score' ),
					'permission_callback' => array( $this, 'get_score_permissions_check' ),
				),
			)
		);
	}

	/**
	 * Same manage_options gate every other VuloPilot REST route uses.
	 *
	 * @param \WP_REST_Request $request Full request object.
	 * @return bool
	 */
	public function get_score_permissions_check( $request ) {
		return current_user_can( 'manage_options' );
	}

	/**
	 * @param \WP_REST_Request $request Full request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_score( $request ) {
		return $this->prepare_get_score_response( $request->get_params(), $request );
	}

	/**
	 * Brand score (REST or ability).
	 *
	 * @param array                 $payload Request params.
	 * @param \WP_REST_Request|null $request Request object, if any.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function prepare_get_score_response( $payload = array(), $request = null ) {
		$findings = new FindingRepository();

		$trust_breakdown     = $findings->get_severity_breakdown_for_scanner_ids( self::TRUST_SCANNER_IDS );
		$authority_breakdown = $findings->get_severity_breakdown_for_scanner_ids( self::AUTHORITY_SCANNER_IDS );
		$entity_breakdown    = $findings->get_severity_breakdown_for_scanner_ids( self::ENTITY_SCANNER_IDS );
		// Trust + Authority only - see this class's own docblock for why Entity no longer blends into the overall Brand Score.
		$overall_breakdown = $findings->get_severity_breakdown_for_scanner_ids(
			array_merge( self::TRUST_SCANNER_IDS, self::AUTHORITY_SCANNER_IDS )
		);

		return rest_ensure_response(
			array(
				'brand_score'        => $this->calculate_score( $overall_breakdown ),
				'trust_score'        => $this->calculate_score( $trust_breakdown ),
				'authority_score'    => $this->calculate_score( $authority_breakdown ),
				'entity_score'       => $this->calculate_score( $entity_breakdown ),
				'severity_breakdown' => $overall_breakdown,
			)
		);
	}

	/**
	 * Same weighting Dashboard::calculate_category_score()/ ContentIntelligence::get_score() already use.
	 *
	 * @param array $breakdown Severity breakdown to score.
	 * @return int 0-100.
	 */
	private function calculate_score( array $breakdown ): int {
		$score = 100
			- ( 15 * log( 1 + $breakdown['critical'] ) )
			- ( 8 * log( 1 + $breakdown['high'] ) )
			- ( 3 * log( 1 + $breakdown['medium'] ) )
			- ( 1 * log( 1 + $breakdown['low'] ) );

		return (int) round( max( 0, min( 100, $score ) ) );
	}
}
