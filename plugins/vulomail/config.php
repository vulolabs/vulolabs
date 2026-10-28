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

// Version of the public integration API (classes/Integrations/functions.php: vulomail_send_email() etc).
// Bumped only when that surface changes; see docs/developer/INTEGRATION-API.md.
define( 'VULOMAIL_API_VERSION', '1.0' );

// VuloLabs' Google connect service: a Google-approved OAuth app, so the site owner needs no Google
// Cloud project. Empty switches it off; Gmail then signs in via the owner's own Google app. Override
// in wp-config.php.
if ( ! defined( 'VULOMAIL_GOOGLE_CONNECT_URL' ) ) {
	define( 'VULOMAIL_GOOGLE_CONNECT_URL', '' );
}
