<?php
/**
 * UnsafePromptException file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Exceptions;

/**
 * Thrown by AI\AISafetyValidator::validate_prompt() when a request is too long
 * or appears to contain a credential — blocked before it's ever sent. Not a
 * gateway failure, so this does NOT extend AiRequestException.
 *
 * @class       UnsafePromptException class
 * @version     1.0.0
 * @author      VuloLabs
 */
class UnsafePromptException extends \Exception {
}
