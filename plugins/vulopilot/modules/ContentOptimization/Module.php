<?php
/**
 * Module class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\ContentOptimization;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot ContentOptimization module.
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
				Scanners\ReadabilityScanner::class,
			)
		);
	}
}
