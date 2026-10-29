<?php
/**
 * Tools REST controller file.
 *
 * @package VuloMail
 */

namespace VuloMail\Rest;

use VuloMail\Email\MessageFactory;
use VuloMail\Sms\PhoneNumber;
use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * REST controller for vulomail/v1/tools - test sends and diagnostics.
 */
class Tools extends Controller {

	/**
	 * REST base for this controller.
	 *
	 * @var string
	 */
	protected $rest_base = 'tools';

	/**
	 * Registers this controller's routes.
	 *
	 * @return void
	 */
	public function register_routes() {
		$routes = array(
			'test-email'  => array( \WP_REST_Server::CREATABLE, 'test_email' ),
			'test-sms'    => array( \WP_REST_Server::CREATABLE, 'test_sms' ),
			'diagnostics' => array( \WP_REST_Server::READABLE, 'diagnostics' ),
		);

		foreach ( $routes as $path => $route ) {
			register_rest_route(
				VuloMail()->rest_namespace,
				'/' . $this->rest_base . '/' . $path,
				array(
					array(
						'methods'             => $route[0],
						'callback'            => array( $this, $route[1] ),
						'permission_callback' => array( $this, 'check_permission' ),
					),
				)
			);
		}
	}

	/**
	 * Sends a test email, through the live routing (the path every other email takes) or one named connection.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function test_email( $request ) {
		$to = sanitize_email( (string) $request->get_param( 'to' ) );

		if ( ! is_email( $to ) ) {
			return new \WP_Error( 'vulomail_invalid_email', __( 'Enter a valid email address to send the test to.', 'vulomail' ), array( 'status' => 400 ) );
		}

		$site    = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
		$subject = sprintf(
			/* translators: %s: site name. */
			__( 'VuloMail test email from %s', 'vulomail' ),
			$site
		);
		$body    = '<p>' . esc_html__( 'This is a test email sent by VuloMail.', 'vulomail' ) . '</p><p>'
			. esc_html__( 'If you are reading it, your email connection is working.', 'vulomail' ) . '</p><p style="color:#666;font-size:12px">'
			. esc_html( home_url( '/' ) ) . '</p>';
		$headers = array( 'Content-Type: text/html; charset=UTF-8' );

		$connection_id = sanitize_key( (string) $request->get_param( 'connection_id' ) );

		if ( '' === $connection_id ) {
			$result = vulomail_send_email(
				array(
					'to'      => $to,
					'subject' => $subject,
					'message' => $body,
					'headers' => $headers,
					'source'  => 'vulomail-test',
				)
			);
			$last   = VuloMail()->wp_mail->last_result();

			return $this->respond(
				! is_wp_error( $result ),
				is_wp_error( $result ) ? $result->get_error_message() : '',
				$last ? $last->provider : \VuloMail\Email\WpMailInterceptor::DEFAULT_PROVIDER,
				$last ? $last->attempts : array()
			);
		}

		$connection = VuloMail()->connections->get( $connection_id );

		if ( ! $connection || Utill::CHANNEL_EMAIL !== $connection['channel'] ) {
			return new \WP_Error( 'vulomail_connection_not_found', __( 'That connection no longer exists.', 'vulomail' ), array( 'status' => 404 ) );
		}

		$missing = VuloMail()->connections->missing_fields( $connection );

		if ( $missing ) {
			/* translators: %s: field names. */
			return $this->respond( false, sprintf( __( 'This connection is incomplete. Missing: %s.', 'vulomail' ), implode( ', ', $missing ) ), $connection['provider'] );
		}

		$message         = ( new MessageFactory( VuloMail()->settings ) )->from_wp_mail(
			array(
				'to'      => $to,
				'subject' => $subject,
				'message' => $body,
				'headers' => $headers,
			)
		);
		$message->source = 'vulomail-test';

		$result           = VuloMail()->email->send_via( $connection, $message );
		$result->attempts = array( $result->to_array() );

		VuloMail()->logger->email( $message, $result );

		return $this->respond( $result->success, $result->error_message, $result->provider, $result->attempts );
	}

	/**
	 * Sends a test SMS through the live routing or one named connection.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function test_sms( $request ) {
		$to     = (string) $request->get_param( 'to' );
		$number = PhoneNumber::normalize( $to, (string) VuloMail()->settings->get( 'sms_country_code' ) );

		if ( '' === $number ) {
			return new \WP_Error( 'vulomail_invalid_number', __( 'Enter a phone number in international format, for example +14155550123.', 'vulomail' ), array( 'status' => 400 ) );
		}

		$body = sprintf(
			/* translators: %s: site name. */
			__( 'VuloMail test message from %s. Your SMS connection is working.', 'vulomail' ),
			wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES )
		);

		$connection_id = sanitize_key( (string) $request->get_param( 'connection_id' ) );

		if ( '' === $connection_id ) {
			$result = VuloMail()->sms->send( $number, $body, 'vulomail-test' );

			return $this->respond( $result->success, $result->error_message, $result->provider, $result->attempts );
		}

		$connection = VuloMail()->connections->get( $connection_id );

		if ( ! $connection || Utill::CHANNEL_SMS !== $connection['channel'] ) {
			return new \WP_Error( 'vulomail_connection_not_found', __( 'That connection no longer exists.', 'vulomail' ), array( 'status' => 404 ) );
		}

		$missing = VuloMail()->connections->missing_fields( $connection );

		if ( $missing ) {
			/* translators: %s: field names. */
			return $this->respond( false, sprintf( __( 'This connection is incomplete. Missing: %s.', 'vulomail' ), implode( ', ', $missing ) ), $connection['provider'] );
		}

		$result           = VuloMail()->sms->send_via( $connection, $number, $body );
		$result->attempts = array( $result->to_array() );

		VuloMail()->logger->sms( $number, $body, $result, false, 'vulomail-test' );

		return $this->respond( $result->success, $result->error_message, $result->provider, $result->attempts );
	}

	/**
	 * Runs and returns the mail diagnostics report.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function diagnostics( $request ) {
		return rest_ensure_response( VuloMail()->diagnostics->run() );
	}

	/**
	 * Builds the response shape shared by the test-send endpoints.
	 *
	 * @param bool   $success  Whether the test was accepted for delivery.
	 * @param string $error    Error message on failure.
	 * @param string $provider Provider that handled the final attempt.
	 * @param array  $attempts Every attempt made.
	 * @return \WP_REST_Response
	 */
	private function respond( $success, $error, $provider, array $attempts = array() ) {
		return rest_ensure_response(
			array(
				'success'  => (bool) $success,
				'provider' => (string) $provider,
				'attempts' => $attempts,
				'message'  => $success
					? __( 'Test sent. Check the inbox or phone to confirm it arrived.', 'vulomail' )
					: ( '' !== (string) $error ? (string) $error : __( 'The test could not be sent.', 'vulomail' ) ),
			)
		);
	}
}
