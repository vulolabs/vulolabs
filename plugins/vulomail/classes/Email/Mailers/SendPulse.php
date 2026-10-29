<?php
/**
 * SendPulse mailer class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email\Mailers;

use VuloMail\Delivery\Result;
use VuloMail\Email\AbstractApiMailer;
use VuloMail\Email\Message;

defined( 'ABSPATH' ) || exit;

/**
 * SendPulse SMTP API. Authenticates via OAuth2 client credentials exchanged for a short-lived token before every send - no long-lived API key exists for this endpoint.
 */
class SendPulse extends AbstractApiMailer {

	const TOKEN_ENDPOINT = 'https://api.sendpulse.com/oauth/access_token';
	const SEND_ENDPOINT  = 'https://api.sendpulse.com/smtp/emails';

	/**
	 * Describes the provider and its connection fields.
	 *
	 * @return array
	 */
	public static function definition() {
		return array(
			'label'  => __( 'SendPulse', 'vulomail' ),
			'desc'   => __( 'SendPulse SMTP API.', 'vulomail' ),
			'fields' => array(
				array(
					'key'      => 'client_id',
					'label'    => __( 'Client ID', 'vulomail' ),
					'type'     => 'text',
					'required' => true,
					'help'     => __( 'From Account → API, under Client credentials. <a href="https://login.sendpulse.com/settings/#api" target="_blank" rel="noopener noreferrer">Open it in SendPulse</a>.', 'vulomail' ),
				),
				array(
					'key'      => 'client_secret',
					'label'    => __( 'Client secret', 'vulomail' ),
					'type'     => 'password',
					'secret'   => true,
					'required' => true,
				),
			),
		);
	}

	/**
	 * Exchanges the client credentials for a bearer token.
	 *
	 * @return string|\WP_Error
	 */
	private function token() {
		$response = $this->http->post(
			self::TOKEN_ENDPOINT,
			array( 'Content-Type' => 'application/json' ),
			wp_json_encode(
				array(
					'grant_type'    => 'client_credentials',
					'client_id'     => $this->config( 'client_id' ),
					'client_secret' => $this->config( 'client_secret' ),
				)
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		if ( 200 !== $response['code'] || empty( $response['json']['access_token'] ) ) {
			return new \WP_Error( 'vulomail_sendpulse_auth', __( 'Could not authenticate with SendPulse.', 'vulomail' ) );
		}

		return (string) $response['json']['access_token'];
	}

	/**
	 * Sends one message.
	 *
	 * @param Message $message Message to send.
	 * @return Result
	 */
	public function send( Message $message ) {
		$files = $this->read_attachments( $message );

		if ( is_wp_error( $files ) ) {
			return Result::fail( $files->get_error_code(), $files->get_error_message() );
		}

		$token = $this->token();

		if ( is_wp_error( $token ) ) {
			return Result::fail( $token->get_error_code(), $token->get_error_message() );
		}

		$map = static function ( array $addresses ) {
			return array_map(
				static function ( $address ) {
					return array_filter(
						array(
							'email' => $address['email'],
							'name'  => $address['name'],
						)
					);
				},
				$addresses
			);
		};

		$email = array(
			'subject' => $message->subject,
			'from'    => array_filter(
				array(
					'email' => $message->from_email,
					'name'  => $message->from_name,
				)
			),
			'to'      => $map( $message->to ),
		);

		if ( $message->is_html() ) {
			$email['html'] = base64_encode( $message->body ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- required by the API, not obfuscation.
		} else {
			$email['text'] = $message->body;
		}

		if ( $message->cc ) {
			$email['cc'] = $map( $message->cc );
		}

		if ( $message->bcc ) {
			$email['bcc'] = $map( $message->bcc );
		}

		if ( $message->reply_to ) {
			$email['headers']['Reply-To'] = $message->reply_to[0]['email'];
		}

		foreach ( $message->headers as $name => $value ) {
			$email['headers'][ $name ] = $value;
		}

		foreach ( $files as $file ) {
			$email['attachments'][ $file['name'] ] = base64_encode( $file['content'] ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- required attachment encoding.
		}

		$response = $this->http->post(
			self::SEND_ENDPOINT,
			array(
				'Authorization' => 'Bearer ' . $token,
				'Content-Type'  => 'application/json',
			),
			wp_json_encode( array( 'email' => $email ) )
		);

		if ( is_wp_error( $response ) || 200 !== $response['code'] ) {
			$detail = is_wp_error( $response ) ? '' : (string) ( $response['json']['message'] ?? '' );

			return $this->failure( $response, $detail );
		}

		return Result::ok( (string) ( $response['json']['id'] ?? '' ) );
	}
}
