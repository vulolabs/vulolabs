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

// Version of the public integration API in classes/Integrations/functions.php (vulomail_send_email() and friends).
// Bumped only when that surface changes; see docs/developer/INTEGRATION-API.md.
define( 'VULOMAIL_API_VERSION', '1.0' );

// VuloLabs' Google connect service, which makes "Sign in with Google" one click: it holds a Google-approved
// OAuth app, so the site owner needs no Google Cloud project. Empty switches one-click off; the Gmail
// connection then signs in through the site owner's own Google app. Set it in wp-config.php to override.
if ( ! defined( 'VULOMAIL_GOOGLE_CONNECT_URL' ) ) {
	define( 'VULOMAIL_GOOGLE_CONNECT_URL', '' );
}
