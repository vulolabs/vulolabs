<?php
/**
 * WriteMetaDescriptionAction class file.
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
 * SEO-MODULE.md's one-click fix for
 * RuleEngine\Rules\MissingMetaDescriptionRule's recommendations — writes
 * to `post_excerpt` via `wp_update_post()`, the same native WordPress
 * field Seo\Scanners\MetaDescriptionScanner checks for absence of, so
 * this closes that check's fix loop the same way GenerateAltAction closes
 * MissingAltTextRule's. Shaped like ImproveReadabilityAction (a real
 * `wp_update_post()` write, gets a WordPress revision as a bonus safety
 * net) rather than GenerateAltAction's raw postmeta write, since
 * `post_excerpt` is a first-class post field, not metadata.
 *
 * @class       WriteMetaDescriptionAction class
 * @version     1.0.0
 * @author      VuloLabs
 */
class WriteMetaDescriptionAction extends AbstractBasicAction {

    /**
     * Search snippets are truncated well before this; a description
     * longer than this reads as the AI padding rather than summarizing.
     */
    private const MAX_LENGTH = 160;

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'write-meta-description';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'Write meta description', 'vulopilot' );
    }

    /**
     * Impact::LOW — Rewrites `post_excerpt` only (this codebase's meta-description field) — one narrow, easily-reverted field, never `post_content`.
     *
     * @inheritDoc
     */
    public function get_risk_level(): string {
        return Impact::LOW;
    }

    /**
     * @inheritDoc
     */
    public function validate_input( array $input ): array {
        $post_id = absint( $input['post_id'] ?? 0 );
        $post    = $post_id ? get_post( $post_id ) : null;

        // Matches Services\PostSeoMetaFields::POST_TYPES — the metabox's
        // own "Fix with AI" description button (Checklist.tsx) is the one
        // real caller that can hand this a product id.
        if ( ! $post || ! in_array( $post->post_type, array( 'post', 'page', 'product' ), true ) ) {
            throw new InvalidActionInputException( __( 'post_id must refer to an existing post, page, or product.', 'vulopilot' ) );
        }

        if ( '' === trim( wp_strip_all_tags( $post->post_content ) ) ) {
            throw new InvalidActionInputException( __( 'This post has no content to summarize.', 'vulopilot' ) );
        }

        return array(
            'post_id'          => $post_id,
            'title'            => $post->post_title,
            'content'          => $post->post_content,
            'previous_excerpt' => $post->post_excerpt,
        );
    }

    /**
     * @inheritDoc
     */
    public function build_prompt( array $input ): array {
        return array(
            array(
                'role'    => 'system',
                'content' => sprintf(
                    'You write concise, compelling meta descriptions for search engine results. '
                        . 'Summarize the page in one sentence, under %d characters. '
                        . 'Respond with ONLY the description itself — no quotes, no preamble.',
                    self::MAX_LENGTH
                ),
            ),
            array(
                'role'    => 'user',
                'content' => sprintf(
                    "Title: %s\n\nContent:\n%s",
                    $input['title'],
                    wp_trim_words( wp_strip_all_tags( $input['content'] ), 200 )
                ),
            ),
        );
    }

    /**
     * @inheritDoc
     */
    public function parse_response( AIResponse $response ): array {
        return array( 'description' => trim( $response->get_content(), " \t\n\r\0\x0B\"'" ) );
    }

    /**
     * @inheritDoc
     */
    public function validate_output( array $output, array $input ): void {
        $description = $output['description'] ?? '';

        if ( '' === $description ) {
            throw new InvalidActionOutputException( __( 'The AI returned an empty description.', 'vulopilot' ) );
        }

        if ( mb_strlen( $description ) > self::MAX_LENGTH * 2 ) {
            throw new InvalidActionOutputException( __( 'The AI returned a description that is too long.', 'vulopilot' ) );
        }
    }

    /**
     * @inheritDoc
     */
    public function build_preview( array $output, array $input ): ActionPreview {
        return new ActionPreview(
            sprintf(
                /* translators: %s is the post/page title. */
                __( 'Set meta description for %s', 'vulopilot' ),
                $input['title']
            ),
            '' !== $input['previous_excerpt'] ? $input['previous_excerpt'] : null,
            $output['description'],
            'text'
        );
    }

    /**
     * @inheritDoc
     */
    public function execute( array $output, array $input ): ActionExecutionResult {
        $result = wp_update_post(
            array(
                'ID'           => $input['post_id'],
                'post_excerpt' => $output['description'],
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
                'previous_excerpt' => $input['previous_excerpt'],
            )
        );
    }

    /**
     * @inheritDoc
     */
    public function rollback( array $snapshot ): void {
        wp_update_post(
            array(
                'ID'           => $snapshot['post_id'],
                'post_excerpt' => $snapshot['previous_excerpt'],
            )
        );
    }
}
