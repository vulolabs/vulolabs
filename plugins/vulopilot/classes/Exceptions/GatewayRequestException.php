<?php
/**
 * GatewayRequestException file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Exceptions;

/**
 * A non-retryable gateway failure (a malformed request, or one VuloCloud
 * rejects outright). Never retried by AI\AiRequestSender; bubbles straight
 * through it.
 *
 * @class       GatewayRequestException class
 * @version     1.0.0
 * @author      VuloLabs
 */
class GatewayRequestException extends AiRequestException {
}
