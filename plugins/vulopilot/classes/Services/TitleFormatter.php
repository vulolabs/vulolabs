<?php
/**
 * TitleFormatter class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Settings → Site Identity → Title Formats' real backing — resolves
 * per-context `title_format_*`/`description_format_*` templates
 * (Utill::VULOPILOT_SETTINGS_DEFAULTS) against `%variable%` tokens and
 * outputs both the document `<title>` and a `<meta name="description">`
 * tag from the result, same "setting gates OUTPUT, not construction"
 * posture as CanonicalUrlManager/SocialMetaTagsManager.
 *
 * `pre_get_document_title` (not the older `wp_title` filter/action) is
 * core's own modern hook for the title — every theme built against
 * `wp_head()`/`_wp_render_title_tag()` since WP 4.4 already calls
 * `wp_get_document_title()`, which checks this filter first and, if a
 * non-empty string comes back, uses it verbatim instead of building its
 * own title from `wp_title()`/`get_bloginfo()`. That's exactly the
 * "replace, don't append" behavior a title-format feature needs. There is
 * no core equivalent filter for a description meta tag (core never
 * outputs one), so `maybe_output_description()` below just echoes
 * directly on `wp_head`, same shape `SocialMetaTagsManager`'s own
 * `wp_head` output already uses.
 *
 * For `post`/`page`, `description_format_*` is only ever a FALLBACK — a
 * real, non-empty `post_excerpt` (this codebase's already-established
 * "meta description" field; see Seo\Scanners\MetaDescriptionScanner's
 * own docblock and `WriteMetaDescriptionAction`, which both treat
 * `post_excerpt` as the real per-post description, not a bespoke postmeta
 * key) always wins when the current post/page actually has one.
 *
 * Self-registers its own hooks in the constructor (php-wordpress.md) and
 * is constructed unconditionally in VuloPilot::init_classes().
 *
 * @class       TitleFormatter class
 * @version     1.0.0
 * @author      VuloLabs
 */
class TitleFormatter {

    /**
     * `%variable%` token => resolver. Each resolver only ever runs for the
     * context it's actually relevant to (see `resolve_for_context()`) — a
     * template that references a variable outside its own context (e.g.
     * `%post_title%` inside `title_format_archive`) simply resolves that
     * token to an empty string, same "unknown/inapplicable token drops
     * silently" posture WebmasterToolsManager's own custom-tag parsing
     * uses for anything it doesn't recognize.
     *
     * @var array<string, callable>
     */
    private const VARIABLES = array(
        'site_title'       => array( __CLASS__, 'var_site_title' ),
        'site_description' => array( __CLASS__, 'var_site_description' ),
        'post_title'       => array( __CLASS__, 'var_current_title' ),
        'page_title'       => array( __CLASS__, 'var_current_title' ),
        'category_title'   => array( __CLASS__, 'var_current_title' ),
        'tag_title'        => array( __CLASS__, 'var_current_title' ),
        'search_term'      => array( __CLASS__, 'var_search_term' ),
        'archive_title'    => array( __CLASS__, 'var_current_title' ),
    );

    /**
     * TitleFormatter constructor.
     */
    public function __construct() {
        add_filter( 'pre_get_document_title', array( $this, 'maybe_filter_title' ), 5 );
        add_action( 'wp_head', array( $this, 'maybe_output_description' ), 5 );
    }

