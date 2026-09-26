<?php
namespace VuloPilot\SeoVisibility;


defined( 'ABSPATH' ) || exit;

/**
 * Enqueues the post-editor SEO metabox - src/post-editor/index.tsx, a
 * `@wordpress/plugins` PluginSidebar registered into the Block Editor,
 * not a mount into VuloPilot's own dashboard app (a separate
 * `#admin-main-wrapper` mount point).
 *
 * Deliberately a `PluginSidebar`, not a classic `add_meta_box()` panel:
 * note the sidebar's `.interface-complementary-area__body` scrolls
 * internally on a long panel - inherent to PluginSidebar, not a bug here.
 *
 * Only enqueued for every post type Services\PostSeoMetaFields::POST_TYPES
 * covers (post/page/product) - that constant is the metabox's single
 * source of truth for which screens it appears on, referenced here rather
 * than duplicated, so this can't silently drift out of sync with which
 * postmeta fields are actually registered for a given post type.
 *
 * @class       PostEditorAssets class
 * @version     1.0.0
 * @author      VuloLabs
 */
class PostEditorAssets {

    /**
     * PostEditorAssets constructor.
     */
    public function __construct() {
        add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue_assets' ) );
    }

    /**
     * Enqueues the post-editor sidebar assets on post/page/product edit
     * screens.
     *
     * @return void
     */
    public function enqueue_assets(): void {
        $screen = get_current_screen();

        if ( ! $screen || ! in_array( $screen->post_type, PostSeoMetaFields::POST_TYPES, true ) ) {
            return;
        }

        $asset_file = VuloPilot()->plugin_path . 'assets/js/post-editor.asset.php';

        if ( ! file_exists( $asset_file ) ) {
            return;
        }

        $asset = include $asset_file;

        wp_enqueue_script(
            'vulopilot-post-editor',
            VuloPilot()->plugin_url . 'assets/js/post-editor.js',
            $asset['dependencies'],
            $asset['version'],
            true
        );

        $style_path = VuloPilot()->plugin_path . 'assets/styles/post-editor.css';
        if ( file_exists( $style_path ) ) {
            wp_enqueue_style( 'vulopilot-post-editor', VuloPilot()->plugin_url . 'assets/styles/post-editor.css', array(), $asset['version'] );
        }

        wp_localize_script(
            'vulopilot-post-editor',
            'vulopilotPostSeo',
            array(
                'apiUrl'   => esc_url_raw( rest_url( VuloPilot()->rest_namespace ) ),
                'nonce'    => wp_create_nonce( 'wp_rest' ),
                'isPro'    => VuloPilot()->util->is_khali_dabba(),
                // Same constant FrontendScripts::localize_scripts() itself
                // localizes as 'shop_url' - not a container key.
                'shopUrl'  => defined( 'VULOPILOT_PRO_SHOP_URL' ) ? VULOPILOT_PRO_SHOP_URL : '',
                // The metabox reads/writes native post meta via
                // wp.data's core/editor 'meta' attribute (registered by
                // Services\PostSeoMetaFields), keyed by these exact
                // strings - localized rather than hand-copied in TS so
                // the two layers can't drift apart.
                'metaKeys' => array_merge(
                    PostSeoMetaFields::META_KEYS,
                    array( 'schema_json' => '_vulopilot_schema_json' )
                ),
            )
        );
    }
}
