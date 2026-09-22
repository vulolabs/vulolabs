<?php
/**
 * GeoAnalyzer class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Geo;

use VuloPilot\AI\AiRequestSender;
use VuloPilot\ValueObjects\GeoScore;
use VuloPilot\Repositories\ActivityLogRepository;
use VuloPilot\Repositories\FindingRepository;
use VuloPilot\Geo\Scanners\GeoCitationOpportunityScanner;

defined( 'ABSPATH' ) || exit;

/**
 * Generates a GeoScore for one post (GEO-MODULE.md's "Generate GEO Score"
 * / "Generate AI suggestions" capability). Deliberately a plain,
 * concrete orchestrator with no interface — like Scanners\ScanRunner and
 * RuleEngine\RuleEngine, there is exactly one way "analyze this post for
 * GEO" happens in this codebase, so an interface here would have one
 * implementer and add nothing (the same reasoning already applied
 * throughout SCANNERS.md/RULE-ENGINE.md).
 *
 * This is NOT an AIAction: nothing about the post's own content is
 * mutated, so there is no Approval/Execution/Rollback lifecycle to run
 * (AI-ACTIONS.md's stages 5-7 exist specifically to gate a *mutation*,
 * and a read-only analysis has none). It still reuses the exact same
 * safety-validated AI call path every AIAction goes through
 * (AI\AiRequestSender, extracted from
 * AiCopilot\ActionRunner precisely so this class didn't have to
 * duplicate that sequence) and the exact same FindingRepository every
 * other engine already persists through — no parallel infrastructure.
 *
 * @class       GeoAnalyzer class
 * @version     1.0.0
 * @author      VuloLabs
 */
class GeoAnalyzer {

    /**
     * The 8 GEO-MODULE.md scanners scoped to a single post, plus the one
     * sitewide check (Trust Signals) that applies identically to every
     * post — 9 total, matching GeoScore's docblock.
     */
    private const TOTAL_DETERMINISTIC_CHECKS = 9;

    public const META_KEY = '_vulopilot_geo_score';

    private FindingRepository $findings;
    private AiRequestSender $request_sender;
    private ActivityLogRepository $activity_logs;

    /**
     * $request_sender is deliberately required, not defaulted — VuloPilot.php's
     * init_classes() builds the one real AiRequestSender during bootstrap and
     * this class must be given that same instance, the same reason
     * AiCopilot\ActionRunner requires it too.
     *
     * @param AiRequestSender          $request_sender Sends a prompt through the safety-validate → send → sanitize sequence.
     * @param FindingRepository|null     $findings       Defaults to a new instance (injectable for tests).
     * @param ActivityLogRepository|null $activity_logs Defaults to a new instance (injectable for tests).
     */
    public function __construct( AiRequestSender $request_sender, ?FindingRepository $findings = null, ?ActivityLogRepository $activity_logs = null ) {
        $this->request_sender = $request_sender;
        $this->findings       = $findings ?? new FindingRepository();
        $this->activity_logs  = $activity_logs ?? new ActivityLogRepository();
    }

