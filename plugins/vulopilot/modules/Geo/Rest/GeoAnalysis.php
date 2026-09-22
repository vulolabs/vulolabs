<?php
/**
 * GeoAnalysis controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Geo\Rest;

use VuloPilot\Repositories\FindingRepository;
use VuloPilot\Geo\GeoAnalyzer;

defined( 'ABSPATH' ) || exit;

/**
 * `GET /geo-analysis/top-pages` — the GEO page's "Top Pages" card. This
 * filename previously hosted the per-post AI GEO score read/generate
 * routes too; those moved to vulopilot-pro's GeoInsights module (see that
 * module's `Rest.php`, registered at the same `geo-analysis` base but a
 * `/(?P<post_id>\d+)` sub-route, since generating a score is a real AI
 * call) — this route doesn't collide with that one (a literal `top-pages`
 * never matches a digits-only regex), and stays in Free deliberately: it's
 * a purely deterministic ranking over already-persisted
 * `vulopilot_scan_findings` rows, no AI call, no cost, nothing that needs
 * gating.
 *
 * Ranks by open `geo`-category finding count per post rather than by
 * GeoAnalysis\GeoAnalyzer's own AI-judged score — that score only exists
 * for posts an admin (or Pro's VisibilitySnapshotBuilder sample) has
 * explicitly analyzed, so ranking by it would silently exclude every
 * post nobody has ever run an AI analysis on. Finding count is the one
 * GEO-health signal every scanned post always has.
 *
 * @class       GeoAnalysis controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class GeoAnalysis extends \WP_REST_Controller {

    /**
     * @var string
     */
    protected $rest_base = 'geo-analysis';

    /**
     * Posts with zero open findings aren't returned by the SQL grouping
     * below (there's no row to group), so they're appended separately,
     * capped to this many, to fill out the "best" list honestly rather
     * than only ever showing posts that have at least one finding.
     */
    private const MAX_ZERO_FINDING_FILL = 20;

    /**
     * Safety bound on `get_pages()`'s own underlying `WP_Query` — its
     * sort key (`open_findings`/`visibility_score`) is computed, not a
     * native post column, so it can't be an SQL `ORDER BY`; every matching
     * post has to be pulled into memory, scored, then sorted/paginated in
     * PHP. Same "reasonable bound, not truly unlimited" posture this
     * controller's own MAX_ZERO_FINDING_FILL and
     * VisibilitySnapshotBuilder::SAMPLE_SIZE already take elsewhere in
     * this codebase, sized generously for a single site's own published
     * content rather than a multisite-scale catalog.
     */
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
     * @return \WP_REST_Response
     */
    public function get_top_pages( $request ) {
        $requested_limit = absint( $request->get_param( 'limit' ) );
        $limit           = min( 20, max( 1, $requested_limit ? $requested_limit : 5 ) );
        $scanner_ids     = $this->parse_scanner_ids( $request );
        // `scope=all` (Dashboard's own "Key pages at a glance" widget) ranks
        // by open findings of ANY category, not just GEO — additive, opt-in
        // param so every existing GEO-tab/AEO-tab caller (which never sends
        // it) keeps today's GEO-only ranking unchanged.
        $sitewide        = 'all' === $request->get_param( 'scope' );
        $counts          = ( new FindingRepository() )->count_by_column(
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

        // A site with fewer real published pages than `2 * $limit` (e.g. a
        // fresh dev install with only 2 pages total, $limit=5) would
        // otherwise show the exact same pages in both "top" and "bottom" —
        // confirmed live on GeoTab.tsx's own "Your Best & Worst Pages" card,
        // the same 2 pages listed as both "AI likes these pages already"
        // AND "Needs attention". Real redundant data, not a fabrication
        // issue — fixed by excluding whatever's already in `top` before
        // ranking the worst, so "bottom" only ever shows pages `top`
        // hasn't already claimed (naturally shorter, even empty, on a very
        // small site, which TopPagesCard.tsx already handles via its own
        // `data.bottom.length > 0` check).
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
     * `GET /geo-analysis/pages` — every published page/post with its real
     * open-GEO-finding count and a real, deterministic (non-AI) visibility
     * percentage. Originally GEO tab's own standalone "Page-by-page
     * analysis" table (Export CSV + sortable, unlike get_top_pages()'s own
     * bounded top/bottom-N lists); now also the row source `IssuesSection.tsx`
     * uses for its "Pages & Posts" table when its own `pageAnalysis` prop is
     * set (GeoTab.tsx/AeoTab.tsx), merging that visibility % + Export CSV
     * into the same table instead of two separate ones showing the same
     * pages twice — per direct instruction. `status`/`date` (added for that
     * merge) are the real `post_status`/`post_modified`, same fields
     * `SeoIssuesByPageTable.tsx` already showed via its own `wp/v2` fetch.
     * The visibility score is the exact same formula
     * GeoAnalyzer::calculate_deterministic_score() computes for one post's
     * own card (GeoAnalyzer::score_from_failures() — see that method's own
     * docblock for why this endpoint calls the extracted, bulk-friendly
     * version instead of that private per-post one) — real structural
     * checks already persisted as scan findings, not an AI-generated
     * number and not gated behind the opt-in "Generate GEO score" action,
     * so every page gets a real percentage instead of only the handful
     * someone has explicitly analyzed.
     *
     * `open_findings`/`sitewide_trust_signal_failure` both come from one
     * shared `count_by_column('object_ref', …)` call — the same grouped
     * query get_top_pages() already uses, reused here instead of querying
     * per post (`calculate_deterministic_score()`'s own two-queries-per-post
     * shape would mean N+1 queries across a whole site's pages).
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
        $total_checks                   = $scanner_ids ? count( $scanner_ids ) : null;

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
                'post_id'         => $post_id,
                'title'           => get_the_title( $post ),
                'edit_link'       => get_edit_post_link( $post_id, 'raw' ),
                'permalink'       => get_permalink( $post ),
                'status'          => $post->post_status,
                'date'            => $post->post_modified,
                'open_findings'   => $open_findings,
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

                // Nulls (no GEO history) always sort last regardless of direction —
                // "unscored" isn't meaningfully higher or lower than a real number.
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
     * Optional `scanner_ids` request param (comma-separated) — when present,
     * both `get_top_pages()` and `get_pages()` rank/score by open findings
     * against that specific caller-supplied set of scanner ids instead of
     * the default `category = geo`. AeoTab.tsx's own "Top pages by answer
     * readiness"/"Page-by-page answer readiness" pass its own 5 real AEO
     * scanner ids this way, reusing this same real endpoint + deterministic
     * scoring formula (GeoAnalyzer::score_from_failures(), also given the
     * matching real denominator — see that method's own docblock) rather
     * than standing up a parallel "AeoAnalysis" controller that would just
     * re-run the identical query shape against a different WHERE clause.
     *
     * @param \WP_REST_Request $request Full request object.
     * @return string[] Sanitized scanner ids, empty if the param was absent/empty.
     */
    private function parse_scanner_ids( \WP_REST_Request $request ): array {
        $raw = (string) $request->get_param( 'scanner_ids' );

        if ( '' === $raw ) {
            return array();
        }

        return array_values( array_filter( array_map( 'sanitize_key', explode( ',', $raw ) ) ) );
    }

    /**
     * @param int $post_id       Post to build a row for.
     * @param int $open_findings Its already-known open GEO finding count.
     * @return array{post_id: int, title: string, edit_link: string, permalink: string, open_findings: int}|null Null if the post no longer exists.
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
     * Published posts/pages with no open GEO finding at all, capped to
     * MAX_ZERO_FINDING_FILL — see get_top_pages()'s own docblock for why
     * these need a separate query rather than falling out of the grouped
     * count above.
     *
     * @param int[] $exclude_post_ids Post ids already counted (have at least one open finding), skip these.
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
            $query_args['post__not_in'] = $exclude_post_ids;
        }

        return get_posts( $query_args );
    }
}
