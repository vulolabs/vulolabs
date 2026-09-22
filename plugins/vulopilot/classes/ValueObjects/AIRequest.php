<?php
/**
 * AIRequest file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\ValueObjects;

/**
 * A chat-style request sent to VuloCloud through AI\AiRequestSender.
 *
 * @class       AIRequest class
 * @version     1.0.0
 * @author      VuloLabs
 */
final class AIRequest {

    /**
     * @var string
     */
    private string $model;

    /**
     * @var array<int, array{role: string, content: string}>
     */
    private array $messages;

    /**
     * @var float|null
     */
    private ?float $temperature;

    /**
     * @var int|null
     */
    private ?int $max_tokens;

    /**
     * A single inline image for the current turn, `{mime_type, data}`
     * (`data` base64-encoded) — additive and optional so every existing
     * caller building a text-only request is unaffected. The VuloCloud
     * gateway's wire contract carries text only, so nothing reads this today;
     * it stays on the request for when that changes.
     *
     * @var array{mime_type: string, data: string}|null
     */
    private ?array $image;

    /**
     * Which real feature/endpoint triggered this call — e.g. 'copilot_chat',
     * 'content_assistant_chat', 'ai_action', 'geo_analysis',
     * 'content_intelligence'. Purely an audit-trail tag: read only by
     * AI\AiRequestSender, written to `vulopilot_ai_history.surface`, so
     * AI Copilot History's "Conversations" filter (and any future
     * per-feature usage breakdown) can tell a real chat turn apart from
     * every other feature that shares the same sender.
     * Null for any caller that doesn't pass one — no behavior change.
     *
     * @var string|null
     */
    private ?string $surface;

    /**
     * @param string                                      $model       Model id to use.
     * @param array                                       $messages    array<int, array{role: string, content: string}>.
     * @param float|null                                  $temperature Optional; the gateway applies its own default when null.
     * @param int|null                                    $max_tokens  Optional; the gateway applies its own default when null.
     * @param array{mime_type: string, data: string}|null $image   Optional inline image for the current turn.
     * @param string|null                                 $surface Optional real feature label — see get_surface()'s own docblock.
     */
    public function __construct(
        string $model,
        array $messages,
        ?float $temperature = null,
        ?int $max_tokens = null,
        ?array $image = null,
        ?string $surface = null
    ) {
        $this->model       = $model;
        $this->messages    = $messages;
        $this->temperature = $temperature;
        $this->max_tokens  = $max_tokens;
        $this->image       = $image;
        $this->surface     = $surface;
    }

    /**
     * @return string
     */
    public function get_model(): string {
        return $this->model;
    }

    /**
     * @return array<int, array{role: string, content: string}>
     */
    public function get_messages(): array {
        return $this->messages;
    }

    /**
     * @return float|null
     */
    public function get_temperature(): ?float {
        return $this->temperature;
    }

    /**
     * @return int|null
     */
    public function get_max_tokens(): ?int {
        return $this->max_tokens;
    }

    /**
     * @return array{mime_type: string, data: string}|null
     */
    public function get_image(): ?array {
        return $this->image;
    }

    /**
     * @return string|null
     */
    public function get_surface(): ?string {
        return $this->surface;
    }
}
