<?php
/**
 * AmazonSesSmtp mailer class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email\Mailers;

defined( 'ABSPATH' ) || exit;

/**
 * Amazon SES over SMTP. Needs SES's own SMTP username/password ("SMTP settings" → "Create SMTP credentials"), not the AWS Access/Secret Key pair.
 */
class AmazonSesSmtp extends Smtp {

	/**
	 * Constructor.
	 *
	 * @param array         $config  Connection settings, secrets decrypted.
	 * @param mixed         $http    Unused (SMTP makes no HTTP requests); kept for the adapter signature.
	 * @param callable|null $factory Returns a PHPMailer instance.
	 */
	public function __construct( array $config, $http = null, $factory = null ) {
		$region = preg_match( '/^[a-z0-9-]+$/', (string) ( $config['region'] ?? '' ) ) ? $config['region'] : 'us-east-1';

		parent::__construct(
			array_merge(
				$config,
				array(
					'host'       => "email-smtp.{$region}.amazonaws.com",
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
			'label'  => __( 'Amazon SES', 'vulomail' ),
			'desc'   => __( 'Sends through Amazon SES\'s SMTP interface.', 'vulomail' ),
			'fields' => array(
				array(
					'key'      => 'region',
					'label'    => __( 'AWS region', 'vulomail' ),
					'type'     => 'text',
					'default'  => 'us-east-1',
					'required' => true,
					'help'     => __( 'For example us-east-1 or eu-west-1 - must match the region SES is verified in.', 'vulomail' ),
				),
				array(
					'key'      => 'username',
					'label'    => __( 'SMTP username', 'vulomail' ),
					'type'     => 'text',
					'required' => true,
					'help'     => __( 'Not your AWS access key. <a href="https://console.aws.amazon.com/ses/home#/smtp" target="_blank" rel="noopener noreferrer">Create SMTP credentials</a> in the SES console.', 'vulomail' ),
				),
				array(
					'key'      => 'password',
					'label'    => __( 'SMTP password', 'vulomail' ),
					'type'     => 'password',
					'secret'   => true,
					'required' => true,
				),
			),
		);
	}
}