    /**
     * Runs a fresh analysis, persists it to postmeta, and returns it.
     *
     * @param int $post_id Post to analyze.
     * @return GeoScore
     *
     * @throws \InvalidArgumentException If post_id doesn't refer to a published post/page.
     * @throws \RuntimeException         If no AI connection is configured, or the AI response is unusable.
     */
    public function analyze( int $post_id ): GeoScore {
        $post = get_post( $post_id );

        if ( ! $post || ! in_array( $post->post_type, array( 'post', 'page' ), true ) || 'publish' !== $post->post_status ) {
            throw new \InvalidArgumentException( __( 'post_id must refer to a published post or page.', 'vulopilot' ) );
        }

        $settings = wp_parse_args( get_option( \VuloPilot\Utill::VULOPILOT_SETTINGS_KEY, array() ), \VuloPilot\Utill::VULOPILOT_SETTINGS_DEFAULTS );

        $deterministic_score       = $this->calculate_deterministic_score( $post_id );
        $sub_scores                = $this->calculate_sub_scores( $post_id, $post );
        $messages                  = $this->build_prompt( $post, $deterministic_score, $settings );
        $response                  = $this->request_sender->send( $messages, null, 'geo_analysis' );
        $ai_scores_and_suggestions = $this->parse_response( $response );

        // Scanning → GEO's "Flag weak entity coverage" — entity_coverage
        // needs AI judgment (GEO-MODULE.md's "Splitting 12 checks into two
        // honest categories"), so unlike a deterministic scanner's flag_*
        // kill switch this can't skip the AI call itself; instead it drops
        // the dimension from the result when disabled, same as a disabled
        // scanner reporting no finding. GeoScore's consumers (GeoScoreCard,
        // VisibilitySnapshotBuilder) already treat every ai_scores key as
        // optional for exactly this kind of missing-key case.
        if ( empty( $settings['ai_visibility_scans']['entity']['enable'] ) ) {
            unset( $ai_scores_and_suggestions['ai_scores']['entity_coverage'] );
        }

        $overall_score = $this->calculate_overall_score( $deterministic_score, $ai_scores_and_suggestions['ai_scores'], $sub_scores );

        $score = new GeoScore(
            $post_id,
            $deterministic_score,
            $ai_scores_and_suggestions['ai_scores'],
            $sub_scores,
            $overall_score,
            $ai_scores_and_suggestions['suggestions'],
            current_time( 'mysql', true )
        );

        $this->maybe_notify_score_drop( $post, $overall_score );

        update_post_meta( $post_id, self::META_KEY, wp_json_encode( $score->to_array() ) );

        return $score;
    }

    /**
     * Compares this analysis's overall_score against the previously stored
     * one (if any) and emails/logs when it fell by at least
     * `visibility_alerts['geo']['threshold']` — gated behind both
     * `email_on_visibility_alerts` and `visibility_alerts['geo']['enable']`
     * (Settings → Notifications → Visibility Alerts, default off). Runs
     * before the new score overwrites the old one in postmeta, since it
     * needs to read the prior value first; only ever fires on an actual
     * re-analysis of a post that already had a stored score, never on a
     * post's first-ever analysis (there is nothing to have "dropped" from).
     *
     * @param \WP_Post $post          Post just analyzed.
     * @param int      $overall_score The just-computed overall_score.
     * @return void
     */
    private function maybe_notify_score_drop( \WP_Post $post, int $overall_score ): void {
        $settings = wp_parse_args( get_option( \VuloPilot\Utill::VULOPILOT_SETTINGS_KEY, array() ), \VuloPilot\Utill::VULOPILOT_SETTINGS_DEFAULTS );

        $geo_alert = (array) ( $settings['visibility_alerts']['geo'] ?? array() );

        if ( empty( $settings['email_on_visibility_alerts'] ) || empty( $geo_alert['enable'] ) ) {
            return;
        }

        $previous = $this->get_stored_score( $post->ID );

        if ( null === $previous || ! isset( $previous['overall_score'] ) ) {
            return;
        }

        $threshold = absint( $geo_alert['threshold'] ?? 5 );
        $drop      = (int) $previous['overall_score'] - $overall_score;

        if ( $drop < $threshold ) {
            return;
        }

        $message = sprintf(
            /* translators: 1: previous score, 2: new score, 3: post title. */
            __( 'The GEO score for "%3$s" fell from %1$d to %2$d.', 'vulopilot' ),
            (int) $previous['overall_score'],
            $overall_score,
            $post->post_title
        );

        $channels = (array) ( $settings['visibility_alert_channels'] ?? array() );

        if ( in_array( 'dashboard', $channels, true ) ) {
            $this->activity_logs->log( 'visibility_alert.geo_score_drop', $message, 'warning', 'system', 'post', (string) $post->ID );
        }

        if ( ! in_array( 'email', $channels, true ) ) {
            return;
        }

        $recipient = $settings['notification_email'] ?: get_option( 'admin_email' );
        $headers   = array();

        if ( ! empty( $settings['email_from_address'] ) && is_email( $settings['email_from_address'] ) ) {
            $from_name = $settings['email_from_name'] ?: get_bloginfo( 'name' );
            $headers[] = sprintf( 'From: %s <%s>', $from_name, $settings['email_from_address'] );
        }

        wp_mail(
            $recipient,
            sprintf(
                /* translators: 1: site name, 2: post title. */
                __( '[%1$s] GEO score dropped for "%2$s"', 'vulopilot' ),
                get_bloginfo( 'name' ),
                $post->post_title
            ),
            $message,
            $headers
        );
    }

