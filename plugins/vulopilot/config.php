<?php
/**
 * VuloPilot config file.
 *
 * @package VuloPilot
 */

defined( 'ABSPATH' ) || exit;

define( 'VULOPILOT_PLUGIN_TEXTDOMAIN', 'vulopilot' );
define( 'VULOPILOT_PLUGIN_VERSION', '1.0.1' );
define( 'VULOPILOT_PLUGIN_SLUG', 'vulopilot' );
define( 'VULOPILOT_PLUGIN_NAME', 'VuloPilot' );
define( 'VULOPILOT_PRO_SHOP_URL', 'https://vulopilot.com/pricing/?utm_source=wpadmin&utm_medium=pluginsettings&utm_campaign=vulopilot' );

if ( ! defined( 'VULOPILOT_APPLICATION_ID' ) ) {
	define( 'VULOPILOT_APPLICATION_ID', '6bae3ccf-0c1d-4ca4-9b99-67fab0c4e0a7' );
}

if ( ! defined( 'VULOPILOT_VULOCLOUD_URL' ) ) {
	define( 'VULOPILOT_VULOCLOUD_URL', 'https://store.vulolabs.com' );
}

if ( ! defined( 'VULOPILOT_VULOCLOUD_HOST_ORGANIZATION_ID' ) ) {
	define( 'VULOPILOT_VULOCLOUD_HOST_ORGANIZATION_ID', 'b3235308-51a9-48db-ba2b-be76b93663c8' );
}
