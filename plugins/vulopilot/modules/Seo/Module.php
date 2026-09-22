<?php
/**
 * Module class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Seo;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot Seo module.
 *
 * Unlike Geo\Module (whose own scanners always run no matter what — see
 * that class's own docblock, since GEO has no whole-category kill switch),
 * this module genuinely gates SEO scanning. All 19 SEO-related scanner
 * classes — Titles (SeoScanner), Schema presence, images/alt text, broken
 * links, broken images, plus the 13 checks from SEO-MODULE.md (meta descriptions,
 * canonicals, internal linking, heading structure, thin content, duplicate
 * content, sitemap, robots.txt, OpenGraph/Twitter cards, orphan pages,
 * structured-data validity), plus AI-CRAWLER-ANALYTICS-MODULE.md's
 * "Blocked Pages" check — are registered here via
 * `vulopilot_scanner_sources`, not in
 * ScannerRegistry::get_default_scanner_classes(). If this module is
 * deactivated (Settings → Modules), this filter callback is never
 * registered (Modules::load_active_modules() only `new`s a module class
 * when it's active), so none of these scanner classes are instantiated and
 * no new SEO findings get produced by future scans — the same
 * "register a source, don't be instantiated directly" extension point
 * vulopilot-pro's AdvancedSeo module already uses to ADD 2 more scanners on
 * top when its own, separate Pro module is active. Already-stored findings
 * from before deactivation are untouched; this only stops new ones, the
 * same posture as any disabled category/granular flag_* setting.
 *
 * Same Module.php shape module-architecture.md documents, discovered by
 * VuloPilot's own free-plugin `modules/` source (Modules::get_all_modules()'s
 * default, self-registered `VuloPilot` namespace) — no filter registration
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
                Scanners\SeoScanner::class,
                Scanners\SchemaScanner::class,
                Scanners\ImagesScanner::class,
                Scanners\BrokenLinksScanner::class,
                Scanners\BrokenImagesScanner::class,
                Scanners\MetaDescriptionScanner::class,
                Scanners\CanonicalUrlScanner::class,
                Scanners\InternalLinkingScanner::class,
                Scanners\HeadingStructureScanner::class,
                Scanners\ThinContentScanner::class,
                Scanners\DuplicateContentScanner::class,
                Scanners\SitemapScanner::class,
                Scanners\RobotsTxtScanner::class,
                Scanners\OpenGraphScanner::class,
                Scanners\TwitterCardScanner::class,
                Scanners\OrphanPageScanner::class,
                Scanners\SeoImagesScanner::class,
                Scanners\StructuredDataValidationScanner::class,
                // AI Crawler Analytics (AI-CRAWLER-ANALYTICS-MODULE.md) —
                // "Blocked Pages," the one genuinely new Free scanner that
                // pass adds. Registered here (not ScannerRegistry's core
                // list) since it's a real robots.txt/SEO check, same
                // category and module home as RobotsTxtScanner above.
                Scanners\AiCrawlerBlockedPagesScanner::class,
            )
        );
    }
}
