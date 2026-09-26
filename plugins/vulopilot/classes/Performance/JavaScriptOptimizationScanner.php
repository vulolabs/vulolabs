<?php
namespace VuloPilot\Performance;

use VuloPilot\Utill\Finding;
use VuloPilot\Utill\Severity;

defined( 'ABSPATH' ) || exit;

/**
 * Flags un-minified same-host JavaScript on the homepage when no known
 * minification-capable plugin is active - see
 * AbstractAssetOptimizationScanner for the shared fetch/detection logic
 * this and CssOptimizationScanner both build on.
 *
 * @class       JavaScriptOptimizationScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class JavaScriptOptimizationScanner extends AbstractAssetOptimizationScanner {

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'javascript-optimization';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'JavaScript', 'vulopilot' );
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
        if ( $this->has_known_minifier_plugin() ) {
            return array();
        }

        $html = $this->fetch_homepage_html();

        if ( null === $html ) {
            return array();
        }

        $unminified = $this->find_unminified_same_host_assets( $html, 'script', 'src' );

        if ( empty( $unminified ) ) {
            return array();
        }

        return array(
            new Finding(
                sprintf(
                    /* translators: %d is the number of un-minified scripts found. */
                    _n(
                        '%d un-minified script found',
                        '%d un-minified scripts found',
                        count( $unminified ),
                        'vulopilot'
                    ),
                    count( $unminified )
                ),
                Severity::LOW,
                $this->get_category(),
                __( 'These scripts aren\'t minified and no minification plugin is active. Minifying JavaScript reduces file size and speeds up page rendering.', 'vulopilot' ),
                'url',
                home_url( '/' ),
                array(
                    'scripts'         => $unminified,
                    'recommended_fix' => array(
                        __( 'Enable JavaScript minification in your caching/optimization plugin.', 'vulopilot' ),
                        __( 'Defer or async-load non-critical scripts so they don\'t block page rendering.', 'vulopilot' ),
                        __( 'Remove unused scripts from themes/plugins you don\'t need.', 'vulopilot' ),
                        __( 'Re-run this scan after minifying to confirm these scripts are no longer flagged.', 'vulopilot' ),
                    ),
                ),
                'unminified-scripts'
            ),
        );
    }
}
