<?php
/**
 * AbstractBasicAction class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\AiCopilot\Actions;

use VuloPilot\Contracts\AI\AIActionInterface;
use VuloPilot\ValueObjects\Impact;

defined( 'ABSPATH' ) || exit;

/**
 * Base class for every free-tier action under AIActions/Actions/. get_tier()
 * and get_risk_level() are the only methods with a sensible shared default
 * — unlike AbstractBasicScanner/AbstractBasicRule, there's no natural
 * default for validate_input()/build_prompt()/parse_response()/
 * validate_output()/build_preview()/execute()/rollback(): every one of
 * those is genuinely different per action, so none are given a default
 * implementation here.
 *
 * @class       AbstractBasicAction class
 * @version     1.0.0
 * @author      VuloLabs
 */
abstract class AbstractBasicAction implements AIActionInterface {

    /**
     * @inheritDoc
     */
    public function get_tier(): string {
        return 'free';
    }

    /**
     * Impact::MEDIUM — a deliberately cautious shared default (see
     * AIActionInterface::get_risk_level()'s own docblock): most of these
     * actions' own execute() rewrites part of an existing post's real
     * `post_content`, a real but bounded/structural edit rather than an
     * isolated field or a wholesale rewrite. Subclasses whose own
     * execute() only ever touches one narrow, isolated field (postmeta,
     * `post_excerpt`, `post_title`) override this to Impact::LOW; ones
     * that replace an entire `post_content` body or `wp_insert_post()` a
     * brand-new page/post override it to Impact::HIGH. See each override's
     * own docblock for why that specific action sits where it does.
     *
     * @inheritDoc
     */
    public function get_risk_level(): string {
        return Impact::MEDIUM;
    }
}
