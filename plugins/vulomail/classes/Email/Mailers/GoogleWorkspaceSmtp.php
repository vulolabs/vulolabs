<?php
/**
 * GoogleWorkspaceSmtp mailer class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email\Mailers;

defined( 'ABSPATH' ) || exit;

/**
 * Google Workspace over SMTP - runs on the same servers as Gmail, so this is GmailSmtp under its own label/connection name.
 */
class GoogleWorkspaceSmtp extends GmailSmtp {

	/**
	 * Describes the provider and its connection fields.
	 *
	 * @return array
	 */
	public static function definition() {
		$definition          = parent::definition();
		$definition['label'] = __( 'Google Workspace', 'vulomail' );

		return $definition;
	}
}
