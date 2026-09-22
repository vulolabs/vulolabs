<?php
/**
 * AiRequestSender class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\AI;

use VuloPilot\Exceptions\AiByokNotConfiguredException;
use VuloPilot\Exceptions\GatewayRequestException;
use VuloPilot\Exceptions\RateLimitExceededException;
use VuloPilot\Exceptions\TransientGatewayException;
use VuloPilot\Repositories\AiHistoryRepository;
use VuloPilot\Services\AiByokGatewayClient;
use VuloPilot\Services\AiCreditsConnection;
use VuloPilot\Utill;
use VuloPilot\ValueObjects\AIRequest;
use VuloPilot\ValueObjects\AIResponse;

defined( 'ABSPATH' ) || exit;

/**
 * The one path every real AI call in this plugin goes through: safety-validate
 * the prompt, make sure this site is connected to VuloCloud, spend one request
 * from the per-minute budget, send `{feature, prompt, site_tone}` to the
 * VuloCloud gateway (retrying transient failures), record the attempt in
 * `vulopilot_ai_history`, then sanitize the response.
 *
 * VuloCloud is the only place an AI answer comes from — it holds every key and
 * decides which vendor serves a call — so there is nothing to pick between and
 * no registry/adapter/fallback layer. The budget, retry and history steps that
 * used to live in decorators around an adapter are plain private steps here,
 * in the same order: budget check on every attempt, retries inside that
 * budget, and one history row per call (failures included, so the audit trail
 * covers what was tried, not only what worked).
 *
 * @class       AiRequestSender class
 * @version     1.0.0
 * @author      VuloLabs
 */
class AiRequestSender {

    /**
     * Requests this site may send per minute (a local, pre-emptive guard
     * against burning through AI credits too fast).
     */
    private const MAX_REQUESTS_PER_MINUTE = 20;

    /**
     * Total attempts including the first; the delay doubles after each failure.
     */
    private const MAX_ATTEMPTS = 3;

    private const BASE_RETRY_DELAY_MS = 500;

    /**
     * `response_excerpt`/`prompt_excerpt` are an audit trail, not a cache —
     * bounds how much of a real prompt or reply gets persisted per call.
     */
    private const EXCERPT_MAX_LENGTH = 300;

    /**
     * USD per 1,000 tokens, [prompt, completion]. An estimate for the
     * dashboard, not a billing-grade figure.
     */
    private const COST_PER_1K_TOKENS = array( 0.005, 0.015 );

    private AISafetyValidator $safety_validator;
    private AiByokGatewayClient $gateway;
    private AiHistoryRepository $history;
    private AiCreditsConnection $credits_connection;

    /**
     * @param AISafetyValidator        $safety_validator   Validator both the prompt and response pass through.
     * @param AiByokGatewayClient|null $gateway            Defaults to a new instance (injectable for tests).
     * @param AiHistoryRepository|null $history            Defaults to a new instance (injectable for tests).
     * @param AiCreditsConnection|null $credits_connection Defaults to a new instance (injectable for tests).
     */
    public function __construct(
        AISafetyValidator $safety_validator,
        ?AiByokGatewayClient $gateway = null,
        ?AiHistoryRepository $history = null,
        ?AiCreditsConnection $credits_connection = null
    ) {
        $this->safety_validator   = $safety_validator;
        $this->credits_connection = $credits_connection ?? new AiCreditsConnection();
        $this->gateway            = $gateway ?? new AiByokGatewayClient( $this->credits_connection );
        $this->history            = $history ?? new AiHistoryRepository();
    }

