<?php
/**
 * AuditContentAction class file.
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
 * Create Content's "AI Content Audit" quick action
 * (QuickActionsCard.tsx) — a real, standalone AI action rather than the
 * in-page scroll shortcut this row used to be (it used to jump to
 * RecentContentCard.tsx's own rule-based scanner findings; those findings
 * still exist and are unrelated to this). This one asks the AI to review
 * one existing post/page's real content wholesale — an overall score, a
 * short summary, and a handful of concrete suggestions — and saves that
 * verdict as post meta rather than rewriting anything, since an audit is
 * meant to inform a human, not silently change the page.
 *
 * Stays free (`get_tier()` inherited as 'free') — QuickActionsCard.tsx
 * gates this tile only on a connected VuloCloud AI account
 * (ConnectVuloCloudPopup/useAiCredits), the same treatment
 * ContentToolsGrid.tsx's own free tiles (AI Writer, Blog Generator,
 * Duplicate Content) get, not a Pro license.
 *
 * @class       AuditContentAction class
 * @version     1.0.0
 * @author      VuloLabs
 */
class AuditContentAction extends AbstractBasicAction {

	private const META_KEY = '_vulopilot_ai_content_audit';

	/**
	 * @inheritDoc
	 */
	public function get_id(): string {
		return 'audit-content';
	}

	/**
	 * @inheritDoc
	 */
	public function get_label(): string {
		return __( 'AI content audit', 'vulopilot' );
	}

	/**
	 * Impact::LOW — writes only a narrow postmeta verdict; never touches
	 * `post_content`/`post_title` or any other real post field.
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

		if ( ! $post || ! in_array( $post->post_type, array( 'post', 'page' ), true ) ) {
			throw new InvalidActionInputException( __( 'post_id must refer to an existing post or page.', 'vulopilot' ) );
		}

		if ( mb_strlen( wp_strip_all_tags( $post->post_content ) ) < 50 ) {
			throw new InvalidActionInputException( __( 'This post needs at least some existing content to audit.', 'vulopilot' ) );
		}

		return array(
			'post_id'      => $post_id,
			'post_title'   => $post->post_title,
			'post_content' => $post->post_content,
			'previous_audit' => get_post_meta( $post_id, self::META_KEY, true ),
		);
	}

	/**
	 * @inheritDoc
	 */
	public function build_prompt( array $input ): array {
		return array(
			array(
				'role'    => 'system',
				'content' => 'You audit WordPress page content for overall quality — SEO, readability, structure, '
					. 'and reader engagement. Respond in exactly this format, nothing else:'
					. "\nSCORE: <a whole number from 0 to 100>\nSUMMARY: <one short paragraph verdict>"
					. "\nSUGGESTIONS:\n- <first concrete suggestion>\n- <second concrete suggestion>\n- <third concrete suggestion>",
			),
			array(
				'role'    => 'user',
				'content' => sprintf(
					"Page title: %s\n\nContent:\n%s\n\nAudit this page.",
					$input['post_title'],
					wp_strip_all_tags( $input['post_content'] )
				),
			),
		);
	}

	/**
	 * @inheritDoc
	 */
	public function parse_response( AIResponse $response ): array {
		$content = $response->get_content();

		preg_match( '/SCORE:\s*(\d+)/i', $content, $score_match );
		preg_match( '/SUMMARY:\s*(.+?)\n/is', $content, $summary_match );
		preg_match( '/SUGGESTIONS:\s*(.+)/is', $content, $suggestions_match );

		$suggestions = array();

		if ( ! empty( $suggestions_match[1] ) ) {
			foreach ( preg_split( '/\r?\n/', trim( $suggestions_match[1] ) ) as $line ) {
				$line = trim( $line, " \t\n\r\0\x0B-" );

				if ( '' !== $line ) {
					$suggestions[] = $line;
				}
			}
		}

		return array(
			'score'       => isset( $score_match[1] ) ? absint( $score_match[1] ) : null,
			'summary'     => trim( $summary_match[1] ?? '' ),
			'suggestions' => $suggestions,
		);
	}

	/**
	 * @inheritDoc
	 */
	public function validate_output( array $output, array $input ): void {
		if ( null === $output['score'] || '' === $output['summary'] ) {
			throw new InvalidActionOutputException(
				__( 'The AI response did not match the expected audit format.', 'vulopilot' )
			);
		}
	}

	/**
	 * @inheritDoc
	 */
	public function build_preview( array $output, array $input ): ActionPreview {
		$after = sprintf( "Score: %d/100\n\n%s", $output['score'], $output['summary'] );

		if ( ! empty( $output['suggestions'] ) ) {
			$after .= "\n\n" . implode( "\n", array_map( fn( $s ) => '- ' . $s, $output['suggestions'] ) );
		}

		return new ActionPreview(
			sprintf(
				/* translators: %s is the post/page title being audited. */
				__( 'AI content audit for: %s', 'vulopilot' ),
				$input['post_title']
			),
			null,
			$after,
			'text'
		);
	}

	/**
	 * @inheritDoc
	 */
	public function execute( array $output, array $input ): ActionExecutionResult {
		update_post_meta(
			$input['post_id'],
			self::META_KEY,
			array(
				'score'       => $output['score'],
				'summary'     => $output['summary'],
				'suggestions' => $output['suggestions'],
				'audited_at'  => current_time( 'mysql' ),
			)
		);

		return new ActionExecutionResult(
			true,
			'post',
			(string) $input['post_id'],
			array(
				'post_id'        => $input['post_id'],
				'previous_audit' => $input['previous_audit'],
			)
		);
	}

	/**
	 * @inheritDoc
	 */
	public function rollback( array $snapshot ): void {
		if ( empty( $snapshot['previous_audit'] ) ) {
			delete_post_meta( $snapshot['post_id'], self::META_KEY );
			return;
		}

		update_post_meta( $snapshot['post_id'], self::META_KEY, $snapshot['previous_audit'] );
	}
}
