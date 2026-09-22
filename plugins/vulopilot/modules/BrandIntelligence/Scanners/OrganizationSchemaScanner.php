<?php
/**
 * OrganizationSchemaScanner class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\BrandIntelligence\Scanners;

use VuloPilot\ValueObjects\Finding;
use VuloPilot\ValueObjects\Severity;
use VuloPilot\Scanners\Basic\AbstractBasicScanner;

defined( 'ABSPATH' ) || exit;

/**
 * Brand Intelligence's own new check (BRAND-INTELLIGENCE-MODULE.md) —
 * narrower than SchemaScanner/StructuredDataValidationScanner's own
 * homepage checks (presence and validity of *any* JSON-LD), this fetches
 * the real, live homepage the same way (`wp_remote_get(home_url('/'))`,
 * same settings gate) and checks specifically for an `Organization` or
 * `LocalBusiness` schema.org type — the structured data Google Knowledge
 * Panels and AI answer engines actually read to resolve "who runs this
 * site" as an entity, not just "does some schema exist somewhere."
 *
 * Checks the real rendered page (not just this site's own
 * `vulopilot_homepage_schema_json` option) so a theme or another plugin's
 * own Organization schema counts too — the same reasoning
 * StructuredDataValidationScanner's own fetch-based check already takes
 * over trusting local state alone.
 *
 * @class       OrganizationSchemaScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class OrganizationSchemaScanner extends AbstractBasicScanner {

    private const REQUEST_TIMEOUT_SECONDS = 8;

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'organization-schema';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'Organization Schema', 'vulopilot' );
    }

    /**
     * @inheritDoc
     */
    public function get_category(): string {
        return 'brand';
    }

    /**
     * @inheritDoc
     */
    public function scan(): array {
        $settings = wp_parse_args( get_option( \VuloPilot\Utill::VULOPILOT_SETTINGS_KEY, array() ), \VuloPilot\Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['flag_missing_schema'] ) ) {
            return array();
        }

        $response = wp_remote_get(
            home_url( '/' ),
            array(
                'timeout'   => self::REQUEST_TIMEOUT_SECONDS,
                'sslverify' => false,
            )
        );

        if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
            return array();
        }

        if ( $this->has_organization_schema( wp_remote_retrieve_body( $response ) ) ) {
            return array();
        }

        return array(
            new Finding(
                __( 'No Organization schema found on the homepage', 'vulopilot' ),
                Severity::MEDIUM,
                $this->get_category(),
                __( 'Organization (or LocalBusiness) structured data is what AI answer engines and Google Knowledge Panels use to resolve "who runs this site" as a real-world entity. Its absence makes this site harder to confidently identify and cite.', 'vulopilot' ),
                'url',
                home_url( '/' )
            ),
        );
    }

    /**
     * Simple raw-string presence check (nested-safe — an Organization
     * reference commonly lives as a "publisher" sub-object of a WebSite
     * block rather than a standalone top-level type), same posture
     * vulopilot-pro's CompetitorVisibilityAnalyzer::has_author_byline()
     * already takes for its own `"@type":"Person"` check.
     *
     * @param string $html Fetched homepage HTML.
     * @return bool
     */
    private function has_organization_schema( string $html ): bool {
        return 1 === preg_match( '/"@type"\s*:\s*"(Organization|LocalBusiness)"/i', $html );
    }
}
