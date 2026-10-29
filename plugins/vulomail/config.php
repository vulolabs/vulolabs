<?php
/**
 * VuloMail config file.
 *
 * @package VuloMail
 */

defined( 'ABSPATH' ) || exit;

define( 'VULOMAIL_PLUGIN_TEXTDOMAIN', 'vulomail' );
define( 'VULOMAIL_PLUGIN_VERSION', '1.0.0' );
define( 'VULOMAIL_PLUGIN_SLUG', 'vulomail' );
define( 'VULOMAIL_PLUGIN_NAME', 'VuloMail' );

// Public integration API version (classes/Integrations/functions.php). See docs/developer/INTEGRATION-API.md.
define( 'VULOMAIL_API_VERSION', '1.0' );

// VuloLabs' hosted Google OAuth app; empty falls back to the site owner's own. Override in wp-config.php.
if ( ! defined( 'VULOMAIL_GOOGLE_CONNECT_URL' ) ) {
	define( 'VULOMAIL_GOOGLE_CONNECT_URL', '' );
}
