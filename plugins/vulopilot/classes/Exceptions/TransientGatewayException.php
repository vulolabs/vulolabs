<?php
/**
 * TransientGatewayException file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Exceptions;

/**
 * A retryable gateway failure — network error, HTTP 5xx, or HTTP 429. Caught by
 * AI\AiRequestSender, which retries with backoff up to its attempt limit before
 * re-throwing.
 *
 * @class       TransientGatewayException class
 * @version     1.0.0
 * @author      VuloLabs
 */
class TransientGatewayException extends AiRequestException {
}
