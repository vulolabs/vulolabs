<?php
/**
 * AiActionRuns controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\AiCopilot\Rest;

use VuloPilot\Repositories\ActionRunRepository;
use VuloPilot\Exceptions\AiRequestException;
use VuloPilot\Exceptions\InvalidActionInputException;
use VuloPilot\Exceptions\InvalidActionOutputException;
use VuloPilot\Exceptions\InsufficientCreditsException;
use VuloPilot\Exceptions\UnsafePromptException;

defined( 'ABSPATH' ) || exit;

/**
 * GET /ai-action-runs backs the Dashboard's "Pending Approval" widget.
 * POST /ai-action-runs (create_item) starts the lifecycle — Create
 * Content's own tool cards (ContentToolsGrid.tsx/QuickStartCard.tsx) call
 * this via ContentToolRunner.tsx. POST /ai-action-runs/{id}/approve|reject|rollback
 * complete the write side — AiCopilot\ActionRunner::propose()/approve()/
 * reject()/rollback() have all been fully implemented since AI-ACTIONS.md's
 * own pass, but this controller used to only expose get_items() plus the
 * approve/reject/rollback trio, leaving propose() — the only way a new run
 * ever gets created in the first place — with no route at all, so every
 * "AI action" trigger in the UI was permanently unreachable. Each has real
 * side effects (a site mutation, for approve/rollback, or a real AI
 * provider call + cost, for create), so each is its own route with its
 * own permission check, not folded into a generic PATCH.
 *
 * @class       AiActionRuns controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class AiActionRuns extends \WP_REST_Controller {

    /**
     * @var string
     */
    protected $rest_base = 'ai-action-runs';

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
            '/' . $this->rest_base,
            array(
                array(
                    'methods'             => \WP_REST_Server::CREATABLE,
                    'callback'            => array( $this, 'create_item' ),
                    'permission_callback' => array( $this, 'update_item_permissions_check' ),
                ),
            )
        );

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/(?P<id>\d+)/approve',
            array(
                array(
                    'methods'             => \WP_REST_Server::CREATABLE,
                    'callback'            => array( $this, 'approve_item' ),
                    'permission_callback' => array( $this, 'update_item_permissions_check' ),
                ),
            )
        );

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/(?P<id>\d+)/reject',
            array(
                array(
                    'methods'             => \WP_REST_Server::CREATABLE,
                    'callback'            => array( $this, 'reject_item' ),
                    'permission_callback' => array( $this, 'update_item_permissions_check' ),
                ),
            )
        );

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/(?P<id>\d+)/rollback',
            array(
                array(
                    'methods'             => \WP_REST_Server::CREATABLE,
                    'callback'            => array( $this, 'rollback_item' ),
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
     *
     * Also requires the real AI Copilot module (see
     * modules/AiCopilot/Module.php's own docblock) — shared by propose/
     * approve/reject/rollback, since every one of those is "AI
     * functionality" requirement #4 says must not execute while that
     * module is off, not just the generation step.
     */
    public function update_item_permissions_check( $request ) {
        if ( ! current_user_can( 'manage_options' ) ) {
            return false;
        }

        if ( ! VuloPilot()->modules->is_active( 'ai-copilot' ) ) {
            return new \WP_Error(
                'vulopilot_ai_copilot_inactive',
                __( 'Enable the AI Copilot module to use AI actions.', 'vulopilot' ),
                array( 'status' => 403 )
            );
        }

        return true;
    }

    /**
     * Stages 1-4 of the AI action lifecycle: proposes a new run for a
     * registered action — validates the real input, sends a real prompt
     * through the AI request sender, and persists a `pending_approval`
     * row with a real preview. The response's own `auto_approved`/
     * `approval_method` (ActionRunner::propose()'s own docblock) say
     * whether that's still true for this particular run — Settings →
     * Automation → Approval Settings can make propose() itself apply the
     * change immediately for a low-enough-risk (or, Pro-gated, any)
     * proposal, in which case there's nothing left to approve via
     * POST /ai-action-runs/{id}/approve; the client should check
     * `auto_approved` rather than assuming every run it just created is
     * still pending.
     *
     * @param \WP_REST_Request $request Full details about the request.
     * @return \WP_REST_Response|\WP_Error
     */
    public function create_item( $request ) {
        $action_id = sanitize_key( (string) $request->get_param( 'action_id' ) );
        $input     = (array) $request->get_param( 'input' );

        if ( '' === $action_id ) {
            return new \WP_Error( 'vulopilot_ai_action_missing_id', __( 'action_id is required.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        try {
            $result = VuloPilot()->ai_action_runner->propose( $action_id, $input );
        } catch ( \InvalidArgumentException $exception ) {
            return new \WP_Error( 'vulopilot_ai_action_invalid', $exception->getMessage(), array( 'status' => 400 ) );
        } catch ( InvalidActionInputException $exception ) {
            return new \WP_Error( 'vulopilot_ai_action_invalid_input', $exception->getMessage(), array( 'status' => 400 ) );
        } catch ( InvalidActionOutputException $exception ) {
            return new \WP_Error( 'vulopilot_ai_action_invalid_output', $exception->getMessage(), array( 'status' => 502 ) );
        } catch ( InsufficientCreditsException $exception ) {
            // VuloPilot brief §15 — a real, structured outcome the React
            // side renders as the two-button exhausted-credits state, not
            // a generic error toast. HTTP 200 (not 402): "do not treat
            // exhausted credits as a generic API failure."
            return rest_ensure_response(
                array(
                    'success'           => false,
                    'error'             => 'insufficient_credits',
                    'credits_remaining' => $exception->get_credits_remaining(),
                    'can_buy_credits'   => $exception->get_can_buy_credits(),
                    'can_upgrade'       => $exception->get_can_upgrade(),
                )
            );
        } catch ( UnsafePromptException $exception ) {
            return new \WP_Error( 'vulopilot_ai_action_unsafe_prompt', $exception->getMessage(), array( 'status' => 400 ) );
        } catch ( AiRequestException $exception ) {
            return new \WP_Error( 'vulopilot_ai_request_error', $exception->getMessage(), array( 'status' => 502 ) );
        } catch ( \RuntimeException $exception ) {
            return new \WP_Error( 'vulopilot_ai_action_runtime_error', $exception->getMessage(), array( 'status' => 500 ) );
        }

        return rest_ensure_response( array_merge( array( 'success' => true ), $result ) );
    }

    /**
     * Approves and executes a pending AI action run.
     *
     * @param \WP_REST_Request $request Full details about the request.
     * @return \WP_REST_Response|\WP_Error
     */
    public function approve_item( $request ) {
        try {
            $result = VuloPilot()->ai_action_runner->approve( absint( $request->get_param( 'id' ) ) );
        } catch ( \RuntimeException $exception ) {
            return new \WP_Error( 'vulopilot_ai_action_not_pending', $exception->getMessage(), array( 'status' => 409 ) );
        } catch ( \InvalidArgumentException $exception ) {
            return new \WP_Error( 'vulopilot_ai_action_invalid', $exception->getMessage(), array( 'status' => 400 ) );
        }

        return rest_ensure_response( array_merge( array( 'success' => true ), $result ) );
    }

    /**
     * Declines a pending AI action run without ever executing it.
     *
     * @param \WP_REST_Request $request Full details about the request.
     * @return \WP_REST_Response|\WP_Error
     */
    public function reject_item( $request ) {
        try {
            VuloPilot()->ai_action_runner->reject( absint( $request->get_param( 'id' ) ) );
        } catch ( \RuntimeException $exception ) {
            return new \WP_Error( 'vulopilot_ai_action_not_pending', $exception->getMessage(), array( 'status' => 409 ) );
        }

        return rest_ensure_response( array( 'success' => true ) );
    }

    /**
     * Reverts a previously executed AI action run.
     *
     * @param \WP_REST_Request $request Full details about the request.
     * @return \WP_REST_Response|\WP_Error
     */
    public function rollback_item( $request ) {
        try {
            VuloPilot()->ai_action_runner->rollback( absint( $request->get_param( 'id' ) ) );
        } catch ( \RuntimeException $exception ) {
            return new \WP_Error( 'vulopilot_ai_action_not_rollbackable', $exception->getMessage(), array( 'status' => 409 ) );
        } catch ( \InvalidArgumentException $exception ) {
            return new \WP_Error( 'vulopilot_ai_action_invalid', $exception->getMessage(), array( 'status' => 400 ) );
        }

        return rest_ensure_response( array( 'success' => true ) );
    }

    /**
     * @inheritDoc
     */
    public function get_items( $request ) {
        $repository = new ActionRunRepository();

        $status = sanitize_key( (string) $request->get_param( 'status' ) );

        return rest_ensure_response(
            $repository->find_all(
                array(
                    'page'      => absint( $request->get_param( 'page' ) ) ?: 1,
                    'per_page'  => absint( $request->get_param( 'per_page' ) ) ?: 20,
                    'status'    => $status,
                    'action_id' => sanitize_key( (string) $request->get_param( 'action_id' ) ),
                )
            )
        );
    }
}
