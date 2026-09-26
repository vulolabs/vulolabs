<?php
namespace VuloPilot\Content;


defined( 'ABSPATH' ) || exit;

/**
 * Discovers and registers every Gutenberg block VuloPilot ships -
 * `tools/webpack/create-config.js` builds each `src/blocks/{name}/` folder
 * into `assets/js/block/{name}/` (block.json + render.php, if present,
 * copied alongside the built JS via `CopyWebpackPlugin`), and this class
 * `glob()`s that BUILT directory at runtime rather than hardcoding a block
 * list, so a new block folder under `src/blocks/` is picked up
 * automatically after a build with no PHP change needed here - same
 * pattern as the sibling free plugin vulocart's own `VuloCart\Block` class,
 * ported here since vulopilot had no block infrastructure at all before
 * `vulopilot/table-of-contents` and `vulopilot/faq`.
 *
 * @class       BlockRegistrar class
 * @version     1.0.0
 * @author      VuloLabs
 */
class BlockRegistrar {

    /**
     * Discovered blocks, cached for the lifetime of one request.
     *
     * @var array<int, array{name: string, path: string}>|null
     */
    private $blocks;

    /**
     * BlockRegistrar constructor.
     */
    public function __construct() {
        add_action( 'init', array( $this, 'register_blocks' ) );
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_styles' ) );
        add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue_editor_styles' ) );
    }

    /**
     * Scans `assets/js/block/` for built block folders containing a `block.json`.
     *
     * @return array<int, array{name: string, path: string}>
     */
    private function get_blocks(): array {
        if ( null !== $this->blocks ) {
            return $this->blocks;
        }

        $this->blocks = array();

        $block_base_path = VuloPilot()->plugin_path . 'assets/js/block/';

        if ( ! is_dir( $block_base_path ) ) {
            return $this->blocks;
        }

        $folders = glob( $block_base_path . '*', GLOB_ONLYDIR );

        foreach ( $folders as $folder ) {
            if ( file_exists( $folder . '/block.json' ) ) {
                $this->blocks[] = array(
                    'name' => basename( $folder ),
                    'path' => $folder,
                );
            }
        }

        return $this->blocks;
    }

    /**
     * Registers every discovered block. Passing a directory path (rather
     * than a bare block name) lets `register_block_type()` read that
     * block's own `block.json` and auto-wire its `render` callback file if
     * one is declared - no custom render-dispatch glue needed here.
     *
     * @return void
     */
    public function register_blocks(): void {
        foreach ( $this->get_blocks() as $block ) {
            register_block_type( $block['path'] );
        }
    }

    /**
     * @return void
     */
    public function enqueue_frontend_styles(): void {
        if ( ! has_block( 'vulopilot/table-of-contents' ) && ! has_block( 'vulopilot/faq' ) ) {
            return;
        }

        $this->enqueue_blocks_stylesheet( 'vulopilot-blocks' );
    }

    /**
     * Unconditional in the editor - the block inserter needs the same
     * `.vulopilot-toc`/`.vulopilot-faq` rules to preview correctly
     * regardless of whether either block has been inserted into THIS
     * particular post yet.
     *
     * @return void
     */
    public function enqueue_editor_styles(): void {
        $this->enqueue_blocks_stylesheet( 'vulopilot-blocks-editor' );
    }

    /**
     * Enqueues the blocks' compiled CSS, when it exists.
     *
     * @param string $handle Real registered handle for this enqueue call.
     * @return void
     */
    private function enqueue_blocks_stylesheet( string $handle ): void {
        $style_path = VuloPilot()->plugin_path . 'assets/styles/public/vulopilot-blocks.min.css';

        if ( ! file_exists( $style_path ) ) {
            return;
        }

        wp_enqueue_style(
            $handle,
            VuloPilot()->plugin_url . 'assets/styles/public/vulopilot-blocks.min.css',
            array(),
            VuloPilot()->version
        );
    }
}
