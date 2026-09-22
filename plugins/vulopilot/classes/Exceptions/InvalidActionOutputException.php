<?php
/**
 * InvalidActionOutputException file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Exceptions;

/**
 * Thrown by an AIActionInterface implementation's validate_output() when
 * the AI response fails validation (e.g. empty content, missing
 * required fields, malformed JSON-LD) before it's shown to the user as a
 * preview.
 *
 * @class       InvalidActionOutputException class
 * @version     1.0.0
 * @author      VuloLabs
 */
class InvalidActionOutputException extends \Exception {
}
