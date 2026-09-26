<?php
namespace VuloPilot\Performance;

use VuloPilot\Utill\Finding;
use VuloPilot\Utill\Severity;
use VuloPilot\Utill\ScannerUtil;

defined( 'ABSPATH' ) || exit;

/**
 * Flags a site with no detectable CDN/asset-offloading - checks whether
 * any same-page asset URL resolves
 * to a host other than the site's own (a real signal that assets are
 * already being served from a CDN or offload service), and falls back to
 * a known-plugin check (same is_plugin_active() shape
 * CacheDetectionScanner uses) before concluding nothing is offloading
 * assets.
 *
 * @class       CdnScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class CdnScanner extends ScannerUtil {

    private const REQUEST_TIMEOUT_SECONDS = 8;

    /**
     * Main plugin files of well-known CDN/asset-offload plugins.
     */
    private const KNOWN_CDN_PLUGINS = array(
        'cloudflare/cloudflare.php',
        'wp-cloudflare-page-cache/wp-cloudflare-super-page-cache.php',
        'ewww-image-optimizer/ewww-image-optimizer.php',
        'bunnycdn/bunnycdn.php',
    );

    private const ASSET_SRC_PATTERN = '/(?:href|src)=["\']((?:https?:)?\/\/[^"\']+\.(?:css|js|png|jpe?g|gif|webp|svg|woff2?))["\']/i';

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'cdn';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'CDN', 'vulopilot' );
    }

    /**
     * @inheritDoc
     */
    public function get_category(): string {
        return 'performance';
    }

    /**
     * @inheritDoc
     */
    public function scan(): array {
        if ( $this->assets_served_from_other_host() || $this->has_known_cdn_plugin() ) {
            return array();
        }

        return array(
            new Finding(
                __( 'No CDN detected for static assets', 'vulopilot' ),
                Severity::LOW,
                $this->get_category(),
                __( 'Every asset on the homepage is served directly from this server. A CDN serves images, CSS, and JavaScript from servers closer to each visitor, reducing load times worldwide.', 'vulopilot' ),
                'url',
                home_url( '/' ),
                array(
                    'recommended_fix' => array(
                        __( 'Sign up for a CDN (e.g. Cloudflare, BunnyCDN, StackPath) and point your DNS or media library through it.', 'vulopilot' ),
                        __( 'Alternatively, use a WordPress plugin that integrates a CDN with your media library automatically.', 'vulopilot' ),
                        __( 'Confirm static assets (images, CSS, JS) now resolve to a different host than your own site.', 'vulopilot' ),
                        __( 'Re-run this scan to confirm at least one asset is now served through the CDN.', 'vulopilot' ),
                    ),
                )
            ),
        );
    }

    /**
     * @return bool
     */
    private function assets_served_from_other_host(): bool {
        $response = wp_remote_get(
            home_url( '/' ),
            array(
                'timeout'   => self::REQUEST_TIMEOUT_SECONDS,
                'sslverify' => false,
            )
        );

        if ( is_wp_error( $response ) ) {
            // Can't tell either way - don't flag on an inconclusive request.
            return true;
        }

        $html = wp_remote_retrieve_body( $response );

        if ( 0 === preg_match_all( self::ASSET_SRC_PATTERN, $html, $matches ) ) {
            return false;
        }

        $site_host = wp_parse_url( home_url( '/' ), PHP_URL_HOST );

        foreach ( $matches[1] as $url ) {
            $url_host = wp_parse_url( $url, PHP_URL_HOST );

            if ( null !== $url_host && $url_host !== $site_host ) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return bool
     */
    private function has_known_cdn_plugin(): bool {
        if ( ! function_exists( 'is_plugin_active' ) ) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        foreach ( self::KNOWN_CDN_PLUGINS as $plugin_file ) {
            if ( is_plugin_active( $plugin_file ) ) {
                return true;
            }
        }

        return false;
    }
}