    /**
     * Reads back a previously generated score without spending another
     * AI call — what the REST controller's GET route returns.
     *
     * @param int $post_id Post to read a score for.
     * @return array<string, mixed>|null
     */
    public function get_stored_score( int $post_id ): ?array {
        $stored = get_post_meta( $post_id, self::META_KEY, true );

        if ( '' === $stored ) {
            return null;
        }

        $decoded = json_decode( (string) $stored, true );

        return is_array( $decoded ) ? $decoded : null;
    }

    /**
     * Percentage of GEO-MODULE.md's 9 deterministic checks that have no
     * open finding for this post (8 per-post scanners) or sitewide (Trust
     * Signals) — null if this site has no GEO scan history at all yet,
     * so an absence of problems is never confused with "never checked."
     *
     * @param int $post_id Post to score.
     * @return int|null 0-100, or null if no 'geo' category finding has ever been recorded.
     */
    private function calculate_deterministic_score( int $post_id ): ?int {
        $has_any_geo_history = 0 < (int) $this->findings->find_all(
            array(
                'category' => 'geo',
                'per_page' => 1,
            )
        )['total'];

        if ( ! $has_any_geo_history ) {
            return null;
        }

        $per_post_failures = (int) $this->findings->find_all(
            array(
                'category'   => 'geo',
                'status'     => 'open',
                'object_ref' => (string) $post_id,
                'per_page'   => self::TOTAL_DETERMINISTIC_CHECKS,
            )
        )['total'];

        $sitewide_trust_signal_failure = 0 < (int) $this->findings->find_all(
            array(
                'category'   => 'geo',
                'status'     => 'open',
                'object_ref' => home_url( '/' ),
                'per_page'   => 1,
            )
        )['total'];

        return self::score_from_failures( $per_post_failures, $sitewide_trust_signal_failure );
    }

    /**
     * The deterministic-score formula itself, extracted so
     * Controllers\GeoAnalysis::get_pages() can compute the same real,
     * non-AI score for every published page in bulk (one grouped
     * `FindingRepository::count_by_column()` query for every post's own
     * open-finding count, one shared lookup for the sitewide Trust Signals
     * failure) instead of calculate_deterministic_score()'s own two
     * queries *per post* — the same score, computed the cheap way for a
     * whole-site listing rather than a single post's own card.
     *
     * @param int      $per_post_failures             Open findings against this specific post (uncapped — capped below).
     * @param bool     $sitewide_trust_signal_failure  Whether the sitewide Trust Signals check is currently open.
     * @param int|null $total_checks                   Denominator — defaults to GEO's own 9-check total. Controllers\GeoAnalysis::get_pages()/get_top_pages() pass a smaller real count when scoped to a caller-supplied `scanner_ids` subset (e.g. AeoTab.tsx's 5 real AEO scanners), so a page's "% ready" reflects failures against the checks that subset actually runs, not GEO's full 9.
     * @return int 0-100.
     */
    public static function score_from_failures( int $per_post_failures, bool $sitewide_trust_signal_failure, ?int $total_checks = null ): int {
        $total_checks = $total_checks && $total_checks > 0 ? $total_checks : self::TOTAL_DETERMINISTIC_CHECKS;

        $failures = min(
            $total_checks,
            $per_post_failures + ( $sitewide_trust_signal_failure ? 1 : 0 )
        );

        return (int) round( ( $total_checks - $failures ) / $total_checks * 100 );
    }

