<?php
/**
 * Smtp mailer class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email\Mailers;

use VuloMail\Delivery\Result;
use VuloMail\Email\MailerInterface;
use VuloMail\Email\Message;
use VuloMail\Security\Redactor;

defined( 'ABSPATH' ) || exit;

/**
 * Sends through any SMTP server, using the PHPMailer copy bundled with WordPress.
 */
class Smtp implements MailerInterface {

	/**
	 * Connection settings, secrets decrypted.
	 *
	 * @var array
	 */
	private $config;

	/**
	 * Builds the PHPMailer instance; replaceable so the adapter can be tested without a server.
	 *
	 * @var callable|null
	 */
	private $factory;

	/**
	 * Constructor.
	 *
	 * @param array         $config  Connection settings, secrets decrypted.
	 * @param mixed         $http    Unused (SMTP makes no HTTP requests); kept for the adapter signature.
	 * @param callable|null $factory Returns a PHPMailer instance.
	 */
	public function __construct( array $config, $http = null, $factory = null ) {
		$this->config  = $config;
		$this->factory = $factory;
	}

	/**
	 * Describes the provider and its connection fields.
	 *
	 * @return array
	 */
	public static function definition() {
		return array(
			'label'  => __( 'SMTP', 'vulomail' ),
			'desc'   => __( 'Any SMTP server: your host, Google Workspace, Microsoft 365, Amazon SES, Zoho and others.', 'vulomail' ),
			'fields' => array(
				array(
					'key'      => 'host',
					'label'    => __( 'SMTP host', 'vulomail' ),
					'type'     => 'text',
					'required' => true,
					'help'     => __( 'For example smtp.example.com', 'vulomail' ),
				),
				array(
					'key'     => 'port',
					'label'   => __( 'Port', 'vulomail' ),
					'type'    => 'number',
					'default' => 587,
				),
				array(
					'key'     => 'encryption',
					'label'   => __( 'Encryption', 'vulomail' ),
					'type'    => 'select',
					'default' => 'tls',
					'options' => array(
						array(
							'value' => 'tls',
							'label' => __( 'STARTTLS (port 587)', 'vulomail' ),
						),
						array(
							'value' => 'ssl',
							'label' => __( 'SSL/TLS (port 465)', 'vulomail' ),
						),
						array(
							'value' => 'none',
							'label' => __( 'None (not recommended)', 'vulomail' ),
						),
					),
				),
				array(
					'key'     => 'auth',
					'label'   => __( 'Use authentication', 'vulomail' ),
					'type'    => 'toggle',
					'default' => true,
				),
				array(
					'key'      => 'username',
					'label'    => __( 'Username', 'vulomail' ),
					'type'     => 'text',
					'required' => true,
					'show_if'  => array( 'auth' => true ),
				),
				array(
					'key'      => 'password',
					'label'    => __( 'Password', 'vulomail' ),
					'type'     => 'password',
					'secret'   => true,
					'required' => true,
					'show_if'  => array( 'auth' => true ),
				),
			),
		);
	}

	/**
	 * Sends one message.
	 *
	 * @param Message $message Message to send.
	 * @return Result
	 */
	public function send( Message $message ) {
		try {
			$mailer = $this->factory ? call_user_func( $this->factory ) : self::new_phpmailer();

			self::compose( $mailer, $message );

			$this->apply_transport( $mailer );

			$mailer->send();

			return Result::ok( method_exists( $mailer, 'getLastMessageID' ) ? $mailer->getLastMessageID() : '' );
		} catch ( \Exception $e ) {
			return Result::fail(
				'smtp_error',
				Redactor::scrub( $e->getMessage(), array( (string) ( $this->config['password'] ?? '' ) ) )
			);
		}
	}

	/**
	 * Fills a PHPMailer instance with a message, then lets other plugins adjust it through
	 * `phpmailer_init`. Also used to build the raw email the Gmail API sends.
	 *
	 * @param object  $mailer  PHPMailer instance.
	 * @param Message $message Message.
	 * @return void
	 */
	public static function compose( $mailer, Message $message ) {
		$mailer->CharSet = $message->charset; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- PHPMailer's API.
		$mailer->setFrom( $message->from_email, $message->from_name, false );

		foreach ( $message->to as $address ) {
			$mailer->addAddress( $address['email'], $address['name'] );
		}

		foreach ( $message->cc as $address ) {
			$mailer->addCC( $address['email'], $address['name'] );
		}

		foreach ( $message->bcc as $address ) {
			$mailer->addBCC( $address['email'], $address['name'] );
		}

		foreach ( $message->reply_to as $address ) {
			$mailer->addReplyTo( $address['email'], $address['name'] );
		}

		$mailer->Subject = $message->subject; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
		$mailer->Body    = $message->body; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
		$mailer->isHTML( $message->is_html() );
		$mailer->ContentType = $message->content_type; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase

		foreach ( $message->headers as $name => $value ) {
			$mailer->addCustomHeader( $name, $value );
		}

		foreach ( $message->attachments as $name => $path ) {
			$mailer->addAttachment( $path, $name );
		}

		// Other plugins adjust content here (WooCommerce adds the plain-text part of a multipart
		// email, for example). The transport is applied afterwards so none of them can redirect
		// the message to a different server.
		do_action_ref_array( 'phpmailer_init', array( &$mailer ) ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core hook, fired for parity with wp_mail().
	}

	/**
	 * Applies the connection's transport settings to a PHPMailer instance.
	 *
	 * @param object $mailer PHPMailer instance.
	 * @return void
	 */
	private function apply_transport( $mailer ) {
		$encryption = (string) ( $this->config['encryption'] ?? 'tls' );
		$use_auth   = ! empty( $this->config['auth'] );

		// phpcs:disable WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- PHPMailer's API.
		$mailer->isSMTP();
		$mailer->Host        = (string) ( $this->config['host'] ?? '' );
		$mailer->Port        = (int) ( $this->config['port'] ?? 587 );
		$mailer->SMTPSecure  = in_array( $encryption, array( 'tls', 'ssl' ), true ) ? $encryption : '';
		$mailer->SMTPAutoTLS = 'none' !== $encryption;
		$mailer->SMTPAuth    = $use_auth;
		$mailer->Username    = $use_auth ? (string) ( $this->config['username'] ?? '' ) : '';
		$mailer->Password    = $use_auth ? (string) ( $this->config['password'] ?? '' ) : '';
		$mailer->Timeout     = (int) apply_filters( 'vulomail_smtp_timeout', 15 );
		$mailer->SMTPDebug   = 0;
		// phpcs:enable
	}

	/**
	 * Builds a fresh PHPMailer instance.
	 *
	 * @return \PHPMailer\PHPMailer\PHPMailer
	 */
	public static function new_phpmailer() {
		if ( ! class_exists( '\PHPMailer\PHPMailer\PHPMailer', false ) ) {
			require_once ABSPATH . WPINC . '/PHPMailer/PHPMailer.php';
			require_once ABSPATH . WPINC . '/PHPMailer/SMTP.php';
			require_once ABSPATH . WPINC . '/PHPMailer/Exception.php';
		}

		// `true`: throw on failure, so send() has one error path.
		return new \PHPMailer\PHPMailer\PHPMailer( true );
	}
}
