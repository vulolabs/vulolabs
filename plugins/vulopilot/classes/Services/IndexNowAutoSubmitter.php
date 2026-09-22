<?php
/**
 * IndexNowAutoSubmitter class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Repositories\IndexNowLogRepository;
use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Scanning → Instant Indexing tab's "Auto-submit post types" setting — real
 * automatic IndexNow submission on publish/update (`save_post`) and on
 * trash (`wp_trash_post`, hooked before the post's slug/status actually
 * changes, so the real, still-live permalink is what gets submitted — a
 * removed/trashed URL is itself a legitimate, real IndexNow use case: it
 * prompts participating engines to re-crawl and discover the 404/410,
 * rather than continuing to serve a stale cached result).
 *
 * Every submission (success or failure) is logged to
 * the shared activity log (`indexnow.submitted`) via IndexNowLogRepository with
 * `trigger_type = 'auto'`, same table the manual "Submit URLs" button's
 * own submissions land in — the mockup's own History card is described as
 * "the last 100 IndexNow API requests," not "manual requests only."
 *
 * Self-registers its own hooks in the constructor (php-wordpress.md) and
 * is constructed unconditionally in VuloPilot::init_classes() — both hooks
 * read `indexnow_post_types`/`indexnow_api_key` before doing anything, same
 * "settings gate the callback's own behavior, not construction" shape
 * every other Services\* class in this plugin already uses.
 *
 * @class       IndexNowAutoSubmitter class
 * @version     1.0.0
 * @author      VuloLabs
 */
class IndexNowAutoSubmitter {

    /**
     * IndexNowAutoSubmitter constructor.
     */
    public function __construct() {
        add_action( 'save_post', array( $this, 'maybe_submit_on_save' ), 20, 2 );
        add_action( 'wp_trash_post', array( $this, 'maybe_submit_on_trash' ) );
    }

    /**
     * @param int      $post_id Post being saved.
     * @param \WP_Post $post    The post object.
     * @return void
     */
    public function maybe_submit_on_save( $post_id, $post ): void {
        if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
            return;
        }

        if ( 'publish' !== $post->post_status ) {
            return;
        }

        $this->maybe_submit( $post );
    }

    /**
     * @param int $post_id Post being trashed.
     * @return void
     */
    public function maybe_submit_on_trash( $post_id ): void {
        $post = get_post( $post_id );

        if ( $post ) {
            $this->maybe_submit( $post );
        }
    }

    /**
     * @param \WP_Post $post Post to submit, if its type is configured for auto-submit.
     * @return void
     */
    private function maybe_submit( \WP_Post $post ): void {
        $settings   = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );
        $post_types = (array) ( $settings['indexnow_post_types'] ?? array() );
        $api_key    = (string) ( $settings['indexnow_api_key'] ?? '' );

        if ( '' === $api_key || ! in_array( $post->post_type, $post_types, true ) ) {
            return;
        }

        $permalink = get_permalink( $post );

        if ( ! $permalink ) {
            return;
        }

        $result = ( new IndexNowClient( $api_key ) )->submit( array( $permalink ) );

        ( new IndexNowLogRepository() )->log( $permalink, $result['status_code'], $result['status'], 'auto' );
    }
}
