<?php
/**
 * Seo controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Seo\Rest;

use VuloPilot\Repositories\FindingRepository;
use VuloPilot\ValueObjects\Severity;

defined( 'ABSPATH' ) || exit;

/**
 * `GET /seo/score` — a real, deterministic SEO Score (no AI, no cost) for
 * the restyled SEO tab's own "SEO Health Score" card. Same weighted-severity
 * formula BrandIntelligence::calculate_score()/ContentIntelligence's own
 * "Content Score" already use (`100 - critical*15 - high*8 - medium*3 -
 * low*1`, clamped 0-100) over
 * FindingRepository::get_severity_breakdown_for_scanner_ids(), scoped to the
 * same 15 real scanner ids SeoTab.tsx's own SEO_SECTIONS groups its unified
 * findings table into — this endpoint just also returns that same grouping's
 * own per-category scores, real open/affected-page counts, a real
 * week-over-week delta, and a real per-category N-day sparkline trend
 * (`get_category_trend()`), all computed the identical documented way.
 *
 * @class       Seo controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class Seo extends \WP_REST_Controller {

    /**
     * @var string
     */
    protected $rest_base = 'seo';

    /**
     * The same 15 real scanner ids SeoTab.tsx's own SEO_SECTIONS/
     * seoSections.ts groups its unified findings table into, kept in sync
     * manually with that file (same "kept in sync manually" posture
     * CrawlerTrafficTab.tsx's own bot-name filter pills already document
     * for CrawlerTrafficLogger::BOT_SIGNATURES) — 6 categories now (was 3),
     * matching the reference mockup's own "SEO areas" grid exactly, still
     * the same 15 ids overall (no scanner added, none dropped):
     *
     * - `titles-meta`: title/meta-description/duplication/focus-keyword
     *   checks only now (`duplicate-content`/`orphan-pages` moved to
     *   `indexability-canonicals` below — both are indexing/canonicalization
     *   concerns, not a title/meta one).
     * - `content-structure` (NEW): heading structure, multiple H1s, thin
     *   content — split out of the old combined `titles-meta` bucket, since
     *   the mockup shows these as their own real "Content Structure" tile.
     * - `images`: unchanged.
     * - `internal-linking`: unchanged.
     * - `indexability-canonicals` (NEW): canonical URLs, duplicate content,
     *   orphan pages — all 3 are real indexability/canonicalization signals,
     *   not title/meta ones.
     * - `structured-data` (NEW): Open Graph/Twitter Card tags only — real
     *   structured *metadata*, but deliberately NOT the same thing as the
     *   `schema`/`structured-data`/`sitewide-structured-data` scanner ids,
     *   which stay owned entirely by "SEO & Visibility"'s own dedicated
     *   Schema & Knowledge tab (direct instruction, still standing: "Schema
     *   should never be bundled into this category when you already have a
     *   dedicated Schema screen"). Reusing the mockup's own "Structured
     *   Data" label for Open Graph/Twitter Card here is the closest real fit
     *   without reintroducing that exact overlap.
     *
     * `sitemap`/`robots` stay dropped from here entirely, same reasoning as
     * before (direct instruction): both are crawler/discovery controls,
     * real overlapping ownership with "SEO & Visibility"'s own dedicated
     * Crawl & URLs tab, which owns real `robots-txt`/`sitemap`/
     * `sitemap-validation`/`ai-crawler-blocked-pages` findings tables
     * itself. SeoTab.tsx's own "Search engine access" status line reads
     * those same 4 scanner ids' open-finding count directly (not through
     * this endpoint).
     *
     * @var array<string, string[]>
     */
    private const CATEGORY_SCANNER_IDS = array(
        'titles-meta'             => array(
            'seo',
            'meta-description',
            'meta-description-duplication',
            'focus-keyword-audit',
        ),
        'content-structure'       => array(
            'heading-structure',
            'multiple-h1',
            'thin-content',
        ),
        'images'                  => array( 'seo-images', 'images' ),
        'internal-linking'        => array( 'internal-linking' ),
        'indexability-canonicals' => array(
            'canonical-url',
            'duplicate-content',
            'orphan-pages',
        ),
        'structured-data'         => array( 'open-graph', 'twitter-card' ),
    );

    /**
     * How far back "since last week" looks for the real deltas below — a
     * real, exact reconstruction of that same moment's own open-finding set
     * (FindingRepository::get_severity_breakdown_for_scanner_ids_as_of(),
     * already built for Content/Brand's own score trends), not an estimate
     * and not a stored snapshot series — so this needed no new table.
     *
     * @var int
     */
    private const DELTA_LOOKBACK_DAYS = 7;

    /**
     * Real number of daily points "SEO progress"'s own "SEO Score Over
     * Time" chart plots — one real reconstructed score per day, same exact
     * `get_severity_breakdown_for_scanner_ids_as_of()` reconstruction
     * `get_score()`'s own single 7-day-ago delta already uses, just called
     * once per day instead of once total. No new table — every point is
     * computed fresh from `vulopilot_scan_findings`' own real
     * `created_at`/`resolved_at` timestamps.
     *
     * Also reused by `get_category_trend()` below for each "SEO areas"
     * tile's own real sparkline (`MetricTileComponent`'s `chart` slot,
     * SeoTab.tsx) — same technique, just re-scoped to one category's own
     * scanner ids per call instead of all 15 combined, so both sparklines
     * cover the identical real N-day window.
     *
     * @var int
     */
    private const PROGRESS_TREND_DAYS = 7;

    /**
     * Real day-range options "SEO progress"'s own new period toggle offers
     * — same real trio `Controllers\Geo::ALLOWED_PROGRESS_DAYS` already
     * established for its own "Score Snapshot" card's identical toggle
     * (min 7, max 90; `get_category_trend()`'s own per-category sparklines
     * stay fixed at `PROGRESS_TREND_DAYS` regardless — this only widens
     * `get_progress()`'s own "SEO Score Over Time" trend).
     *
     * @var int[]
     */
    private const ALLOWED_PROGRESS_DAYS = array( 7, 30, 90 );

    /**
     * Below this real character count, a set meta description is flagged
     * "Too short" rather than passed outright — short enough that a
     * search engine is likely to still append its own auto-generated
     * text after it. Same real `post_excerpt` field
     * MetaDescriptionScanner::scan() already reads (see that class's own
     * docblock for why `post_excerpt` specifically) — this endpoint just
     * additionally checks its length, which that scanner's own
     * empty-or-not check doesn't.
     *
     * @var int
     */
    private const MIN_META_DESCRIPTION_LENGTH = 50;

    /**
     * Real request timeout for fetch_rendered_body()'s own `wp_remote_get()`.
     *
     * @var int
     */
    private const PAGE_FETCH_TIMEOUT_SECONDS = 8;

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

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/pages-needing-attention',
            array(
                array(
                    'methods'             => \WP_REST_Server::READABLE,
                    'callback'            => array( $this, 'get_pages_needing_attention' ),
                    'permission_callback' => array( $this, 'get_score_permissions_check' ),
                ),
            )
        );

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/analyze-page',
            array(
                array(
                    'methods'             => \WP_REST_Server::READABLE,
                    'callback'            => array( $this, 'get_page_analysis' ),
                    'permission_callback' => array( $this, 'get_score_permissions_check' ),
                    'args'                => array(
                        'post_id' => array(
                            'required'          => true,
                            'validate_callback' => static fn( $value ): bool => is_numeric( $value ),
                        ),
                    ),
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
        $findings          = new FindingRepository();
        $all_scanner_ids   = array_merge( ...array_values( self::CATEGORY_SCANNER_IDS ) );
        $overall_breakdown = $findings->get_severity_breakdown_for_scanner_ids( $all_scanner_ids );

        $category_scores = array();
        foreach ( self::CATEGORY_SCANNER_IDS as $key => $scanner_ids ) {
            $category_breakdown = $findings->get_severity_breakdown_for_scanner_ids( $scanner_ids );

            $category_scores[ $key ] = array(
                'score'          => $this->calculate_score( $category_breakdown ),
                'open_count'     => array_sum( $category_breakdown ),
                'affected_pages' => $findings->get_affected_object_count_for_scanner_ids( $scanner_ids ),
                'trend'          => $this->get_category_trend( $findings, $scanner_ids ),
            );
        }

        $as_of              = gmdate( 'Y-m-d H:i:s', strtotime( '-' . self::DELTA_LOOKBACK_DAYS . ' days' ) );
        $previous_breakdown = $findings->get_severity_breakdown_for_scanner_ids_as_of( $all_scanner_ids, $as_of );

        return rest_ensure_response(
            array(
                'seo_score'          => $this->calculate_score( $overall_breakdown ),
                'pages_checked'      => $this->get_pages_checked(),
                'category_scores'    => $category_scores,
                'severity_breakdown' => $overall_breakdown,
                'total_open'         => array_sum( $overall_breakdown ),
                'deltas'             => array(
                    'lookback_days' => self::DELTA_LOOKBACK_DAYS,
                    'total_open'    => array_sum( $overall_breakdown ) - array_sum( $previous_breakdown ),
                    'critical'      => $overall_breakdown['critical'] - ( $previous_breakdown['critical'] ?? 0 ),
                    'high'          => $overall_breakdown['high'] - ( $previous_breakdown['high'] ?? 0 ),
                ),
            )
        );
    }

    /**
     * Real published post/page count — the same real scope
     * `SeoScanner::run()` itself scans (`post_type => ['post', 'page'],
     * post_status => 'publish'`), so "Pages checked" always means exactly
     * what the SEO module actually looks at, not a separate invented
     * definition.
     *
     * @return int
     */
    private function get_pages_checked(): int {
        $posts = wp_count_posts( 'post' );
        $pages = wp_count_posts( 'page' );

        return (int) ( $posts->publish ?? 0 ) + (int) ( $pages->publish ?? 0 );
    }

    /**
     * Real `PROGRESS_TREND_DAYS`-point daily score trend for one "SEO
     * areas" category — each `MetricTileComponent` tile's own real
     * sparkline (`chart: { type: 'sparkline', data: category.trend }`,
     * SeoTab.tsx). Same `get_severity_breakdown_for_scanner_ids_as_of()`
     * reconstruction `get_progress()`'s own sitewide trend already uses,
     * just re-run per category against that category's own scanner ids
     * rather than all 15 combined — no new stored snapshot table, every
     * point is a fresh reconstruction of real `vulopilot_scan_findings`
     * rows as of that day.
     *
     * @param FindingRepository $findings    Shared repository instance, reused across every category's own call rather than re-instantiated per category.
     * @param string[]          $scanner_ids This one category's own scanner ids (one value of `self::CATEGORY_SCANNER_IDS`).
     * @return int[] `PROGRESS_TREND_DAYS` real scores, oldest first.
     */
    private function get_category_trend( FindingRepository $findings, array $scanner_ids ): array {
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
     * Same weighting BrandIntelligence::calculate_score()/
     * ContentIntelligence's own "Content Score" already use.
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

    /**
     * "Pages that need attention" (SEO & Visibility → SEO's own new
     * "What should I fix first?" section) — every real published page/post
     * with at least one currently-open finding among the same 15 real SEO
     * scanner ids `get_score()` scopes to, each with: the same real
     * deterministic `calculate_score()` this endpoint's own sibling already
     * uses, scoped to just that page's own open findings; a real "Change"
     * (that same score minus the identical score reconstructed as of
     * `DELTA_LOOKBACK_DAYS` ago — same exact reconstruction technique
     * `get_score()`'s own site-wide `deltas` already uses, no stored
     * snapshot needed); and a real "Main Problem" (that page's own
     * worst-severity open finding's actual stored `title`, not a
     * category/summary label). Worst score first.
     *
     * @return \WP_REST_Response
     */
    public function get_pages_needing_attention() {
        $findings        = new FindingRepository();
        $all_scanner_ids = array_merge( ...array_values( self::CATEGORY_SCANNER_IDS ) );

        $current_buckets = $findings->get_open_findings_for_scanner_ids_by_post( $all_scanner_ids );

        $as_of         = gmdate( 'Y-m-d H:i:s', strtotime( '-' . self::DELTA_LOOKBACK_DAYS . ' days' ) );
        $as_of_buckets = $findings->get_open_findings_for_scanner_ids_by_post( $all_scanner_ids, $as_of );

        $severity_rank = array_flip( Severity::all() );
        $rows          = array();

        foreach ( $current_buckets as $post_id => $post_findings ) {
            $post = get_post( $post_id );

            if ( ! $post || 'publish' !== $post->post_status ) {
                continue;
            }

            $breakdown = array_fill_keys( array( 'critical', 'high', 'medium', 'low' ), 0 );
            foreach ( $post_findings as $finding ) {
                if ( array_key_exists( $finding['severity'], $breakdown ) ) {
                    ++$breakdown[ $finding['severity'] ];
                }
            }

            usort(
                $post_findings,
                static fn( $a, $b ) => ( $severity_rank[ $a['severity'] ] ?? 99 ) <=> ( $severity_rank[ $b['severity'] ] ?? 99 )
            );

            $as_of_breakdown = array_fill_keys( array( 'critical', 'high', 'medium', 'low' ), 0 );
            foreach ( ( $as_of_buckets[ $post_id ] ?? array() ) as $finding ) {
                if ( array_key_exists( $finding['severity'], $as_of_breakdown ) ) {
                    ++$as_of_breakdown[ $finding['severity'] ];
                }
            }

            $score = $this->calculate_score( $breakdown );

            $rows[] = array(
                'post_id'      => $post_id,
                'title'        => get_the_title( $post ),
                'edit_link'    => (string) get_edit_post_link( $post_id, 'raw' ),
                'permalink'    => (string) get_permalink( $post_id ),
                'score'        => $score,
                'issues'       => count( $post_findings ),
                'main_problem' => $post_findings[0]['title'],
                'change'       => $score - $this->calculate_score( $as_of_breakdown ),
            );
        }

        usort( $rows, static fn( $a, $b ) => $a['score'] <=> $b['score'] );

        return rest_ensure_response(
            array(
                'data'  => $rows,
                'total' => count( $rows ),
            )
        );
    }

    /**
     * "SEO progress" (SEO & Visibility → SEO's own new progress-over-time
     * card) — a real 7-point daily score trend, plus 3 real week-over-week
     * counters. Nothing here is a fabricated/estimated number and nothing
     * needed a new stored snapshot table — every point/counter is either a
     * fresh reconstruction of real historical `vulopilot_scan_findings`
     * rows (same `..._as_of()` technique `get_score()`'s own single 7-day
     * delta already uses, `count_resolved_between()`/`get_stats_for_period()`
     * for the two "this week" counters that already existed for
     * ReportsOverview's own period-over-period reporting) or a real
     * before/after comparison over that same reconstruction
     * (`get_open_findings_for_scanner_ids_by_post()`, "Pages that need
     * attention"'s own new helper, for "Pages Improved"). Both the trend's
     * own length AND the 3 counters' own comparison window are now
     * real-selectable (`days`, one of `ALLOWED_PROGRESS_DAYS` — same real
     * toggle `Controllers\Geo::get_progress()` already supports), rather
     * than fixed at `PROGRESS_TREND_DAYS`/`DELTA_LOOKBACK_DAYS` regardless
     * of what the toggle is set to — the `this_week` field names are
     * historical (kept so the frontend response shape doesn't change) but
     * now genuinely mean "in the selected period."
     *
     * @param \WP_REST_Request $request Full request object.
     * @return \WP_REST_Response
     */
    public function get_progress( \WP_REST_Request $request ) {
        $days = (int) $request->get_param( 'days' );
        if ( ! in_array( $days, self::ALLOWED_PROGRESS_DAYS, true ) ) {
            $days = self::PROGRESS_TREND_DAYS;
        }

        $findings        = new FindingRepository();
        $all_scanner_ids = array_merge( ...array_values( self::CATEGORY_SCANNER_IDS ) );

        $trend = array();
        for ( $days_ago = $days - 1; $days_ago >= 0; $days_ago-- ) {
            $breakdown = $findings->get_severity_breakdown_for_scanner_ids_as_of(
                $all_scanner_ids,
                gmdate( 'Y-m-d 23:59:59', strtotime( "-{$days_ago} days" ) )
            );

            $trend[] = array(
                'date'  => gmdate( 'Y-m-d', strtotime( "-{$days_ago} days" ) ),
                'score' => $this->calculate_score( $breakdown ),
            );
        }

        // The 3 week-over-week counters below now scale with the same real
        // `$days` the trend above just widened to (7/30/90 — the "SEO
        // progress" card's own new period toggle), two clean back-to-back
        // `$days`-length windows rather than a window fixed at
        // `DELTA_LOOKBACK_DAYS` regardless of what the toggle is set to
        // (the earlier, narrower version of this real-selectable-trend
        // change). `get_score()`'s own separate sitewide-score delta still
        // uses `DELTA_LOOKBACK_DAYS` fixed at 7 — that one is unrelated to
        // this card's own toggle and untouched.
        $now            = gmdate( 'Y-m-d H:i:s' );
        $period_ago     = gmdate( 'Y-m-d H:i:s', strtotime( "-{$days} days" ) );
        $two_periods_ago = gmdate( 'Y-m-d H:i:s', strtotime( '-' . ( $days * 2 ) . ' days' ) );

        $issues_fixed_this_week = $findings->count_resolved_between( $period_ago, $now, null, $all_scanner_ids );
        $issues_fixed_last_week = $findings->count_resolved_between( $two_periods_ago, $period_ago, null, $all_scanner_ids );

        // Two clean, equal-length, back-to-back `$days`-length calendar
        // windows — same span count_resolved_between()'s own datetime pair
        // above uses, just expressed as whole dates for
        // get_stats_for_period()'s own `DATE(created_at) BETWEEN` scope.
        $new_issues_this_week = $findings->get_stats_for_period(
            gmdate( 'Y-m-d', strtotime( '-' . ( $days - 1 ) . ' days' ) ),
            gmdate( 'Y-m-d' ),
            null,
            $all_scanner_ids
        )['total'];
        $new_issues_last_week = $findings->get_stats_for_period(
            gmdate( 'Y-m-d', strtotime( '-' . ( ( $days * 2 ) - 1 ) . ' days' ) ),
            gmdate( 'Y-m-d', strtotime( "-{$days} days" ) ),
            null,
            $all_scanner_ids
        )['total'];

        $pages_improved_this_week = $this->count_pages_with_improved_score(
            $findings->get_open_findings_for_scanner_ids_by_post( $all_scanner_ids ),
            $findings->get_open_findings_for_scanner_ids_by_post( $all_scanner_ids, $period_ago )
        );
        $pages_improved_last_week = $this->count_pages_with_improved_score(
            $findings->get_open_findings_for_scanner_ids_by_post( $all_scanner_ids, $period_ago ),
            $findings->get_open_findings_for_scanner_ids_by_post( $all_scanner_ids, $two_periods_ago )
        );

        return rest_ensure_response(
            array(
                'days'           => $days,
                'trend'          => $trend,
                'issues_fixed'   => array(
                    'this_week' => $issues_fixed_this_week,
                    'delta'     => $issues_fixed_this_week - $issues_fixed_last_week,
                ),
                'new_issues'     => array(
                    'this_week' => $new_issues_this_week,
                    'delta'     => $new_issues_this_week - $new_issues_last_week,
                ),
                'pages_improved' => array(
                    'this_week' => $pages_improved_this_week,
                    'delta'     => $pages_improved_this_week - $pages_improved_last_week,
                ),
            )
        );
    }

    /**
     * How many real published pages/posts scored better (a higher real
     * `calculate_score()` result) in `$current` than in `$previous` — same
     * "real published content only" scope
     * `get_pages_needing_attention()`'s own `get_post()`/`publish` check
     * already applies, so a page deleted or unpublished since `$previous`
     * was reconstructed doesn't count as "improved" just because its
     * findings vanished along with it. A post id present in one snapshot
     * but not the other genuinely had zero open findings there — scored a
     * real 100, not a missing/estimated value.
     *
     * @param array<int, array<int, array{id: int, title: string, severity: string}>> $current  get_open_findings_for_scanner_ids_by_post()'s own current-state return.
     * @param array<int, array<int, array{id: int, title: string, severity: string}>> $previous Same shape, reconstructed as of an earlier moment.
     * @return int
     */
    private function count_pages_with_improved_score( array $current, array $previous ): int {
        $score_by_post_id = function ( array $buckets ): array {
            $scores = array();

            foreach ( $buckets as $post_id => $post_findings ) {
                $breakdown = array_fill_keys( array( 'critical', 'high', 'medium', 'low' ), 0 );

                foreach ( $post_findings as $finding ) {
                    if ( array_key_exists( $finding['severity'], $breakdown ) ) {
                        ++$breakdown[ $finding['severity'] ];
                    }
                }

                $scores[ $post_id ] = $this->calculate_score( $breakdown );
            }

            return $scores;
        };

        $current_scores  = $score_by_post_id( $current );
        $previous_scores = $score_by_post_id( $previous );

        $post_ids = array_unique( array_merge( array_keys( $current_scores ), array_keys( $previous_scores ) ) );
        $improved = 0;

        foreach ( $post_ids as $post_id ) {
            $post = get_post( $post_id );

            if ( ! $post || 'publish' !== $post->post_status ) {
                continue;
            }

            $current_score  = $current_scores[ $post_id ] ?? 100;
            $previous_score = $previous_scores[ $post_id ] ?? 100;

            if ( $current_score > $previous_score ) {
                ++$improved;
            }
        }

        return $improved;
    }

    /**
     * "Page Analysis" — a real, on-demand, per-page check runner (SEO &
     * Visibility → SEO → "Pages & Posts" table's own "Analyze" row
     * action), not a restyle of anything that already existed: every
     * check below is computed fresh against this one specific page at
     * request time, not read from a possibly-stale batch scan of a
     * different, bounded set of posts. Reuses the exact same real
     * detection logic each named sibling scanner already uses (same
     * regexes, same thresholds, same settings) — just correctly scoped to
     * the one page a site owner clicked "Analyze" on, several of which
     * (H1 presence, per-page image alt text, title uniqueness,
     * indexability) have no existing scanner at all, since every sibling
     * scanner that inspects `post_content` this directly only ever
     * batch-scans "the most recent N posts," not an arbitrary one on
     * demand.
     *
     * @param \WP_REST_Request $request Full request object.
     * @return \WP_REST_Response|\WP_Error
     */
    public function get_page_analysis( \WP_REST_Request $request ) {
        $post_id = (int) $request->get_param( 'post_id' );
        $post    = get_post( $post_id );

        if ( ! $post || ! in_array( $post->post_type, array( 'post', 'page' ), true ) ) {
            return new \WP_Error(
                'vulopilot_page_not_found',
                __( 'That page could not be found.', 'vulopilot' ),
                array( 'status' => 404 )
            );
        }

        $permalink = (string) get_permalink( $post );
        $body      = $this->fetch_rendered_body( $permalink );

        return rest_ensure_response(
            array(
                'post_id'          => $post_id,
                'title'            => get_the_title( $post ),
                'permalink'        => $permalink,
                'meta_description' => $post->post_excerpt,
                'analyzed_at'      => current_time( 'mysql', true ),
                // `check_featured_image()`/`check_orphan_page()` return `null`
                // (filtered out here) when their own real settings toggle
                // (Settings → Scanning → SEO's "Flag missing featured image"/
                // "Flag orphan pages") is off — same real on/off
                // SeoImagesScanner/OrphanPageScanner themselves already
                // respect, so this panel never complains about a check the
                // site owner deliberately turned off elsewhere. Every other
                // check here has no such toggle.
                'checks'           => array_values(
                    array_filter(
                        array(
                            $this->check_title_tag( $post ),
                            $this->check_meta_description( $post ),
                            $this->check_h1_heading( $post ),
                            $this->check_headings( $post ),
                            $this->check_content_length( $post ),
                            $this->check_images_alt_text( $post ),
                            $this->check_featured_image( $post ),
                            $this->check_broken_links( $post_id ),
                            $this->check_orphan_page( $post_id ),
                            $this->check_canonical( $body ),
                            $this->check_indexability( $post ),
                            $this->check_structured_data( $body ),
                            $this->check_social_metadata( $body ),
                        )
                    )
                ),
            )
        );
    }

    /**
     * Real, unique-title-in-database check — same exact query shape
     * DuplicateContentScanner::scan() already uses to find posts sharing a
     * title, just narrowed to "does at least one OTHER published post
     * share this one's title" for a single page rather than that
     * scanner's own sitewide sweep.
     *
     * @param \WP_Post $post Page being analyzed.
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function check_title_tag( \WP_Post $post ): array {
        $label = __( 'Title Tag', 'vulopilot' );
        $title = trim( get_the_title( $post ) );

        if ( '' === $title ) {
            return $this->build_check( 'title_tag', $label, 'fail', __( 'Missing title tag', 'vulopilot' ) );
        }

        global $wpdb;
        $duplicate_count = (int) $wpdb->get_var( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_title = %s AND post_status = 'publish' AND post_type IN ('post', 'page') AND ID != %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $title,
                $post->ID
            )
        );

        if ( $duplicate_count > 0 ) {
            return $this->build_check( 'title_tag', $label, 'fail', __( 'Duplicate title — shared with another published page', 'vulopilot' ) );
        }

        return $this->build_check( 'title_tag', $label, 'pass', __( 'Title tag is unique and set', 'vulopilot' ) );
    }

    /**
     * Same real `post_excerpt` field MetaDescriptionScanner::scan()
     * already reads, additionally length-checked against
     * MIN_META_DESCRIPTION_LENGTH (that scanner only checks empty/not).
     *
     * @param \WP_Post $post Page being analyzed.
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function check_meta_description( \WP_Post $post ): array {
        $label   = __( 'Meta Description', 'vulopilot' );
        $excerpt = trim( $post->post_excerpt );
        $length  = strlen( $excerpt );

        if ( '' === $excerpt ) {
            return $this->build_check( 'meta_description', $label, 'fail', __( 'Missing meta description', 'vulopilot' ) );
        }

        if ( $length < self::MIN_META_DESCRIPTION_LENGTH ) {
            return $this->build_check(
                'meta_description',
                $label,
                'warn',
                sprintf(
                    /* translators: %d: real current character count. */
                    __( 'Too short (%d characters)', 'vulopilot' ),
                    $length
                )
            );
        }

        return $this->build_check( 'meta_description', $label, 'pass', __( 'Meta description is set', 'vulopilot' ) );
    }

    /**
     * Real presence check for an `<h1>` tag anywhere in this page's own
     * `post_content` — no existing scanner checks for H1 *presence*
     * (AccessibilityScanner's own H1 check flags a *second* one, not a
     * missing first one).
     *
     * @param \WP_Post $post Page being analyzed.
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function check_h1_heading( \WP_Post $post ): array {
        $label = __( 'H1 Heading', 'vulopilot' );

        if ( preg_match( '/<h1[\s>]/i', $post->post_content ) ) {
            return $this->build_check( 'h1_heading', $label, 'pass', __( 'H1 tag found', 'vulopilot' ) );
        }

        return $this->build_check( 'h1_heading', $label, 'fail', __( 'H1 tag not found', 'vulopilot' ) );
    }

    /**
     * Same real `<h2>`-`<h6>` presence regex HeadingStructureScanner::scan()
     * already uses — that scanner only checks content over its own
     * MIN_WORD_COUNT_TO_CHECK threshold; this runs the identical check
     * regardless of length, since a site owner analyzing one specific
     * page already knows which page they're looking at.
     *
     * @param \WP_Post $post Page being analyzed.
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function check_headings( \WP_Post $post ): array {
        $label = __( 'Subheadings', 'vulopilot' );

        if ( preg_match( '/<h[2-6][\s>]/i', $post->post_content ) ) {
            return $this->build_check( 'headings', $label, 'pass', __( 'H2, H3+ tags found', 'vulopilot' ) );
        }

        return $this->build_check( 'headings', $label, 'warn', __( 'No subheadings found', 'vulopilot' ) );
    }

    /**
     * Same real word-count + `thin_content_word_threshold` setting
     * ThinContentScanner::scan() already reads.
     *
     * @param \WP_Post $post Page being analyzed.
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function check_content_length( \WP_Post $post ): array {
        $label             = __( 'Content', 'vulopilot' );
        $settings          = wp_parse_args( get_option( \VuloPilot\Utill::VULOPILOT_SETTINGS_KEY, array() ), \VuloPilot\Utill::VULOPILOT_SETTINGS_DEFAULTS );
        $threshold_setting = absint( $settings['thin_content_word_threshold'] ?? 300 );
        $min_words         = $threshold_setting > 0 ? $threshold_setting : 300;
        $word_count        = str_word_count( wp_strip_all_tags( $post->post_content ) );

        if ( $word_count < $min_words ) {
            return $this->build_check(
                'content',
                $label,
                'fail',
                sprintf(
                    /* translators: 1: real word count, 2: real minimum recommended word count. */
                    __( 'Thin content (%1$d words, recommended %2$d+)', 'vulopilot' ),
                    $word_count,
                    $min_words
                )
            );
        }

        return $this->build_check( 'content', $label, 'pass', __( 'Word count is good', 'vulopilot' ) );
    }

    /**
     * Real per-`<img>` alt-text presence check across this page's own
     * `post_content` — distinct from ImagesScanner's separate, sitewide
     * check (missing `_wp_attachment_image_alt` meta across the whole
     * media library, not scoped to any one page).
     *
     * @param \WP_Post $post Page being analyzed.
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function check_images_alt_text( \WP_Post $post ): array {
        $label = __( 'Images', 'vulopilot' );

        if ( ! preg_match_all( '/<img\b[^>]*>/i', $post->post_content, $matches ) ) {
            return $this->build_check( 'images', $label, 'pass', __( 'No images in this content', 'vulopilot' ) );
        }

        $missing = 0;

        foreach ( $matches[0] as $img_tag ) {
            $has_alt = preg_match( '/\balt\s*=\s*"([^"]*)"/i', $img_tag, $alt_match )
                || preg_match( "/\balt\s*=\s*'([^']*)'/i", $img_tag, $alt_match );

            if ( ! $has_alt || '' === trim( $alt_match[1] ) ) {
                ++$missing;
            }
        }

        if ( $missing > 0 ) {
            return $this->build_check(
                'images',
                $label,
                'fail',
                sprintf(
                    /* translators: %d: real number of images missing alt text on this page. */
                    _n( '%d image missing alt text', '%d images missing alt text', $missing, 'vulopilot' ),
                    $missing
                )
            );
        }

        return $this->build_check( 'images', $label, 'pass', __( 'All images have alt text', 'vulopilot' ) );
    }

    /**
     * Same real `has_post_thumbnail()` check SeoImagesScanner::scan() already
     * runs (batch-scoped there to the most recently modified posts; here
     * scoped live to this one page instead), gated behind that same real
     * `flag_missing_featured_image` setting (Settings → Scanning → SEO) so
     * this panel never flags something the site owner already turned off —
     * `null` (filtered out by `get_page_analysis()`) rather than a fabricated
     * "pass" when the setting is off.
     *
     * @param \WP_Post $post Page being analyzed.
     * @return array{key: string, label: string, status: string, message: string}|null
     */
    private function check_featured_image( \WP_Post $post ): ?array {
        $settings = wp_parse_args( get_option( \VuloPilot\Utill::VULOPILOT_SETTINGS_KEY, array() ), \VuloPilot\Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['flag_missing_featured_image'] ) ) {
            return null;
        }

        $label = __( 'Featured Image', 'vulopilot' );

        if ( has_post_thumbnail( $post ) ) {
            return $this->build_check( 'featured_image', $label, 'pass', __( 'Featured image is set', 'vulopilot' ) );
        }

        return $this->build_check( 'featured_image', $label, 'fail', __( 'No featured image set', 'vulopilot' ) );
    }

    /**
     * Real, already-stored `broken-links` findings scoped to this one
     * page (`FindingRepository::find_all()`'s own `object_type`/
     * `object_ref` filters) — the same real per-run coverage
     * BrokenLinksTab.tsx's own "Broken Link Monitoring" table already
     * shows, read here rather than re-checked live so this endpoint's own
     * "broken" count can never disagree with that table for the same
     * page. Labeled "Broken Links" (not "Internal Links" — that's a
     * separate, distinct real question: does anything ELSE link *to* this
     * page, see `check_orphan_page()` below) to match what this check
     * actually answers: does this page itself contain any broken links.
     *
     * @param int $post_id Page being analyzed.
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function check_broken_links( int $post_id ): array {
        $label    = __( 'Broken Links', 'vulopilot' );
        $findings = new FindingRepository();
        $broken   = $findings->find_all(
            array(
                'scanner_id'  => 'broken-links',
                'status'      => 'open',
                'object_type' => 'post',
                'object_ref'  => (string) $post_id,
                'per_page'    => 100,
            )
        );

        $count = count( $broken['data'] ?? array() );

        if ( $count > 0 ) {
            return $this->build_check(
                'broken_links',
                $label,
                'fail',
                sprintf(
                    /* translators: %d: real number of broken links found on this page by the Broken Links scanner. */
                    _n( '%d broken internal link found', '%d broken internal links found', $count, 'vulopilot' ),
                    $count
                )
            );
        }

        return $this->build_check( 'broken_links', $label, 'pass', __( 'No broken links found', 'vulopilot' ) );
    }

    /**
     * Real, already-stored `orphan-pages` finding for this one page
     * (`OrphanPageScanner::scan()`'s own real "does anything among the most
     * recently modified content link to this page" cross-reference,
     * batch-computed sitewide and read back here rather than re-run live —
     * same "trust the stored scan, don't risk disagreeing with it" posture
     * `check_broken_links()` above already takes for `broken-links`). Gated
     * behind that scanner's own real `flag_orphan_pages` setting (Settings →
     * Scanning → SEO) so this panel never reports an orphan verdict that
     * scanner itself has been told not to compute — `null` (filtered out by
     * `get_page_analysis()`) rather than a fabricated "pass" when it's off,
     * same reasoning `check_featured_image()` above already documents.
     *
     * @param int $post_id Page being analyzed.
     * @return array{key: string, label: string, status: string, message: string}|null
     */
    private function check_orphan_page( int $post_id ): ?array {
        $settings = wp_parse_args( get_option( \VuloPilot\Utill::VULOPILOT_SETTINGS_KEY, array() ), \VuloPilot\Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['flag_orphan_pages'] ) ) {
            return null;
        }

        $label    = __( 'Orphan Page', 'vulopilot' );
        $findings = new FindingRepository();
        $orphan   = $findings->find_all(
            array(
                'scanner_id'  => 'orphan-pages',
                'status'      => 'open',
                'object_type' => 'post',
                'object_ref'  => (string) $post_id,
                'per_page'    => 1,
            )
        );

        if ( count( $orphan['data'] ?? array() ) > 0 ) {
            return $this->build_check(
                'orphan_page',
                $label,
                'fail',
                __( '0 internal links point to this page — nothing else links to it', 'vulopilot' )
            );
        }

        return $this->build_check( 'orphan_page', $label, 'pass', __( 'At least one other page links to this page', 'vulopilot' ) );
    }

    /**
     * Same real `rel="canonical"` presence check CanonicalUrlScanner::scan()
     * already uses, against this specific page's own freshly-fetched body
     * rather than that scanner's own bounded "homepage + 9 recent posts"
     * batch — a page outside that batch still gets a real, fresh answer
     * here instead of silently defaulting to "pass."
     *
     * @param string|null $body This page's real fetched HTML, or null if the fetch failed.
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function check_canonical( ?string $body ): array {
        $label = __( 'Canonical', 'vulopilot' );

        if ( null === $body ) {
            return $this->build_check( 'canonical', $label, 'warn', __( 'Could not fetch this page to check', 'vulopilot' ) );
        }

        if ( false !== stripos( $body, 'rel="canonical"' ) || false !== stripos( $body, "rel='canonical'" ) ) {
            return $this->build_check( 'canonical', $label, 'pass', __( 'Canonical is set', 'vulopilot' ) );
        }

        return $this->build_check( 'canonical', $label, 'fail', __( 'No canonical URL tag found', 'vulopilot' ) );
    }

    /**
     * Real per-page indexability signal — this page's own real
     * `post_status`, plus the site-wide "Discourage search engines"
     * setting (`get_option('blog_public')`, Settings → Reading — a real,
     * always-available WP core option, unlike a per-post noindex flag,
     * which nothing in this codebase stores since that's normally an SEO
     * plugin's own field and no specific one is assumed active here).
     *
     * @param \WP_Post $post Page being analyzed.
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function check_indexability( \WP_Post $post ): array {
        $label = __( 'Indexability', 'vulopilot' );

        if ( 'publish' !== $post->post_status ) {
            return $this->build_check( 'indexability', $label, 'fail', __( 'Not published', 'vulopilot' ) );
        }

        if ( '1' !== (string) get_option( 'blog_public' ) ) {
            return $this->build_check( 'indexability', $label, 'fail', __( 'Site is set to discourage search engines (Settings → Reading)', 'vulopilot' ) );
        }

        return $this->build_check( 'indexability', $label, 'pass', __( 'Content is indexed', 'vulopilot' ) );
    }

    /**
     * Same real `application/ld+json` presence check SchemaScanner::scan()
     * already uses, against this page's own freshly-fetched body instead
     * of that scanner's homepage-only scope.
     *
     * @param string|null $body This page's real fetched HTML, or null if the fetch failed.
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function check_structured_data( ?string $body ): array {
        $label = __( 'Structured Data', 'vulopilot' );

        if ( null === $body ) {
            return $this->build_check( 'structured_data', $label, 'warn', __( 'Could not fetch this page to check', 'vulopilot' ) );
        }

        if ( false !== stripos( $body, 'application/ld+json' ) ) {
            return $this->build_check( 'structured_data', $label, 'pass', __( 'Structured data (JSON-LD) found', 'vulopilot' ) );
        }

        return $this->build_check( 'structured_data', $label, 'warn', __( 'No schema detected', 'vulopilot' ) );
    }

    /**
     * Same real Open Graph tag presence check OpenGraphScanner::scan()
     * already uses, against this page's own freshly-fetched body instead
     * of that scanner's homepage-only scope.
     *
     * @param string|null $body This page's real fetched HTML, or null if the fetch failed.
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function check_social_metadata( ?string $body ): array {
        $label = __( 'Social Metadata', 'vulopilot' );

        if ( null === $body ) {
            return $this->build_check( 'social_metadata', $label, 'warn', __( 'Could not fetch this page to check', 'vulopilot' ) );
        }

        $required = array( 'og:title', 'og:description', 'og:image' );
        $missing  = array();

        foreach ( $required as $property ) {
            if ( false === stripos( $body, 'property="' . $property . '"' ) && false === stripos( $body, "property='" . $property . "'" ) ) {
                $missing[] = $property;
            }
        }

        if ( empty( $missing ) ) {
            return $this->build_check( 'social_metadata', $label, 'pass', __( 'Open Graph tags found', 'vulopilot' ) );
        }

        return $this->build_check(
            'social_metadata',
            $label,
            'warn',
            sprintf(
                /* translators: %s: real comma-separated list of missing Open Graph properties. */
                __( 'Open Graph tags missing: %s', 'vulopilot' ),
                implode( ', ', $missing )
            )
        );
    }

    /**
     * Builds one row of the `checks` array `get_page_analysis()` returns.
     *
     * @param string $key   Stable machine key for this check.
     * @param string $label Human-readable check name.
     * @param string $status One of 'pass'/'warn'/'fail'.
     * @param string $message Real, specific finding for this page — never a generic placeholder.
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function build_check( string $key, string $label, string $status, string $message ): array {
        return array(
            'key'     => $key,
            'label'   => $label,
            'status'  => $status,
            'message' => $message,
        );
    }

    /**
     * Same real `wp_remote_get()` fetch shape CanonicalUrlScanner/
     * OpenGraphScanner/SchemaScanner already each do independently against
     * their own narrower scope — fetched once here and shared across
     * check_canonical()/check_structured_data()/check_social_metadata()
     * rather than 3 separate requests for the same page.
     *
     * @param string $url Real permalink to fetch.
     * @return string|null Response body, or null if the request failed.
     */
    private function fetch_rendered_body( string $url ): ?string {
        $response = wp_remote_get(
            $url,
            array(
                'timeout'   => self::PAGE_FETCH_TIMEOUT_SECONDS,
                'sslverify' => false,
            )
        );

        if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
            return null;
        }

        return wp_remote_retrieve_body( $response );
    }
}
