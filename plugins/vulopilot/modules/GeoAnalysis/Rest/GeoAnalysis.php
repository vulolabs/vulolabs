<?php
/**
 * GeoAnalysis controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\GeoAnalysis\Rest;

use VuloPilot\Utill\FindingRepository;
use VuloPilot\GeoAnalysis\GeoAnalyzer;

defined( 'ABSPATH' ) || exit;

/**
 * @class       GeoAnalysis controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class GeoAnalysis extends \WP_REST_Controller {

	/**
	 * @var string
	 */
	protected $rest_base = 'geo-analysis';

	/** Posts with zero open findings aren't returned by the SQL grouping below, so they're appended separately. */
	private const MAX_ZERO_FINDING_FILL = 20;

	/** Safety bound on `get_pages()`'s `WP_Query`. */
	private const MAX_PAGES_QUERY = 1000;

	/**
	 * @inheritDoc
	 */
	public function register_routes() {
		register_rest_route(
			\VuloPilot()->rest_namespace,
			'/' . $this->rest_base . '/top-pages',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_top_pages' ),
					'permission_callback' => array( $this, 'get_top_pages_permissions_check' ),
				),
			)
		);

		register_rest_route(
			\VuloPilot()->rest_namespace,
			'/' . $this->rest_base . '/pages',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_pages' ),
					'permission_callback' => array( $this, 'get_top_pages_permissions_check' ),
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
	public function get_top_pages_permissions_check( $request ) {
		return current_user_can( 'manage_options' );
	}

	/**
	 * @param \WP_REST_Request $request Full request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_top_pages( $request ) {
		return $this->prepare_get_top_pages_response( $request->get_params(), $request );
	}

	/**
	 * Top/bottom pages by open GEO findings (REST or ability).
	 *
	 * @param array                 $payload Request params.
	 * @param \WP_REST_Request|null $request Request object, if any.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function prepare_get_top_pages_response( $payload = array(), $request = null ) {
		$requested_limit = absint( ( $payload['limit'] ?? null ) );
		$limit           = min( 20, max( 1, $requested_limit ? $requested_limit : 5 ) );
		$scanner_ids     = $this->parse_scanner_ids( (string) ( $payload['scanner_ids'] ?? '' ) );
		// `scope=all` ranks by open findings of any category, not just GEO.
		$sitewide = 'all' === ( $payload['scope'] ?? null );
		$counts   = ( new FindingRepository() )->count_by_column(
			'object_ref',
			$sitewide
				? array( 'status' => 'open' )
				: ( $scanner_ids
					? array(
						'scanner_id' => $scanner_ids,
						'status'     => 'open',
					)
					: array(
						'category' => 'geo',
						'status'   => 'open',
					) )
		);

		$ranked = array();

		foreach ( $counts as $post_id => $open_findings ) {
			$ranked[] = $this->build_row( (int) $post_id, (int) $open_findings );
		}

		$ranked = array_values( array_filter( $ranked ) );

		$zero_finding_posts = $this->get_zero_finding_posts( array_column( $ranked, 'post_id' ) );

		foreach ( $zero_finding_posts as $post_id ) {
			$ranked[] = $this->build_row( $post_id, 0 );
		}

		usort( $ranked, static fn( $a, $b ) => $a['open_findings'] <=> $b['open_findings'] );

		$top     = array_slice( $ranked, 0, $limit );
		$top_ids = array_column( $top, 'post_id' );

		// A site with fewer published pages than `2 * $limit` would otherwise show the same pages in both "top" and "bottom".
		$remaining = array_values(
			array_filter(
				$ranked,
				static fn( $row ) => ! in_array( $row['post_id'], $top_ids, true )
			)
		);

		return rest_ensure_response(
			array(
				'top'    => $top,
				'bottom' => array_slice( array_reverse( $remaining ), 0, $limit ),
			)
		);
	}

	/**
	 * `GET /geo-analysis/pages`.
	 *
	 * @param \WP_REST_Request $request Full request object.
	 * @return \WP_REST_Response
	 */
	public function get_pages( $request ) {
		$page        = max( 1, absint( $request->get_param( 'page' ) ) ?: 1 );
		$per_page    = min( self::MAX_PAGES_QUERY, max( 1, absint( $request->get_param( 'per_page' ) ) ?: 10 ) );
		$search      = sanitize_text_field( (string) $request->get_param( 'search' ) );
		$orderby     = sanitize_key( (string) $request->get_param( 'orderby' ) ) ?: 'open_findings';
		$order       = 'asc' === strtolower( (string) $request->get_param( 'order' ) ) ? 'asc' : 'desc';
		$scanner_ids = $this->parse_scanner_ids( $request );

		$findings            = new FindingRepository();
		$history_scope       = $scanner_ids ? array( 'scanner_id' => $scanner_ids ) : array( 'category' => 'geo' );
		$has_any_geo_history = 0 < (int) $findings->find_all( $history_scope + array( 'per_page' => 1 ) )['total'];

		$counts_by_object_ref          = $findings->count_by_column(
			'object_ref',
			$history_scope + array( 'status' => 'open' )
		);
		$sitewide_trust_signal_failure = 0 < (int) ( $counts_by_object_ref[ home_url( '/' ) ] ?? 0 );
		$total_checks                  = $scanner_ids ? count( $scanner_ids ) : null;

		$query_args = array(
			'post_type'      => array( 'post', 'page' ),
			'post_status'    => 'publish',
			'posts_per_page' => self::MAX_PAGES_QUERY,
			'fields'         => 'ids',
		);

		if ( '' !== $search ) {
			$query_args['s'] = $search;
		}

		$post_ids = get_posts( $query_args );

		$rows = array();

		foreach ( $post_ids as $post_id ) {
			$post = get_post( $post_id );

			if ( ! $post ) {
				continue;
			}

			$open_findings = (int) ( $counts_by_object_ref[ (string) $post_id ] ?? 0 );

			$rows[] = array(
				'post_id'          => $post_id,
				'title'            => get_the_title( $post ),
				'edit_link'        => get_edit_post_link( $post_id, 'raw' ),
				'permalink'        => get_permalink( $post ),
				'status'           => $post->post_status,
				'date'             => $post->post_modified,
				'open_findings'    => $open_findings,
				'visibility_score' => $has_any_geo_history
					? GeoAnalyzer::score_from_failures( $open_findings, $sitewide_trust_signal_failure, $total_checks )
					: null,
			);
		}

		$sort_key = in_array( $orderby, array( 'open_findings', 'visibility_score', 'title' ), true )
			? $orderby
			: 'open_findings';

		usort(
			$rows,
			static function ( $a, $b ) use ( $sort_key, $order ) {
				$a_value = $a[ $sort_key ];
				$b_value = $b[ $sort_key ];

				// Nulls always sort last regardless of direction.
				if ( null === $a_value && null === $b_value ) {
					return 0;
				}
				if ( null === $a_value ) {
					return 1;
				}
				if ( null === $b_value ) {
					return -1;
				}

				$comparison = is_string( $a_value ) ? strcasecmp( $a_value, $b_value ) : $a_value <=> $b_value;

				return 'asc' === $order ? $comparison : -$comparison;
			}
		);

		$total  = count( $rows );
		$offset = ( $page - 1 ) * $per_page;
		$paged  = array_slice( $rows, $offset, $per_page );

		return rest_ensure_response(
			array(
				'data'  => $paged,
				'total' => $total,
			)
		);
	}

	/**
	 * Optional `scanner_ids` request param.
	 *
	 * @param \WP_REST_Request $request Full request object.
	 * @return string[] Sanitized scanner ids, empty if the param was absent/empty.
	 */
	private function parse_scanner_ids( $request ): array {
		$raw = $request instanceof \WP_REST_Request ? (string) $request->get_param( 'scanner_ids' ) : (string) $request;

		if ( '' === $raw ) {
			return array();
		}

		return array_values( array_filter( array_map( 'sanitize_key', explode( ',', $raw ) ) ) );
	}

	/**
	 * @param int $post_id       Post to build a row for.
	 * @param int $open_findings Its already-known open GEO finding count.
	 * @return array|null Null if the post no longer exists.
	 */
	private function build_row( int $post_id, int $open_findings ): ?array {
		$post = get_post( $post_id );

		if ( ! $post || 'publish' !== $post->post_status ) {
			return null;
		}

		return array(
			'post_id'       => $post_id,
			'title'         => get_the_title( $post ),
			'edit_link'     => get_edit_post_link( $post_id, 'raw' ),
			'permalink'     => get_permalink( $post ),
			'open_findings' => $open_findings,
		);
	}

	/**
	 * Published posts/pages with no open GEO finding at all, capped to MAX_ZERO_FINDING_FILL.
	 *
	 * @param int[] $exclude_post_ids Post ids already counted.
	 * @return int[]
	 */
	private function get_zero_finding_posts( array $exclude_post_ids ): array {
		$query_args = array(
			'post_type'      => array( 'post', 'page' ),
			'post_status'    => 'publish',
			'posts_per_page' => self::MAX_ZERO_FINDING_FILL,
			'orderby'        => 'modified',
			'order'          => 'DESC',
			'fields'         => 'ids',
		);

		if ( $exclude_post_ids ) {
			$query_args['post__not_in'] = $exclude_post_ids; // phpcs:ignore WordPressVIPMinimum.Performance.WPQueryParams.PostNotIn_post__not_in -- excludes the small set of posts that already have a real geo finding, bounded by self::MAX_ZERO_FINDING_FILL's own result set size, not an unbounded/user-controlled list.
		}

		return get_posts( $query_args );
	}
}
