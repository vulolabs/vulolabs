<?php
/**
 * Plugin Name: VuloMail
 * Plugin URI: https://vulomail.com/
 * Description: One plugin. Email and SMS. One delivery control center. Send WordPress email through SMTP or a transactional email API, send SMS through your own gateway, with failover, logs and diagnostics.
 * Author: VuloLabs
 * Version: 1.0.0
 * Author URI: https://vulolabs.com/
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * Text Domain: vulomail
 * Domain Path: /languages/
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 *
 * @package VuloMail
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/vendor/autoload.php';
// Lives under classes/ because the release script only packages a fixed list of top-level paths.
require_once __DIR__ . '/classes/Integrations/functions.php';

/**
 * Returns the main plugin instance.
 *
 * @return \VuloMail\VuloMail
 */
function VuloMail() { // phpcs:ignore WordPress.NamingConventions.ValidFunctionName.FunctionNameInvalid -- PascalCase global accessor, same deliberate exception as VuloPilot()/VuloCart().
	return \VuloMail\VuloMail::init( __FILE__ );
}

VuloMail();
