<?php
/**
 * SparkPost mailer class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email\Mailers;

use VuloMail\Delivery\Result;
use VuloMail\Email\AbstractApiMailer;
use VuloMail\Email\Message;

defined( 'ABSPATH' ) || exit;

/**
 * SparkPost Transmissions API.
 */
class SparkPost extends AbstractApiMailer {

	const ENDPOINTS = array(
		'us' => 'https://api.sparkpost.com/api/v1/transmissions',
		'eu' => 'https://api.eu.sparkpost.com/api/v1/transmissions',
	);

	/**
	 * Describes the provider and its connection fields.
	 *
	 * @return array
	 */
	public static function definition() {
		return array(
			'label'  => __( 'SparkPost', 'vulomail' ),
			'desc'   => __( 'SparkPost transactional email API.', 'vulomail' ),
			'fields' => array(
				array(
					'key'      => 'api_key',
					'label'    => __( 'API key', 'vulomail' ),
					'type'     => 'password',
					'secret'   => true,
					'required' => true,
					'help'     => __( 'Shown only once when created. <a href="https://app.sparkpost.com/account/api-keys" target="_blank" rel="noopener noreferrer">Create one in SparkPost</a>.', 'vulomail' ),
				),
				array(
					'key'     => 'region',
					'label'   => __( 'Region', 'vulomail' ),
					'type'    => 'select',
					'default' => 'us',
					'options' => array(
						array(
							'value' => 'us',
							'label' => __( 'US', 'vulomail' ),
						),
						array(
							'value' => 'eu',
							'label' => __( 'EU', 'vulomail' ),
						),
					),
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
		$files = $this->read_attachments( $message );

		if ( is_wp_error( $files ) ) {
			return Result::fail( $files->get_error_code(), $files->get_error_message() );
		}

		$map = static function ( array $addresses ) {
			return array_map(
				static function ( $address ) {
					return array(
						'address' => array_filter(
							array(
								'email' => $address['email'],
								'name'  => $address['name'],
							)
						),
					);
				},
				$addresses
			);
		};

		$content = array(
			'subject' => $message->subject,
			'from'    => array_filter(
				array(
					'email' => $message->from_email,
					'name'  => $message->from_name,
				)
			),
		);

		if ( $message->is_html() ) {
			$content['html'] = $message->body;
		} else {
			$content['text'] = $message->body;
		}

		if ( $message->reply_to ) {
			$content['reply_to'] = $message->reply_to[0]['email'];
		}

		if ( $message->headers ) {
			$content['headers'] = $message->headers;
		}

		foreach ( $files as $file ) {
			$content['attachments'][] = array(
				'name' => $file['name'],
				'type' => $file['type'],
				'data' => base64_encode( $file['content'] ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- required attachment encoding.
			);
		}

		$recipients = $map( $message->to );

		// SparkPost has no separate Cc/Bcc: added to content's headers and sent as extra recipients that don't appear in the To header.
		if ( $message->cc ) {
			$content['headers']['CC'] = implode( ', ', array_map( array( Message::class, 'format' ), $message->cc ) );
			$recipients               = array_merge( $recipients, $map( $message->cc ) );
		}

		if ( $message->bcc ) {
			$recipients = array_merge( $recipients, $map( $message->bcc ) );
		}

		$region   = in_array( $this->config( 'region' ), array( 'us', 'eu' ), true ) ? $this->config( 'region' ) : 'us';
		$response = $this->http->post(
			self::ENDPOINTS[ $region ],
			array(
				'Authorization' => $this->config( 'api_key' ),
				'Content-Type'  => 'application/json',
			),
			wp_json_encode(
				array(
					'content'    => $content,
					'recipients' => $recipients,
				)
			)
		);

		if ( is_wp_error( $response ) || $response['code'] >= 300 ) {
			$detail = is_wp_error( $response ) ? '' : (string) ( $response['json']['errors'][0]['message'] ?? '' );

			return $this->failure( $response, $detail );
		}

		return Result::ok( (string) ( $response['json']['results']['id'] ?? '' ) );
	}
}