    /**
     * @param string $title Core's own already-resolved title (unused — this
     *                       either replaces it wholesale or returns it untouched).
     * @return string
     */
    public function maybe_filter_title( string $title ): string {
        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['site_identity_enabled'] ) || 'enabled' !== $settings['site_identity_enabled'] ) {
            return $title;
        }

        $context_key = $this->current_context_key();

        if ( ! $context_key ) {
            return $title; // 404s and any other context this feature doesn't cover — leave core's own title alone.
        }

        $template = trim( (string) ( $settings[ "title_format_{$context_key}" ] ?? '' ) );

        if ( '' === $template ) {
            return $title;
        }

        $resolved = $this->resolve( $template, $context_key, (string) ( $settings['title_separator'] ?? '|' ) );

        return '' !== $resolved ? $resolved : $title;
    }

    /**
     * Outputs `<meta name="description">` on `wp_head`, same
     * setting-gated/context-scoped posture as `maybe_filter_title()`
     * above — see this class's own top docblock for why `post`/`page`
     * defer to a real `post_excerpt` first.
     *
     * @return void
     */
    public function maybe_output_description(): void {
        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['site_identity_enabled'] ) || 'enabled' !== $settings['site_identity_enabled'] ) {
            return;
        }

        $context_key = $this->current_context_key();

        if ( ! $context_key ) {
            return;
        }

        $content = '';

        if ( in_array( $context_key, array( 'post', 'page' ), true ) ) {
            $excerpt = trim( wp_strip_all_tags( get_the_excerpt() ) );

            if ( '' !== $excerpt ) {
                $content = $excerpt;
            }
        }

        if ( '' === $content ) {
            $template = trim( (string) ( $settings[ "description_format_{$context_key}" ] ?? '' ) );

            if ( '' !== $template ) {
                $content = $this->resolve( $template, $context_key, (string) ( $settings['title_separator'] ?? '|' ) );
            }
        }

        if ( '' === $content ) {
            return;
        }

        echo '<meta name="description" content="' . esc_attr( $content ) . '" />' . "\n";
    }

    /**
     * Resolves a template string against one context's own variable set —
     * also used by the Settings screen's live preview to stay a single
     * source of truth (Controllers\Settings::preview_title_formats()).
     *
     * @param string $template   Raw template, e.g. `%post_title% %sep% %site_title%`.
     * @param string $context    One of `home`/`post`/`page`/`category`/`tag`/`search`/`archive`.
     * @param string $separator  What `%sep%` itself resolves to.
     * @return string
     */
    public function resolve( string $template, string $context, string $separator ): string {
        $replacements = array( '%sep%' => $separator );

        foreach ( self::VARIABLES as $token => $resolver ) {
            $replacements[ "%{$token}%" ] = call_user_func( $resolver, $token, $context );
        }

        $resolved = strtr( $template, $replacements );

        // Collapse the empty-separator runs a template produces when one
        // of its own tokens resolves empty in this context (e.g.
        // `%site_description%` when the site tagline is blank) — same
        // "don't show a dangling separator" concern SnippetPreview.tsx's
        // own truncation already cares about for readability, just for
        // the opposite (too-short, not too-long) failure shape.
        $resolved = preg_replace( '/\s*' . preg_quote( $separator, '/' ) . '\s*$/', '', $resolved );
        $resolved = preg_replace( '/^\s*' . preg_quote( $separator, '/' ) . '\s*/', '', $resolved );

        return trim( (string) $resolved );
    }

    /**
     * @return string|null One of home/post/page/category/tag/search/archive, or null for anything else (404, embeds, ...).
     */
    private function current_context_key(): ?string {
        if ( is_front_page() || is_home() ) {
            return 'home';
        }

        if ( is_search() ) {
            return 'search';
        }

        if ( is_category() ) {
            return 'category';
        }

        if ( is_tag() ) {
            return 'tag';
        }

        if ( is_page() ) {
            return 'page';
        }

        if ( is_singular() ) {
            return 'post';
        }

        if ( is_archive() ) {
            return 'archive';
        }

        return null;
    }

    /**
     * @return string
     */
    private static function var_site_title(): string {
        return get_bloginfo( 'name' );
    }

    /**
     * @return string
     */
    private static function var_site_description(): string {
        return get_bloginfo( 'description' );
    }

    /**
     * `%post_title%`/`%page_title%`/`%category_title%`/`%tag_title%`/
     * `%archive_title%` all resolve the same way — core's own
     * `single_term_title()`/`get_the_title()`/`get_the_archive_title()`
     * already return the right string for whichever of those 5 contexts
     * is actually active, so one resolver covers all 5 rather than 5
     * near-duplicates.
     *
     * @return string
     */
    private static function var_current_title(): string {
        if ( is_category() || is_tag() ) {
            return single_term_title( '', false ) ?: '';
        }

        if ( is_archive() ) {
            return wp_strip_all_tags( get_the_archive_title() );
        }

        return get_the_title();
    }

    /**
     * @return string
     */
    private static function var_search_term(): string {
        return get_search_query();
    }
}
