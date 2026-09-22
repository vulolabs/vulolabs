<?php
/**
 * Geo controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Geo\Rest;

use VuloPilot\Repositories\FindingRepository;
use VuloPilot\ValueObjects\Severity;

defined( 'ABSPATH' ) || exit;

/**
 * `GET /geo/score` — a real, deterministic GEO Score (no AI, no cost) for
 * the GEO tab's own "GEO Score" card (SEO & Visibility → GEO). Same
 * shape/weighting `Controllers\Seo::get_score()` already established for
 * the SEO tab's own "SEO Health Score" — this is that same pattern applied
 * to GeoTab.tsx's own real free GEO scanner ids instead of SEO's 15.
 *
 * 6 of the 7 signals below are plain `get_severity_breakdown_for_scanner_ids()`
 * lookups over real, always-free GEO scanners (same scanner ids GeoTab.tsx's
 * own `GEO_TOPICS` already groups its findings table into, just regrouped
 * 1:1 to match this feature's own reference mockup, which names Question
 * Coverage/Entity Clarity/Content Freshness as their own rows rather than
 * folded into GEO_TOPICS' 5-tile "Other Signals" catch-all — see
 * SIGNAL_SCANNER_IDS below for the exact regrouping and why).
 *
 * The 7th, "Content Freshness", is NOT finding-based — no free scanner
 * checks it (`stale-content` exists but is Pro-only, registered by
 * vulopilot-pro's GeoInsights module; giving a dedicated headline row to a
 * scanner that never runs on a free site would silently read "100/100,
 * Good" for every free-tier visitor, which is indistinguishable from
 * "genuinely fresh" — the same failure mode this codebase's own
 * GEO_TOPICS docblock already flags for Pro-only scanners folded into a
 * mixed bucket, except there the mix dilutes it and here a dedicated row
 * wouldn't). Instead this computes a real, free, deterministic sitewide
 * freshness score straight from every published post/page's own real
 * `post_modified_gmt`, using the exact same 4-tier recency bands (25%/50%/
 * 100% of the real "stale after" setting) `GeoAnalyzer::calculate_content_freshness()`
 * already applies per-post for the (AI-scored, Pro-only) per-post GEO
 * score — just averaged across every real published page instead of one.
 *
 * Overall `geo_score` is an unweighted mean of the 7 signal scores, same
 * "unweighted mean of real per-signal averages" shape
 * `VisibilitySnapshotBuilder::calculate_overall_score()` (Pro) already
 * established as this codebase's own real GEO-scoring convention — chosen
 * over re-deriving one merged severity breakdown across all 6 finding-based
 * signals (which `Content Freshness`, not being finding-based at all,
 * couldn't join anyway).
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
     * Real, always-free GEO scanner ids (`classes/Scanners/Basic/`),
     * regrouped 1:1 against this card's own reference mockup rows. Kept in
     * sync manually with GeoTab.tsx's own `GEO_TOPICS` — same "kept in sync
     * manually" posture `Controllers\Seo::CATEGORY_SCANNER_IDS`'s own
     * docblock already documents for SEO_SECTIONS, since these two groupings
     * serve different UI purposes (a 5-tile topic grid there vs. this card's
     * own 7-row score breakdown here) despite drawing on the same 9 real
     * scanners:
     *
     * - `ai-summary`: GEO_TOPICS' own "AI Summary" topic, unchanged.
     * - `question-coverage`: GEO_TOPICS' own "FAQ-style Questions" topic,
     *   renamed here to match this card's own reference mockup wording —
     *   same real scanner underneath.
     * - `evidence-citations`/`ai-readable-structure`: unchanged from
     *   GEO_TOPICS.
     * - `entity-clarity`: split out of GEO_TOPICS' "Other Signals" catch-all
     *   into its own row, matching the mockup — real scanner
     *   `geo-entity-naming-consistency` (label "Entity Naming Consistency"),
     *   named "Entity Clarity" here since that's what naming
     *   consistency/disambiguation genuinely buys an AI system.
     * - `other-geo-signals`: the remaining always-free GEO_TOPICS "Other
     *   Signals" scanners, minus `geo-entity-naming-consistency` (moved to
     *   its own row above) and minus `stale-content` (the real,
     *   deterministic, sitewide `content-freshness` score computed in
     *   `get_content_freshness()` below already covers that concept
     *   honestly for free-tier sites; keeping the Pro-only scanner's
     *   findings folded in here too would double-count the same idea under
     *   two different rows). `llms-txt-missing` is also Pro-only
     *   (GeoInsights) — left in this mixed bucket rather than given its own
     *   row, same reasoning GEO_TOPICS' own docblock already gives: it
     *   simply contributes nothing yet on a free site, same as any other
     *   not-yet-scanned signal, and this bucket has real free scanners
     *   alongside it so a free-tier "0 open findings" reading here isn't
     *   solely because the check never ran.
     *
     * `content-freshness` (the 7th row) is deliberately NOT a key in this
     * array — see this class's own docblock for why it's computed
     * separately in `get_content_freshness()` instead.
     *
     * @var array<string, string[]>
     */
    private const SIGNAL_SCANNER_IDS = array(
        'ai-summary'             => array( 'geo-summary-block' ),
        'question-coverage'      => array( 'geo-faq-opportunity' ),
        'evidence-citations'     => array( 'geo-citation-opportunities' ),
        'ai-readable-structure'  => array( 'geo-chunking', 'geo-semantic-structure' ),
        'entity-clarity'         => array( 'geo-entity-naming-consistency' ),
        'other-geo-signals'      => array( 'geo-author-info', 'geo-eeat-signals', 'geo-trust-signals', 'llms-txt-missing' ),
    );

    /**
     * How far back "since last week" looks for `get_score()`'s own real
     * delta — same real exact-reconstruction technique (no stored snapshot)
     * `Controllers\Seo::DELTA_LOOKBACK_DAYS` already uses.
     *
     * @var int
     */
    private const DELTA_LOOKBACK_DAYS = 7;

    /**
     * Real per-signal daily score trend length for `get_score()`'s own
     * `signals[*].trend` — same `Controllers\Seo::PROGRESS_TREND_DAYS`
     * value/purpose, feeding SeoTab.tsx's own `categoryScoreDelta()` (score
     * now minus the oldest point) for each row's real up/down delta arrow,
     * now real for this card's own rows too instead of only SEO's.
     *
     * @var int
     */
    private const PROGRESS_TREND_DAYS = 7;

    /**
     * Real day-range options "Score Snapshot"'s own period dropdown offers
     * — same trio Pro's `GeoInsights\Rest::get_history()` already accepts
     * on `/geo-visibility-history?days=N` (min 7, max 365), narrowed to a
     * fixed real menu here since this card's own dropdown is a discrete
     * choice, not a free-typed number.
     *
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
     * @return \WP_REST_Response
     */
    public function get_score() {
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
     * Real published post/page count — same real scope every GEO scanner
     * itself scans, same reasoning `Controllers\Seo::get_pages_checked()`
     * already documents for SEO's own identical stat.
     *
     * @return int
     */
    private function get_pages_checked(): int {
        $posts = wp_count_posts( 'post' );
        $pages = wp_count_posts( 'page' );

        return (int) ( $posts->publish ?? 0 ) + (int) ( $pages->publish ?? 0 );
    }

    /**
     * Same weighting `Controllers\Seo::calculate_score()`/
     * BrandIntelligence::calculate_score() already use.
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
     * Real `PROGRESS_TREND_DAYS`-point daily score trend for one of this
     * card's own finding-based signals — same real `..._as_of()`
     * reconstruction technique `Controllers\Seo::get_category_trend()`
     * already established for SEO's own "SEO areas" rows, applied here so
     * `SeoTab.tsx`'s own `categoryScoreDelta()` (this endpoint's real
     * `signal.trend[0]` vs the current `signal.score`) has a real number to
     * diff for this card's rows too, not just SEO's. No new stored
     * snapshot table — every point is a fresh reconstruction of real
     * `vulopilot_scan_findings` rows as of that day.
     *
     * @param FindingRepository $findings    Shared repository instance, reused across every signal's own call rather than re-instantiated per signal.
     * @param string[]          $scanner_ids This one signal's own scanner ids (one value of `self::SIGNAL_SCANNER_IDS`).
     * @return int[] `PROGRESS_TREND_DAYS` real scores, oldest first.
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
     * Real most-severe, most-recent still-open finding's own stored
     * `title` across a set of scanner ids — the "Main Problem" column of
     * this card's own GEO Score Breakdown table. `find_all()` has no
     * severity-rank ORDER BY of its own (only real column names), so this
     * fetches real open findings for these scanner ids and ranks them
     * client-side by `Severity::all()`'s own real order — same technique
     * `Controllers\Seo::get_pages_needing_attention()` already uses for its
     * own per-page "Main Problem", just site-wide instead of per-post.
     * `null` (never a fabricated "No issues" string standing in for a real
     * scanner not having run) when nothing is open.
     *
     * @param FindingRepository $findings    Repository instance to query.
     * @param string[]          $scanner_ids Real scanner ids to look across.
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
     * Real, free, deterministic sitewide "Content Freshness" — see this
     * class's own docblock for why this exists instead of a `stale-content`
     * finding lookup. Same 4-tier recency banding
     * `GeoAnalyzer::calculate_content_freshness()` already applies per-post
     * (25%/50%/100% of the real "stale after" setting), computed here in
     * one SQL pass over every real published post/page's own real
     * `post_modified_gmt` rather than looping `WP_Post` objects in PHP.
     *
     * `trend` is always `null` here (not just an empty array) — deliberately
     * distinct from a finding-based signal's real `trend`, since (per this
     * method's own docblock) there's no historical reconstruction to offer
     * for this one, same reasoning `get_progress()`'s own docblock already
     * gives for excluding this signal from the sitewide trend entirely.
     *
     * @return array{score: int|null, open_count: null, affected_pages: int, main_problem: string|null, trend: null}
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
     * "Score Snapshot" — a real daily score trend over `days` (7/30/90),
     * one real reconstructed `geo_score` per day via the same
     * `..._as_of()` technique `Controllers\Seo::get_progress()` already
     * uses — no new stored snapshot table. Scoped to the 6 finding-based
     * signals only (`SIGNAL_SCANNER_IDS`) — `content-freshness` is excluded
     * from this trend since it isn't finding-based (no
     * `vulopilot_scan_findings` history to reconstruct against; a post's
     * `post_modified_gmt` doesn't retroactively change), so folding a
     * static drift-only number into a 6-signal reconstruction would make
     * the "one real score per day" contract this endpoint otherwise keeps
     * ambiguous about which parts are truly historical.
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
