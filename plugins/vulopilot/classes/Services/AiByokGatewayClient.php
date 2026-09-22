<?php
/**
 * AiByokGatewayClient class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

defined( 'ABSPATH' ) || exit;

/**
 * The one HTTP call the BYOK proxy path makes — `POST /plugin/ai/byok-execute`
 * against VuloCloud's own `contexts/vulopilot/ai-byok`/`ai-gateway`: sends
 * `{feature, prompt, context, site_tone}`, deliberately never a `provider`
 * or `model` field — this site never names one, never learns which
 * vendor/key actually answered, and never holds an API key at all.
 * VuloCloud alone resolves whichever Organization or (if allowed) Customer
 * backup credential should serve the request.
 *
 * Deliberately its own class, separate from AiCreditGatewayClient (which
 * calls the credits-metered `/plugin/ai/execute` with a structured
 * `{featureId, action, context}` shape VuloCloud's own feature catalog
 * interprets) — genuinely different wire contracts for two different
 * funding sources of the same underlying Gateway.
 *
 * @class       AiByokGatewayClient class
 * @version     1.0.0
 * @author      VuloLabs
 */
class AiByokGatewayClient {

    private AiCreditsConnection $credits;

    public function __construct( ?AiCreditsConnection $credits = null ) {
        $this->credits = $credits ?? new AiCreditsConnection();
    }

    /**
     * @param string               $feature   Free-text action identifier (e.g. 'seo_analysis') — for VuloCloud's own usage-log categorization only.
     * @param string               $prompt    This site's own already-built prompt text — VuloCloud does not construct it.
     * @param array<string, mixed> $context   Optional structured metadata.
     * @param string               $site_tone The manually-set `vulopilot_site_tone` option value, or ''.
     * @return array{success: true, request_id: string, response: string}|\WP_Error {
     *   A \WP_Error for connectivity/configuration failure OR VuloCloud
     *   reporting `AI_BYOK_NOT_CONFIGURED` (code
     *   'vulopilot_ai_byok_not_configured') — the caller
     *   (AI\AiRequestSender) maps that one specific code to
     *   AiByokNotConfiguredException; every other \WP_Error becomes a
     *   generic GatewayRequestException.
     * }
     */
    public function execute( string $feature, string $prompt, array $context, string $site_tone ) {
        if ( '' === trim( VULOPILOT_VULOCLOUD_URL ) ) {
            return new \WP_Error( 'vulopilot_ai_byok_not_configured', __( 'VuloCloud isn’t configured for this build yet.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        $credential = $this->credits->get_site_credential();

        if ( ! $credential ) {
            return new \WP_Error( 'vulopilot_ai_byok_not_connected', __( 'This site is not connected to VuloCloud.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        $body = array(
            'siteId'  => $credential['site_id'],
            'secret'  => $credential['secret'],
            'feature' => $feature,
            'prompt'  => $prompt,
        );

        if ( ! empty( $context ) ) {
            $body['context'] = $context;
        }

        if ( '' !== $site_tone ) {
            $body['site_tone'] = $site_tone;
        }

        $response = wp_remote_post(
            untrailingslashit( VULOPILOT_VULOCLOUD_URL ) . '/plugin/ai/byok-execute',
            array(
                // Real provider latency lives on VuloCloud's side of this
                // call — same generous timeout AiCreditGatewayClient uses,
                // for the same reason (a slow completion shouldn't time
                // out here before VuloCloud's own response comes back).
                'timeout' => 60,
                'headers' => array( 'Content-Type' => 'application/json' ),
                'body'    => wp_json_encode( $body ),
            )
        );

        if ( is_wp_error( $response ) ) {
            return new \WP_Error(
                'vulopilot_ai_byok_unreachable',
                sprintf(
                    /* translators: %s: underlying error message. */
                    __( 'Could not reach VuloCloud: %s', 'vulopilot' ),
                    $response->get_error_message()
                ),
                array( 'status' => 503 )
            );
        }

        $status = (int) wp_remote_retrieve_response_code( $response );
        $decoded = json_decode( (string) wp_remote_retrieve_body( $response ), true );

        if ( ! is_array( $decoded ) ) {
            return new \WP_Error( 'vulopilot_ai_byok_unparseable_response', __( 'VuloCloud returned an unexpected response.', 'vulopilot' ), array( 'status' => 502 ) );
        }

        if ( $status < 200 || $status >= 300 ) {
            // 'AI_BYOK_NOT_CONFIGURED' is the one code AiCopilot\ActionRunner
            // specifically recognizes to decide whether to fall through to
            // AI Credits (see that class's own docblock) — passed through
            // verbatim via the \WP_Error code rather than translated to a
            // generic message here, unlike every other DomainError (never
            // expose VuloCloud's internal error text to the end user,
            // VuloPilot brief §19/§26).
            if ( 'AI_BYOK_NOT_CONFIGURED' === ( $decoded['error'] ?? '' ) ) {
                return new \WP_Error( 'vulopilot_ai_byok_not_configured', __( 'No AI connection is configured for this site.', 'vulopilot' ), array( 'status' => $status ) );
            }

            return new \WP_Error(
                'vulopilot_ai_byok_gateway_error',
                __( 'VuloCloud could not process this AI request right now.', 'vulopilot' ),
                array( 'status' => $status )
            );
        }

        return array(
            'success'    => true,
            'request_id' => (string) ( $decoded['requestId'] ?? '' ),
            'response'   => (string) ( $decoded['response'] ?? '' ),
        );
    }

    /**
     * `POST /plugin/ai/byok-status` — a cheap boolean-only check, no
     * prompt/key material involved. Used only by the Settings UI's status
     * display (VuloCloudAiConnectionPanel.tsx), never by ActionRunner's own
     * per-request decision (which always attempts execute() directly and
     * reacts to a real AI_BYOK_NOT_CONFIGURED response instead — see that
     * class's own docblock on why a separate pre-check there would just
     * be a second, redundant round trip).
     *
     * Returns a real `\WP_Error` only for an actual connectivity failure
     * — `connected`/`configured` are deliberately two separate booleans,
     * not one collapsed into the other, because "this site has no
     * site_id/secret at all" and "this site has one, but VuloCloud says
     * no key resolves for it" are genuinely different states the caller
     * (RestAPI\Controllers\VuloCloudAiConnection::get_items()) needs to tell apart
     * to decide whether to show a Connect form or a "configure a key"
     * notice. An earlier version of this method returned plain `false`
     * for "no credential" — indistinguishable, to a caller only checking
     * `is_wp_error()`, from "connected but not configured" (also
     * ultimately a falsy `configured` value), which silently always read
     * as "connected" once that check ran on a real WP_Error only.
     *
     * @return array{connected: bool, configured: bool}|\WP_Error
     */
    public function status() {
        $credential = $this->credits->get_site_credential();

        if ( ! $credential ) {
            return array(
                'connected'  => false,
                'configured' => false,
            );
        }

        $response = wp_remote_post(
            untrailingslashit( VULOPILOT_VULOCLOUD_URL ) . '/plugin/ai/byok-status',
            array(
                'timeout' => 15,
                'headers' => array( 'Content-Type' => 'application/json' ),
                'body'    => wp_json_encode(
                    array(
                        'siteId' => $credential['site_id'],
                        'secret' => $credential['secret'],
                    )
                ),
            )
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $decoded = json_decode( (string) wp_remote_retrieve_body( $response ), true );

        return array(
            'connected'  => true,
            'configured' => is_array( $decoded ) && ! empty( $decoded['configured'] ),
        );
    }
}
