<?php
/**
 * AiCrawlerBlockedPagesScanner class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Seo\Scanners;

use VuloPilot\Contracts\Scanner\TracksScannedObjectsInterface;
use VuloPilot\Services\CrawlerTrafficLogger;
use VuloPilot\Services\RobotsTxtBotAccess;
use VuloPilot\Utill;
use VuloPilot\ValueObjects\Finding;
use VuloPilot\ValueObjects\Severity;
use VuloPilot\Scanners\Basic\AbstractBasicScanner;
use VuloPilot\Scanners\Basic\ScannedPostsTrait;

defined( 'ABSPATH' ) || exit;

/**
 * AI Crawler Analytics' Free "Blocked Pages" (AI-CRAWLER-ANALYTICS-MODULE.md)
 * — flags real published pages that robots.txt disallows for a SPECIFIC
 * known AI bot. Deliberately narrower than RobotsTxtScanner (which already
 * owns "robots.txt blocks every crawler sitewide" as its own HIGH-severity
 * finding): a page only shows up here when the disallow rule is scoped to
 * one AI bot's own named group (or the wildcard group, but only when that
 * group ISN'T the sitewide `Disallow: /` RobotsTxtScanner already reports),
 * matching AboutPageAnalysisScanner's own "narrower than an existing check"
 * precedent rather than re-flagging the same sitewide condition twice.
 *
 * @class       AiCrawlerBlockedPagesScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class AiCrawlerBlockedPagesScanner extends AbstractBasicScanner implements TracksScannedObjectsInterface {

    use ScannedPostsTrait;

    private const BATCH_SIZE = 50;

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'ai-crawler-blocked-pages';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'AI Crawler Blocked Pages', 'vulopilot' );
    }

    /**
     * @inheritDoc
     */
    public function get_category(): string {
        return 'seo';
    }

    /**
     * @inheritDoc
     */
    public function scan(): array {
        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['flag_ai_crawler_blocked_pages'] ) ) {
            return array();
        }

        $findings       = array();
        $robots         = new RobotsTxtBotAccess();
        $bot_signatures = CrawlerTrafficLogger::get_bot_signatures();

        $posts = get_posts(
            array(
                'post_type'      => array( 'post', 'page' ),
                'post_status'    => 'publish',
                'posts_per_page' => self::BATCH_SIZE,
                'orderby'        => 'modified',
                'order'          => 'DESC',
            )
        );

        foreach ( $posts as $post ) {
            $this->mark_post_scanned( $post->ID );
        }

        foreach ( $bot_signatures as $bot_token => $bot_name ) {
            $disallowed_paths = $robots->get_disallowed_paths_for_bot( $bot_token );

            // A bare `/` disallow is already RobotsTxtScanner's own
            // sitewide finding when it applies to the wildcard group — skip
            // it here so the same real problem isn't reported twice.
            $disallowed_paths = array_diff( $disallowed_paths, array( '/' ) );

            if ( empty( $disallowed_paths ) ) {
                continue;
            }

            foreach ( $posts as $post ) {
                $path = (string) wp_parse_url( get_permalink( $post ), PHP_URL_PATH );

                if ( ! $this->path_matches_any( $path, $disallowed_paths ) ) {
                    continue;
                }

                $findings[] = new Finding(
                    sprintf(
                        /* translators: 1: bot display name, 2: post/page title. */
                        __( '%1$s is blocked from crawling: %2$s', 'vulopilot' ),
                        $bot_name,
                        get_the_title( $post )
                    ),
                    Severity::MEDIUM,
                    $this->get_category(),
                    sprintf(
                        /* translators: %s is the bot display name. */
                        __( 'robots.txt disallows this page for %s specifically, so it won\'t be read for AI answers even though the rest of the site may be reachable.', 'vulopilot' ),
                        $bot_name
                    ),
                    'post',
                    (string) $post->ID,
                    array( 'bot' => $bot_name )
                );
            }
        }

        return $findings;
    }

    /**
     * Whether $path starts with any of $disallowed_paths — plain prefix
     * matching, the same restraint RobotsTxtScanner's own docblock argues
     * for (no wildcard/regex robots.txt path syntax support).
     *
     * @param string   $path             The post's own URL path.
     * @param string[] $disallowed_paths Disallow paths for one bot.
     * @return bool
     */
    private function path_matches_any( string $path, array $disallowed_paths ): bool {
        foreach ( $disallowed_paths as $disallowed_path ) {
            if ( '' !== $disallowed_path && 0 === strpos( $path, $disallowed_path ) ) {
                return true;
            }
        }

        return false;
    }
}
