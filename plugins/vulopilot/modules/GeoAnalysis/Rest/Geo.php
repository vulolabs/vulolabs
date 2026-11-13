<?php
/**
 * Geo controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\GeoAnalysis\Rest;

use VuloPilot\Utill\FindingRepository;
use VuloPilot\Utill\Severity;

defined( 'ABSPATH' ) || exit;

/**
 * REST controller for the GEO tab.
 *
 * @class       Geo controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class Geo extends \WP_REST_Controller {

	/**
	 * @var string
	 */
	protected $rest_base = 'geo';

	/**
	 * GEO scanner ids (`modules/GeoAnalysis/Scanners/`), regrouped against this card's 7 rows.
	 *
	 * @var array
	 */
	private const SIGNAL_SCANNER_IDS = array(
		'ai-summary'            => array( 'geo-summary-block' ),
		'question-coverage'     => array( 'geo-faq-opportunity' ),
		'evidence-citations'    => array( 'geo-citation-opportunities' ),
		'ai-readable-structure' => array( 'geo-chunking', 'geo-semantic-structure' ),
		'entity-clarity'        => array( 'geo-entity-naming-consistency' ),
		'other-geo-signals'     => array( 'geo-author-info', 'geo-eeat-signals', 'geo-trust-signals', 'llms-txt-missing' ),
	);

	/**
	 * How far back "since last week" looks for `get_score()`'s delta.
	 *
	 * @var int
	 */
	private const DELTA_LOOKBACK_DAYS = 7;

	/**
	 * Per-signal daily score trend length for `get_score()`'s `signals[*].trend`, feeding each row's up/down delta arrow.
	 *
	 * @var int
	 */
	private const PROGRESS_TREND_DAYS = 7;

	/**
	 * @var int[]
	 */
	private const ALLOWED_PROGRESS_DAYS = array( 7, 30, 90 );

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

		register_rest_route(
			VuloPilot()->rest_namespace,
			'/' . $this->rest_base . '/progress',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_progress' ),
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
	 * GEO score (REST or ability).
	 *
	 * @param array                 $payload Request params.
	 * @param \WP_REST_Request|null $request Request object, if any.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function prepare_get_score_response( $payload = array(), $request = null ) {
		$findings = new FindingRepository();

		$signals = array();
		foreach ( self::SIGNAL_SCANNER_IDS as $key => $scanner_ids ) {
			$breakdown = $findings->get_severity_breakdown_for_scanner_ids( $scanner_ids );

			$signals[ $key ] = array(
				'score'          => $this->calculate_score( $breakdown ),
				'open_count'     => array_sum( $breakdown ),
				'affected_pages' => $findings->get_affected_object_count_for_scanner_ids( $scanner_ids ),
				'main_problem'   => $this->get_main_problem( $findings, $scanner_ids ),
				'trend'          => $this->get_signal_trend( $findings, $scanner_ids ),
			);
		}

		$signals['content-freshness'] = $this->get_content_freshness();

		$geo_score = (int) round( array_sum( array_column( $signals, 'score' ) ) / count( $signals ) );

		$finding_scanner_ids = array_merge( ...array_values( self::SIGNAL_SCANNER_IDS ) );
		$overall_breakdown   = $findings->get_severity_breakdown_for_scanner_ids( $finding_scanner_ids );
		$as_of               = gmdate( 'Y-m-d H:i:s', strtotime( '-' . self::DELTA_LOOKBACK_DAYS . ' days' ) );
		$previous_breakdown  = $findings->get_severity_breakdown_for_scanner_ids_as_of( $finding_scanner_ids, $as_of );

		return rest_ensure_response(
			array(
				'geo_score'     => $geo_score,
				'pages_checked' => $this->get_pages_checked(),
				'signals'       => $signals,
				'deltas'        => array(
					'lookback_days' => self::DELTA_LOOKBACK_DAYS,
					'total_open'    => array_sum( $overall_breakdown ) - array_sum( $previous_breakdown ),
				),
			)
		);
	}

	/**
	 * Real published post/page count - same real scope every GEO scanner itself scans.
	 *
	 * @return int
	 */
	private function get_pages_checked(): int {
		$posts = wp_count_posts( 'post' );
		$pages = wp_count_posts( 'page' );

		return (int) ( $posts->publish ?? 0 ) + (int) ( $pages->publish ?? 0 );
	}

	/**
	 * Same weighting `Seo::calculate_score()`/ BrandIntelligence::calculate_score() already use.
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

	/**
	 * `PROGRESS_TREND_DAYS`-point daily score trend for one finding-based signal, same reconstruction technique as `Controllers\Seo::get_category_trend()`.
	 *
	 * @param FindingRepository $findings    Shared repository instance.
	 * @param string[]          $scanner_ids This signal's scanner ids.
	 * @return int[] Scores, oldest first.
	 */
	private function get_signal_trend( FindingRepository $findings, array $scanner_ids ): array {
		$trend = array();

		for ( $days_ago = self::PROGRESS_TREND_DAYS - 1; $days_ago >= 0; $days_ago-- ) {
			$breakdown = $findings->get_severity_breakdown_for_scanner_ids_as_of(
				$scanner_ids,
				gmdate( 'Y-m-d 23:59:59', strtotime( "-{$days_ago} days" ) )
			);

			$trend[] = $this->calculate_score( $breakdown );
		}

		return $trend;
	}

	/**
	 * Most-severe open finding's title across a set of scanner ids, for this card's "Main Problem" column.
	 *
	 * @param FindingRepository $findings    Repository instance to query.
	 * @param string[]          $scanner_ids Scanner ids to look across.
	 * @return string|null
	 */
	private function get_main_problem( FindingRepository $findings, array $scanner_ids ): ?string {
		$rows = $findings->find_all(
			array(
				'scanner_id' => $scanner_ids,
				'status'     => 'open',
				'per_page'   => 100,
				'orderby'    => 'created_at',
				'order'      => 'desc',
			)
		)['data'];

		if ( empty( $rows ) ) {
			return null;
		}

		$rank = array_flip( Severity::all() );
		usort( $rows, static fn( $a, $b ) => ( $rank[ $a['severity'] ] ?? 99 ) <=> ( $rank[ $b['severity'] ] ?? 99 ) );

		return $rows[0]['title'];
	}

	/**
	 * Sitewide "Content Freshness" signal: 4-tier recency banding.
	 *
	 * @return array
	 */
	private function get_content_freshness(): array {
		global $wpdb;

		$settings         = wp_parse_args( get_option( \VuloPilot\Utill::VULOPILOT_SETTINGS_KEY, array() ), \VuloPilot\Utill::VULOPILOT_SETTINGS_DEFAULTS );
		$stale_after_days = absint( $settings['ai_visibility_scans']['freshness']['stale_months'] ?? 12 ) * 30;

		$rows = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			"SELECT TIMESTAMPDIFF(DAY, post_modified_gmt, UTC_TIMESTAMP()) AS days_since_modified
             FROM {$wpdb->posts}
             WHERE post_type IN ('post', 'page') AND post_status = 'publish'" // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		);

		if ( empty( $rows ) ) {
			return array(
				'score'          => null,
				'open_count'     => null,
				'affected_pages' => 0,
				'main_problem'   => null,
				'trend'          => null,
			);
		}

		$tier_scores = array();
		$stale_count = 0;

		foreach ( $rows as $row ) {
			$days = max( 0, (int) $row->days_since_modified );

			if ( $days <= $stale_after_days * 0.25 ) {
				$tier = 100;
			} elseif ( $days <= $stale_after_days * 0.5 ) {
				$tier = 75;
			} elseif ( $days <= $stale_after_days ) {
				$tier = 50;
			} else {
				$tier = 25;
				++$stale_count;
			}

			$tier_scores[] = $tier;
		}

		$score = (int) round( array_sum( $tier_scores ) / count( $tier_scores ) );

		$main_problem = $stale_count > 0
			? sprintf(
				/* translators: 1: real number of pages not updated since the "stale after" window, 2: real total published pages checked. */
				_n(
					'%1$d of %2$d pages haven’t been updated in a while',
					'%1$d of %2$d pages haven’t been updated in a while',
					$stale_count,
					'vulopilot'
				),
				$stale_count,
				count( $tier_scores )
			)
			: null;

		return array(
			'score'          => $score,
			'open_count'     => null,
			'affected_pages' => $stale_count,
			'main_problem'   => $main_problem,
			'trend'          => null,
		);
	}

	/**
	 * "Score Snapshot": daily score trend over `days`.
	 *
	 * @param \WP_REST_Request $request Full request object.
	 * @return \WP_REST_Response
	 */
	public function get_progress( \WP_REST_Request $request ) {
		$days = (int) $request->get_param( 'days' );
		if ( ! in_array( $days, self::ALLOWED_PROGRESS_DAYS, true ) ) {
			$days = 30;
		}

		$findings            = new FindingRepository();
		$finding_scanner_ids = array_merge( ...array_values( self::SIGNAL_SCANNER_IDS ) );

		$trend = array();
		for ( $days_ago = $days - 1; $days_ago >= 0; $days_ago-- ) {
			$breakdown = $findings->get_severity_breakdown_for_scanner_ids_as_of(
				$finding_scanner_ids,
				gmdate( 'Y-m-d 23:59:59', strtotime( "-{$days_ago} days" ) )
			);

			$trend[] = array(
				'date'  => gmdate( 'Y-m-d', strtotime( "-{$days_ago} days" ) ),
				'score' => $this->calculate_score( $breakdown ),
			);
		}

		return rest_ensure_response(
			array(
				'days'  => $days,
				'trend' => $trend,
			)
		);
	}
}
