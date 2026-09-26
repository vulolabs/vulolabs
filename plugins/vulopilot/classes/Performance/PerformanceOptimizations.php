<?php
namespace VuloPilot\Performance;


defined( 'ABSPATH' ) || exit;

/**
 * Real, reversible effects for 2 of "Performance" Overview's 6 Quick
 * Actions (`classes/Performance/Rest/PerformanceActions.php` only
 * flips the option; this class is what actually reads it on every real
 * request):
 *
 * - `vulopilot_force_lazy_loading` - when set, force-enables WordPress
 *   core's own native `loading="lazy"` behavior via the
 *   `wp_lazy_loading_enabled` filter, overriding any theme/plugin that
 *   disabled it (the exact condition LazyLoadingScanner flags).
 * - `vulopilot_preload_critical_resources` - when set, outputs real
 *   `<link rel="preload">` tags on `wp_head` for the site's custom logo
 *   and its first enqueued front-end CSS file.
 *
 * @class       PerformanceOptimizations class
 * @version     1.0.0
 * @author      VuloLabs
 */
class PerformanceOptimizations {

    /**
     * PerformanceOptimizations constructor.
     */
    public function __construct() {
        if ( get_option( 'vulopilot_force_lazy_loading' ) ) {
            add_filter( 'wp_lazy_loading_enabled', '__return_true', 999 );
        }

        add_filter( 'wp_preload_resources', array( $this, 'add_preloads' ) );
    }

    /**
     * Adds the site logo and the first queued CSS file to the resources
     * WordPress preloads in the page head (core prints the tags itself).
     *
     * @param array<int, array<string, mixed>> $preload_resources Resources core is already going to preload.
     * @return array<int, array<string, mixed>>
     */
    public function add_preloads( $preload_resources ) {
        if ( ! get_option( 'vulopilot_preload_critical_resources' ) ) {
            return $preload_resources;
        }

        $logo_id = get_theme_mod( 'custom_logo' );

        if ( $logo_id ) {
            $logo_url = wp_get_attachment_image_url( (int) $logo_id, 'full' );

            if ( $logo_url ) {
                $preload_resources[] = array(
                    'href' => $logo_url,
                    'as'   => 'image',
                );
            }
        }

        global $wp_styles;

        if ( $wp_styles instanceof \WP_Styles ) {
            foreach ( $wp_styles->queue as $handle ) {
                if ( empty( $wp_styles->registered[ $handle ]->src ) ) {
                    continue;
                }

                $preload_resources[] = array(
                    'href' => $wp_styles->registered[ $handle ]->src,
                    'as'   => 'style',
                );
                break;
            }
        }

        return $preload_resources;
    }
}
