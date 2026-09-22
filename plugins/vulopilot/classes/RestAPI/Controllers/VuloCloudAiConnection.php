<?php
/**
 * VuloCloudAiConnection controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\RestAPI\Controllers;

use VuloPilot\Services\AiByokGatewayClient;
use VuloPilot\Services\AiCreditsConnection;

defined( 'ABSPATH' ) || exit;

/**
 * GET /vulocloud-ai-connection, GET /vulocloud-ai-connection/broker-authorize-url —
 * backs src/components/Settings/BusinessVisibility/VuloCloudAiConnectionPanel.tsx
 * (Settings → Connections → VuloCloud AI): the "Connect to VuloCloud" /
 * "Disconnect" section. VuloCloud is the only place this site gets AI from —
 * it holds every key — so this only reports whether the site is connected and
 * whether VuloCloud has an AI key that resolves for it, and hands back the URL
 * the connect button sends the browser to.
 *
 * @class       VuloCloudAiConnection controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class VuloCloudAiConnection extends \WP_REST_Controller {

    /**
     * @var string
     */
    protected $rest_base = 'vulocloud-ai-connection';

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
            '/' . $this->rest_base . '/broker-authorize-url',
            array(
                array(
                    'methods'             => \WP_REST_Server::READABLE,
                    'callback'            => array( $this, 'get_broker_authorize_url' ),
                    'permission_callback' => array( $this, 'get_items_permissions_check' ),
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
     * `connected` is "this site has a VuloCloud site secret"; `configured` is
     * "an Organization's own (or an allowed Customer backup) AI key actually
     * resolves for this site right now".
     *
     * @inheritDoc
     */
    public function get_items( $request ) {
        // A cheap connection-status check (AiByokGatewayClient::status(),
        // never a key/prompt) — the real, current answer to "does AI work
        // for this site".
        $vulocloud_status = ( new AiByokGatewayClient() )->status();

        return rest_ensure_response(
            array(
                'vulocloud_status' => is_wp_error( $vulocloud_status )
                    ? array( 'connected' => false, 'configured' => false )
                    : $vulocloud_status,
            )
        );
    }

    /**
     * The URL the "Connect to VuloCloud" button itself 302s the browser
     * to — AiCreditsConnection::get_broker_authorize_url()'s own docblock
     * for the full passwordless sequence this kicks off.
     *
     * @return \WP_REST_Response|\WP_Error
     */
    public function get_broker_authorize_url() {
        $url = ( new AiCreditsConnection() )->get_broker_authorize_url();

        if ( ! $url ) {
            return new \WP_Error( 'vulopilot_connect_broker_not_configured', __( 'VuloCloud isn’t configured for this build yet.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        return rest_ensure_response( array( 'url' => $url ) );
    }
}
