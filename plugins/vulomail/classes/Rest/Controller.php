<?php
/**
 * Base REST controller file.
 *
 * @package VuloMail
 */

namespace VuloMail\Rest;

use VuloMail\Email\WpMailInterceptor;
use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Shared permission check: every route is admin-only. Core's REST cookie auth already verifies the `wp_rest` nonce, so a logged-in admin's browser can't be tricked into calling these routes cross-site.
 */
abstract class Controller extends \WP_REST_Controller {

	/**
	 * Checks that the current user may manage VuloMail.
	 *
	 * @return bool|\WP_Error
	 */
	public function check_permission() {
		if ( ! current_user_can( Utill::CAPABILITY ) ) {
			return new \WP_Error( 'rest_forbidden', __( 'You are not allowed to manage VuloMail.', 'vulomail' ), array( 'status' => rest_authorization_required_code() ) );
		}

		return true;
	}

	/**
	 * Marks each failed attempt worth advice with `is_cause`. A later WordPress-mailer failure just means the server itself can't send; the connection's error is the one to fix.
	 *
	 * @param array $attempts Attempts in order, as Result::to_array() stores them.
	 * @return array
	 */
	protected static function with_causes( array $attempts ) {
		foreach ( $attempts as $index => $attempt ) {
			$attempts[ $index ]['is_cause'] = empty( $attempt['success'] )
				&& ! ( $index > 0 && WpMailInterceptor::DEFAULT_PROVIDER === ( $attempt['provider'] ?? '' ) );
		}

		return $attempts;
	}
}
