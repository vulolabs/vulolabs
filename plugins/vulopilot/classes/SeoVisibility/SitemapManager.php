<?php
namespace VuloPilot\SeoVisibility;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Scanning → Sitemap tab's real backing - a set of real filters/toggles
 * over WordPress core's own native sitemap at /wp-sitemap.xml (since 5.5;
 * Seo\Scanners\SitemapScanner already checks for exactly this URL), not
 * a from-scratch sitemap generator: `sitemap_enabled` gates core's own
 * `wp_sitemaps_enabled`, `sitemap_links_per_page` overrides core's own
 * `wp_sitemaps_max_urls`, `sitemap_xml_post_types`/`sitemap_xml_taxonomies`
 * subtract from core's own `wp_sitemaps_post_types`/`wp_sitemaps_taxonomies`
 * (these 2 settings are also read directly by
 * Services\HtmlSitemapRenderer for the `[vulopilot_html_sitemap]`
 * shortcode - one real shared control each in Settings →
 * GetStarted\Sitemap.ts, not a separate XML/HTML pair, per direct
 * instruction), and `sitemap_exclude_posts`/`sitemap_exclude_terms` add
 * `post__not_in`/`exclude` onto core's own per-provider query args. All
 * real, all just wrapping/narrowing what core already builds.
 *
 * `sitemap_enabled` alone also gates pinging Bing's still-supported sitemap
 * ping endpoint whenever published content is saved (the UI's own separate
 * "Ping search engines on update" toggle was folded into "Generate XML
 * sitemap" - one real setting instead of two). Google deprecated its own
 * sitemap ping endpoint in June 2023 (Search Console / robots.txt
 * discovery are the only supported paths now) - this deliberately does
 * NOT call it: silently hitting a dead endpoint and reporting success
 * would be dishonest, the same posture CrawlerTrafficLogger's own
 * Google-Extended correction already takes for a similar Google-specific
 * gap.
 *
 * `sitemap_include_images`/`sitemap_include_featured_images` are NOT
 * implemented here - core's native sitemaps have no `<image:image>`
 * extension support at all, and adding one would mean building a second,
 * competing sitemap implementation, exactly what this class exists to
 * avoid. They round-trip through Settings (Utill::VULOPILOT_SETTINGS_DEFAULTS's
 * own comment documents this same gap) but nothing reads them - same
 * honest posture Seo.ts's Redirects & 404s section already takes for its
 * own not-yet-built features.
 *
 * Self-registers its own hooks in the constructor (php-wordpress.md) and
 * is constructed unconditionally in VuloPilot::init_classes() - every
 * hook reads its own setting before doing anything.
 *
 * @class       SitemapManager class
 * @version     1.0.0
 * @author      VuloLabs
 */
class SitemapManager {

    /**
     * SitemapManager constructor.
     */
    public function __construct() {
        add_filter( 'wp_sitemaps_enabled', array( $this, 'filter_sitemaps_enabled' ) );

        add_filter( 'wp_sitemaps_max_urls', array( $this, 'filter_max_urls' ) );
        add_filter( 'wp_sitemaps_post_types', array( $this, 'filter_post_types' ) );
        add_filter( 'wp_sitemaps_taxonomies', array( $this, 'filter_taxonomies' ) );
        add_filter( 'wp_sitemaps_posts_query_args', array( $this, 'filter_posts_query_args' ) );
        add_filter( 'wp_sitemaps_taxonomies_query_args', array( $this, 'filter_taxonomies_query_args' ) );
    }

    /**
     * @return array<string, mixed> Effective settings, defaults filled in.
     */
    private function get_settings(): array {
        return wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );
    }

    /**
     * `sitemap_links_per_page` - 0 or unset falls back to core's own
     * default (2000) rather than passing through a nonsensical override.
     *
     * @param int $max_urls Core's own current max-URLs-per-page value.
     * @return int
     */
    public function filter_max_urls( $max_urls ) {
        $links_per_page = (int) ( $this->get_settings()['sitemap_links_per_page'] ?? 0 );

        return $links_per_page > 0 ? $links_per_page : $max_urls;
    }

    /**
     * Narrows core's own registered sitemap post types down to
     * `sitemap_xml_post_types` - a post type core would otherwise include
     * (e.g. 'attachment') is dropped from the XML sitemap entirely when
     * its slug isn't in that setting.
     *
     * @param \WP_Post_Type[] $post_types Core's own currently-registered sitemap post types, keyed by slug.
     * @return \WP_Post_Type[]
     */
    public function filter_post_types( $post_types ) {
        $included = (array) ( $this->get_settings()['sitemap_xml_post_types'] ?? array() );

        foreach ( $post_types as $slug => $post_type_object ) {
            if ( ! in_array( $slug, $included, true ) ) {
                unset( $post_types[ $slug ] );
            }
        }

        return $post_types;
    }

    /**
     * Same narrowing as filter_post_types(), for taxonomies.
     *
     * @param \WP_Taxonomy[] $taxonomies Core's own currently-registered sitemap taxonomies, keyed by slug.
     * @return \WP_Taxonomy[]
     */
    public function filter_taxonomies( $taxonomies ) {
        $included = (array) ( $this->get_settings()['sitemap_xml_taxonomies'] ?? array() );

        foreach ( $taxonomies as $slug => $taxonomy_object ) {
            if ( ! in_array( $slug, $included, true ) ) {
                unset( $taxonomies[ $slug ] );
            }
        }

        return $taxonomies;
    }

    /**
     * `sitemap_exclude_posts` - comma-separated post IDs, applied via
     * core's own `wp_sitemaps_posts_query_args` filter.
     *
     * @param array $args Core's own current WP_Query args for one sitemap page.
     * @return array
     */
    public function filter_posts_query_args( $args ) {
        $excluded = $this->parse_id_list( (string) ( $this->get_settings()['sitemap_exclude_posts'] ?? '' ) );

        if ( $excluded ) {
            $args['post__not_in'] = array_merge( $args['post__not_in'] ?? array(), $excluded ); // phpcs:ignore WordPressVIPMinimum.Performance.WPQueryParams.PostNotIn_post__not_in -- admin-configured `sitemap_exclude_posts` list, a small bounded set of explicit ids, not an unbounded/user-controlled exclusion.
        }

        return $args;
    }

    /**
     * `sitemap_exclude_terms` - comma-separated term IDs, applied via
     * core's own `wp_sitemaps_taxonomies_query_args` filter.
     *
     * @param array $args Core's own current get_terms() args for one sitemap page.
     * @return array
     */
    public function filter_taxonomies_query_args( $args ) {
        $excluded = $this->parse_id_list( (string) ( $this->get_settings()['sitemap_exclude_terms'] ?? '' ) );

        if ( $excluded ) {
            $args['exclude'] = array_merge( $args['exclude'] ?? array(), $excluded ); // phpcs:ignore WordPressVIPMinimum.Performance.WPQueryParams.PostNotIn_exclude -- admin-configured `sitemap_exclude_terms` list, a small bounded set of explicit ids, not an unbounded/user-controlled exclusion.
        }

        return $args;
    }

    /**
     * @param string $raw Comma-separated IDs, e.g. "12, 48, 103".
     * @return int[] Positive integer IDs only.
     */
    private function parse_id_list( string $raw ): array {
        if ( '' === trim( $raw ) ) {
            return array();
        }

        return array_values(
            array_filter(
                array_map( 'absint', explode( ',', $raw ) )
            )
        );
    }

    /**
     * @param bool $enabled Core's own current wp_sitemaps_enabled value.
     * @return bool
     */
    public function filter_sitemaps_enabled( $enabled ) {
        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['sitemap_enabled'] ) ) {
            return false;
        }

        return $enabled;
    }
}
