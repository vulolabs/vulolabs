<?php
/**
 * ActionRunRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Repositories;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for vulopilot_ai_action_runs (see AI-ACTIONS.md) — the
 * record of one AIAction going through propose → approve/reject →
 * execute → rollback. `input`/`output`/`preview`/`snapshot` are stored as
 * JSON; AiCopilot\ActionRunner is the only code that encodes/decodes
 * them, this repository just persists strings.
 *
 * @class       ActionRunRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class ActionRunRepository extends AbstractRepository {

    /**
     * @var string[]
     */
    protected array $filterable_columns = array( 'action_id', 'status', 'object_type' );

    /**
     * @inheritDoc
     */
    protected function get_table_key(): string {
        return 'ai_action_run';
    }

    /**
     * Real content-creation stats for one date range — how many of the
     * given actions actually ran to completion (`status = 'executed'`),
     * and how many real words their own output contained in total.
     *
     * Every content-creation action's real `output` column is
     * `{title, body}` JSON (confirmed against GenerateBlogAction/
     * GenerateLandingPageAction/GenerateProductDescriptionAction's own
     * parse_response()/execute()) — written once at propose() time and
     * never touched again by approve(), so it's the real, final generated
     * text, not a stale draft. Word count uses the exact same
     * wp_strip_all_tags()+str_word_count() pair
     * Seo\Scanners\ThinContentScanner already uses for real content
     * elsewhere in this codebase, not a different heuristic.
     *
     * @param string   $period_start Y-m-d, inclusive.
     * @param string   $period_end   Y-m-d, inclusive.
     * @param string[] $action_ids   Content-creation action ids to scope to.
     * @return array{content_created: int, words_generated: int}
     */
    public function get_content_creation_stats_for_period( string $period_start, string $period_end, array $action_ids ): array {
        global $wpdb;

        if ( ! $action_ids ) {
            return array(
                'content_created' => 0,
                'words_generated' => 0,
            );
        }

        $placeholders = implode( ', ', array_fill( 0, count( $action_ids ), '%s' ) );

        $outputs = $wpdb->get_col(
            $wpdb->prepare( // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- $placeholders' %s count matches $action_ids' size at runtime; the trailing 2 %s are $period_start/$period_end, both passed below via the same spread.
                "SELECT output FROM {$this->get_table()} WHERE status = 'executed' AND action_id IN ({$placeholders}) AND DATE(created_at) BETWEEN %s AND %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $placeholders' %s count matches $action_ids' size at runtime.
                ...array_merge( $action_ids, array( $period_start, $period_end ) )
            )
        );

        $words = 0;

        foreach ( (array) $outputs as $raw_output ) {
            $output = json_decode( (string) $raw_output, true );
            $body   = is_array( $output ) ? (string) ( $output['body'] ?? '' ) : '';
            $words += str_word_count( wp_strip_all_tags( $body ) );
        }

        return array(
            'content_created' => count( (array) $outputs ),
            'words_generated' => $words,
        );
    }
}
