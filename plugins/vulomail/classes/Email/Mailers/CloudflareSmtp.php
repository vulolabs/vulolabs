<?php
/**
 * CloudflareSmtp mailer class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email\Mailers;

defined( 'ABSPATH' ) || exit;

/**
 * Cloudflare Email Sending over SMTP. Relay auth is fixed: username "api_token", password the API token - only the token is asked for.
 */
class CloudflareSmtp extends Smtp {

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
					'host'       => 'smtp.mx.cloudflare.net',
					'port'       => 465,
					'encryption' => 'ssl',
					'auth'       => true,
					'username'   => 'api_token',
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
			'label'  => __( 'Cloudflare Email Sending', 'vulomail' ),
			'desc'   => __( 'Sends through Cloudflare\'s Email Sending SMTP relay. Your sending domain must already be onboarded for Email Sending on the account that owns the token.', 'vulomail' ),
			'fields' => array(
				array(
					'key'      => 'password',
					'label'    => __( 'API token', 'vulomail' ),
					'type'     => 'password',
					'secret'   => true,
					'required' => true,
					'help'     => __( '<a href="https://dash.cloudflare.com/" target="_blank" rel="noopener noreferrer">Open the Cloudflare dashboard</a>, under Email → Email Routing → Email Sending.', 'vulomail' ),
				),
			),
		);
	}
}