    /**
     * The 6 readme.txt AI-Visibility sub-metrics that don't need an AI
     * judgment call — either a direct or composite read of specific
     * scanner-id findings (made queryable by FindingRepository's
     * `scanner_id` filter), or a value computed straight from the post
     * object already in hand. Each is 0-100, same coarse-tiering posture
     * calculate_overall_score() already documents for the site as a
     * whole — not a claim of scientific precision.
     *
     * @param int      $post_id Post to score.
     * @param \WP_Post $post    Same post, already loaded by analyze().
     * @return array{retrieval_score: int, citation_readiness: int, ai_summary_qa_detection: int, entity_naming_consistency: int, content_freshness: int, data_point_evidence_density: int}
     */
    private function calculate_sub_scores( int $post_id, \WP_Post $post ): array {
        $ref = (string) $post_id;

        $retrieval_checks = array( 'geo-chunking', 'geo-semantic-structure' );
        $retrieval_passed = 0;
        foreach ( $retrieval_checks as $scanner_id ) {
            if ( ! $this->has_open_finding( $scanner_id, $ref ) ) {
                ++$retrieval_passed;
            }
        }

        $qa_checks = array( 'geo-summary-block', 'geo-faq-opportunity' );
        $qa_passed = 0;
        foreach ( $qa_checks as $scanner_id ) {
            if ( ! $this->has_open_finding( $scanner_id, $ref ) ) {
                ++$qa_passed;
            }
        }

        return array(
            'retrieval_score'             => (int) round( $retrieval_passed / count( $retrieval_checks ) * 100 ),
            'citation_readiness'          => $this->has_open_finding( 'geo-citation-opportunities', $ref ) ? 0 : 100,
            'ai_summary_qa_detection'     => (int) round( $qa_passed / count( $qa_checks ) * 100 ),
            'entity_naming_consistency'   => $this->has_open_finding( 'geo-entity-naming-consistency', $ref ) ? 0 : 100,
            'content_freshness'           => $this->calculate_content_freshness( $post ),
            'data_point_evidence_density' => $this->calculate_evidence_density( $post ),
        );
    }

    /**
     * Whether one specific scanner has an open finding against one
     * specific object — the per-check building block calculate_sub_scores()
     * composes into named sub-metrics, made possible by FindingRepository
     * exposing `scanner_id` as a filterable column.
     *
     * @param string $scanner_id One of the Geo*Scanner::get_id() strings.
     * @param string $object_ref Post id (or home_url('/') for the sitewide Trust Signals check).
     * @return bool
     */
    private function has_open_finding( string $scanner_id, string $object_ref ): bool {
        return 0 < (int) $this->findings->find_all(
            array(
                'category'   => 'geo',
                'status'     => 'open',
                'scanner_id' => $scanner_id,
                'object_ref' => $object_ref,
                'per_page'   => 1,
            )
        )['total'];
    }

    /**
     * Coarse recency tiering off `post_modified` — a genuinely different
     * signal from GeoEeatSignalsScanner's binary "never edited" check,
     * since this scores *how* stale, not just whether. Tier boundaries
     * scale off Settings → Scanning → AI Visibility's "Content freshness"
     * row's own `ai_visibility_scans.freshness.stale_months` (the
     * "flag as stale" point becomes the bottom tier) rather than the
     * fixed 90/180/365-day boundaries this originally shipped with. This
     * deterministic sub-score always runs regardless of that row's own
     * `enable` toggle — unlike StaleContentScanner's own findings-list
     * check, it's one of 6 fixed inputs to the overall per-post GEO score,
     * not a standalone, independently-disable-able check.
     *
     * @param \WP_Post $post Post being scored.
     * @return int 0-100.
     */
    private function calculate_content_freshness( \WP_Post $post ): int {
        $settings            = wp_parse_args( get_option( \VuloPilot\Utill::VULOPILOT_SETTINGS_KEY, array() ), \VuloPilot\Utill::VULOPILOT_SETTINGS_DEFAULTS );
        $stale_after_days    = absint( $settings['ai_visibility_scans']['freshness']['stale_months'] ?? 12 ) * 30;
        $days_since_modified = ( current_time( 'timestamp', true ) - strtotime( $post->post_modified_gmt ) ) / DAY_IN_SECONDS;

        if ( $days_since_modified <= $stale_after_days * 0.25 ) {
            return 100;
        }
        if ( $days_since_modified <= $stale_after_days * 0.5 ) {
            return 75;
        }
        if ( $days_since_modified <= $stale_after_days ) {
            return 50;
        }
        return 25;
    }

