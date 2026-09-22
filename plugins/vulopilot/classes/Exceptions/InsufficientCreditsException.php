<?php
/**
 * InsufficientCreditsException file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Exceptions;

/**
 * Thrown by AiCopilot\ActionRunner::propose() when a credits-metered
 * action's VuloCloud AI Gateway call comes back with
 * `{success:false, error:'insufficient_credits'}` (VuloPilot brief §15) —
 * a real, structured, user-actionable outcome, not a generic provider
 * failure (AiRequestException), so it gets its own catch clause wherever
 * propose() is called (RestAPI\Controllers\AiActionRuns::create_item()) to
 * carry `credits_remaining`/`can_buy_credits`/`can_upgrade` through to the
 * REST response's own `data`, matching the exact shape the React side's
 * exhausted-credits UI needs.
 *
 * @class       InsufficientCreditsException class
 * @version     1.0.0
 * @author      VuloLabs
 */
class InsufficientCreditsException extends \Exception {

    private int $credits_remaining;
    private bool $can_buy_credits;
    private bool $can_upgrade;

    public function __construct( string $message, int $credits_remaining, bool $can_buy_credits, bool $can_upgrade ) {
        parent::__construct( $message );

        $this->credits_remaining = $credits_remaining;
        $this->can_buy_credits   = $can_buy_credits;
        $this->can_upgrade       = $can_upgrade;
    }

    public function get_credits_remaining(): int {
        return $this->credits_remaining;
    }

    public function get_can_buy_credits(): bool {
        return $this->can_buy_credits;
    }

    public function get_can_upgrade(): bool {
        return $this->can_upgrade;
    }
}
