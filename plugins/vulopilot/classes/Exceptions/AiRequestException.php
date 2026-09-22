<?php
/**
 * AiRequestException file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Exceptions;

/**
 * Common parent of every failure of an AI request to VuloCloud
 * (GatewayRequestException, RateLimitExceededException,
 * TransientGatewayException, AiByokNotConfiguredException) — the type REST
 * controllers catch to turn any of them into a 502.
 *
 * @class       AiRequestException class
 * @version     1.0.0
 * @author      VuloLabs
 */
class AiRequestException extends \Exception {
}
