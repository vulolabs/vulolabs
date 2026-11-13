<?php
/**
 * Module class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\TechnicalSeo;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot TechnicalSeo module.
 *
 * @class       Module class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Module {

	/** Module constructor. */
	public function __construct() {
		new Abilities();
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
				// AI Crawler Analytics - "Blocked Pages," the one genuinely new Free scanner that pass adds.
				Scanners\AiCrawlerBlockedPagesScanner::class,
			)
		);
	}
}
