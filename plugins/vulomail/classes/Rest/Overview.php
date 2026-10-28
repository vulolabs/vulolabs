<?php
/**
 * Overview REST controller file.
 *
 * @package VuloMail
 */

namespace VuloMail\Rest;

use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * GET vulomail/v1/overview - the Dashboard tab's data in one request.
 */
class Overview extends Controller {

	/**
	 * REST base for this controller.
	 *
	 * @var string
	 */
	protected $rest_base = 'overview';

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
			)
		);
	}

	/**
	 * Builds the Dashboard tab's data in one response.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function get_items( $request ) {
		$days = in_array( absint( $request->get_param( 'days' ) ), array( 7, 30, 90 ), true ) ? absint( $request->get_param( 'days' ) ) : 7;

		$totals = array(
			Utill::CHANNEL_EMAIL => array(
				'sent'   => 0,
				'failed' => 0,
			),
			Utill::CHANNEL_SMS   => array(
				'sent'   => 0,
				'failed' => 0,
			),
		);

		foreach ( VuloMail()->logs->daily_counts( gmdate( 'Y-m-d 00:00:00', time() - ( $days - 1 ) * DAY_IN_SECONDS ) ) as $row ) {
			$status = 'sent' === $row['status'] ? 'sent' : 'failed';

			if ( isset( $totals[ $row['channel'] ] ) ) {
				$totals[ $row['channel'] ][ $status ] += (int) $row['total'];
			}
		}

		$failures = VuloMail()->logs->query(
			array(
				'status'   => 'failed',
				'per_page' => 5,
			)
		);
		$attempts = VuloMail()->logs->attempts( array_column( $failures['data'], 'id' ) );
		$failures = array_map(
			static function ( $row ) use ( $attempts ) {
				return self::with_cause( $row, $attempts[ (int) $row['id'] ] ?? array() );
			},
			$failures['data']
		);

		return rest_ensure_response(
			array(
				'days'            => $days,
				'email'           => array_merge( $totals[ Utill::CHANNEL_EMAIL ], $this->channel_state( VuloMail()->email, 'email_enabled' ) ),
				'sms'             => array_merge( $totals[ Utill::CHANNEL_SMS ], $this->channel_state( VuloMail()->sms, 'sms_enabled' ) ),
				'recent_failures' => Utill::with_display_dates( $failures ),
				'logging'         => (bool) VuloMail()->settings->get( 'log_enabled' ),
				'sms_alerts'      => $this->sms_alerts(),
			)
		);
	}

	/**
	 * Adds `cause`: the provider, error code and error text to explain a failure by. That is the
	 * last attempt marked by with_causes(), or the row's own error when no attempt is recorded.
	 *
	 * @param array $row      Failed log row from LogRepository::query().
	 * @param array $attempts The row's attempts.
	 * @return array
	 */
	private static function with_cause( array $row, array $attempts ) {
		$row['cause'] = array(
			'provider'      => (string) $row['provider'],
			'error_code'    => (string) $row['error_code'],
			'error_message' => (string) $row['error_message'],
		);

		foreach ( array_reverse( self::with_causes( $attempts ) ) as $attempt ) {
			if ( $attempt['is_cause'] ) {
				$row['cause'] = array(
					'provider'      => (string) ( $attempt['provider'] ?? '' ),
					'error_code'    => (string) ( $attempt['error_code'] ?? '' ),
					'error_message' => (string) ( $attempt['error_message'] ?? '' ),
				);
				break;
			}
		}

		return $row;
	}

	/**
	 * How many SMS alerts this site can use, and how many are switched on.
	 *
	 * @return array{enabled: int, available: int}
	 */
	private function sms_alerts() {
		$saved     = (array) VuloMail()->settings->get( 'sms_triggers' );
		$enabled   = 0;
		$available = 0;

		foreach ( \VuloMail\Sms\Triggers::definitions() as $id => $trigger ) {
			if ( empty( $trigger['available'] ) ) {
				continue;
			}

			++$available;
			$enabled += empty( $saved[ $id ]['enabled'] ) ? 0 : 1;
		}

		return array(
			'enabled'   => $enabled,
			'available' => $available,
		);
	}

	/**
	 * Summarizes a channel's readiness and routing for the dashboard.
	 *
	 * @param object $dispatcher Email or SMS dispatcher.
	 * @param string $setting    Setting key of the channel's on/off switch.
	 * @return array{enabled: bool, ready: bool, primary: string, backup: string}
	 */
	private function channel_state( $dispatcher, $setting ) {
		$chain = $dispatcher->chain();

		return array(
			'enabled' => (bool) VuloMail()->settings->get( $setting ),
			'ready'   => $dispatcher->is_ready(),
			'primary' => isset( $chain[0] ) ? $chain[0]['label'] : '',
			'backup'  => isset( $chain[1] ) ? $chain[1]['label'] : '',
		);
	}
}
