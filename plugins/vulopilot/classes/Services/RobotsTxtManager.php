<?php
/**
 * RobotsTxtManager class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Scanning → SEO's "Auto-generate robots.txt" toggle, plus Crawl & URLs →
 * Robots & Sitemap's own "Edit" action (Controllers\RobotsSitemap). Not a
 * from-scratch robots.txt file generator — WordPress core already serves
 * a virtual robots.txt (`do_robots()`, filterable via `robots_txt`) at
 * every install's /robots.txt, which is exactly the URL
 * Seo\Scanners\RobotsTxtScanner already checks. Two real, independent
 * things layer onto that same real filter:
 *   - When "Auto-generate robots.txt" is on, appends a `Sitemap:` line
 *     pointing at core's own sitemap (see SitemapManager) so crawlers
 *     that read robots.txt for a sitemap reference find one — the one
 *     thing WordPress core's own virtual robots.txt never adds by itself.
 *   - When a real custom override has been saved (the "Edit" action's own
 *     real `POST /robots-sitemap/robots`), that content REPLACES core's
 *     own virtual output outright — a real, persisted admin-authored
 *     robots.txt, not a preview: the very next live fetch of
 *     `/robots.txt` returns exactly this. Runs at an earlier priority
 *     than the sitemap-line logic so a custom file that doesn't already
 *     have its own `Sitemap:` line still gets one, same as core's own
 *     default output would.
 *
 * Self-registers its own hooks in the constructor (php-wordpress.md) and
 * is constructed unconditionally in VuloPilot::init_classes().
 *
 * @class       RobotsTxtManager class
 * @version     1.0.0
 * @author      VuloLabs
 */
class RobotsTxtManager {

    /**
     * Real, persisted admin-authored robots.txt override — empty/absent
     * means "use WordPress core's own virtual output," same as before
     * this option existed.
     */
    private const CUSTOM_CONTENT_OPTION = 'vulopilot_custom_robots_txt';

    /**
     * RobotsTxtManager constructor.
     */
    public function __construct() {
        add_filter( 'robots_txt', array( $this, 'maybe_use_custom_robots_txt' ), 5, 1 );
        add_filter( 'robots_txt', array( $this, 'maybe_append_sitemap_line' ), 20, 2 );
    }

    /**
     * @param string $output The robots.txt content built so far.
     * @return string
     */
    public function maybe_use_custom_robots_txt( $output ) {
        $custom = $this->get_custom_content();

        return '' !== $custom ? $custom : $output;
    }

    /**
     * @param string $output       The robots.txt content built so far.
     * @param bool   $is_public    Whether the site is set to be publicly indexed.
     * @return string
     */
    public function maybe_append_sitemap_line( $output, $is_public ) {
        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['robots_auto_generate'] ) || ! $is_public ) {
            return $output;
        }

        if ( false !== strpos( $output, 'Sitemap:' ) ) {
            return $output; // Another plugin/theme (or the real custom override above) already added one — don't duplicate.
        }

        return rtrim( $output ) . "\nSitemap: " . home_url( '/wp-sitemap.xml' ) . "\n";
    }

    /**
     * @return string Real saved override content, or '' when none is set.
     */
    public function get_custom_content(): string {
        return (string) get_option( self::CUSTOM_CONTENT_OPTION, '' );
    }

    /**
     * @param string $content Real new override content — '' clears it, reverting to WordPress core's own virtual robots.txt.
     * @return void
     */
    public function save_custom_content( string $content ): void {
        if ( '' === $content ) {
            delete_option( self::CUSTOM_CONTENT_OPTION );
            return;
        }

        update_option( self::CUSTOM_CONTENT_OPTION, $content, false );
    }
}
