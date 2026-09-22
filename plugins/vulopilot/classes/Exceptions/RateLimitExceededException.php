<?php
/**
 * RateLimitExceededException file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Exceptions;

/**
 * Thrown by AI\AiRequestSender when this site's per-minute request budget is
 * exhausted, before the request is ever sent to VuloCloud.
 *
 * @class       RateLimitExceededException class
 * @version     1.0.0
 * @author      VuloLabs
 */
class RateLimitExceededException extends AiRequestException {
}
