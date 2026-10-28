<?php
/**
 * Connections REST controller file.
 *
 * @package VuloMail
 */

namespace VuloMail\Rest;

defined( 'ABSPATH' ) || exit;

/**
 * REST controller for vulomail/v1/connections - list, create/update and delete. Responses never
 * contain a credential: secret fields come back masked.
 */
class Connections extends Controller {

	/**
	 * REST base for this controller.
	 *
	 * @var string
	 */
	protected $rest_base = 'connections';

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
					'callback'            => array( $this, 'save_item' ),
					'permission_callback' => array( $this, 'check_permission' ),
				),
			)
		);

		register_rest_route(
			VuloMail()->rest_namespace,
			'/' . $this->rest_base . '/(?P<id>[a-z0-9]+)',
			array(
				array(
					'methods'             => \WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'delete_item' ),
					'permission_callback' => array( $this, 'check_permission' ),
				),
			)
		);

		register_rest_route(
			VuloMail()->rest_namespace,
			'/' . $this->rest_base . '/(?P<id>[a-z0-9]+)/google',
			array(
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'google_authorize' ),
					'permission_callback' => array( $this, 'check_permission' ),
				),
			)
		);

		// Google (or VuloLabs' connect service) sends the browser here after consent. It carries no
		// REST nonce, so it can't be admin-only; the single-use state, created by an admin for one
		// connection, is the authorization.
		register_rest_route(
			VuloMail()->rest_namespace,
			'/google/callback',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'google_callback' ),
					'permission_callback' => '__return_true',
				),
			)
		);
	}

	/**
	 * Starts "Sign in with Google" for a saved Gmail connection.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function google_authorize( $request ) {
		$url = VuloMail()->google->authorize_url( sanitize_key( (string) $request['id'] ) );

		return is_wp_error( $url ) ? $url : rest_ensure_response( array( 'url' => $url ) );
	}

	/**
	 * Finishes "Sign in with Google" and sends the browser back to the Connections screen, which
	 * shows the outcome.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return void
	 */
	public function google_callback( $request ) {
		$outcome = VuloMail()->google->complete(
			sanitize_key( (string) $request->get_param( 'state' ) ),
			sanitize_text_field( (string) $request->get_param( 'code' ) ),
			sanitize_key( (string) $request->get_param( 'error' ) )
		);

		$target = admin_url( 'admin.php?page=vulomail' ) . '#&tab=settings&subtab=connections&google='
			. ( $outcome['success'] ? 'connected' : 'failed' )
			. '&google_message=' . rawurlencode( $outcome['message'] );

		nocache_headers();
		wp_safe_redirect( $target );
		exit;
	}

	/**
	 * Lists every connection plus the routing slots.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function get_items( $request ) {
		return rest_ensure_response( $this->payload() );
	}

	/**
	 * Creates or updates a connection.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function save_item( $request ) {
		$input = $request->get_json_params();
		$saved = VuloMail()->connections->save( is_array( $input ) ? $input : array() );

		if ( is_wp_error( $saved ) ) {
			return $saved;
		}

		// Email keeps WordPress's own mailer as the default until the site owner picks a primary. SMS
		// has no default to fall back on, so its first gateway becomes the primary.
		if ( \VuloMail\Utill::CHANNEL_SMS === $saved['channel'] && '' === (string) VuloMail()->settings->get( 'sms_primary' ) ) {
			VuloMail()->settings->update( array( 'sms_primary' => $saved['id'] ) );
		}

		// `saved` lets the form act on a connection it just created (such as signing it in with Google).
		return rest_ensure_response( array_merge( $this->payload(), array( 'saved' => $saved['id'] ) ) );
	}

	/**
	 * Deletes a connection and clears any routing slot pointing at it.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function delete_item( $request ) {
		$id = sanitize_key( (string) $request['id'] );

		if ( ! VuloMail()->connections->delete( $id ) ) {
			return new \WP_Error( 'vulomail_connection_not_found', __( 'That connection no longer exists.', 'vulomail' ), array( 'status' => 404 ) );
		}

		// Clear any routing slot that pointed at it.
		$cleared = array();

		foreach ( array( 'email_primary', 'email_backup', 'sms_primary', 'sms_backup' ) as $slot ) {
			if ( VuloMail()->settings->get( $slot ) === $id ) {
				$cleared[ $slot ] = '';
			}
		}

		// Losing the primary promotes the backup, so the channel keeps a clear first choice.
		foreach ( array( 'email', 'sms' ) as $channel ) {
			$backup = (string) VuloMail()->settings->get( $channel . '_backup' );

			if ( isset( $cleared[ $channel . '_primary' ] ) && ! isset( $cleared[ $channel . '_backup' ] ) && '' !== $backup ) {
				$cleared[ $channel . '_primary' ] = $backup;
				$cleared[ $channel . '_backup' ]  = '';
			}
		}

		if ( $cleared ) {
			VuloMail()->settings->update( $cleared );
		}

		return rest_ensure_response( $this->payload() );
	}

	/**
	 * Connections plus the routing slots, so the screen refreshes from one response.
	 *
	 * @return array
	 */
	private function payload() {
		$connections = array();

		foreach ( VuloMail()->connections->all() as $connection ) {
			$connections[] = VuloMail()->connections->for_display( $connection );
		}

		$settings = VuloMail()->settings->all();

		return array(
			'connections' => $connections,
			'routing'     => array(
				'email_primary' => $settings['email_primary'],
				'email_backup'  => $settings['email_backup'],
				'sms_primary'   => $settings['sms_primary'],
				'sms_backup'    => $settings['sms_backup'],
			),
		);
	}
}
