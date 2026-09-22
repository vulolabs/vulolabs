<?php
/**
 * Dashboard controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\RestAPI\Controllers;

use VuloPilot\ValueObjects\Severity;
use VuloPilot\Repositories\ActionRunRepository;
use VuloPilot\Repositories\AiHistoryRepository;
use VuloPilot\Repositories\AutomationsRepository;
use VuloPilot\Repositories\FindingRepository;

defined( 'ABSPATH' ) || exit;

/**
 * GET /dashboard — the summary object the Dashboard page's widgets read
 * (src/dashboard-widgets/registry.ts's DashboardSummary interface). This
 * is one aggregate payload rather than one REST call per widget
 * (performance.md's "prefer a single query" guidance, applied to the
 * frontend's fetch pattern too) — every number here is a cheap,
 * index-backed COUNT/GROUP BY, not a computed-per-request table scan.
 *
 * List-shaped widgets (Recent Activity, Latest Reports, Pending Approval,
 * Automation Status's row list, Health Timeline) deliberately do NOT live
 * in this payload — they call the existing dedicated list endpoints
 * (`/activity-logs`, `/reports`, `/ai-action-runs`, `/automations`,
 * `/site-health-snapshots`) directly, the same endpoints their full list
 * pages already use, rather than duplicating that data here.
 *
 * @class       Dashboard controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class Dashboard extends \WP_REST_Controller {

    /**
     * @var string
     */
    protected $rest_base = 'dashboard';

    /**
     * @inheritDoc
     */
    public function register_routes() {
        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base,
            array(
                array(
                    'methods'             => \WP_REST_Server::READABLE,
                    'callback'            => array( $this, 'get_items' ),
                    'permission_callback' => array( $this, 'get_items_permissions_check' ),
                ),
            )
        );
    }

    /**
     * @inheritDoc
     */
    public function get_items_permissions_check( $request ) {
        return current_user_can( 'manage_options' );
    }

    /**
     * @inheritDoc
     */
    public function get_items( $request ) {
        $findings        = new FindingRepository();
        $automations     = new AutomationsRepository();
        $action_runs     = new ActionRunRepository();
        $ai_usage        = $this->build_ai_usage_this_month();
        $category_scores = $this->build_category_scores( $findings );

        return rest_ensure_response(
            array(
                'overall_score'            => $this->calculate_overall_score( $category_scores ),
                'open_findings'            => $this->count_open_findings( $findings ),
                'critical_findings'        => $findings->count_by_severity( Severity::CRITICAL ),
                'findings_by_severity'     => $this->build_findings_by_severity( $findings ),
                'active_automations'       => $automations->count_enabled(),
                'ai_jobs_used'             => $ai_usage['ai_jobs_used'],
                'ai_jobs_quota'            => $ai_usage['ai_jobs_quota'],
                'category_scores'          => $category_scores,
                'psi_speed_scores'         => $this->build_psi_speed_scores(),
                'category_scores_7d_ago'   => $this->build_category_scores_as_of( $findings, gmdate( 'Y-m-d H:i:s', strtotime( '-7 days' ) ) ),
                // Dashboard's "Good / N open findings" hero badges — real
                // counts from findings' own created_at/resolved_at, same
                // 7-day window category_scores_7d_ago already reconstructs
                // against.
                'new_findings_this_week'   => $findings->count_created_since( gmdate( 'Y-m-d H:i:s', strtotime( '-7 days' ) ) ),
                'fixed_findings_this_week' => $findings->count_resolved_since( gmdate( 'Y-m-d H:i:s', strtotime( '-7 days' ) ) ),
                'quick_fixes'              => $this->count_quick_fixes( $findings ),
                'pending_approvals'        => (int) $action_runs->find_all(
                    array(
						'status'   => 'pending_approval',
						'per_page' => 1,
					)
                )['total'],
                'automation_status'        => $automations->get_status_counts(),
                'site_snapshot'            => $this->build_site_snapshot(),
            )
        );
    }

    /**
     * "Site snapshot" — real WordPress core counts, every one a plain core
     * function call (`wp_count_posts()`/`wp_count_comments()`/`count_users()`/
     * `get_plugins()`/`phpversion()`/`get_bloginfo('version')`), not derived
     * from scan findings the way every other field on this payload is.
     * Nothing in this codebase exposed these before this method — added
     * specifically to back the Dashboard's own "Site snapshot" widget
     * rather than leave that section fabricated or omitted, since every
     * number here is genuinely free to compute (no query, no scan, just
     * core WP state already loaded on every request).
     *
     * @return array{posts: int, pages: int, comments: int, users: int, plugins_active: int, plugins_total: int, wp_version: string, php_version: string}
     */
    private function build_site_snapshot(): array {
        if ( ! function_exists( 'get_plugins' ) ) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        $post_counts    = wp_count_posts( 'post' );
        $page_counts    = wp_count_posts( 'page' );
        $comment_counts = wp_count_comments();
        $user_counts    = count_users();
        $active_plugins = (array) get_option( 'active_plugins', array() );

        return array(
            'posts'          => (int) ( $post_counts->publish ?? 0 ),
            'pages'          => (int) ( $page_counts->publish ?? 0 ),
            'comments'       => (int) ( $comment_counts->approved ?? 0 ),
            'users'          => (int) ( $user_counts['total_users'] ?? 0 ),
            'plugins_active' => count( $active_plugins ),
            'plugins_total'  => count( get_plugins() ),
            'wp_version'     => get_bloginfo( 'version' ),
            'php_version'    => PHP_VERSION,
        );
    }

    /**
     * Real AI usage for the current calendar month, read from
     * `vulopilot_ai_history` — the ledger `AI\AiRequestSender` writes a
     * row to on every real AI call, already
     * consumed by the AI Usage Report and Recent Conversations. `ai_jobs_used`
     * is real; `ai_jobs_quota` stays honestly 0 (meaning "no cap configured"),
     * since no quota cap exists anywhere yet (AI-ARCHITECTURE.md's "What's not here yet" —
     * quota enforcement). No widget on the Dashboard/AI Copilot pages reads
     * these two fields today (the AI Copilot page's own usage widget was
     * replaced by RecommendedActionsCard — a real-findings summary, not a
     * usage count), but they stay real rather than a hardcoded stub since
     * DashboardSummary's own contract (this class's docblock) is "one
     * aggregate payload, widgets pick the fields they need."
     *
     * @return array{ai_jobs_used: int, ai_jobs_quota: int}
     */
    private function build_ai_usage_this_month(): array {
        $stats = ( new AiHistoryRepository() )->get_stats_for_period( gmdate( 'Y-m-01' ), gmdate( 'Y-m-d' ) );

        return array(
            'ai_jobs_used'  => $stats['total_calls'],
            'ai_jobs_quota' => 0,
        );
    }

    /**
     * Per-domain widget scores (SEO/Performance/Security/Accessibility/
     * WooCommerce). `vulopilot_site_health_snapshots` already has
     * `seo_score`/`performance_score`/`security_score` columns, but
     * nothing in this codebase computes or writes them yet
     * (ScanPersistenceListener::refresh_todays_snapshot() only ever
     * upserts overall_score) — reading those columns here would silently
     * always return null, which is indistinguishable from "not
     * implemented" and would be exactly the kind of fabricated-looking
     * number this controller's docblock already warns against for AI
     * usage. Instead each score is computed live, using the identical
     * weighting calculate_overall_score() uses, just scoped to one
     * category's open findings — a real, honest derived score computable
     * from data that already exists.
     *
     * @param FindingRepository $findings Repository to read category breakdowns from.
     * @return array<string, int|null> Category id => 0-100 score, or null where the category doesn't apply to this site (WooCommerce inactive).
     */
    private function build_category_scores( FindingRepository $findings ): array {
        $categories = array( 'seo', 'performance', 'security', 'accessibility', 'geo' );
        $scores     = array();

        foreach ( $categories as $category ) {
            $scores[ $category ] = $this->calculate_category_score( $findings, $category );
        }

        $scores['woocommerce'] = class_exists( 'WooCommerce' )
            ? $this->calculate_category_score( $findings, 'woocommerce' )
            : null;

        // Content Intelligence's "Content Score" — deliberately NOT one of
        // the single-category loop above: it spans a fixed scanner_id list
        // across two categories (content's own readability scanner plus 4
        // reused seo-category scanners), not one category string
        // (CONTENT-INTELLIGENCE-MODULE.md's audit explains why those seo
        // scanners aren't recategorized). Same weighting, different scope.
        $scores['content'] = $this->calculate_content_score( $findings );

        // Brand Intelligence's overall "Brand Score" — same
        // cross-scanner-id-list scope as 'content' above, spanning 3 new
        // brand-category scanners plus 4 reused geo-category ones
        // (Controllers\BrandIntelligence's own docblock explains the
        // grouping; BRAND-INTELLIGENCE-MODULE.md has the full audit).
        $scores['brand'] = $this->calculate_brand_score( $findings );

        return $scores;
    }

    /**
     * Same 8 keys/same weighting as build_category_scores(), but each
     * score is reconstructed as of a past moment via
     * get_severity_breakdown_for_category_as_of() instead of counting
     * today's open findings — what the Dashboard's score-card trend
     * arrows diff against (this call's result vs. build_category_scores()'s),
     * since no per-category score snapshot history exists to read a real
     * delta from directly.
     *
     * @param FindingRepository $findings Repository to read category breakdowns from.
     * @param string            $as_of    MySQL datetime (UTC) to reconstruct every category's open set as of.
     * @return array<string, int|null> Category id => 0-100 score, or null where the category doesn't apply to this site (WooCommerce inactive).
     */
    private function build_category_scores_as_of( FindingRepository $findings, string $as_of ): array {
        $categories = array( 'seo', 'performance', 'security', 'accessibility', 'geo' );
        $scores     = array();

        foreach ( $categories as $category ) {
            $breakdown           = $findings->get_severity_breakdown_for_category_as_of( $category, $as_of );
            $scores[ $category ] = $this->score_from_breakdown( $breakdown );
        }

        $scores['woocommerce'] = class_exists( 'WooCommerce' )
            ? $this->score_from_breakdown( $findings->get_severity_breakdown_for_category_as_of( 'woocommerce', $as_of ) )
            : null;

        $scores['content'] = $this->score_from_breakdown(
            $findings->get_severity_breakdown_for_scanner_ids_as_of(
                array( 'readability', 'thin-content', 'duplicate-content', 'heading-structure', 'internal-linking', 'orphan-pages' ),
                $as_of
            )
        );

        $scores['brand'] = $this->score_from_breakdown(
            $findings->get_severity_breakdown_for_scanner_ids_as_of(
                array(
                    'geo-trust-signals',
                    'about-page-analysis',
                    'geo-eeat-signals',
                    'geo-author-info',
                    'author-schema',
                    'geo-entity-naming-consistency',
                    'organization-schema',
                ),
                $as_of
            )
        );

        return $scores;
    }

    /**
     * The one weighting formula calculate_overall_score()/
     * calculate_category_score()/calculate_content_score()/
     * calculate_brand_score() each already apply to a current-open-findings
     * breakdown, factored out so build_category_scores_as_of() can apply
     * the identical formula to a reconstructed-as-of-a-past-date breakdown
     * instead — the trend is only meaningful if both ends use the same
     * scoring math.
     *
     * @param array{critical: int, high: int, medium: int, low: int} $breakdown Severity counts to score.
     * @return int 0-100.
     */
    private function score_from_breakdown( array $breakdown ): int {
        $score = 100
            - ( $breakdown['critical'] * 15 )
            - ( $breakdown['high'] * 8 )
            - ( $breakdown['medium'] * 3 )
            - ( $breakdown['low'] * 1 );

        return max( 0, min( 100, $score ) );
    }

    /**
     * Same weighting as calculate_category_score()/calculate_content_score(),
     * scoped to Brand Intelligence's own combined scanner_id list — see
     * Controllers\BrandIntelligence::get_score() for the same 7 ids split
     * into its own named Trust/Authority/Entity sub-scores.
     *
     * @param FindingRepository $findings Repository to read the breakdown from.
     * @return int 0-100.
     */
    private function calculate_brand_score( FindingRepository $findings ): int {
        $breakdown = $findings->get_severity_breakdown_for_scanner_ids(
            array(
                'geo-trust-signals',
                'about-page-analysis',
                'geo-eeat-signals',
                'geo-author-info',
                'author-schema',
                'geo-entity-naming-consistency',
                'organization-schema',
            )
        );

        $score = 100
            - ( $breakdown['critical'] * 15 )
            - ( $breakdown['high'] * 8 )
            - ( $breakdown['medium'] * 3 )
            - ( $breakdown['low'] * 1 );

        return max( 0, min( 100, $score ) );
    }

    /**
     * Same weighting as calculate_category_score()/calculate_overall_score(),
     * scoped to Content Intelligence's own fixed scanner_id list — see
     * FindingRepository::get_severity_breakdown_for_scanner_ids()'s own
     * docblock for why a scanner-id list, not a category string, is what
     * this composite score needs.
     *
     * @param FindingRepository $findings Repository to read the breakdown from.
     * @return int 0-100.
     */
    private function calculate_content_score( FindingRepository $findings ): int {
        $breakdown = $findings->get_severity_breakdown_for_scanner_ids(
            array( 'readability', 'thin-content', 'duplicate-content', 'heading-structure', 'internal-linking', 'orphan-pages' )
        );

        $score = 100
            - ( $breakdown['critical'] * 15 )
            - ( $breakdown['high'] * 8 )
            - ( $breakdown['medium'] * 3 )
            - ( $breakdown['low'] * 1 );

        return max( 0, min( 100, $score ) );
    }

    /**
     * Same weighting as calculate_overall_score(), scoped to one category.
     *
     * @param FindingRepository $findings Repository to read the breakdown from.
     * @param string            $category One of the scanner category strings (SCANNERS.md).
     * @return int 0-100.
     */
    private function calculate_category_score( FindingRepository $findings, string $category ): int {
        $breakdown = $findings->get_severity_breakdown_for_category( $category );

        $score = 100
            - ( $breakdown['critical'] * 15 )
            - ( $breakdown['high'] * 8 )
            - ( $breakdown['medium'] * 3 )
            - ( $breakdown['low'] * 1 );

        return max( 0, min( 100, $score ) );
    }

    /**
     * Real Google PageSpeed Insights Mobile/Desktop scores, if a
     * `psi_api_key` is configured (Services\PageSpeedInsightsFetcher's own
     * cron/one-off fetch writes these three options; this method never
     * makes the slow external HTTP call itself). Both scores null means
     * PerformanceScoreCard.tsx falls back to the single real unified
     * `category_scores.performance` number instead of a fabricated split.
     *
     * @return array{mobile: int|null, desktop: int|null, checked_at: string|null}
     */
    private function build_psi_speed_scores(): array {
        $mobile     = get_option( 'vulopilot_psi_mobile_score', null );
        $desktop    = get_option( 'vulopilot_psi_desktop_score', null );
        $checked_at = get_option( 'vulopilot_psi_checked_at', null );

        return array(
            'mobile'     => null !== $mobile ? (int) $mobile : null,
            'desktop'    => null !== $desktop ? (int) $desktop : null,
            'checked_at' => '' !== $checked_at ? $checked_at : null,
        );
    }

    /**
     * "Quick Fixes" = open findings in a category that has a matching
     * one-click AIAction already registered, by the same by-convention id
     * match AI-ACTIONS.md's "Recommendations as an input source" section
     * documents (`images` findings ↔ the `generate-alt` action). This
     * isn't a general "all auto-fixable findings" count — there's no
     * formal Recommendation → Action mapping yet (AI-ACTIONS.md's "What's
     * not here yet"), so counting anything beyond the one real pairing
     * that exists today would overstate what VuloPilot can actually do.
     *
     * @param FindingRepository $findings Repository to count from.
     * @return int
     */
    private function count_quick_fixes( FindingRepository $findings ): int {
        if ( ! VuloPilot()->ai_action_registry->get_action( 'generate-alt' ) ) {
            return 0;
        }

        return $findings->count_by_category( 'images' );
    }

    /**
     * @param FindingRepository $findings Repository to sum severities from.
     * @return int
     */
    private function count_open_findings( FindingRepository $findings ): int {
        $total = 0;

        foreach ( Severity::all() as $severity ) {
            $total += $findings->count_by_severity( $severity );
        }

        return $total;
    }

    /**
     * Open finding count per severity — backs the Dashboard's issue
     * distribution chart. `info` is excluded: it's a real severity value
     * the `vulopilot_scan_findings` column accepts, but nothing in
     * calculate_overall_score()'s own weighting treats it as an issue
     * (no point deduction), so surfacing it here would misrepresent it as
     * something needing attention.
     *
     * @param FindingRepository $findings Repository to count from.
     * @return array{critical: int, high: int, medium: int, low: int}
     */
    private function build_findings_by_severity( FindingRepository $findings ): array {
        return array(
            'critical' => $findings->count_by_severity( Severity::CRITICAL ),
            'high'     => $findings->count_by_severity( Severity::HIGH ),
            'medium'   => $findings->count_by_severity( Severity::MEDIUM ),
            'low'      => $findings->count_by_severity( Severity::LOW ),
        );
    }

    /**
     * "Overall Health" — the average of every applicable category's own
     * already-computed, already-displayed 0-100 score (build_category_scores()'s
     * return value), not an independent raw severity-count formula run
     * across every open finding sitewide in one combined total.
     *
     * That combined-total formula is what this method used to do, and on
     * any real, actively-scanned site it saturates almost immediately:
     * confirmed live on this site's own 507 open findings (238 of them
     * `high`, weighted 8 points each — 1904 points of "damage" alone) blew
     * straight through the same 100-point budget calculate_category_score()
     * applies per category, clamping this one stat to 0 while every
     * category tile right below it (SEO 35, Performance 96, Security 0,
     * Content 68) still showed real gradation — reading as "this number
     * isn't syncing" rather than "this site has a lot of open issues," and
     * guaranteed to keep reading that way on this site (or any similarly
     * sized one) regardless of how much real progress is made. Averaging
     * the categories instead keeps this headline inside the same range the
     * tiles beneath it show, and since each category already clamps itself
     * to 0-100 before this average runs, one saturated category (Security,
     * here) can no longer single-handedly floor the whole site's score.
     *
     * @param array<string, int|null> $category_scores build_category_scores()'s own return value — null entries (e.g. `woocommerce` on a non-WooCommerce site) are excluded from the average rather than counted as 0.
     * @return int 0-100.
     */
    private function calculate_overall_score( array $category_scores ): int {
        $applicable = array_filter(
            $category_scores,
            static function ( $score ) {
                return null !== $score;
            }
        );

        if ( ! $applicable ) {
            return 100;
        }

        return (int) round( array_sum( $applicable ) / count( $applicable ) );
    }
}
