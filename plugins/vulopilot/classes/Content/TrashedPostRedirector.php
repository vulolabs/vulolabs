<?php
/**
 * TrashedPostRedirector class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Content;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot can't know what a deleted page's visitors should be sent to instead - a guessed
 * target (e.g. the home page) is often wrong and would silently mask a real 404 as success. So
 * instead of auto-creating a redirect, this shows a one-time, per-post admin notice the moment a
 * post/page is trashed, pointing the admin at the Redirects tab to add one themselves if the old
 * URL is worth protecting.
 *
 * Gated on the same `enable_redirect_manager` setting as RedirectManager's own slug-change
 * auto-redirect, since the notice's "Add a redirect" link leads to that same feature.
 *
 * @class       TrashedPostRedirector class
 * @version     2.0.0
 * @author      VuloLabs
 */
class TrashedPostRedirector {

	/**
	 * Option holding pending "add a redirect?" notices, keyed by post id.
	 *
	 * @var string
	 */
	private const NOTICES_OPTION = 'vulopilot_trash_redirect_notices';

	/**
	 * TrashedPostRedirector constructor.
	 */
	public function __construct() {
		add_action( 'wp_trash_post', array( $this, 'maybe_queue_notice' ) );
		add_action( 'admin_notices', array( $this, 'render_notices' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_dismiss_script' ) );
		add_action( 'wp_ajax_vulopilot_dismiss_trash_notice', array( $this, 'ajax_dismiss_notice' ) );
	}

	/**
	 * Queues a one-time notice for the just-trashed post, if it had a real, previously-public URL
	 * worth offering a redirect for.
	 *
	 * @param int $post_id Post id being trashed.
	 * @return void
	 */
	public function maybe_queue_notice( int $post_id ): void {
		$settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

		if ( empty( $settings['enable_redirect_manager'] ) ) {
			return;
		}

		$post = get_post( $post_id );

		if ( ! $post || 'publish' !== $post->post_status || ! is_post_type_viewable( $post->post_type ) ) {
			return;
		}

		$source_path = RedirectRepository::normalize_path( (string) wp_parse_url( get_permalink( $post ), PHP_URL_PATH ) );

		if ( '' === $source_path || '/' === $source_path ) {
			return;
		}

		$notices             = get_option( self::NOTICES_OPTION, array() );
		$notices             = is_array( $notices ) ? $notices : array();
		$notices[ $post_id ] = array(
			'title'       => get_the_title( $post ),
			'source_path' => $source_path,
		);
		update_option( self::NOTICES_OPTION, $notices, false );
	}

	/**
	 * Renders one dismissible notice per pending entry, each linking straight to the Redirects
	 * tab so the admin can add one for that exact URL if they want to. Dismissal is persisted via
	 * AJAX (`ajax_dismiss_notice()`), so once removed, the notice never comes back for that post.
	 *
	 * @return void
	 */
	public function render_notices(): void {
		if ( ! current_user_can( 'edit_posts' ) ) {
			return;
		}

		$notices = get_option( self::NOTICES_OPTION, array() );

		if ( empty( $notices ) || ! is_array( $notices ) ) {
			return;
		}

		$redirects_url = admin_url( 'admin.php?page=vulopilot#&tab=seo-visibility&subtab=redirects' );

		foreach ( $notices as $post_id => $notice ) {
			printf(
				'<div class="notice notice-warning is-dismissible vulopilot-trash-redirect-notice" data-post-id="%1$d"><p>%2$s</p></div>',
				(int) $post_id,
				wp_kses_post(
					sprintf(
						/* translators: 1: deleted page/post title, 2: its old URL path, 3: Redirects tab URL. */
						__( '<strong>%1$s</strong> has been deleted. VuloPilot doesn\'t redirect it automatically - if %2$s is still linked to elsewhere or indexed by search engines, you can <a href="%3$s">add a redirect for it</a>.', 'vulopilot' ),
						esc_html( (string) $notice['title'] ),
						'<code>' . esc_html( (string) $notice['source_path'] ) . '</code>',
						esc_url( $redirects_url )
					)
				)
			);
		}
	}

	/**
	 * Listens for WordPress core's own dismiss click on `.vulopilot-trash-redirect-notice` and
	 * reports it back so the notice can be removed from storage - otherwise core only hides it in
	 * the current page's DOM, and it would reappear on the next page load.
	 *
	 * @return void
	 */
	public function enqueue_dismiss_script(): void {
		$notices = get_option( self::NOTICES_OPTION, array() );

		if ( empty( $notices ) ) {
			return;
		}

		wp_add_inline_script(
			'common',
			'jQuery(document).on("click", ".vulopilot-trash-redirect-notice .notice-dismiss", function () {' .
			'var postId = jQuery(this).closest(".vulopilot-trash-redirect-notice").data("post-id");' .
			'jQuery.post(ajaxurl, { action: "vulopilot_dismiss_trash_notice", post_id: postId, nonce: "' . esc_js( wp_create_nonce( 'vulopilot_dismiss_trash_notice' ) ) . '" });' .
			'});'
		);
	}

	/**
	 * AJAX handler - removes one post's entry from the pending-notices option for good.
	 *
	 * @return void
	 */
	public function ajax_dismiss_notice(): void {
		check_ajax_referer( 'vulopilot_dismiss_trash_notice', 'nonce' );

		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( null, 403 );
		}

		$post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified above via check_ajax_referer().

		$notices = get_option( self::NOTICES_OPTION, array() );

		if ( is_array( $notices ) && isset( $notices[ $post_id ] ) ) {
			unset( $notices[ $post_id ] );
			update_option( self::NOTICES_OPTION, $notices, false );
		}

		wp_send_json_success();
	}
}
