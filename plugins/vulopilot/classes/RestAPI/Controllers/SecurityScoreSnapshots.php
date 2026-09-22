<?php
/**
 * SecurityScoreSnapshots controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\RestAPI\Controllers;

use VuloPilot\Repositories\ScoreSnapshotRepository;

defined( 'ABSPATH' ) || exit;

/**
 * `GET /security-score-snapshots?days=N` — backs SecurityTrendCard.tsx's
 * trend chart. Read-only, same shape as
 * PerformanceScoreSnapshots.php's own `/performance-score-snapshots?days=N`.
 *
 * @class       SecurityScoreSnapshots controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class SecurityScoreSnapshots extends \WP_REST_Controller {

    /**
     * REST base for this controller's routes.
     *
     * @var string
     */
    protected $rest_base = 'security-score-snapshots';

    /**
     * Registers GET /security-score-snapshots.
     *
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
    }

    /**
     * Same manage_options gate every other VuloPilot REST route uses.
     *
     * @param \WP_REST_Request $request Full request object.
     * @return bool
     */
    public function get_items_permissions_check( $request ) {
        return current_user_can( 'manage_options' );
    }

    /**
     * @param \WP_REST_Request $request Full request object.
     * @return \WP_REST_Response
     */
    public function get_items( $request ) {
        $days = absint( $request->get_param( 'days' ) );

        return rest_ensure_response(
            ( new ScoreSnapshotRepository( 'security' ) )->get_recent( $days ? $days : 30 )
        );
    }
}
