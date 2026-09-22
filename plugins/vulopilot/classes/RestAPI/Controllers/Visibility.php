<?php
/**
 * Visibility controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\RestAPI\Controllers;

use VuloPilot\Repositories\FindingRepository;
use VuloPilot\Services\GoogleAnalyticsClient;
use VuloPilot\Services\GoogleServicesConnection;
use VuloPilot\Seo\Rest\Seo;
use VuloPilot\Geo\Rest\Geo;
use VuloPilot\BrandIntelligence\Rest\BrandIntelligence;

defined( 'ABSPATH' ) || exit;

/**
 * `GET /visibility/score` / `GET /visibility/progress` — back the "SEO &
 * Visibility → Overview" tab's own real dashboard (OverviewTab.tsx):
 * one combined score across the 4 real free-tier areas already scored
 * elsewhere on this plugin's own dedicated tabs (Brand, SEO, GEO, Crawl &
 * URLs), plus a real combined trend.
 *
 * Deliberately calls each area's own existing controller method directly
 * (`( new Seo() )->get_score()`, etc.) rather than re-deriving each area's
 * own scanner-id list/formula a 6th time — this guarantees the number shown
 * here for "SEO" (for example) can never disagree with the number SEO's
 * own tab shows, since both come from the exact same call. Only the 7-day-
 * ago *delta* per area is computed locally here (via the same
 * `..._as_of()` reconstruction technique every other score endpoint in
 * this codebase already uses), since none of the 4 source endpoints expose
 * a "score as of N days ago" of their own — `AREA_SCANNER_IDS` below is
 * kept in sync manually with each source controller's own scanner-id
 * list, same "kept in sync manually" convention `Controllers\Seo`'s own
 * docblock already documents for a similar cross-file duplication.
 *
 * AEO and Keywords are deliberately NOT included: AEO has no free-tier
 * score anywhere in this codebase (`AeoTab.tsx`'s own client-side "AEO
 * Score" reads a Pro-only snapshot and silently falls back to 0 without
 * vulopilot-pro's GeoInsights module active); Keywords has no score at
 * all, only Search-Console-gated position/click stats. Averaging in a
 * fabricated or always-zero number for either would drag the combined
 * score down dishonestly rather than reflect real site health — better to
 * average 4 genuinely real areas than 6 where 2 are placeholders.
 *
 * @class       Visibility controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class Visibility extends \WP_REST_Controller {

    /**
     * @var string
     */
    protected $rest_base = 'visibility';

    /**
     * Real scanner ids behind each area's own score, kept in sync manually
     * with `Controllers\Seo::CATEGORY_SCANNER_IDS` (merged), `Controllers\Geo::SIGNAL_SCANNER_IDS`
     * (merged, minus `content-freshness` — that signal is a real sitewide
     * computation from `post_modified_gmt`, not a finding count, so it has
     * no "as of N days ago" reconstruction the way a finding does; GEO's
     * own real `/geo/progress` excludes it from its trend for the identical
     * reason, see that class's own docblock), `Controllers\BrandIntelligence::TRUST_SCANNER_IDS`/
     * `AUTHORITY_SCANNER_IDS` (merged), and `Controllers\CrawlerTraffic::get_analytics()`'s
     * own inline 4-id array. Used ONLY for the 7-day-ago delta reconstruction
     * and the combined trend below — the *current* score for each area
     * always comes from that area's own real endpoint (see this class's own
     * docblock), so a delta computed from a slightly different or stale
     * copy of this list would still never make the *headline* number
     * disagree with that area's own tab, only the change arrow's precision.
     *
     * @var array<string, string[]>
     */
    private const AREA_SCANNER_IDS = array(
        'brand' => array( 'geo-trust-signals', 'about-page-analysis', 'geo-eeat-signals', 'geo-author-info', 'author-schema' ),
        'seo'   => array(
            'seo',
            'meta-description',
            'meta-description-duplication',
            'focus-keyword-audit',
            'heading-structure',
            'multiple-h1',
            'thin-content',
            'seo-images',
            'images',
            'internal-linking',
            'canonical-url',
            'duplicate-content',
            'orphan-pages',
            'open-graph',
            'twitter-card',
        ),
        'geo'   => array(
            'geo-summary-block',
            'geo-faq-opportunity',
            'geo-citation-opportunities',
            'geo-chunking',
            'geo-semantic-structure',
            'geo-entity-naming-consistency',
            'geo-author-info',
            'geo-eeat-signals',
            'geo-trust-signals',
            'llms-txt-missing',
        ),
        'crawl' => array( 'robots-txt', 'sitemap', 'sitemap-validation', 'ai-crawler-blocked-pages' ),
    );

    /**
     * Real, human-facing label per area — same 4 areas the "Visibility
     * Breakdown" table's own rows show.
     *
     * @var array<string, string>
     */
    private const AREA_LABELS = array(
        'brand' => 'Brand Visibility',
        'seo'   => 'SEO',
        'geo'   => 'GEO (AI Visibility)',
        'crawl' => 'Crawl & URLs',
    );

    /**
     * Same 7-day lookback every other real score delta in this codebase
     * uses (`Controllers\Seo::DELTA_LOOKBACK_DAYS`, `Controllers\Geo::DELTA_LOOKBACK_DAYS`).
     *
     * @var int
     */
    private const DELTA_LOOKBACK_DAYS = 7;

    /**
     * Real day-range options "Visibility Trend"'s own period dropdown
     * offers, same trio `Controllers\Geo::ALLOWED_PROGRESS_DAYS` already
     * uses.
     *
     * @var int[]
     */
    private const ALLOWED_PROGRESS_DAYS = array( 7, 30, 90 );

    /**
     * Real GA4 traffic-source lookback window for "Visibility by Source" —
     * fixed rather than user-selectable (unlike "Visibility Trend"'s own
     * 7/30/90 dropdown above) since this card has no period control of its
     * own in the reference layout it matches.
     *
     * @var int
     */
    private const TRAFFIC_SOURCE_WINDOW_DAYS = 30;

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
            '/' . $this->rest_base . '/traffic-sources',
            array(
                array(
                    'methods'             => \WP_REST_Server::READABLE,
                    'callback'            => array( $this, 'get_traffic_sources' ),
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
        $seo_data   = ( new Seo() )->get_score()->get_data();
        $geo_data   = ( new Geo() )->get_score()->get_data();
        $brand_data = ( new BrandIntelligence() )->get_score()->get_data();
        $crawl_data = ( new CrawlerTraffic() )->get_analytics( new \WP_REST_Request() )->get_data();

        $areas = array(
            'brand' => array( 'label' => self::AREA_LABELS['brand'], 'score' => (int) $brand_data['brand_score'] ),
            'seo'   => array( 'label' => self::AREA_LABELS['seo'], 'score' => (int) $seo_data['seo_score'] ),
            'geo'   => array( 'label' => self::AREA_LABELS['geo'], 'score' => (int) $geo_data['geo_score'] ),
            'crawl' => array( 'label' => self::AREA_LABELS['crawl'], 'score' => (int) $crawl_data['crawl_health_score'] ),
        );

        $findings = new FindingRepository();
        $as_of    = gmdate( 'Y-m-d H:i:s', strtotime( '-' . self::DELTA_LOOKBACK_DAYS . ' days' ) );

        foreach ( self::AREA_SCANNER_IDS as $key => $scanner_ids ) {
            $previous_breakdown             = $findings->get_severity_breakdown_for_scanner_ids_as_of( $scanner_ids, $as_of );
            $areas[ $key ]['previous_score'] = $this->calculate_score( $previous_breakdown );
            $areas[ $key ]['change']         = $areas[ $key ]['score'] - $areas[ $key ]['previous_score'];
        }

        $visibility_score          = (int) round( array_sum( array_column( $areas, 'score' ) ) / count( $areas ) );
        $previous_visibility_score = (int) round( array_sum( array_column( $areas, 'previous_score' ) ) / count( $areas ) );

        return rest_ensure_response(
            array(
                'visibility_score'          => $visibility_score,
                'previous_visibility_score' => $previous_visibility_score,
                'change'                    => $visibility_score - $previous_visibility_score,
                'lookback_days'             => self::DELTA_LOOKBACK_DAYS,
                'areas'                     => $areas,
            )
        );
    }

    /**
     * Same weighting every other real score in this codebase uses.
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
     * "Visibility Trend" — a real daily combined-score trend over `days`
     * (7/30/90), one real reconstructed score per day
     * (`FindingRepository::get_severity_breakdown_for_scanner_ids_as_of()`,
     * same technique every other real score trend in this codebase already
     * uses) across ALL 4 areas' scanner ids merged into one breakdown —
     * genuinely cheap (one query per day, same cost as `Controllers\Geo::get_progress()`),
     * not 4 separate per-area reconstructions per day. No new stored
     * snapshot table.
     *
     * @param \WP_REST_Request $request Full request object.
     * @return \WP_REST_Response
     */
    public function get_progress( \WP_REST_Request $request ) {
        $days = (int) $request->get_param( 'days' );
        if ( ! in_array( $days, self::ALLOWED_PROGRESS_DAYS, true ) ) {
            $days = 30;
        }

        $findings = new FindingRepository();
        $all_ids  = array_values( array_unique( array_merge( ...array_values( self::AREA_SCANNER_IDS ) ) ) );

        $trend = array();
        for ( $days_ago = $days - 1; $days_ago >= 0; $days_ago-- ) {
            $breakdown = $findings->get_severity_breakdown_for_scanner_ids_as_of(
                $all_ids,
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

    /**
     * "Visibility by Source" — real GA4 sessions grouped by
     * `sessionDefaultChannelGroup` (GoogleAnalyticsClient::run_channel_group_report()),
     * a genuine Google Analytics dimension, over the last
     * `TRAFFIC_SOURCE_WINDOW_DAYS` real days. This plugin tracks zero
     * human-visitor traffic-source data of its own anywhere
     * (`vulopilot_crawler_visits` is AI bots only, by explicit design — see
     * `CrawlerTraffic.php`'s own docblock; Search Console is organic-
     * search-only by definition) — so unlike "Visibility by Area" (this
     * same tab's own real category-score donut, a separate concept), this
     * card only ever has real data to show once a site owner has actually
     * connected a real GA4 property (Settings → Connections → Google
     * Services). `connected: false` (empty `sources`) covers both "never
     * connected" and "connected, but the live GA4 call itself failed" —
     * the frontend renders the identical honest "connect" prompt either
     * way rather than a fabricated number or a confusing distinct error
     * state for a case a site owner can't act on differently anyway.
     *
     * @return \WP_REST_Response
     */
    public function get_traffic_sources() {
        $connection = new GoogleServicesConnection();
        $status     = $connection->get_status();

        $response = array(
            'connected'      => false,
            'window_days'    => self::TRAFFIC_SOURCE_WINDOW_DAYS,
            'total_sessions' => 0,
            'sources'        => array(),
        );

        if ( ! $status['connected'] || '' === $status['ga4_property_id'] ) {
            return rest_ensure_response( $response );
        }

        $end_date   = gmdate( 'Y-m-d' );
        $start_date = gmdate( 'Y-m-d', strtotime( '-' . ( self::TRAFFIC_SOURCE_WINDOW_DAYS - 1 ) . ' days' ) );

        $sessions_by_channel = ( new GoogleAnalyticsClient( $connection ) )->run_channel_group_report( $status['ga4_property_id'], $start_date, $end_date );

        if ( is_wp_error( $sessions_by_channel ) || empty( $sessions_by_channel ) ) {
            return rest_ensure_response( $response );
        }

        arsort( $sessions_by_channel );

        $total = array_sum( $sessions_by_channel );

        $response['connected']      = true;
        $response['total_sessions'] = $total;

        foreach ( $sessions_by_channel as $channel => $sessions ) {
            $response['sources'][] = array(
                'label'    => $channel,
                'sessions' => $sessions,
                'percent'  => $total > 0 ? (int) round( $sessions / $total * 100 ) : 0,
            );
        }

        return rest_ensure_response( $response );
    }
}
