<?php
/**
 * FrontendScripts class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot;

use VuloPilot\AiAssistant\VuloCloudAccountConnection;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot FrontendScripts class.
 *
 * @class       FrontendScripts class
 * @version     1.0.0
 * @author      VuloLabs
 */
class FrontendScripts {

	/** FrontendScripts constructor. */
	public function __construct() {
		add_action( 'admin_enqueue_scripts', array( $this, 'admin_load_scripts' ) );
	}

	/**
	 * Returns the URL to the built assets directory.
	 *
	 * @return string
	 */
	public static function get_asset_url() {
		return VuloPilot()->plugin_url . 'assets/';
	}

	/**
	 * Registers the admin assets.
	 *
	 * @return void
	 */
	public static function admin_load_scripts() {
		self::register_admin_scripts();
		self::register_admin_styles();
	}

	/**
	 * Registers the admin app and its shared-dependency chunk.
	 *
	 * @return void
	 */
	private static function register_admin_scripts() {
		$index_asset_path  = VuloPilot()->plugin_path . 'assets/js/index.asset.php';
		$vendor_asset_path = VuloPilot()->plugin_path . 'assets/js/vendors.asset.php';

		$index_asset = file_exists( $index_asset_path )
			? include $index_asset_path
			: array(
				'dependencies' => array( 'wp-element', 'wp-i18n', 'wp-hooks' ),
				'version'      => VULOPILOT_PLUGIN_VERSION,
			);

		$vendor_asset = file_exists( $vendor_asset_path )
			? include $vendor_asset_path
			: array(
				'dependencies' => array(),
				'version'      => VULOPILOT_PLUGIN_VERSION,
			);

		wp_register_script(
			'vulopilot-vendor-script',
			self::get_asset_url() . 'js/vendors.js',
			$vendor_asset['dependencies'],
			$vendor_asset['version'],
			true
		);

		wp_register_script(
			'vulopilot-admin-script',
			self::get_asset_url() . 'js/index.js',
			$index_asset['dependencies'],
			$index_asset['version'],
			true
		);
		wp_set_script_translations( 'vulopilot-admin-script', 'vulopilot' );
	}

	/**
	 * Registers the admin app's CSS.
	 *
	 * @return void
	 */
	private static function register_admin_styles() {
		wp_register_style(
			'vulopilot-admin-style',
			self::get_asset_url() . 'styles/index.css',
			array(),
			// The file's build time, so a rebuilt stylesheet gets a new URL instead of the browser's cached copy.
			self::asset_version( 'styles/index.css' )
		);
	}

	/**
	 * Version string for a built asset: its modification time, or the plugin version when it is missing.
	 *
	 * @param string $relative_path Path under the plugin's assets/ folder.
	 * @return string
	 */
	private static function asset_version( $relative_path ) {
		$path = VuloPilot()->plugin_path . 'assets/' . $relative_path;

		return file_exists( $path ) ? (string) filemtime( $path ) : VULOPILOT_PLUGIN_VERSION;
	}

	/**
	 * Enqueues a previously registered handle.
	 *
	 * @param string $handle Registered handle.
	 * @return void
	 */
	public static function enqueue_script( $handle ) {
		wp_enqueue_script( $handle );
	}

	/**
	 * Enqueues a previously registered CSS handle.
	 *
	 * @param string $handle Registered handle.
	 * @return void
	 */
	public static function enqueue_style( $handle ) {
		wp_enqueue_style( $handle );
	}

	/**
	 * Passes the React app what it needs to boot and call the REST API.
	 *
	 * @param string $handle Handle to attach the data to.
	 * @return void
	 */
	public static function localize_scripts( $handle ) {
		$vulocloud_status = ( new VuloCloudAccountConnection() )->get_status();

		wp_localize_script(
			$handle,
			'vulopilotAppLocalizer',
			array(
				'apiUrl'                    => untrailingslashit( get_rest_url() ),
				'restUrl'                   => VuloPilot()->rest_namespace,
				'nonce'                     => wp_create_nonce( 'wp_rest' ),
				'plugin_url'                => VuloPilot()->plugin_url,
				'admin_url'                 => admin_url( 'admin.php?page=vulopilot' ),
				'site_url'                  => site_url(),
				// Settings → Site Identity → Title Formats' own Live Title Preview reads these directly.
				'site_title'                => get_bloginfo( 'name' ),
				'site_description'          => get_bloginfo( 'description' ),
				// Dashboard → Site overview's homepage thumbnail.
				'home_preview_image'        => self::get_home_preview_image(),
				// The real logged-in user's own display name.
				'current_user_display_name' => wp_get_current_user()->display_name,
				'version'                   => VuloPilot()->version,
				'plugin_slug'               => VuloPilot()->plugin_slug,
				'text_domain'               => VULOPILOT_PLUGIN_TEXTDOMAIN,
				'date_format'               => get_option( 'date_format' ) . ' ' . get_option( 'time_format' ),
				// Settings → General → Date Format, translated into zyra's own token syntax (YYYY/MM/DD/…).
				'date_format_js'            => self::convert_date_format_to_js( get_option( 'date_format' ) ),
				// Settings → General → Time Format, converted like 'date_format_js' above but with its own call.
				'time_format_js'            => self::convert_date_format_to_js( get_option( 'time_format' ) ),
				// Settings → General → Timezone as a minute offset from UTC (`wp_timezone()` resolves both a `timezone_string` and a `gmt_offset` fallback, DST included).
				'gmt_offset_minutes'        => (int) round(
					wp_timezone()->getOffset( new \DateTime( 'now', new \DateTimeZone( 'UTC' ) ) ) / 60
				),
				'khali_dabba'               => VuloPilot()->util->is_khali_dabba(),
				'active_modules'            => (array) apply_filters( 'vulopilot_localized_active_modules', VuloPilot()->modules->get_active_modules() ),
				'vulocloud_connected'       => $vulocloud_status['connected'],
				'vulocloud_account_email'   => $vulocloud_status['email'],
				'shop_url'                  => VULOPILOT_PRO_SHOP_URL,
				'pro_data'                  => apply_filters(
					'vulopilot_update_pro_data',
					array(
						'version'         => false,
						'manage_plan_url' => VULOPILOT_PRO_SHOP_URL,
					)
				),
				// Settings → Sitemap's own "Post types in sitemap" checkbox list (SEO/Sitemap.ts).
				'sitemap_custom_post_types' => self::get_sitemap_custom_post_types(),
				// Whether WooCommerce is active on this site at all.
				'has_woocommerce'           => class_exists( 'WooCommerce' ),
			)
		);
	}

