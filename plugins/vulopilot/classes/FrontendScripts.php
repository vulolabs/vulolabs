<?php
/**
 * FrontendScripts class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot;

use VuloPilot\Services\VuloCloudAccountConnection;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot FrontendScripts class.
 *
 * Registers and localizes the admin React bundle. Deliberately much
 * smaller than VuloLabs\FrontendScripts — that class's size comes from
 * WooCommerce-specific localized data (store owners, payment gateways, WC
 * countries) VuloPilot has no equivalent of; this only carries what the
 * React app actually needs to boot and call the REST API (see
 * src/global.d.ts's AppLocalizer interface).
 *
 * @class       FrontendScripts class
 * @version     1.0.0
 * @author      VuloLabs
 */
class FrontendScripts {

    /**
     * FrontendScripts constructor.
     */
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
     * Registers the admin script and style bundles (built by wp-scripts;
     * see webpack.config.js / package.json).
     *
     * @return void
     */
    public static function admin_load_scripts() {
        self::register_admin_scripts();
        self::register_admin_styles();
    }

    /**
     * Registers every admin script handle — both the app entry
     * ('vulopilot-admin-script', from index.js) and the shared-dependency
     * chunk webpack's splitChunks config emits alongside it
     * ('vulopilot-vendor-script', from vendors.js — see
     * tools/webpack/create-config.js's `optimization.splitChunks.cacheGroups.vendors`).
     * index.js's own webpack runtime expects vendors.js's module registry
     * to already be on the page; registering only the admin script and
     * never the vendor one (a bug this method used to have) means
     * index.js loads with nothing to resolve its own chunk references
     * against and the React app silently never mounts — a blank content
     * area with working WP-admin chrome around it, not a fatal error.
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
     * Registers every admin style handle.
     *
     * @return void
     */
    private static function register_admin_styles() {
        wp_register_style(
            'vulopilot-admin-style',
            self::get_asset_url() . 'styles/index.css',
            array(),
            VULOPILOT_PLUGIN_VERSION
        );
    }

    /**
     * Enqueues a previously registered script handle.
     *
     * @param string $handle Script handle.
     * @return void
     */
    public static function enqueue_script( $handle ) {
        wp_enqueue_script( $handle );
    }

    /**
     * Enqueues a previously registered style handle.
     *
     * @param string $handle Style handle.
     * @return void
     */
    public static function enqueue_style( $handle ) {
        wp_enqueue_style( $handle );
    }

