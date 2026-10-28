<?php
/**
 * Settings REST controller file.
 *
 * @package VuloMail
 */

namespace VuloMail\Rest;

defined( 'ABSPATH' ) || exit;

/**
 * GET/POST vulomail/v1/settings.
 */
class Settings extends Controller {

	/**
	 * REST base for this controller.
	 *
	 * @var string
	 */
	protected $rest_base = 'settings';

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
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'update_item' ),
					'permission_callback' => array( $this, 'check_permission' ),
				),
			)
		);
	}

	/**
	 * Gets every stored setting.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function get_items( $request ) {
		return rest_ensure_response( VuloMail()->settings->all() );
	}

	/**
	 * Merges posted keys into stored settings; unknown keys are ignored, every value validated by
	 * Settings\Settings.
	 *
	 * Accepts a flat `{ key: value }` body, or the `{ setting, settingName }` body zyra's auto-saving
	 * settings form sends, unpacked by from_form_values().
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update_item( $request ) {
		$input   = $request->get_json_params();
		$input   = is_array( $input ) ? $input : (array) $request->get_body_params();
		$is_form = isset( $input['setting'] ) && is_array( $input['setting'] );

		if ( $is_form ) {
			$input = $this->from_form_values( $input['setting'] );
		}

		$error = $this->validate( $input );

		if ( $error ) {
			// The form has no error path; it shows the message from a normal response instead.
			return $is_form
				? rest_ensure_response(
					array(
						'success' => false,
						'type'    => 'error',
						'message' => $error->get_error_message(),
					)
				)
				: $error;
		}

		$before = VuloMail()->settings->all();
		$after  = VuloMail()->settings->update( $input );

		if ( ! $is_form ) {
			return rest_ensure_response( $after );
		}

		// The form autosaves on every sub-tab open, even unedited; only announce it when it changed.
		return rest_ensure_response(
			array(
				'success' => true,
				'message' => $after !== $before ? __( 'Settings saved.', 'vulomail' ) : '',
			)
		);
	}

	/**
	 * Checks values that can't simply be sanitized into something valid.
	 *
	 * @param array $input Flat settings.
	 * @return \WP_Error|null
	 */
	private function validate( array $input ) {
		if ( isset( $input['from_email'] ) && '' !== trim( (string) $input['from_email'] ) && ! is_email( trim( (string) $input['from_email'] ) ) ) {
			return new \WP_Error( 'vulomail_invalid_email', __( 'The sender email is not a valid email address, so it was not saved.', 'vulomail' ), array( 'status' => 400 ) );
		}

		// A routing slot may only point at an existing connection of the same channel.
		foreach ( array( 'email_primary', 'email_backup', 'sms_primary', 'sms_backup' ) as $slot ) {
			if ( empty( $input[ $slot ] ) ) {
				continue;
			}

			$connection = VuloMail()->connections->get( sanitize_key( (string) $input[ $slot ] ) );

			if ( ! $connection || 0 !== strpos( $slot, $connection['channel'] . '_' ) ) {
				return new \WP_Error( 'vulomail_invalid_connection', __( 'That connection does not exist.', 'vulomail' ), array( 'status' => 400 ) );
			}
		}

		return null;
	}

	/**
	 * Unpacks settings-form field values into flat settings.
	 *
	 * - A toggle group arrives as `{ setting_name: { enable: bool }, ... }`; each inner key is the
	 *   real setting.
	 * - A key starting with `sms_triggers` holds alerts' on/off state, keyed by alert id.
	 * - `sms_template_{id}` holds one alert's message template.
	 *
	 * @param array $form Field key => value.
	 * @return array Flat settings.
	 */
	private function from_form_values( array $form ) {
		$defaults = \VuloMail\Settings\Settings::DEFAULTS;
		$triggers = (array) VuloMail()->settings->get( 'sms_triggers' );
		$flat     = array();
		$touched  = false;

		$trigger = static function ( $id ) use ( &$triggers ) {
			$triggers[ $id ] = array_merge(
				array(
					'enabled'  => false,
					'template' => '',
				),
				isset( $triggers[ $id ] ) && is_array( $triggers[ $id ] ) ? $triggers[ $id ] : array()
			);
		};

		foreach ( $form as $key => $value ) {
			$key = (string) $key;

			// Alerts' on/off state arrives in one or more groups: `sms_triggers`, `sms_triggers_woocommerce`...
			if ( 0 === strpos( $key, 'sms_triggers' ) ) {
				foreach ( is_array( $value ) ? $value : array() as $id => $row ) {
					$id = sanitize_key( (string) $id );
					$trigger( $id );
					$triggers[ $id ]['enabled'] = is_array( $row ) && ! empty( $row['enable'] );
					$touched                    = true;
				}
			} elseif ( 0 === strpos( $key, 'sms_template_' ) ) {
				$id = sanitize_key( substr( $key, strlen( 'sms_template_' ) ) );
				$trigger( $id );
				$triggers[ $id ]['template'] = is_string( $value ) ? $value : '';
				$touched                     = true;
			} elseif ( array_key_exists( $key, $defaults ) ) {
				$flat[ $key ] = $value;
			} elseif ( is_array( $value ) ) {
				foreach ( $value as $name => $row ) {
					if ( array_key_exists( $name, $defaults ) && is_bool( $defaults[ $name ] ) ) {
						$flat[ $name ] = is_array( $row ) && ! empty( $row['enable'] );
					}
				}
			}
		}

		if ( $touched ) {
			$flat['sms_triggers'] = $triggers;
		}

		return $flat;
	}
}
