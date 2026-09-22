<?php
/**
 * CrawlerTrafficLogger class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Repositories\CrawlerVisitRepository;
use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * AI Crawler Traffic Monitoring (readme.txt) — detects known AI-answer-
 * engine crawlers by User-Agent on every real front-end page load and
 * logs the visit (bot name + user agent + requested URL only — never an
 * IP address or any other visitor-identifying data, per readme.txt's own
 * FAQ promise). Self-registers its own hooks in the constructor
 * (php-wordpress.md) and is constructed unconditionally in
 * VuloPilot::init_classes(), the same shape GeoAnalysis\LlmsTxtGenerator
 * already uses for "detect something on every real front-end request" —
 * `template_redirect` fires only for genuine page-template requests, never
 * wp-admin, REST API, or admin-ajax.php, so no extra is_admin()/DOING_AJAX
 * guard is needed beyond what that hook already excludes.
 *
 * The plugin's readme.txt names "Google-Extended (Gemini)" as one of the
 * crawlers to monitor, but Google documents Google-Extended as a robots.txt-only
 * opt-out *token* with no distinguishing User-Agent of its own — content
 * used for Gemini/AI training is actually fetched under Google's
 * AI-training crawler UA, `Google-CloudVertexBot`. BOT_SIGNATURES maps
 * the readme's label to that real, detectable UA instead of matching a
 * literal "Google-Extended" string that would never appear in real
 * traffic and would silently show zero visits forever.
 *
 * One Pro extension point for "AI Crawler Traffic Analytics & Historical
 * Logs" (readme.txt's Pro line) is `vulopilot_crawler_log_retention_days`
 * — Free's daily cleanup cron deletes rows older than Settings → AI
 * Visibility's own "Log retention" value (default 30); vulopilot-pro's
 * AdvancedReports module overrides it further via this same filter.
 * No separate Pro table/REST controller is needed — see this feature's
 * plan doc for why a per-event log doesn't need the snapshot-rollup shape
 * Health Score's historical trend uses.
 *
 * A second extension point, `vulopilot_crawler_bot_signatures`, lets Pro (or
 * any third party) extend BOT_SIGNATURES without editing this class —
 * AI-CRAWLER-ANALYTICS-MODULE.md's "register a source, don't modify the
 * host" reasoning, the same posture every other *_sources filter in this
 * codebase already uses, applied to this one fixed array that previously
 * had no such seam.
 *
 * @class       CrawlerTrafficLogger class
 * @version     1.0.0
 * @author      VuloLabs
 */
class CrawlerTrafficLogger {

    private const CLEANUP_HOOK = 'vulopilot_crawler_log_cleanup';

    /**
     * User-Agent substring => display name. Matched case-sensitively
     * against the raw header, same convention every real bot's
     * documented UA token already uses (these are all literal,
     * case-sensitive product tokens).
     *
     * @var array<string, string>
     */
    private const BOT_SIGNATURES = array(
        'GPTBot'                => 'GPTBot (OpenAI)',
        'ChatGPT-User'          => 'ChatGPT-User (OpenAI)',
        'ClaudeBot'             => 'ClaudeBot (Anthropic)',
        'anthropic-ai'          => 'anthropic-ai (Anthropic)',
        'PerplexityBot'         => 'PerplexityBot (Perplexity)',
        'Bytespider'            => 'Bytespider (ByteDance)',
        'CCBot'                 => 'CCBot (Common Crawl)',
        'Google-CloudVertexBot' => 'Google-CloudVertexBot (Google AI training)',
        'Amazonbot'             => 'Amazonbot (Amazon)',
    );

    /**
     * CrawlerTrafficLogger constructor.
     */
    public function __construct() {
        add_action( 'template_redirect', array( $this, 'maybe_log' ) );
        add_action( 'init', array( $this, 'ensure_cleanup_scheduled' ) );
        add_action( self::CLEANUP_HOOK, array( $this, 'run_cleanup' ) );
    }

    /**
     * @return void
     */
    public function maybe_log(): void {
        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['enable_crawler_tracking'] ) ) {
            return;
        }

        $user_agent = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';

        if ( '' === $user_agent ) {
            return;
        }

        foreach ( self::get_bot_signatures() as $signature => $bot_name ) {
            if ( false === strpos( $user_agent, $signature ) ) {
                continue;
            }

            $requested_url = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';

            // is_404() is already reliable here — `template_redirect` fires
            // after WP has resolved the main query, so this is the request's
            // real outcome, not a guess. AI Crawler Alerts' "access limited"
            // check (CrawlerAlertMonitor::find_bots_with_high_404_rate())
            // reads this back per bot.
            ( new CrawlerVisitRepository() )->log( $bot_name, $user_agent, $requested_url, is_404() );
            return;
        }
    }

    /**
     * User-Agent substring => display name, extensible via
     * `vulopilot_crawler_bot_signatures` — the shared source of truth for
     * every place in this codebase that needs to know which AI bots are
     * detectable (Seo\Scanners\AiCrawlerBlockedPagesScanner, and
     * vulopilot-pro's crawler-analytics correlation/alert code).
     *
     * @return array<string, string>
     */
    public static function get_bot_signatures(): array {
        return apply_filters( 'vulopilot_crawler_bot_signatures', self::BOT_SIGNATURES );
    }

    /**
     * Schedules the daily cleanup cron once, the standard
     * wp_next_scheduled()-guarded wp_schedule_event() pattern — no
     * existing cron-scheduling helper to reuse in this plugin (Scheduler.php
     * for recurring scans is Pro business logic, a different concern).
     *
     * @return void
     */
    public function ensure_cleanup_scheduled(): void {
        if ( ! wp_next_scheduled( self::CLEANUP_HOOK ) ) {
            wp_schedule_event( time(), 'daily', self::CLEANUP_HOOK );
        }
    }

    /**
     * Deletes crawler-visit rows past the retention window — the one
     * mechanism behind readme.txt's Pro "Historical Logs" line, see this
     * class's own docblock.
     *
     * @return void
     */
    public function run_cleanup(): void {
        $settings       = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );
        $saved_days     = (int) ( $settings['log_retention'] ?? 30 );
        $retention_days = (int) apply_filters( 'vulopilot_crawler_log_retention_days', $saved_days ?: 30 );

        if ( $retention_days <= 0 ) {
            return;
        }

        ( new CrawlerVisitRepository() )->delete_older_than( $retention_days );
    }
}
