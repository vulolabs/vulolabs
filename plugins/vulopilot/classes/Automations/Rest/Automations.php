<?php
namespace VuloPilot\Automations\Rest;

use VuloPilot\Automations\BuiltinAutomationSeeder;
use VuloPilot\Automations\AutomationsRepository;
use VuloPilot\Automations\AutomationsRunRepository;

defined( 'ABSPATH' ) || exit;

/**
 * REST controller for automations: list, enable/disable, and run-now.
 *
 * @class       Automations controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class Automations extends \WP_REST_Controller {

	/**
	 * Must be `automations`, the path the frontend calls.
	 *
	 * @var string
	 */
	protected $rest_base = 'automations';

	/**
	 * @inheritDoc
	 */
	public function register_routes() {
		register_rest_route(
			VuloPilot()->rest_namespace,
			'/' . $this->rest_base,
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_items' ),
					'permission_callback' => array( $this, 'get_items_permissions_check' ),
				),
			)
		);

		register_rest_route(
			VuloPilot()->rest_namespace,
			'/' . $this->rest_base . '/(?P<id>\d+)',
			array(
				array(
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update_item' ),
					'permission_callback' => array( $this, 'update_item_permissions_check' ),
				),
			)
		);

		register_rest_route(
			VuloPilot()->rest_namespace,
			'/' . $this->rest_base . '/(?P<id>\d+)/run',
			array(
				array(
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'run_item' ),
					'permission_callback' => array( $this, 'update_item_permissions_check' ),
				),
			)
		);
	}

	/**
	 * @inheritDoc
	 */
	public function get_items_permissions_check( $request ) {
		return current_user_can( 'manage_options' );
	}

	/**
	 * @inheritDoc
	 */
	public function update_item_permissions_check( $request ) {
		return current_user_can( 'manage_options' );
	}

	/**
	 * @inheritDoc
	 */
	public function get_items( $request ) {
		return $this->prepare_get_items_response( $request->get_params(), $request );
	}

	/**
	 * List automations (REST or ability).
	 *
	 * @param array                 $payload Request params.
	 * @param \WP_REST_Request|null $request Request object, if any.
	 * @return \WP_REST_Response
	 */
	public function prepare_get_items_response( $payload, $request = null ) {
		$payload = wp_parse_args(
			$payload,
			array(
				'page'     => 0,
				'per_page' => 0,
				'status'   => '',
				'search'   => '',
				'orderby'  => '',
				'order'    => '',
			)
		);

		$repository = new AutomationsRepository();

		$status = sanitize_key( (string) $payload['status'] );
		$search = sanitize_text_field( (string) $payload['search'] );

		$result                  = $repository->find_all(
			array(
				'page'     => absint( $payload['page'] ) ? absint( $payload['page'] ) : 1,
				'per_page' => absint( $payload['per_page'] ) ? absint( $payload['per_page'] ) : 20,
				'status'   => $status,
				'search'   => $search,
				'orderby'  => sanitize_key( (string) $payload['orderby'] ),
				'order'    => sanitize_key( (string) $payload['order'] ),
			)
		);
		$result['status_counts'] = $repository->get_status_counts();
		$result['data']          = self::with_next_run( self::with_last_run( $result['data'] ) );

		return rest_ensure_response( $result );
	}

	/**
	 * @param array $rows Real automation rows, each with a real 'trigger_type'.
	 * @return array
	 */
	private static function with_next_run( array $rows ): array {
		$cron_trigger_types = array( 'hourly', 'daily', 'weekly', 'monthly' );
		$next_run_by_type   = array();

		foreach ( $cron_trigger_types as $trigger_type ) {
			$timestamp                         = wp_next_scheduled( 'vulopilot_automations_tick_' . $trigger_type );
			$next_run_by_type[ $trigger_type ] = $timestamp ? gmdate( 'Y-m-d H:i:s', $timestamp ) : null;
		}

		return array_map(
			static function ( array $row ) use ( $next_run_by_type ): array {
				$row['next_run_at'] = $next_run_by_type[ $row['trigger_type'] ?? '' ] ?? null;

				return $row;
			},
			$rows
		);
	}

	/**
	 * @inheritDoc
	 */
	public function update_item( $request ) {
		$id         = absint( $request->get_param( 'id' ) );
		$repository = new AutomationsRepository();
		$row        = $repository->find( $id );

		if ( ! $row ) {
			return new \WP_Error( 'vulopilot_automations_not_found', __( 'Automation not found.', 'vulopilot' ), array( 'status' => 404 ) );
		}

		$data = array();

		if ( null !== $request->get_param( 'status' ) ) {
			$status = sanitize_key( (string) $request->get_param( 'status' ) );

			if ( ! in_array( $status, array( 'enabled', 'disabled', 'draft' ), true ) ) {
				return new \WP_Error( 'vulopilot_invalid_status', __( 'Invalid automation status.', 'vulopilot' ), array( 'status' => 400 ) );
			}

			$data['status'] = $status;
		}

		if ( null !== $request->get_param( 'trigger_config' ) ) {
			$trigger_config = $this->validate_builtin_trigger_config( (string) $row['trigger_type'], (array) $request->get_param( 'trigger_config' ) );

			if ( is_wp_error( $trigger_config ) ) {
				return $trigger_config;
			}

			$data['trigger_config'] = wp_json_encode( $trigger_config );
		}

		if ( ! $data ) {
			return new \WP_Error( 'vulopilot_nothing_to_update', __( 'Nothing to update.', 'vulopilot' ), array( 'status' => 400 ) );
		}

		if ( ! $repository->update( $id, $data ) ) {
			return new \WP_Error( 'vulopilot_update_failed', __( 'Could not update this automation.', 'vulopilot' ), array( 'status' => 500 ) );
		}

		return rest_ensure_response(
			array(
				'success' => true,
				'id'      => $id,
			)
		);
	}

	/**
	 * @param string $trigger_type The row's own, already-known trigger_type.
	 * @param array  $incoming     Raw `trigger_config` from the request body.
	 * @return array|\WP_Error
	 */
	private function validate_builtin_trigger_config( string $trigger_type, array $incoming ) {
		$allowed_frequencies = array(
			BuiltinAutomationSeeder::TRIGGER_FULL_SITE_SCAN   => array( 'manual', 'daily', 'weekly', 'monthly' ),
			BuiltinAutomationSeeder::TRIGGER_VISIBILITY_REPORT => array( 'weekly', 'monthly' ),
		);

		if ( ! isset( $allowed_frequencies[ $trigger_type ] ) ) {
			return new \WP_Error( 'vulopilot_trigger_config_not_editable', __( 'This automation\'s schedule can\'t be edited here.', 'vulopilot' ), array( 'status' => 400 ) );
		}

		$frequency = sanitize_key( (string) ( $incoming['frequency'] ?? '' ) );

		if ( ! in_array( $frequency, $allowed_frequencies[ $trigger_type ], true ) ) {
			return new \WP_Error( 'vulopilot_invalid_frequency', __( 'Invalid schedule frequency.', 'vulopilot' ), array( 'status' => 400 ) );
		}

		$config = array(
			'frequency'      => $frequency,
			'system_default' => BuiltinAutomationSeeder::TRIGGER_FULL_SITE_SCAN === $trigger_type
				? BuiltinAutomationSeeder::MARKER_FULL_SITE_SCAN
				: BuiltinAutomationSeeder::MARKER_VISIBILITY_REPORT,
		);

		if ( 'weekly' === $frequency ) {
			$config['day_of_week'] = max( 1, min( 7, absint( $incoming['day_of_week'] ?? 1 ) ) );
		}

		return $config;
	}

	/**
	 * @inheritDoc
	 */
	public function run_item( $request ) {
		$id         = absint( $request->get_param( 'id' ) );
		$repository = new AutomationsRepository();
		$row        = $repository->find( $id );

		if ( ! $row ) {
			return new \WP_Error( 'vulopilot_automations_not_found', __( 'Automation not found.', 'vulopilot' ), array( 'status' => 404 ) );
		}

		// Free's own two built-in automations run synchronously here.
		if ( BuiltinAutomationSeeder::TRIGGER_FULL_SITE_SCAN === $row['trigger_type'] ) {
			VuloPilot()->automation_scheduler->run_scheduled_scan();

			return rest_ensure_response( array( 'success' => true ) );
		}

		if ( BuiltinAutomationSeeder::TRIGGER_VISIBILITY_REPORT === $row['trigger_type'] ) {
			VuloPilot()->automation_scheduler->run_scheduled_report();

			return rest_ensure_response( array( 'success' => true ) );
		}

		return new \WP_Error(
			'vulopilot_automations_not_implemented',
			__( 'Manually running an automation isn\'t supported yet - automations currently only fire from their own configured trigger.', 'vulopilot' ),
			array( 'status' => 501 )
		);
	}

	/**
	 * @param array $rows Real automation rows, each with a real 'id'.
	 * @return array
	 */
	private static function with_last_run( array $rows ): array {
		$ids = array_map(
			static fn( array $row ): int => (int) ( $row['id'] ?? 0 ),
			$rows
		);

		$latest_by_id = ( new AutomationsRunRepository() )->get_latest_by_automation_ids( $ids );

		return array_map(
			static function ( array $row ) use ( $latest_by_id ): array {
				$latest = $latest_by_id[ (int) ( $row['id'] ?? 0 ) ] ?? null;

				$row['last_run_status']           = $latest['status'] ?? null;
				$row['last_run_actions_executed'] = $latest['actions_executed'] ?? null;
				$row['last_run_actions_failed']   = $latest['actions_failed'] ?? null;
				$row['last_run_changes_made']     = $latest['changes_made'] ?? null;
				$row['last_run_finished_at']      = $latest['finished_at'] ?? null;

				return $row;
			},
			$rows
		);
	}
}
