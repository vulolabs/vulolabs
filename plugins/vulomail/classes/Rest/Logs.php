<?php
/**
 * Logs REST controller file.
 *
 * @package VuloMail
 */

namespace VuloMail\Rest;

use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * REST controller for vulomail/v1/logs - list, view, delete and resend delivery log entries.
 */
class Logs extends Controller {

	/**
	 * REST base for this controller.
	 *
	 * @var string
	 */
	protected $rest_base = 'logs';

	/**
	 * Registers this controller's routes.
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			VuloMail()->rest_namespace,
			'/' . $this->rest_base,
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_items' ),
					'permission_callback' => array( $this, 'check_permission' ),
				),
				array(
					'methods'             => \WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'delete_items' ),
					'permission_callback' => array( $this, 'check_permission' ),
				),
			)
		);

		register_rest_route(
			VuloMail()->rest_namespace,
			'/' . $this->rest_base . '/(?P<id>\d+)',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_item' ),
					'permission_callback' => array( $this, 'check_permission' ),
				),
			)
		);

		register_rest_route(
			VuloMail()->rest_namespace,
			'/' . $this->rest_base . '/(?P<id>\d+)/resend',
			array(
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'resend_item' ),
					'permission_callback' => array( $this, 'check_permission' ),
				),
			)
		);
	}

	/**
	 * Lists delivery log entries, filtered and paginated.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function get_items( $request ) {
		$channel = sanitize_key( (string) $request->get_param( 'channel' ) );
		$status  = sanitize_key( (string) $request->get_param( 'status' ) );

		$result = VuloMail()->logs->query(
			array(
				'channel'  => in_array( $channel, array( Utill::CHANNEL_EMAIL, Utill::CHANNEL_SMS ), true ) ? $channel : '',
				'status'   => in_array( $status, array( 'sent', 'failed' ), true ) ? $status : '',
				'search'   => sanitize_text_field( (string) $request->get_param( 'search' ) ),
				'after'    => self::day_boundary( $request->get_param( 'after' ), '00:00:00' ),
				'before'   => self::day_boundary( $request->get_param( 'before' ), '23:59:59' ),
				'page'     => absint( $request->get_param( 'page' ) ),
				'per_page' => absint( $request->get_param( 'per_page' ) ),
				'orderby'  => sanitize_key( (string) $request->get_param( 'orderby' ) ),
				'order'    => sanitize_key( (string) $request->get_param( 'order' ) ),
			)
		);

		$result['data'] = array_map( array( self::class, 'with_engagement' ), Utill::with_display_dates( $result['data'] ) );

		return rest_ensure_response( $result );
	}

	/**
	 * Gets one delivery log entry.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_item( $request ) {
		$row = VuloMail()->logs->get( absint( $request['id'] ) );

		if ( ! $row ) {
			return new \WP_Error( 'vulomail_log_not_found', __( 'That log entry no longer exists.', 'vulomail' ), array( 'status' => 404 ) );
		}

		$attempts = json_decode( (string) $row['attempts'], true );
		$headers  = json_decode( (string) $row['headers'], true );

		$row['created_at_display'] = Utill::format_datetime( (string) $row['created_at'] );
		$row['attempts']           = self::with_causes( is_array( $attempts ) ? $attempts : array() );
		$row['headers']            = is_array( $headers ) ? $headers : array();
		$row['has_body']           = null !== $row['body'];
		$row['can_resend']         = $this->can_resend( $row );

		$row = self::with_engagement( $row );

		$row['tracking'] = array(
			'open_count'       => (int) $row['open_count'],
			'first_opened_at'  => self::display_or_empty( $row['first_opened_at'] ),
			'last_opened_at'   => self::display_or_empty( $row['last_opened_at'] ),
			'click_count'      => (int) $row['click_count'],
			'first_clicked_at' => self::display_or_empty( $row['first_clicked_at'] ),
			'last_clicked_at'  => self::display_or_empty( $row['last_clicked_at'] ),
			'links'            => 'not_tracked' === $row['clicked'] ? array() : array_map(
				static function ( $link ) {
					return array(
						'url'              => (string) $link['url'],
						'click_count'      => (int) $link['click_count'],
						'first_clicked_at' => self::display_or_empty( $link['first_clicked_at'] ),
						'last_clicked_at'  => self::display_or_empty( $link['last_clicked_at'] ),
					);
				},
				VuloMail()->logs->links( (int) $row['id'] )
			),
		);

		// Replaced by `opened`, `clicked` and `tracking`. The token is what a tracked email's links
		// carry, and never leaves the server.
		unset(
			$row['tracking_token'],
			$row['track_opens'],
			$row['track_clicks'],
			$row['open_count'],
			$row['click_count'],
			$row['first_opened_at'],
			$row['last_opened_at'],
			$row['first_clicked_at'],
			$row['last_clicked_at']
		);

		return rest_ensure_response( $row );
	}

	/**
	 * Deletes the given ids, or everything when `all` is true.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function delete_items( $request ) {
		$input = $request->get_json_params();
		$input = is_array( $input ) ? $input : array();

		if ( ! empty( $input['all'] ) ) {
			return rest_ensure_response( array( 'deleted' => VuloMail()->logs->delete_all() ) );
		}

		$ids = isset( $input['ids'] ) && is_array( $input['ids'] ) ? $input['ids'] : array();

		if ( ! $ids ) {
			return new \WP_Error( 'vulomail_no_ids', __( 'No log entries were selected.', 'vulomail' ), array( 'status' => 400 ) );
		}

		return rest_ensure_response( array( 'deleted' => VuloMail()->logs->delete( $ids ) ) );
	}

	/**
	 * Sends a logged message again. Needs its content stored and its recipients unmasked.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function resend_item( $request ) {
		$row = VuloMail()->logs->get( absint( $request['id'] ) );

		if ( ! $row ) {
			return new \WP_Error( 'vulomail_log_not_found', __( 'That log entry no longer exists.', 'vulomail' ), array( 'status' => 404 ) );
		}

		if ( ! $this->can_resend( $row ) ) {
			return new \WP_Error( 'vulomail_cannot_resend', __( 'This message can\'t be resent because its content or recipients were not stored.', 'vulomail' ), array( 'status' => 400 ) );
		}

		if ( Utill::CHANNEL_SMS === $row['channel'] ) {
			$result = vulomail_send_sms( $row['recipients'], $row['body'], array( 'source' => 'vulomail-resend' ) );
		} else {
			$headers = json_decode( (string) $row['headers'], true );
			$headers = is_array( $headers ) ? $headers : array();
			$send    = array( 'Content-Type: ' . ( 'text/html' === ( $headers['Content-Type'] ?? '' ) ? 'text/html' : 'text/plain' ) . '; charset=UTF-8' );

			if ( ! empty( $headers['Reply-To'] ) ) {
				$send[] = 'Reply-To: ' . $headers['Reply-To'];
			}

			$result = vulomail_send_email(
				array(
					'to'      => $row['recipients'],
					'subject' => $row['subject'],
					'message' => $row['body'],
					'headers' => $send,
					'source'  => 'vulomail-resend',
				)
			);
		}

		if ( is_wp_error( $result ) ) {
			return rest_ensure_response(
				array(
					'success' => false,
					'message' => $result->get_error_message(),
				)
			);
		}

		return rest_ensure_response(
			array(
				'success' => true,
				'message' => __( 'Message resent.', 'vulomail' ),
			)
		);
	}

	/**
	 * Turns a calendar day from the date-range filter into a UTC datetime, read in the site's own
	 * timezone (the one the log's dates are shown in).
	 *
	 * @param mixed  $day  Raw request value, expected as `Y-m-d`.
	 * @param string $time `H:i:s` within that day.
	 * @return string UTC `Y-m-d H:i:s`, or '' when the value isn't a date.
	 */
	private static function day_boundary( $day, $time ) {
		$day = is_string( $day ) ? trim( $day ) : '';

		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $day ) ) {
			return '';
		}

		$local = date_create( $day . ' ' . $time, wp_timezone() );

		return $local ? $local->setTimezone( new \DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' ) : '';
	}

	/**
	 * Adds `opened` and `clicked` to a log row: 'yes', 'no', or 'not_tracked'. Only a delivered email
	 * gets `track_*` flags, so a failed email or text message reads 'not_tracked'. A click counts as
	 * an open - the reader must have opened the email to click, even if their mail app blocked the
	 * pixel.
	 *
	 * @param array $row Log row with its tracking columns.
	 * @return array
	 */
	private static function with_engagement( array $row ) {
		$opens  = (int) $row['open_count'];
		$clicks = (int) $row['click_count'];

		$row['opened']  = (int) $row['track_opens'] ? ( $opens + $clicks > 0 ? 'yes' : 'no' ) : 'not_tracked';
		$row['clicked'] = (int) $row['track_clicks'] ? ( $clicks > 0 ? 'yes' : 'no' ) : 'not_tracked';

		return $row;
	}

	/**
	 * A stored UTC datetime in the site's format, or '' when it is empty.
	 *
	 * @param string|null $utc_datetime UTC `Y-m-d H:i:s`.
	 * @return string
	 */
	private static function display_or_empty( $utc_datetime ) {
		return empty( $utc_datetime ) ? '' : Utill::format_datetime( (string) $utc_datetime );
	}

	/**
	 * Whether a log row's message can be sent again.
	 *
	 * @param array $row Log row.
	 * @return bool
	 */
	private function can_resend( array $row ) {
		return null !== $row['body'] && '' !== $row['recipients'] && false === strpos( $row['recipients'], '•' );
	}
}