    /**
     * Localizes the admin script with everything the React app needs to
     * boot and call the REST API.
     *
     * @param string $handle Script handle to attach the localized data to.
     * @return void
     */
    public static function localize_scripts( $handle ) {
        $vulocloud_status = ( new VuloCloudAccountConnection() )->get_status();

        wp_localize_script(
            $handle,
            'appLocalizer',
            array(
                'apiUrl'                    => untrailingslashit( get_rest_url() ),
                'restUrl'                   => VuloPilot()->rest_namespace,
                'nonce'                     => wp_create_nonce( 'wp_rest' ),
                'plugin_url'                => VuloPilot()->plugin_url,
                'admin_url'                 => admin_url( 'admin.php?page=vulopilot' ),
                'site_url'                  => site_url(),
                // Settings → Site Identity → Title Formats' own Live Title
                // Preview reads these directly rather than round-tripping a
                // REST call for two read-only WP-core values Services\TitleFormatter
                // itself resolves the exact same way (get_bloginfo()).
                'site_title'                => get_bloginfo( 'name' ),
                'site_description'          => get_bloginfo( 'description' ),
                // Dashboard → Site overview's homepage thumbnail: the static front
                // page's featured image, else the site logo, else the site icon —
                // a real image this site already has, not a rendered screenshot.
                'home_preview_image'        => self::get_home_preview_image(),
                // The real logged-in user's own display name — e.g. the
                // AI Content Assistant's greeting (AiContentAssistantSidebar.tsx)
                // reads this to say "Hi {name}!" instead of a generic
                // "Hi!". `localize_scripts()` only ever runs in an
                // authenticated admin context, so wp_get_current_user()
                // is never the logged-out 0-id user here.
                'current_user_display_name' => wp_get_current_user()->display_name,
                'version'                   => VuloPilot()->version,
                'plugin_slug'               => VuloPilot()->plugin_slug,
                'text_domain'               => VULOPILOT_PLUGIN_TEXTDOMAIN,
                'date_format'               => get_option( 'date_format' ) . ' ' . get_option( 'time_format' ),
                // Settings → General → Date Format, translated into zyra's
                // own token syntax (YYYY/MM/DD/…) — TableCard's `date`
                // column type and any other date display in the React app
                // pass this through as the `format` it renders with, so
                // dates show the way this site is actually configured
                // rather than zyra's hardcoded "YYYY-MM-DD" default.
                'date_format_js'            => self::convert_date_format_to_js( get_option( 'date_format' ) ),
                // Settings → General → Time Format, same real token
                // conversion as 'date_format_js' above (same static
                // helper — its own docblock's "date_format never contains
                // time tokens" caveat is exactly why this needed its own
                // separate call, real `time_format` was never actually
                // converted before). zyra's own token syntax has no am/pm
                // token, so a 12-hour 'g:i a'-style format still renders
                // without the AM/PM suffix — the same already-accepted
                // limitation 'date_format_js' itself already carries for
                // any date format containing 'a'/'A'.
                'time_format_js'            => self::convert_date_format_to_js( get_option( 'time_format' ) ),
                // Settings → General → Timezone, as a plain minute offset
                // from UTC (`wp_timezone()` already resolves both a real
                // `timezone_string` like 'Asia/Kolkata' and a plain
                // `gmt_offset` fallback into one DateTimeZone, DST included
                // for the former) — every raw timestamp this plugin's own
                // REST layer returns is UTC (`current_time( 'mysql', true )`,
                // confirmed across ScanPersistenceListener.php/
                // BackupManager.php/AutomationScheduler.php), so formatWpDate.ts/
                // formatWpTime() need this to shift a raw UTC value to this
                // site's own configured local time before reading its
                // date/time parts — without it, a JS `new Date()` on that
                // same naive "Y-m-d H:i:s" string (no 'Z'/offset) gets
                // parsed as the *visiting browser's* local time instead,
                // which silently disagrees with this site's own Settings →
                // General → Timezone for any admin not physically in that
                // same zone.
                'gmt_offset_minutes'        => (int) round(
                    wp_timezone()->getOffset( new \DateTime( 'now', new \DateTimeZone( 'UTC' ) ) ) / 60
                ),
                // Feeds zyra's configureZyra()/ZyraVariable.khali_dabba (a
                // proSetting field's Pro-tag/lock in InputRenderer) and
                // vulopilot-pro's src/index.tsx (which module JS entries
                // actually load) — both were reading these two keys off
                // appLocalizer already, but nothing populated them yet.
                'khali_dabba'               => VuloPilot()->util->is_khali_dabba(),
                'active_modules'            => VuloPilot()->modules->get_active_modules(),
                // useVuloCloudAccountLogin.ts's own real, synchronous read —
                // same "localized once at page load, no fetch/loading state
                // needed" shape 'khali_dabba' above already has. A *person*
                // logged into VuloCloud (VuloCloudAccountConnection), not
                // this site's own Pro license — see that class's own
                // docblock.
                'vulocloud_connected'       => $vulocloud_status['connected'],
                'vulocloud_account_email'   => $vulocloud_status['email'],
                'shop_url'                  => VULOPILOT_PRO_SHOP_URL,
                // 'version' defaults to false (Pro not installed) unless
                // vulopilot-pro's own bootstrap overrides it — same
                // shape/default as vulocart's 'pro_data'/
                // `vulocart_update_pro_data` filter. Feeds the header's
                // "Pro: …" version tag (app.tsx).
                'pro_data'                  => apply_filters(
                    'vulopilot_update_pro_data',
                    array(
                        'version'         => false,
                        'manage_plan_url' => VULOPILOT_PRO_SHOP_URL,
                    )
                ),
            )
        );
    }

    /**
     * Translates a PHP `date()` format string (Settings → General → Date
     * Format only ever produces one of a handful of single-character
     * tokens — Y/y/F/M/m/n/j/d, plus whatever literal punctuation sits
     * between them) into the token syntax zyra's own TableCard `date`
     * column type understands (YYYY/YY/MMMM/MMM/MM/DD/D). zyra has no
     * unpadded-numeric-month or 12-hour/am-pm tokens, so `n`/`h`/`g` fall
     * back to their nearest zyra equivalent and `a`/`A` are dropped rather
     * than leaking the literal letter into the rendered date — a
     * non-issue in practice since `date_format` (unlike `time_format`)
     * never contains time tokens on a default WordPress install.
     *
     * @param string $php_format A PHP `date()` format string, e.g. get_option( 'date_format' ).
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

            // A backslash escapes the next character as a literal in
            // PHP's date() syntax (e.g. custom formats like 'jS \o\f F').
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
     * Best real image to represent the homepage: the static front page's
     * featured image, else the custom logo, else the site icon, else the
     * newest post featured image, else the newest media-library image.
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

        // Sites that show their latest posts (no static front page) have
        // none of the above by default — fall back to the newest published
        // post that has a featured image, then the newest image in the
        // media library.
        $posts_with_image = get_posts(
            array(
                'post_type'      => array( 'post', 'page' ),
                'post_status'    => 'publish',
                'posts_per_page' => 1,
                'fields'         => 'ids',
                'meta_key'       => '_thumbnail_id',
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

        // WooCommerce's stock placeholder image isn't this site's own picture.
        return ( '' !== $image_url && false === strpos( $image_url, 'placeholder' ) ) ? esc_url_raw( $image_url ) : '';
    }
}
