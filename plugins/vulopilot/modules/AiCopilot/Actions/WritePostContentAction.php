<?php
/**
 * WritePostContentAction class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\AiCopilot\Actions;

use VuloPilot\Exceptions\InvalidActionInputException;
use VuloPilot\Exceptions\InvalidActionOutputException;
use VuloPilot\ValueObjects\ActionExecutionResult;
use VuloPilot\ValueObjects\ActionPreview;
use VuloPilot\ValueObjects\AIResponse;
use VuloPilot\ValueObjects\Impact;

defined( 'ABSPATH' ) || exit;

/**
 * Create Content's "AI Writer" tool (ContentToolsGrid.tsx) — given a short
 * brief of what to write, creates a new draft post with AI-written body
 * copy. When an existing `post_id` is supplied instead (automations, which
 * act on a specific finding's post), it replaces that post's
 * `post_content` in place. Same "edit an existing
 * object's real field" shape as WriteMetaTitleAction, just on
 * `post_content` instead of `post_title`, and with a user-supplied brief
 * as extra input (there's no existing "current content" to rewrite from
 * for a genuinely blank draft, so the brief is what the AI actually
 * writes from — GenerateBlogAction is the "no existing post at all" case;
 * this is the "I already have a post, write its body" case).
 *
 * @class       WritePostContentAction class
 * @version     1.0.0
 * @author      VuloLabs
 */
class WritePostContentAction extends AbstractBasicAction {

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'write-post-content';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'Write content', 'vulopilot' );
    }

    /**
     * Impact::HIGH — Replaces the post's entire `post_content` body wholesale — the widest single-post blast radius this plugin's AI actions have.
     *
     * @inheritDoc
     */
    public function get_risk_level(): string {
        return Impact::HIGH;
    }

    /**
     * @inheritDoc
     */
    public function validate_input( array $input ): array {
        $post_id = absint( $input['post_id'] ?? 0 );
        $post    = $post_id ? get_post( $post_id ) : null;

        // No post_id = the AI Writer tool's own "write something new" case
        // (a draft is created in execute()). A post_id that's supplied must
        // still be a real post/page.
        if ( $post_id && ( ! $post || ! in_array( $post->post_type, array( 'post', 'page' ), true ) ) ) {
            throw new InvalidActionInputException( __( 'post_id must refer to an existing post or page.', 'vulopilot' ) );
        }

        $brief = sanitize_textarea_field( (string) ( $input['brief'] ?? '' ) );

        if ( mb_strlen( $brief ) < 5 ) {
            throw new InvalidActionInputException( __( 'Please describe what to write about (at least 5 characters).', 'vulopilot' ) );
        }

        return array(
            'post_id'          => $post_id,
            'post_title'       => $post ? $post->post_title : wp_trim_words( $brief, 8, '' ),
            'previous_content' => $post ? $post->post_content : '',
            'brief'            => $brief,
        );
    }

    /**
     * @inheritDoc
     */
    public function build_prompt( array $input ): array {
        return array(
            array(
                'role'    => 'system',
                'content' => 'You write WordPress page/post body content as HTML paragraphs. '
                    . 'Respond with ONLY the body HTML — no title, no preamble, no code fences.',
            ),
            array(
                'role'    => 'user',
                'content' => sprintf(
                    "Page title: %s\n\nWrite the body content for this brief: %s",
                    $input['post_title'],
                    $input['brief']
                ),
            ),
        );
    }

    /**
     * @inheritDoc
     */
    public function parse_response( AIResponse $response ): array {
        return array( 'content' => trim( $response->get_content() ) );
    }

    /**
     * @inheritDoc
     */
    public function validate_output( array $output, array $input ): void {
        $content = $output['content'] ?? '';

        if ( mb_strlen( wp_strip_all_tags( $content ) ) < 100 ) {
            throw new InvalidActionOutputException( __( 'The AI returned content that is too short to be useful.', 'vulopilot' ) );
        }
    }

    /**
     * @inheritDoc
     */
    public function build_preview( array $output, array $input ): ActionPreview {
        return new ActionPreview(
            sprintf(
                /* translators: %s is the post/page title being written for. */
                __( 'Write content for: %s', 'vulopilot' ),
                $input['post_title']
            ),
            '' !== $input['previous_content']
                ? wp_trim_words( wp_strip_all_tags( $input['previous_content'] ), 40 )
                : null,
            wp_trim_words( wp_strip_all_tags( $output['content'] ), 40 ),
            'html'
        );
    }

    /**
     * @inheritDoc
     */
    public function execute( array $output, array $input ): ActionExecutionResult {
        if ( ! $input['post_id'] ) {
            $new_id = wp_insert_post(
                array(
                    'post_title'   => $input['post_title'],
                    'post_content' => $output['content'],
                    'post_status'  => 'draft',
                    'post_type'    => 'post',
                ),
                true
            );

            if ( is_wp_error( $new_id ) ) {
                return new ActionExecutionResult( false, null, null, array(), $new_id->get_error_message() );
            }

            return new ActionExecutionResult( true, 'post', (string) $new_id, array( 'created_post_id' => $new_id ) );
        }

        $result = wp_update_post(
            array(
                'ID'           => $input['post_id'],
                'post_content' => $output['content'],
            ),
            true
        );

        if ( is_wp_error( $result ) ) {
            return new ActionExecutionResult( false, 'post', (string) $input['post_id'], array(), $result->get_error_message() );
        }

        return new ActionExecutionResult(
            true,
            'post',
            (string) $input['post_id'],
            array(
                'post_id'          => $input['post_id'],
                'previous_content' => $input['previous_content'],
            )
        );
    }

    /**
     * @inheritDoc
     */
    public function rollback( array $snapshot ): void {
        if ( ! empty( $snapshot['created_post_id'] ) ) {
            wp_trash_post( $snapshot['created_post_id'] );
            return;
        }

        wp_update_post(
            array(
                'ID'           => $snapshot['post_id'],
                'post_content' => $snapshot['previous_content'],
            )
        );
    }
}