    /**
     * @param array<int, array{role: string, content: string}> $messages Chat-style prompt messages.
     * @param array{mime_type: string, data: string}|null      $image    Optional inline image for the current turn. The VuloCloud gateway's wire contract doesn't carry one today, so it is recorded on the request but never sent.
     * @param string|null                                      $surface  Optional real feature label recorded to `vulopilot_ai_history.surface` — see AIRequest::get_surface()'s own docblock.
     * @return AIResponse
     *
     * @throws \VuloPilot\Exceptions\UnsafePromptException If the prompt fails safety validation.
     * @throws \RuntimeException                            If this site isn't connected to VuloCloud.
     * @throws RateLimitExceededException                   If this minute's request budget is already spent.
     * @throws AiByokNotConfiguredException                 If VuloCloud has no AI key that resolves for this site.
     * @throws GatewayRequestException                      If the VuloCloud gateway rejects or fails the request.
     */
    public function send( array $messages, ?array $image = null, ?string $surface = null ): AIResponse {
        $this->safety_validator->validate_prompt( $messages );

        if ( ! $this->credits_connection->is_connected() ) {
            throw new \RuntimeException( __( 'No AI connection is configured.', 'vulopilot' ) );
        }

        $request = new AIRequest( '', $messages, null, null, $image, $surface );

        try {
            $response = $this->send_with_retries( $request );
            $this->record_success( $request, $response );
        } catch ( \Throwable $exception ) {
            $this->record_failure( $request );
            throw $exception;
        }

        return $this->safety_validator->sanitize_response( $response );
    }

    /**
     * Only a TransientGatewayException is retried — a GatewayRequestException
     * (malformed request), AiByokNotConfiguredException or
     * RateLimitExceededException passes straight through, per those
     * exceptions' own docblocks. Every attempt spends from the budget.
     *
     * @param AIRequest $request Request to send.
     * @return AIResponse
     *
     * @throws TransientGatewayException If every attempt is exhausted.
     */
    private function send_with_retries( AIRequest $request ): AIResponse {
        $attempts_made = 0;

        while ( true ) {
            try {
                $this->enforce_rate_limit();

                return $this->call_gateway( $request );
            } catch ( TransientGatewayException $exception ) {
                ++$attempts_made;

                if ( $attempts_made >= self::MAX_ATTEMPTS ) {
                    throw $exception;
                }

                usleep( self::BASE_RETRY_DELAY_MS * 1000 * ( 2 ** ( $attempts_made - 1 ) ) );
            }
        }
    }

    /**
     * A WP transient as a lightweight per-minute counter — the existing WP
     * mechanism for "a value that should expire on its own", not a new cache.
     *
     * @return void
     *
     * @throws RateLimitExceededException If this minute's budget is already spent.
     */
    private function enforce_rate_limit(): void {
        $transient_key = 'vulopilot_ai_rate_vulocloud_' . floor( time() / MINUTE_IN_SECONDS );
        $count         = (int) get_transient( $transient_key );

        if ( $count >= self::MAX_REQUESTS_PER_MINUTE ) {
            throw new RateLimitExceededException(
                sprintf(
                    /* translators: %d: requests-per-minute limit. */
                    __( 'AI rate limit reached (%d requests/minute).', 'vulopilot' ),
                    self::MAX_REQUESTS_PER_MINUTE
                )
            );
        }

        set_transient( $transient_key, $count + 1, MINUTE_IN_SECONDS );
    }

