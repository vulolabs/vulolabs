<?php
/**
 * Gmail mailer class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email\Mailers;

use VuloMail\Connections\GoogleOAuth;
use VuloMail\Delivery\Result;
use VuloMail\Email\AbstractApiMailer;
use VuloMail\Email\Message;
use VuloMail\Security\Redactor;

defined( 'ABSPATH' ) || exit;

/**
 * Gmail, with a choice of sign-in method: "Sign in with Google" (`oneclick`/`own`) sends through the
 * Gmail API as a raw RFC 822 message built by PHPMailer (so `phpmailer_init` still applies); `app_password`
 * hands off to GmailSmtp. Either way Gmail sends from the signed-in account or a verified "Send mail as" address.
 */
class Gmail extends AbstractApiMailer {

	/**
	 * Sign-in method that uses an app password over SMTP instead of signing in with Google.
	 */
	const MODE_APP_PASSWORD = 'app_password';

	/**
	 * Gmail API send endpoint, media upload form.
	 */
	const SEND_URL = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media';

	/**
	 * Describes the provider and its connection fields. `oauth` shows the "Sign in with Google" control;
	 * `hidden` fields are filled by that sign-in, never typed; `advanced` ones sit in its collapsed section.
	 *
	 * @return array
	 */
	public static function definition() {
		$one_click = GoogleOAuth::one_click_available();
		$google    = array( GoogleOAuth::MODE_ONE_CLICK, GoogleOAuth::MODE_OWN );

		// Shown as cards, "Sign in with Google" first; until VuloLabs' connect service is set up, that card signs in through the owner's own Google app.
		$sign_in = array(
			'value' => $one_click ? GoogleOAuth::MODE_ONE_CLICK : GoogleOAuth::MODE_OWN,
			'label' => __( 'Sign in with Google', 'vulomail' ),
			'desc'  => $one_click
				? __( 'Connect your Google account in one click. No password is stored.', 'vulomail' )
				: __( 'Connect your Google account. No password is stored; needs a one-time Google Cloud setup, shown step by step.', 'vulomail' ),
			'icon'  => 'link',
		);

		// Recommended only while it is also the quickest way in.
		if ( $one_click ) {
			$sign_in['badgeText']  = __( 'Recommended', 'vulomail' );
			$sign_in['badgeColor'] = 'green';
		}

		$modes = array(
			$sign_in,
			array(
				'value' => self::MODE_APP_PASSWORD,
				'label' => __( 'App password', 'vulomail' ),
				'desc'  => __( 'Your Gmail address and a 16-character app password from your Google account.', 'vulomail' ),
				'icon'  => 'lock',
			),
		);

		if ( $one_click ) {
			$modes[] = array(
				'value' => GoogleOAuth::MODE_OWN,
				'label' => __( 'My own Google app', 'vulomail' ),
				'desc'  => __( 'Sign in with Google through a Google Cloud app you manage. For advanced setups.', 'vulomail' ),
				'icon'  => 'setting',
			);
		}

		return array(
			'label'  => __( 'Gmail', 'vulomail' ),
			'desc'   => __( 'Send from your Gmail address, by signing in with Google or with an app password.', 'vulomail' ),
			'oauth'  => 'google',
			'fields' => array(
				array(
					'key'     => 'auth_mode',
					'label'   => __( 'How do you want to connect?', 'vulomail' ),
					'type'    => 'select',
					'display' => 'cards',
					// Without one-click, an app password is the quicker setup for most people.
					'default' => $one_click ? GoogleOAuth::MODE_ONE_CLICK : self::MODE_APP_PASSWORD,
					'options' => $modes,
				),
				array(
					'key'      => 'username',
					'label'    => __( 'Gmail address', 'vulomail' ),
					'type'     => 'text',
					'required' => true,
					'show_if'  => array( 'auth_mode' => self::MODE_APP_PASSWORD ),
				),
				array(
					'key'      => 'password',
					'label'    => __( 'App password', 'vulomail' ),
					'type'     => 'password',
					'secret'   => true,
					'required' => true,
					'show_if'  => array( 'auth_mode' => self::MODE_APP_PASSWORD ),
					'help'     => __( 'Needs 2-Step Verification switched on; your normal password will not work here. <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">Create an app password</a>.', 'vulomail' ),
				),
				array(
					'key'      => 'client_id',
					'label'    => __( 'Client ID', 'vulomail' ),
					'type'     => 'text',
					'required' => true,
					'advanced' => true,
					'show_if'  => array( 'auth_mode' => GoogleOAuth::MODE_OWN ),
					'help'     => __( 'From your Google Cloud OAuth client (type "Web application"). <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Open Google Cloud credentials</a>', 'vulomail' ),
				),
				array(
					'key'      => 'client_secret',
					'label'    => __( 'Client Secret', 'vulomail' ),
					'type'     => 'password',
					'secret'   => true,
					'required' => true,
					'advanced' => true,
					'show_if'  => array( 'auth_mode' => GoogleOAuth::MODE_OWN ),
				),
				array(
					'key'     => 'account_email',
					'label'   => __( 'Google account', 'vulomail' ),
					'type'    => 'text',
					'hidden'  => true,
					'show_if' => array( 'auth_mode' => $google ),
				),
				array(
					'key'      => 'refresh_token',
					'label'    => __( 'Google sign-in', 'vulomail' ),
					'type'     => 'password',
					'secret'   => true,
					'hidden'   => true,
					'required' => true,
					'show_if'  => array( 'auth_mode' => $google ),
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
		// A connection saved before sign-in methods existed is an app-password one.
		if ( self::MODE_APP_PASSWORD === ( $this->config['auth_mode'] ?? self::MODE_APP_PASSWORD ) ) {
			return ( new GmailSmtp( $this->config ) )->send( $message );
		}

		$token = GoogleOAuth::access_token( $this->config, $this->http );

		if ( is_wp_error( $token ) ) {
			return Result::fail( $token->get_error_code(), $token->get_error_message() );
		}

		try {
			$mailer = Smtp::new_phpmailer();

			Smtp::compose( $mailer, $message );

			// Built, never sent from here; sendmail flavour keeps To/Subject/Bcc headers, which the Gmail API reads recipients from (it strips Bcc itself).
			$mailer->Mailer = 'sendmail'; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- PHPMailer's API.
			$mailer->preSend();

			$raw = $mailer->getSentMIMEMessage();
		} catch ( \Exception $e ) {
			return Result::fail( 'message_error', Redactor::scrub( $e->getMessage(), $this->secrets() ) );
		}

		$response = $this->http->post(
			self::SEND_URL,
			array(
				'Authorization' => 'Bearer ' . $token,
				'Content-Type'  => 'message/rfc822',
			),
			$raw
		);

		if ( is_wp_error( $response ) ) {
			return $this->failure( $response );
		}

		if ( 200 === $response['code'] && ! empty( $response['json']['id'] ) ) {
			return Result::ok( (string) $response['json']['id'] );
		}

		if ( 401 === $response['code'] ) {
			// The cached token was revoked early; the next send fetches a fresh one.
			GoogleOAuth::forget_token( $this->config );
		}

		return $this->failure( $response, (string) ( $response['json']['error']['message'] ?? '' ) );
	}
}