    /**
     * Reuses GeoCitationOpportunityScanner's own regex (one source of
     * truth for "what a data point/citable claim looks like") but counts
     * matches instead of just checking presence — "Data Point & Evidence
     * Density" is about how much supporting evidence a piece has, not
     * only whether it has any. The top-tier threshold is Settings →
     * Scanning → AI Visibility's "Evidence checks" row's own
     * `ai_visibility_scans.evidence.min_data_points` (matches per 500
     * words) rather than a fixed `>= 3`; the middle tier sits at half
     * that.
     *
     * @param \WP_Post $post Post being scored.
     * @return int 0-100.
     */
    private function calculate_evidence_density( \WP_Post $post ): int {
        $settings        = wp_parse_args( get_option( \VuloPilot\Utill::VULOPILOT_SETTINGS_KEY, array() ), \VuloPilot\Utill::VULOPILOT_SETTINGS_DEFAULTS );
        $min_data_points = max( 1, absint( $settings['ai_visibility_scans']['evidence']['min_data_points'] ?? 3 ) );

        $plain_text  = wp_strip_all_tags( $post->post_content );
        $word_count  = str_word_count( $plain_text );
        $match_count = preg_match_all( GeoCitationOpportunityScanner::CLAIM_PATTERN, $plain_text );
        $match_count = false !== $match_count ? $match_count : 0;

        $per_500_words = $word_count > 0 ? $match_count / ( $word_count / 500 ) : 0;

        if ( $per_500_words >= $min_data_points ) {
            return 100;
        }
        if ( $per_500_words >= $min_data_points / 2 ) {
            return 60;
        }
        return 20;
    }

    /**
     * @param \WP_Post             $post                Post being analyzed.
     * @param int|null             $deterministic_score Already-known deterministic score, if any — given to the AI as context.
     * @param array<string, mixed> $settings            Stored plugin settings — only `ai_visibility_scans.entity` is read here.
     * @return array<int, array{role: string, content: string}>
     */
    private function build_prompt( \WP_Post $post, ?int $deterministic_score, array $settings ): array {
        // Settings → Scanning → AI Visibility's "Entity clarity" row's own
        // `min_mentions` — entity_coverage is still an AI judgment call
        // (see analyze()'s own comment on `ai_visibility_scans.entity.enable`),
        // but this gives the AI a concrete, user-configurable anchor point
        // instead of an unparameterized "judge this holistically," the
        // same "factor this in" context $deterministic_score already gets
        // below.
        $entity_guidance = '';
        if ( ! empty( $settings['ai_visibility_scans']['entity']['enable'] ) ) {
            $entity_guidance = sprintf(
                "\n\n(Score \"entity_coverage\" low if this content mentions its primary subject/entity — the main product, service, or organization it's about — fewer than %d times.)",
                max( 1, absint( $settings['ai_visibility_scans']['entity']['min_mentions'] ?? 2 ) )
            );
        }

        return array(
            array(
                'role'    => 'system',
                'content' => 'You evaluate web content for how well AI answer engines (like ChatGPT, Perplexity, and AI Overviews) '
                    . 'can find, understand, and cite it. Score eight dimensions from 0-100: '
                    . '"entity_coverage" (does the content clearly name and explain the key people/products/concepts it discusses), '
                    . '"question_coverage" (does it directly answer the questions a reader would plausibly search for), '
                    . '"answer_completeness" (are answers self-contained rather than requiring outside context), '
                    . '"llm_readability" (is it written in clear, extractable prose an AI system could quote directly), '
                    . '"purpose_clarity" (is it obvious within the first few sentences what this content is about and who it is for), '
                    . '"conversation_readiness" (would the content still read naturally if voiced aloud as an answer to a follow-up question), '
                    . '"knowledge_graph_coverage" (does the content name real, specific, well-known entities an AI system could cross-reference, rather than vague generalities), '
                    . '"answer_first_structure" (does the content lead with the direct answer/conclusion before background or preamble). '
                    . 'Also give 3-5 concrete, specific suggestions to improve this content for AI answer engines. '
                    . 'Respond with ONLY raw JSON like {"entity_coverage": 70, "question_coverage": 60, "answer_completeness": 65, '
                    . '"llm_readability": 80, "purpose_clarity": 75, "conversation_readiness": 55, "knowledge_graph_coverage": 60, '
                    . '"answer_first_structure": 65, "suggestions": ["...", "..."]} — no markdown fences, no commentary.',
            ),
            array(
                'role'    => 'user',
                'content' => sprintf(
                    "Title: %s\n\nContent:\n%s%s%s",
                    $post->post_title,
                    wp_trim_words( wp_strip_all_tags( $post->post_content ), 500 ),
                    null !== $deterministic_score
                        ? sprintf( "\n\n(This content already scores %d/100 on separate structural checks — factor that in.)", $deterministic_score )
                        : '',
                    $entity_guidance
                ),
            ),
        );
    }

