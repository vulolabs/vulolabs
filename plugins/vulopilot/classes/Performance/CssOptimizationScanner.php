<?php
namespace VuloPilot\Performance;

use VuloPilot\Utill\Finding;
use VuloPilot\Utill\Severity;

defined( 'ABSPATH' ) || exit;

/**
 * Flags un-minified same-host CSS on the homepage when no known
 * minification-capable plugin is active - see
 * AbstractAssetOptimizationScanner for the shared fetch/detection logic
 * this and JavaScriptOptimizationScanner both build on.
 *
 * @class       CssOptimizationScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class CssOptimizationScanner extends AbstractAssetOptimizationScanner {

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'css-optimization';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'CSS Optimization', 'vulopilot' );
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

        $unminified = $this->find_unminified_same_host_assets( $html, 'link', 'href', 'stylesheet' );

        if ( empty( $unminified ) ) {
            return array();
        }

        return array(
            new Finding(
                sprintf(
                    /* translators: %d is the number of un-minified stylesheets found. */
                    _n(
                        '%d un-minified stylesheet found',
                        '%d un-minified stylesheets found',
                        count( $unminified ),
                        'vulopilot'
                    ),
                    count( $unminified )
                ),
                Severity::LOW,
                $this->get_category(),
                __( 'These stylesheets aren\'t minified and no minification plugin is active. Minifying CSS reduces file size and speeds up page rendering.', 'vulopilot' ),
                'url',
                home_url( '/' ),
                array(
                    'stylesheets'     => $unminified,
                    'recommended_fix' => array(
                        __( 'Enable CSS minification in your caching/optimization plugin, or use a dedicated asset-optimization plugin.', 'vulopilot' ),
                        __( 'Combine multiple small stylesheets into fewer files where possible to reduce requests.', 'vulopilot' ),
                        __( 'Remove unused CSS rules from themes/plugins you don\'t need.', 'vulopilot' ),
                        __( 'Re-run this scan after minifying to confirm these stylesheets are no longer flagged.', 'vulopilot' ),
                    ),
                ),
                'unminified-styles'
            ),
        );
    }
}
