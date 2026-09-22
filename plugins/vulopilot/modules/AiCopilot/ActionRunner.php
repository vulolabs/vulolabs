<?php
/**
 * ActionRunner class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\AiCopilot;

use VuloPilot\ValueObjects\Severity;
use VuloPilot\ValueObjects\Impact;
use VuloPilot\ValueObjects\AIResponse;
use VuloPilot\AI\AiRequestSender;
use VuloPilot\Repositories\ActionRunRepository;
use VuloPilot\Repositories\ActivityLogRepository;
use VuloPilot\Services\AiCreditGatewayClient;
use VuloPilot\Services\AiCreditsConnection;
use VuloPilot\Exceptions\AiByokNotConfiguredException;
use VuloPilot\Exceptions\InsufficientCreditsException;
use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Orchestrates every AIAction through its full lifecycle — the same
 * orchestrator role Scanners\ScanRunner and RuleEngine\RuleEngine play
 * for their own engines, but split across four public methods instead of
 * one `run()`, because "Approval" (AI-ACTIONS.md's 5th lifecycle stage)
 * is a genuine pause: propose() and approve()/reject() are always two
 * separate HTTP requests, potentially made by two different people, with
 * a persisted `vulopilot_ai_action_runs` row bridging them.
 *
 * ```
 * propose()  Input → Prompt Builder → (AI call) → Validator → Preview   [persists: pending_approval]
 * approve()  Execution                                                  [persists: executed | failed]
 * reject()   (no-op besides recording the decision)                     [persists: rejected]
 * rollback() Rollback                                                   [persists: rolled_back]
 * ```
 *
 * Logging (stage 8) isn't a method on AIActionInterface — every
 * transition above writes to the existing ActivityLogRepository here,
 * once, rather than each action re-implementing its own audit trail.
 *
 * @class       ActionRunner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class ActionRunner {

    private ActionRegistry $registry;
    private AiRequestSender $request_sender;
    private ActionRunRepository $runs;
    private ActivityLogRepository $activity_logs;
    private AiCreditGatewayClient $credit_gateway;
    private AiCreditsConnection $credits_connection;

    /**
     * Real, structured `{action_id: [feature_id, action]}` mapping onto
     * VuloCloud's own ai-gateway feature catalog (architecture plan §C,
     * "3 representative features") — every other AI action id (not in this
     * map) is unaffected and stays exactly on the BYOK path it's always
     * used. Adding a feature to a future migration pass means adding one
     * entry here plus a matching build_credit_context() case, not
     * restructuring propose() itself.
     */
    private const CREDIT_FEATURE_MAP = array(
        'write-meta-title'              => array( 'seo_title', 'generate' ),
        'write-meta-description'        => array( 'meta_description', 'generate' ),
        'improve-readability'           => array( 'content_improvement', 'rewrite' ),
        'write-post-content'            => array( 'post_content', 'write' ),
        'generate-blog'                 => array( 'blog_post', 'generate' ),
        'differentiate-duplicate-title' => array( 'duplicate_title', 'differentiate' ),
    );


    /**
     * @param ActionRegistry             $registry           Registry to resolve action ids from.
     * @param AiRequestSender          $request_sender      Sends a prompt through the safety-validate → send → sanitize sequence.
     * @param ActionRunRepository|null   $runs           Defaults to a new instance (injectable for tests).
     * @param ActivityLogRepository|null $activity_logs Defaults to a new instance (injectable for tests).
     * @param AiCreditGatewayClient|null $credit_gateway Defaults to a new instance (injectable for tests).
     * @param AiCreditsConnection|null   $credits_connection Defaults to a new instance (injectable for tests).
     */
    public function __construct(
        ActionRegistry $registry,
        AiRequestSender $request_sender,
        ?ActionRunRepository $runs = null,
        ?ActivityLogRepository $activity_logs = null,
        ?AiCreditGatewayClient $credit_gateway = null,
        ?AiCreditsConnection $credits_connection = null
    ) {
        $this->registry           = $registry;
        $this->request_sender     = $request_sender;
        $this->runs               = $runs ?? new ActionRunRepository();
        $this->activity_logs      = $activity_logs ?? new ActivityLogRepository();
        $this->credits_connection = $credits_connection ?? new AiCreditsConnection();
        $this->credit_gateway     = $credit_gateway ?? new AiCreditGatewayClient( $this->credits_connection );
    }

    /**
     * Stages 1-4: validates input, builds and safety-checks the prompt,
     * sends it through the AI request sender, validates and
     * previews the result. Persists the outcome as a `pending_approval`
     * row — nothing about the site's actual content changes yet.
     *
     * Also gates Settings → Automation → Approval Settings' "Ask before
     * applying AI changes" — after persisting the pending_approval row,
     * immediately self-approve()s it (method 'auto_unattended') when the
     * site's `ai_change_approval_mode` setting says this proposal's own
     * risk level doesn't need a human to look at it first (see
     * should_auto_approve()'s own docblock). This is the one general gate
     * every propose() call goes through — manual one-click fixes and
     * automation-triggered ones alike — independent of vulopilot-pro's own
     * Automations\Actions\RunAiActionAction, whose narrower 'auto_fix'
     * automation-mode gate (automation runs only, method 'auto_automation')
     * still layers on top of this one; that class checks this method's own
     * `auto_approved` return value first so the two auto-approval paths
     * never race to approve() the same run twice.
     *
     * @param string               $action_id  e.g. 'generate-alt'.
     * @param array<string, mixed> $raw_input Raw input (REST params, or built from a Recommendation).
     * @return array{run_id: int, preview: array<string, mixed>, auto_approved: bool, approval_method: string|null}
     *
     * @throws \InvalidArgumentException If $action_id isn't registered.
     * @throws \RuntimeException         If no AI connection is configured.
     */
    public function propose( string $action_id, array $raw_input ): array {
        $action = $this->get_action_or_fail( $action_id );

        $input    = $action->validate_input( $raw_input );
        $response = $this->send_prompt_or_credits( $action_id, $action, $input );

        $output = $action->parse_response( $response );
        $action->validate_output( $output, $input );

        $preview    = $action->build_preview( $output, $input );
        $risk_level = $action->get_risk_level();

        $run_id = $this->runs->insert(
            array(
                'action_id'    => $action_id,
                'status'       => 'pending_approval',
                'risk_level'   => $risk_level,
                'input'        => wp_json_encode( $input ),
                'output'       => wp_json_encode( $output ),
                'preview'      => wp_json_encode( $preview->to_array() ),
                'requested_by' => get_current_user_id(),
            )
        );

        $this->log( $run_id, 'ai_action.proposed', Severity::INFO, sprintf( '%s proposed: %s', $action->get_label(), $preview->get_summary() ) );

        $auto_approved   = false;
        $approval_method = null;

        if ( $this->should_auto_approve( $risk_level ) ) {
            try {
                $this->approve( $run_id, 'auto_unattended' );
                $auto_approved   = true;
                $approval_method = 'auto_unattended';
            } catch ( \Throwable $exception ) {
                // Leave it pending_approval — a human can still review and
                // approve it manually; an auto-approve failure shouldn't
                // lose the proposal itself.
            }
        }

        return array(
            'run_id'          => $run_id,
            'preview'         => $preview->to_array(),
            'auto_approved'   => $auto_approved,
            'approval_method' => $approval_method,
        );
    }

    /**
     * Chooses between the two ways this codebase can now actually get an
     * AI completion for a proposed action: this site's own configured
     * BYOK path — an Organization's own key, or (if allowed) a Customer
     * backup key, resolved entirely server-side and proxied through
     * VuloCloud (AI\AiRequestSender, contexts/vulopilot/ai-byok on the
     * VuloCloud side) — or VuloCloud's hosted AI Gateway spending real AI
     * Credits (architecture plan §C).
     *
     * Unlike the earlier, pre-BYOK-proxy version of this method, "is BYOK
     * configured" can no longer be answered locally before making a call
     * — that state lives in VuloCloud now (an Organization's/Customer's
     * own credential store), not in a local option this site can read for
     * free. So this always ATTEMPTS the BYOK path first (via
     * AiRequestSender, same as before) and only decides whether to fall
     * through to credits by reacting to a real AiByokNotConfiguredException
     * — a second, separate "is it configured?" pre-check would just be a
     * redundant network round trip for the exact same answer the real
     * attempt already gives, and would risk a stale answer if a key was
     * just added/removed moments earlier. Falling through only ever
     * happens for the action ids in CREDIT_FEATURE_MAP (VuloPilot
     * brief §9's structured-request contract only has a real feature-
     * catalog entry for those today); every other action id's
     * "not configured" is a final, honest error, exactly as it always was.
     *
     * @param string                             $action_id Real, registered action id.
     * @param \VuloPilot\Contracts\AI\AIActionInterface $action    Same instance get_action_or_fail() already resolved.
     * @param array                              $input     validate_input()'s own normalized output.
     * @return \VuloPilot\ValueObjects\AIResponse
     *
     * @throws InsufficientCreditsException If the credits fallback was used and VuloCloud reports an empty balance.
     * @throws \RuntimeException            If no AI is available at all — neither a BYOK key nor (for an eligible action) AI Credits.
     */
    private function send_prompt_or_credits( string $action_id, $action, array $input ): AIResponse {
        try {
            return $this->request_sender->send( $action->build_prompt( $input ), null, 'ai_action' );
        } catch ( AiByokNotConfiguredException $exception ) {
            if ( ! isset( self::CREDIT_FEATURE_MAP[ $action_id ] ) || ! $this->credits_connection->is_connected() ) {
                throw new \RuntimeException( __( 'No AI connection is configured. Add a key in your VuloCloud account, or ask your agency to.', 'vulopilot' ) );
            }
        }

        list( $feature_id, $credit_action ) = self::CREDIT_FEATURE_MAP[ $action_id ];
        $context = $this->build_credit_context( $action_id, $input );

        $result = $this->credit_gateway->execute( $feature_id, $credit_action, $context );

        if ( $result instanceof \WP_Error ) {
            throw new \RuntimeException( $result->get_error_message() );
        }

        if ( empty( $result['success'] ) ) {
            throw new InsufficientCreditsException(
                __( 'You’ve used all your AI Credits.', 'vulopilot' ),
                (int) ( $result['credits_remaining'] ?? 0 ),
                (bool) ( $result['can_buy_credits'] ?? false ),
                (bool) ( $result['can_upgrade'] ?? false )
            );
        }

        // provider/model/token counts are deliberately generic —
        // VuloCloud's feature catalog owns which real provider/model
        // actually answered (VuloPilot brief §9), and its own
        // /plugin/ai/execute response never exposes that to this site
        // (§19) — parse_response()/validate_output()/build_preview() below
        // only ever read get_content() regardless of these other fields.
        return new AIResponse( $result['response'], 'vulocloud', 'hosted', 0, 0, 'stop' );
    }

    /**
     * The structured `context` payload for one of CREDIT_FEATURE_MAP's
     * three action ids — field names translated from each Action class's
     * own validate_input() output into the exact names VuloCloud's
     * matching feature-catalog entry expects (ai-feature-catalog.ts on the
     * vulocloud side) since they don't always match 1:1 (e.g.
     * WriteMetaTitleAction's own `previous_title` vs. the catalog's
     * `title`).
     *
     * @param string $action_id Real, registered action id — always one of CREDIT_FEATURE_MAP's own keys.
     * @param array  $input     validate_input()'s own normalized output for that same action.
     * @return array<string, mixed>
     */
    private function build_credit_context( string $action_id, array $input ): array {
        switch ( $action_id ) {
            case 'write-meta-title':
                return array(
                    'title'   => $input['previous_title'],
                    'content' => $input['content'],
                );
            case 'write-meta-description':
                return array(
                    'title'   => $input['title'],
                    'content' => $input['content'],
                );
            case 'improve-readability':
                return array(
                    'content' => $input['original_content'],
                    'goal'    => 'improve readability',
                );
            case 'write-post-content':
                return array(
                    'title'   => $input['post_title'],
                    'brief'   => $input['brief'],
                    'content' => $input['previous_content'],
                );
            case 'generate-blog':
                return array(
                    'topic'      => $input['topic'],
                    'word_count' => $input['word_count'],
                    'tone'       => $input['tone'],
                );
            case 'differentiate-duplicate-title':
                return array(
                    'title'         => $input['previous_title'],
                    'content'       => $input['content'],
                    'sibling_count' => count( $input['sibling_titles'] ),
                );
            default:
                return array();
        }
    }

    /**
     * `ai_change_approval_mode` (Utill::VULOPILOT_SETTINGS_DEFAULTS, free
     * plugin, meaningfully acted on right here — unlike automation_mode/
     * auto_fix_max_impact, which are only ever read by vulopilot-pro):
     *  - 'always'      — never auto-approves; today's existing, unchanged
     *                     behavior (every propose() waits for a human).
     *  - 'risk_based'  — auto-approves only Impact::LOW proposals; anything
     *                     Impact::MEDIUM/HIGH still waits for a human.
     *  - 'never'       — auto-approves every proposal regardless of risk.
     *                     Pro-gated the same way automation_mode's own
     *                     'auto_fix' option is (InputRenderer's own
     *                     `proSetting` lock icon) — but real-enforced here
     *                     too via Utill::is_khali_dabba() rather than only
     *                     trusting the stored option value, since nothing
     *                     structurally prevents a free install from having
     *                     'never' already saved (e.g. a lapsed license).
     *
     * @param string $risk_level One of Impact::LOW/MEDIUM/HIGH — the
     *                           proposal's own AIActionInterface::get_risk_level().
     * @return bool
     */
    private function should_auto_approve( string $risk_level ): bool {
        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );
        $mode     = $settings['ai_change_approval_mode'] ?? 'always';

        if ( 'never' === $mode ) {
            return VuloPilot()->util->is_khali_dabba();
        }

        if ( 'risk_based' === $mode ) {
            return Impact::LOW === $risk_level;
        }

        return false;
    }

    /**
     * Stage 6: applies a previously proposed, still-pending action.
     *
     * @param int    $run_id A propose()-returned run_id.
     * @param string $method 'manual' (a human clicked Approve — the only way
     *                       this was ever called before Automate Work's
     *                       Auto-fix mode and Approval Settings' risk-based/
     *                       "Do not ask" modes), 'auto_automation'
     *                       (vulopilot-pro's RunAiActionAction calling this
     *                       immediately after propose(), gated on Automate
     *                       Work's own automation_mode setting), or
     *                       'auto_unattended' (propose() calling this on
     *                       itself via should_auto_approve(), gated on
     *                       Approval Settings' ai_change_approval_mode
     *                       setting) — the latter two both mean no human
     *                       was involved at all: `approved_by` is left null
     *                       rather than attributing it to whichever user id
     *                       happens to own the request context, and
     *                       `approval_method` is persisted with its exact
     *                       value so History can honestly say *which* of
     *                       the two unattended paths actually applied the
     *                       change, instead of a single generic "auto"
     *                       that would imply automation even when nothing
     *                       automated was involved.
     * @return array<string, mixed> ActionExecutionResult::to_array().
     *
     * @throws \RuntimeException If $run_id doesn't exist or isn't pending approval.
     */
    public function approve( int $run_id, string $method = 'manual' ): array {
        $run = $this->get_pending_run_or_fail( $run_id );

        $action = $this->get_action_or_fail( $run['action_id'] );
        $input  = json_decode( (string) $run['input'], true ) ?? array();
        $output = json_decode( (string) $run['output'], true ) ?? array();

        $result        = $action->execute( $output, $input );
        $is_unattended = 0 === strpos( $method, 'auto' );

        $this->runs->update(
            $run_id,
            array(
                'status'          => $result->is_success() ? 'executed' : 'failed',
                'object_type'     => $result->get_object_type(),
                'object_ref'      => $result->get_object_ref(),
                'snapshot'        => wp_json_encode( $result->get_snapshot() ),
                'error_message'   => $result->get_message(),
                'approved_by'     => $is_unattended ? null : get_current_user_id(),
                'approval_method' => $method,
                'approved_at'     => current_time( 'mysql', true ),
                'executed_at'     => $result->is_success() ? current_time( 'mysql', true ) : null,
            )
        );

        $this->log(
            $run_id,
            $result->is_success() ? 'ai_action.executed' : 'ai_action.failed',
            $result->is_success() ? Severity::INFO : Severity::HIGH,
            $result->is_success()
                ? sprintf(
                    'auto_automation' === $method
                        ? '%s auto-approved and executed by automation.'
                        : ( 'auto_unattended' === $method
                            ? '%s applied automatically — no approval required by Approval Settings.'
                            : '%s executed.' ),
                    $action->get_label()
                )
                : sprintf( '%s failed: %s', $action->get_label(), $result->get_message() )
        );

        return $result->to_array();
    }

    /**
     * Stage 5's negative outcome — declines a pending action without
     * ever calling execute().
     *
     * @param int $run_id A propose()-returned run_id.
     * @return void
     *
     * @throws \RuntimeException If $run_id doesn't exist or isn't pending approval.
     */
    public function reject( int $run_id ): void {
        $run = $this->get_pending_run_or_fail( $run_id );

        $this->runs->update( $run_id, array( 'status' => 'rejected' ) );

        $this->log( $run_id, 'ai_action.rejected', Severity::INFO, sprintf( 'Action run #%d rejected.', $run_id ) );
    }

    /**
     * Stage 7: reverts a previously executed action.
     *
     * @param int $run_id A propose()-returned, subsequently approve()'d run_id.
     * @return void
     *
     * @throws \RuntimeException If $run_id doesn't exist or wasn't successfully executed.
     */
    public function rollback( int $run_id ): void {
        $run = $this->runs->find( $run_id );

        if ( ! $run || 'executed' !== $run['status'] ) {
            throw new \RuntimeException( __( 'This action run cannot be rolled back.', 'vulopilot' ) );
        }

        $action = $this->get_action_or_fail( $run['action_id'] );

        $action->rollback( json_decode( (string) $run['snapshot'], true ) ?? array() );

        $this->runs->update(
            $run_id,
            array(
                'status'         => 'rolled_back',
                'rolled_back_at' => current_time( 'mysql', true ),
            )
        );

        $this->log( $run_id, 'ai_action.rolled_back', Severity::MEDIUM, sprintf( '%s rolled back.', $action->get_label() ) );
    }

    /**
     * @param string $action_id Action id to resolve.
     * @return \VuloPilot\Contracts\AI\AIActionInterface
     *
     * @throws \InvalidArgumentException If unregistered.
     */
    private function get_action_or_fail( string $action_id ) {
        $action = $this->registry->get_action( $action_id );

        if ( ! $action ) {
            throw new \InvalidArgumentException( sprintf( 'No AI action registered for "%s".', $action_id ) );
        }

        return $action;
    }

    /**
     * @param int $run_id Run id to fetch.
     * @return array<string, mixed>
     *
     * @throws \RuntimeException If missing or not pending approval.
     */
    private function get_pending_run_or_fail( int $run_id ): array {
        $run = $this->runs->find( $run_id );

        if ( ! $run || 'pending_approval' !== $run['status'] ) {
            throw new \RuntimeException( __( 'This action run is not awaiting approval.', 'vulopilot' ) );
        }

        return $run;
    }

    /**
     * @param int    $run_id   Run id this event is about.
     * @param string $event_type e.g. 'ai_action.executed'.
     * @param string $severity One of Severity's constants.
     * @param string $message  Human-readable description.
     * @return void
     */
    private function log( int $run_id, string $event_type, string $severity, string $message ): void {
        $this->activity_logs->log( $event_type, $message, $severity, 'user', 'ai_action_run', (string) $run_id );
    }
}
