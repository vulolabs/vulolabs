<?php
/**
 * GmailSmtp mailer class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email\Mailers;

defined( 'ABSPATH' ) || exit;

/**
 * Gmail over SMTP, with the host, port and encryption fixed to Google's own - only the address and
 * an app password are asked for. Needs 2-Step Verification switched on and an app password generated
 * at myaccount.google.com/apppasswords; the normal account password will not authenticate here.
 *
 * GoogleWorkspaceSmtp extends this with the same host and fields under its own, separate provider
 * entry, since Gmail and Google Workspace are listed as two distinct options. The Gmail provider
 * itself (Gmail) hands its app-password connections to this class.
 */
class GmailSmtp extends Smtp {

	/**
	 * Constructor.
	 *
	 * @param array         $config  Connection settings, secrets decrypted.
	 * @param mixed         $http    Unused (SMTP makes no HTTP requests); kept for the adapter signature.
	 * @param callable|null $factory Returns a PHPMailer instance.
	 */
	public function __construct( array $config, $http = null, $factory = null ) {
		parent::__construct(
			array_merge(
				$config,
				array(
					'host'       => 'smtp.gmail.com',
					'port'       => 587,
					'encryption' => 'tls',
					'auth'       => true,
				)
			),
			$http,
			$factory
		);
	}

	/**
	 * Describes the provider and its connection fields.
	 *
	 * @return array
	 */
	public static function definition() {
		return array(
			'label'  => __( 'Gmail', 'vulomail' ),
			'desc'   => __( 'Sends through Google\'s SMTP server using an app password.', 'vulomail' ),
			'fields' => array(
				array(
					'key'      => 'username',
					'label'    => __( 'Gmail address', 'vulomail' ),
					'type'     => 'text',
					'required' => true,
				),
				array(
					'key'      => 'password',
					'label'    => __( 'App password', 'vulomail' ),
					'type'     => 'password',
					'secret'   => true,
					'required' => true,
					'help'     => __( 'Needs 2-Step Verification switched on; your normal password will not work here. <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">Create an app password</a>.', 'vulomail' ),
				),
			),
		);
	}
}
