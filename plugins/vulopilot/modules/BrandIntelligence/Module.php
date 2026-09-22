<?php
/**
 * Module class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\BrandIntelligence;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot Brand Intelligence module.
 *
 * Same genuinely-gated shape ContentIntelligence\Module already uses —
 * this module's 3 own new scanners (OrganizationSchemaScanner,
 * AuthorSchemaScanner, AboutPageAnalysisScanner) are registered here via
 * `vulopilot_scanner_sources`, not in
 * ScannerRegistry::get_default_scanner_classes(); deactivating this module
 * (Settings → Modules) stops them from producing new findings.
 *
 * Deliberately does NOT re-register the existing `geo`-category scanners
 * it reads from (GeoTrustSignalsScanner/GeoEeatSignalsScanner/
 * GeoAuthorInfoScanner/GeoEntityNamingConsistencyScanner —
 * BRAND-INTELLIGENCE-MODULE.md's audit) — those already run under
 * Geo\Module's own always-on registration and stay there; recategorizing
 * or re-registering them here would be exactly the kind of
 * duplicated-registration ContentIntelligence\Module's own docblock
 * already avoids for its own reused `seo` scanners.
 *
 * Same Module.php shape module-architecture.md documents, discovered by
 * VuloPilot's own free-plugin `modules/` source — no filter registration
 * needed since this module ships in Free itself.
 *
 * @class       Module class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Module {

    /**
     * Module constructor.
     */
    public function __construct() {
        add_filter( 'vulopilot_scanner_sources', array( $this, 'register_scanners' ) );
    }

    /**
     * @param string[] $scanners Already-registered scanner classes.
     * @return string[]
     */
    public function register_scanners( array $scanners ): array {
        return array_merge(
            $scanners,
            array(
                Scanners\OrganizationSchemaScanner::class,
                Scanners\AuthorSchemaScanner::class,
                Scanners\AboutPageAnalysisScanner::class,
            )
        );
    }
}
