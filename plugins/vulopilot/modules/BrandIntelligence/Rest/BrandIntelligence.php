<?php
/**
 * BrandIntelligence controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\BrandIntelligence\Rest;

use VuloPilot\Repositories\FindingRepository;

defined( 'ABSPATH' ) || exit;

/**
 * `GET /brand-intelligence/score` — Brand Intelligence's composite,
 * deterministic scores (no AI, no cost): an overall "Brand Score" plus
 * three named sub-scores (Trust, Authority, Entity), each scoped to its
 * own `scanner_id` list via
 * FindingRepository::get_severity_breakdown_for_scanner_ids() and the
 * exact same weighting Controllers\Dashboard::calculate_category_score()
 * already uses — same cross-scanner-id-list mechanism
 * Controllers\ContentIntelligence's own "Content Score" already
 * establishes, just with 3 named sub-scores instead of 1 flat score
 * (BRAND-INTELLIGENCE-MODULE.md's audit explains the scanner grouping).
 *
 * Every scanner_id here is either brand-new (`organization-schema`,
 * `author-schema`, `about-page-analysis`) or an existing `geo`-category
 * scanner reused rather than duplicated/recategorized
 * (`geo-trust-signals`, `geo-eeat-signals`, `geo-author-info`,
 * `geo-entity-naming-consistency`) — the same "spans categories via an
 * explicit id list, not a category string" reasoning Content Score's own
 * docblock gives.
 *
 * `brand_score` used to blend all 3 sub-scores (Trust + Authority +
 * Entity) together; now just Trust + Authority (direct instruction:
 * "Knowledge Graph and Brand Visibility overlap around 'Entity'... Entity
 * Score therefore has a much stronger conceptual home in Knowledge
 * Graph... Brand Visibility: 'Do people and AI trust/recognise my
 * brand?' [vs] Knowledge Graph: 'Does Google/AI understand who and what
 * my business actually is?'"). `entity_score` itself is still computed
 * and returned here, unchanged — KnowledgeGraphSection.tsx's own new
 * "Entity Understanding" card reads it straight from this same real
 * endpoint/field rather than a second, duplicate calculation; only
 * BrandScoreCard.tsx stopped rendering it as one of ITS OWN 4 tiles (now
 * 3: Brand/Trust/Authority).
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
     * @return \WP_REST_Response
     */
    public function get_score() {
        $findings = new FindingRepository();

        $trust_breakdown     = $findings->get_severity_breakdown_for_scanner_ids( self::TRUST_SCANNER_IDS );
        $authority_breakdown = $findings->get_severity_breakdown_for_scanner_ids( self::AUTHORITY_SCANNER_IDS );
        $entity_breakdown    = $findings->get_severity_breakdown_for_scanner_ids( self::ENTITY_SCANNER_IDS );
        // Trust + Authority only — see this class's own docblock for why
        // Entity no longer blends into the overall Brand Score.
        $overall_breakdown   = $findings->get_severity_breakdown_for_scanner_ids(
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
     * Same weighting Controllers\Dashboard::calculate_category_score()/
     * Controllers\ContentIntelligence::get_score() already use.
     *
     * @param array{critical: int, high: int, medium: int, low: int} $breakdown Severity breakdown to score.
     * @return int 0-100.
     */
    private function calculate_score( array $breakdown ): int {
        $score = 100
            - ( $breakdown['critical'] * 15 )
            - ( $breakdown['high'] * 8 )
            - ( $breakdown['medium'] * 3 )
            - ( $breakdown['low'] * 1 );

        return max( 0, min( 100, $score ) );
    }
}
