<?php
/**
 * AiByokNotConfiguredException file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Exceptions;

/**
 * Thrown by AI\AiRequestSender when VuloCloud reports
 * `AI_BYOK_NOT_CONFIGURED` — neither this site's Organization nor an allowed
 * Customer backup has a usable AI key. A real AiRequestException subclass, but
 * also its own distinct type so AiCopilot\ActionRunner::send_prompt_or_credits()
 * can specifically recognize "no key at all" and decide whether to fall through
 * to the AI Credits path for an eligible action, rather than treating it like a
 * generic transient failure worth retrying.
 *
 * @class       AiByokNotConfiguredException class
 * @version     1.0.0
 * @author      VuloLabs
 */
class AiByokNotConfiguredException extends AiRequestException {
}