    /**
     * @param \VuloPilot\ValueObjects\AIResponse $response Raw AI response.
     * @return array{ai_scores: array{entity_coverage: int, question_coverage: int, answer_completeness: int, llm_readability: int, purpose_clarity: int, conversation_readiness: int, knowledge_graph_coverage: int, answer_first_structure: int}, suggestions: string[]}
     *
     * @throws \RuntimeException If the response isn't usable JSON in the expected shape.
     */
    private function parse_response( \VuloPilot\ValueObjects\AIResponse $response ): array {
        $content = preg_replace( '/^```(?:json)?\s*|\s*```$/', '', trim( $response->get_content() ) );
        $decoded = json_decode( trim( (string) $content ), true );

        if ( ! is_array( $decoded ) ) {
            throw new \RuntimeException( __( 'The AI did not return a usable GEO analysis.', 'vulopilot' ) );
        }

        $ai_scores = array();

        foreach ( array( 'entity_coverage', 'question_coverage', 'answer_completeness', 'llm_readability', 'purpose_clarity', 'conversation_readiness', 'knowledge_graph_coverage', 'answer_first_structure' ) as $key ) {
            $value = $decoded[ $key ] ?? null;

            if ( ! is_int( $value ) && ! ( is_numeric( $value ) && (string) (int) $value === (string) $value ) ) {
                throw new \RuntimeException(
                    sprintf(
                        /* translators: %s is the missing/invalid score dimension. */
                        __( 'The AI response is missing a valid "%s" score.', 'vulopilot' ),
                        $key
                    )
                );
            }

            $ai_scores[ $key ] = max( 0, min( 100, (int) $value ) );
        }

        $suggestions = array_values(
            array_filter(
                is_array( $decoded['suggestions'] ?? null ) ? $decoded['suggestions'] : array(),
                static fn( $suggestion ) => is_string( $suggestion ) && '' !== trim( $suggestion )
            )
        );

        if ( empty( $suggestions ) ) {
            throw new \RuntimeException( __( 'The AI did not return any suggestions.', 'vulopilot' ) );
        }

        return array(
            'ai_scores'   => $ai_scores,
            'suggestions' => $suggestions,
        );
    }

    /**
     * Simple, documented average — not a claim of scientific precision,
     * the same posture Controllers/Dashboard.php's calculate_overall_score()
     * already takes for the sitewide health score. Blends up to 3
     * components: the 9-check deterministic score (structural, may be
     * null if this site has no GEO scan history yet), the average of the
     * 8 AI-judged dimensions, and the average of the 6 computed sub-scores
     * (calculate_sub_scores()) — whichever of the 3 are actually known are
     * averaged together unweighted, same "coarse, not scientific" posture
     * as before this method grew a third component.
     *
     * @param int|null $deterministic_score 0-100, or null.
     * @param array    $ai_scores           8 keys, each 0-100.
     * @param array    $sub_scores          6 keys, each 0-100 (calculate_sub_scores()'s return shape).
     * @return int 0-100.
     */
    private function calculate_overall_score( ?int $deterministic_score, array $ai_scores, array $sub_scores ): int {
        $ai_average  = array_sum( $ai_scores ) / count( $ai_scores );
        $sub_average = array_sum( $sub_scores ) / count( $sub_scores );

        $components = array( $ai_average, $sub_average );

        if ( null !== $deterministic_score ) {
            $components[] = $deterministic_score;
        }

        return (int) round( array_sum( $components ) / count( $components ) );
    }
}
