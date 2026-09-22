<?php
/**
 * GenerateLandingPageAction class file.
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
 * Create Content's "Landing Pages" tool — same new-content-creation shape
 * as GenerateBlogAction (a topic the site owner types, not an existing
 * post/attachment; see that class's own docblock for why), but creates a
 * `page` rather than a `post`, and asks the AI for a real landing-page
 * structure (headline + persuasive sections) instead of blog prose.
 * execute() always creates a `draft`, never `publish`, for the same
 * "approving this only approves generating a draft for review" reasoning
 * GenerateBlogAction gives.
 *
 * @class       GenerateLandingPageAction class
 * @version     1.0.0
 * @author      VuloLabs
 */
class GenerateLandingPageAction extends AbstractBasicAction {

    /**
     * Marks a `page` as one this action created — the only real signal
     * distinguishing an AI-generated landing page from any other page
     * (an "About Us"/"Contact" page has the identical `post_type`, so
     * Create Content's own Recent Content list (RecentContentCard.tsx)
     * needs this to show a real "Landing Page" category instead of
     * mislabeling every page as one. Registered as REST-visible in
     * Services\PostSeoMetaFields (same "an action's own META_KEY
     * registered there" pattern GenerateSchemaAction::META_KEY already
     * uses), so it rides along in `GET /wp/v2/pages`'s own `meta` field
     * for free — no bespoke endpoint needed to read it back.
     */
    public const META_KEY = '_vulopilot_landing_page';

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'generate-landing-page';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'Generate landing page', 'vulopilot' );
    }

    /**
     * Impact::HIGH — `wp_insert_post()`s a brand-new page with AI-generated `post_content` — creates new, potentially publicly-visible content outright.
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
        $topic = sanitize_text_field( (string) ( $input['topic'] ?? '' ) );

        if ( mb_strlen( $topic ) < 5 ) {
            throw new InvalidActionInputException( __( 'Please describe what the landing page is for (at least 5 characters).', 'vulopilot' ) );
        }

        // Optional — a bare topic is still a complete, valid input, same
        // as ContentToolsGrid.tsx's own "Landing Pages" tile, which never
        // supplies it.
        $tone = mb_substr( sanitize_text_field( (string) ( $input['tone'] ?? '' ) ), 0, 60 );

        return array(
            'topic' => $topic,
            'tone'  => $tone,
        );
    }

    /**
     * @inheritDoc
     */
    public function build_prompt( array $input ): array {
        $user_message = sprintf( 'Write a landing page for: %s', $input['topic'] );

        if ( '' !== ( $input['tone'] ?? '' ) ) {
            $user_message .= sprintf( "\n\nTone: %s.", $input['tone'] );
        }

        return array(
            array(
                'role'    => 'system',
                'content' => 'You write high-converting WordPress landing pages. Respond in exactly this format, nothing else:'
                    . "\nTITLE: <the headline>\n\nBODY:\n<the full page body as HTML — a hero intro, 2-3 benefit sections with subheadings, and a closing call-to-action paragraph>",
            ),
            array(
                'role'    => 'user',
                'content' => $user_message,
            ),
        );
    }

    /**
     * @inheritDoc
     */
    public function parse_response( AIResponse $response ): array {
        $content = $response->get_content();

        preg_match( '/TITLE:\s*(.+?)\n/i', $content, $title_match );
        preg_match( '/BODY:\s*(.+)/is', $content, $body_match );

        return array(
            'title' => trim( $title_match[1] ?? '' ),
            'body'  => trim( $body_match[1] ?? '' ),
        );
    }

    /**
     * @inheritDoc
     */
    public function validate_output( array $output, array $input ): void {
        if ( '' === ( $output['title'] ?? '' ) || '' === ( $output['body'] ?? '' ) ) {
            throw new InvalidActionOutputException(
                __( 'The AI response did not match the expected TITLE/BODY format.', 'vulopilot' )
            );
        }

        if ( mb_strlen( wp_strip_all_tags( $output['body'] ) ) < 150 ) {
            throw new InvalidActionOutputException( __( 'The AI returned a landing page body that is too short to be useful.', 'vulopilot' ) );
        }
    }

    /**
     * @inheritDoc
     */
    public function build_preview( array $output, array $input ): ActionPreview {
        return new ActionPreview(
            sprintf(
                /* translators: %s is the generated page title. */
                __( 'Create a new draft landing page: %s', 'vulopilot' ),
                $output['title']
            ),
            null,
            wp_trim_words( wp_strip_all_tags( $output['body'] ), 40 ),
            'html'
        );
    }

    /**
     * @inheritDoc
     */
    public function execute( array $output, array $input ): ActionExecutionResult {
        $post_id = wp_insert_post(
            array(
                'post_title'   => $output['title'],
                'post_content' => $output['body'],
                'post_status'  => 'draft',
                'post_type'    => 'page',
            ),
            true
        );

        if ( is_wp_error( $post_id ) ) {
            return new ActionExecutionResult( false, null, null, array(), $post_id->get_error_message() );
        }

        update_post_meta( $post_id, self::META_KEY, true );

        return new ActionExecutionResult(
            true,
            'post',
            (string) $post_id,
            array( 'created_post_id' => $post_id )
        );
    }

    /**
     * @inheritDoc
     */
    public function rollback( array $snapshot ): void {
        wp_trash_post( $snapshot['created_post_id'] );
    }
}