	/**
	 * Real, currently-registered public post types beyond the 4 this plugin's own Sitemap settings tab already hardcodes as fixed checkboxes.
	 *
	 * @return array
	 */
	private static function get_sitemap_custom_post_types() {
		$builtin        = array( 'post', 'page', 'attachment', 'product' );
		$post_type_objs = get_post_types( array( 'public' => true ), 'objects' );

		$custom = array();

		foreach ( $post_type_objs as $slug => $post_type_obj ) {
			if ( in_array( $slug, $builtin, true ) ) {
				continue;
			}

			$custom[] = array(
				'value' => $slug,
				'label' => $post_type_obj->labels->name,
			);
		}

		return $custom;
	}

	/**
	 * Converts a PHP `date()` format string into the token syntax zyra's table `date` column understands.
	 *
	 * @param string $php_format A PHP `date()` format string.
	 * @return string The same format expressed in zyra's token syntax.
	 */
	private static function convert_date_format_to_js( string $php_format ): string {
		$token_map = array(
			'Y' => 'YYYY',
			'y' => 'YY',
			'F' => 'MMMM',
			'M' => 'MMM',
			'm' => 'MM',
			'n' => 'MM',
			'd' => 'DD',
			'j' => 'D',
			'H' => 'HH',
			'G' => 'HH',
			'h' => 'HH',
			'g' => 'HH',
			'i' => 'mm',
			's' => 'ss',
		);

		$js_format = '';
		$length    = strlen( $php_format );

		for ( $i = 0; $i < $length; $i++ ) {
			$char = $php_format[ $i ];

			// A backslash escapes the next character as a literal in PHP's date() syntax.
			if ( '\\' === $char && $i + 1 < $length ) {
				$js_format .= $php_format[ ++$i ];
				continue;
			}

			if ( 'a' === $char || 'A' === $char ) {
				continue;
			}

			$js_format .= $token_map[ $char ] ?? $char;
		}

		return trim( $js_format );
	}

	/**
	 * Best real image to represent the homepage.
	 *
	 * @return string Image URL, or '' when the site has none of them.
	 */
	private static function get_home_preview_image(): string {
		$front_page_id = (int) get_option( 'page_on_front' );

		if ( $front_page_id ) {
			$thumbnail = get_the_post_thumbnail_url( $front_page_id, 'large' );

			if ( $thumbnail ) {
				return esc_url_raw( $thumbnail );
			}
		}

		$logo_id = (int) get_theme_mod( 'custom_logo' );

		if ( $logo_id ) {
			$logo = wp_get_attachment_image_url( $logo_id, 'large' );

			if ( $logo ) {
				return esc_url_raw( $logo );
			}
		}

		$site_icon = get_site_icon_url( 512 );

		if ( $site_icon ) {
			return esc_url_raw( $site_icon );
		}

		// Sites that show their latest posts have none of the above by default.
		$posts_with_image = get_posts(
			array(
				'post_type'      => array( 'post', 'page' ),
				'post_status'    => 'publish',
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'meta_key'       => '_thumbnail_id', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- one-off social-share og:image fallback lookup (not a hot/repeated path), and `_thumbnail_id` is WordPress core's own indexed postmeta key.
				'orderby'        => 'date',
				'order'          => 'DESC',
			)
		);

		if ( $posts_with_image ) {
			$thumbnail = get_the_post_thumbnail_url( (int) $posts_with_image[0], 'large' );

			if ( $thumbnail ) {
				return esc_url_raw( $thumbnail );
			}
		}

		$images = get_posts(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'post_mime_type' => 'image',
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'orderby'        => 'date',
				'order'          => 'DESC',
			)
		);

		$image_url = $images ? (string) wp_get_attachment_image_url( (int) $images[0], 'large' ) : '';

		// The store platform's stock placeholder image isn't this site's own picture.
		return ( '' !== $image_url && false === strpos( $image_url, 'placeholder' ) ) ? esc_url_raw( $image_url ) : '';
	}
}
