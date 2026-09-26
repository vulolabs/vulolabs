<?php
namespace VuloPilot\SeoVisibility;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Scanning → SEO & Content → Tag Manager card's real backing - outputs
 * Google Tag Manager's two-part snippet: the loader enqueued through the
 * WordPress asset API, and the fallback printed right after the opening
 * `<body>` tag via `wp_body_open`.
 *
 * Self-registers its own hooks in the constructor (php-wordpress.md) and is
 * constructed unconditionally in VuloPilot::init_classes().
 *
 * @class       TagManagerService class
 * @version     1.0.0
 * @author      VuloLabs
 */
class TagManagerService {

    /**
     * TagManagerService constructor.
     */
    public function __construct() {
        add_action( 'wp_enqueue_scripts', array( $this, 'maybe_enqueue_head_script' ), 1 );
        add_action( 'wp_body_open', array( $this, 'maybe_output_body_noscript' ) );
    }

    /**
     * @return void
     */
    public function maybe_enqueue_head_script(): void {
        $container_id = $this->get_container_id();

        if ( '' === $container_id ) {
            return;
        }

        // A source-less handle carrying only the inline GTM bootstrap, printed in <head>.
        wp_register_script( 'vulopilot-gtm', false, array(), VuloPilot()->version, false );
        wp_enqueue_script( 'vulopilot-gtm' );
        wp_add_inline_script(
            'vulopilot-gtm',
            sprintf(
                "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n" .
                "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n" .
                "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n" .
                "'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n" .
                "})(window,document,'script','dataLayer','%s');",
                esc_js( $container_id )
            )
        );
    }

    /**
     * @return void
     */
    public function maybe_output_body_noscript(): void {
        $container_id = $this->get_container_id();

        if ( '' === $container_id ) {
            return;
        }

        printf(
            '<!-- Google Tag Manager (noscript) --><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=%1$s" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript><!-- End Google Tag Manager (noscript) -->' . "\n",
            esc_attr( $container_id )
        );
    }

    /**
     * Real, trimmed GTM Container ID - empty when the toggle is off or no
     * id has been entered yet, the same "gate output, not construction"
     * posture WebmasterToolsManager's own per-provider codes already use.
     *
     * @return string
     */
    private function get_container_id(): string {
        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['tag_manager_enabled'] ) ) {
            return '';
        }

        return trim( (string) ( $settings['tag_manager_container_id'] ?? '' ) );
    }
}
