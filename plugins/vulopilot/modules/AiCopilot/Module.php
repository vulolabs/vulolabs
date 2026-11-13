<?php
/**
 * Module class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\AiCopilot;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot AiCopilot module.
 *
 * @class       Module class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Module {

	/** Module constructor. */
	public function __construct() {
		new Abilities();
	}
}