    /**
     * Sends `{feature, prompt, site_tone}` to VuloCloud and returns finished
     * text. The prompt is the request's messages flattened in order — VuloCloud
     * alone turns it back into whatever message shape the serving vendor
     * expects. The response's provider/model/token fields are deliberately
     * generic: this site never learns which vendor or key answered.
     *
     * @param AIRequest $request Request to send.
     * @return AIResponse
     *
     * @throws AiByokNotConfiguredException If VuloCloud has no AI key that resolves for this site.
     * @throws GatewayRequestException      For any other gateway failure.
     */
    private function call_gateway( AIRequest $request ): AIResponse {
        // Lives in the flat `vulopilot_settings` option (General tab's own
        // "Site tone" field, autosaved) — see Utill::VULOPILOT_SETTINGS_DEFAULTS.
        $settings = wp_parse_args( (array) get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

        $result = $this->gateway->execute(
            $request->get_surface() ?? 'ai_action',
            $this->flatten_messages( $request->get_messages() ),
            array(),
            (string) $settings['site_tone']
        );

        if ( is_wp_error( $result ) ) {
            if ( 'vulopilot_ai_byok_not_configured' === $result->get_error_code() ) {
                throw new AiByokNotConfiguredException( $result->get_error_message() );
            }

            throw new GatewayRequestException( $result->get_error_message() );
        }

        return new AIResponse( $result['response'], 'vulocloud', 'hosted', 0, 0, 'stop' );
    }

    /**
     * @param array<int, array{role: string, content: string}> $messages Chat-style prompt messages.
     * @return string
     */
    private function flatten_messages( array $messages ): string {
        return implode(
            "\n\n",
            array_filter( array_map( static fn( $message ) => (string) ( $message['content'] ?? '' ), $messages ) )
        );
    }

    /**
     * @param AIRequest  $request  Originating request.
     * @param AIResponse $response Completed response.
     * @return void
     */
    private function record_success( AIRequest $request, AIResponse $response ): void {
        $this->history->insert(
            array(
                'provider'          => $response->get_provider(),
                'model'             => $response->get_model(),
                'surface'           => $request->get_surface(),
                'prompt_tokens'     => $response->get_prompt_tokens(),
                'completion_tokens' => $response->get_completion_tokens(),
                'cost_estimate'     => $this->estimate_cost( $response ),
                'status'            => 'success',
                'prompt_excerpt'    => $this->build_prompt_excerpt( $request ),
                'response_excerpt'  => $this->build_excerpt( $response->get_content() ),
                'requested_by'      => get_current_user_id(),
            )
        );
    }

    /**
     * @param AIRequest $request Originating request.
     * @return void
     */
    private function record_failure( AIRequest $request ): void {
        $this->history->insert(
            array(
                'provider'          => 'vulocloud',
                'surface'           => $request->get_surface(),
                'prompt_tokens'     => 0,
                'completion_tokens' => 0,
                'cost_estimate'     => 0,
                'status'            => 'failure',
                'prompt_excerpt'    => $this->build_prompt_excerpt( $request ),
                'requested_by'      => get_current_user_id(),
            )
        );
    }

    /**
     * Truncates real text down to an audit-trail-sized excerpt. `mb_substr`
     * since real AI replies routinely contain multi-byte characters.
     *
     * @param string $content Full text.
     * @return string
     */
    private function build_excerpt( string $content ): string {
        $trimmed = trim( $content );

        if ( mb_strlen( $trimmed ) <= self::EXCERPT_MAX_LENGTH ) {
            return $trimmed;
        }

        return mb_substr( $trimmed, 0, self::EXCERPT_MAX_LENGTH ) . '…';
    }

    /**
     * The real, human-typed question this call is answering — the last
     * `role: 'user'` message in the request (never the system prompt, which is
     * always message[0] and is orchestration instructions, not anything a
     * human asked). History's detail panel ("You asked") reads this.
     *
     * @param AIRequest $request Originating request.
     * @return string|null Null if the request genuinely has no user message.
     */
    private function build_prompt_excerpt( AIRequest $request ): ?string {
        $last_user_message = null;

        foreach ( $request->get_messages() as $message ) {
            if ( 'user' === ( $message['role'] ?? '' ) ) {
                $last_user_message = (string) ( $message['content'] ?? '' );
            }
        }

        return null === $last_user_message ? null : $this->build_excerpt( $last_user_message );
    }

    /**
     * @param AIResponse $response Completed response.
     * @return float USD.
     */
    private function estimate_cost( AIResponse $response ): float {
        [$prompt_rate, $completion_rate] = self::COST_PER_1K_TOKENS;

        return round(
            ( $response->get_prompt_tokens() / 1000 * $prompt_rate )
            + ( $response->get_completion_tokens() / 1000 * $completion_rate ),
            4
        );
    }
}
