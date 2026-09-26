<?php
/**
 * AiConversationRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\AiCopilot\Repositories;

use VuloPilot\Utill\RepositoryUtil;

defined( 'ABSPATH' ) || exit;

/**
 * @class       AiConversationRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class AiConversationRepository extends RepositoryUtil {

    /**
     * How many leading characters of the first user message become a
     * conversation's `title` - long enough to be recognizable in the
     * "Recent conversations" list, short enough to always fit the column.
     */
    private const TITLE_MAX_LENGTH = 80;

    /**
     * How many leading characters of the first user message become
     * get_recent_with_excerpt()'s `excerpt` field.
     */
    private const EXCERPT_MAX_LENGTH = 140;

    /**
     * @var string[]
     */
    protected array $filterable_columns = array( 'user_id' );

    /**
     * @inheritDoc
     */
    protected function get_table_key(): string {
        return 'ai_conversation';
    }

    /**
     * Lightweight rows for the "Recent conversations" list - `title`/
     * `updated_at` only, never decoding every row's full `turns` blob just
     * to render a list.
     *
     * @param int $user_id Only this user's own conversations.
     * @param int $limit   Max rows to return.
     * @return array{data: array<int, array<string, mixed>>, total: int}
     */
    public function get_recent( int $user_id, int $limit = 5 ): array {
        global $wpdb;

        $table = $this->get_table();

        $rows = $wpdb->get_results(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare(
                "SELECT id, title, updated_at FROM %i WHERE user_id = %d ORDER BY updated_at DESC LIMIT %d", $table, // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $user_id,
                $limit
            ),
            ARRAY_A
        );

        $total = (int) $wpdb->get_var(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare( "SELECT COUNT(*) FROM %i WHERE user_id = %d", $table, $user_id ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        );

        return array(
            'data'  => null !== $rows ? $rows : array(),
            'total' => $total,
        );
    }

    /**
     * Same real rows get_recent() returns, plus a real `excerpt` - the
     * conversation's own first user turn, read from its `turns` JSON blob.
     * Deliberately a SEPARATE method rather than a param on get_recent():
     * that method's own docblock says never to decode `turns` just to
     * render a list, and this method still doesn't for any caller passing
     * a large $limit - it only exists because ChatTab.tsx's own inline
     * "Recent conversations" section shows a real one-line excerpt under
     * each thread's `title` (already just an 80-char truncation of that
     * same first message - showing it twice as both headline and
     * description would be redundant), and only ever asks for 3 rows.
     *
     * @param int $user_id Only this user's own conversations.
     * @param int $limit   Max rows to return - keep small; each row decodes its own `turns` blob.
     * @return array{data: array<int, array{id: int, title: string, excerpt: string, updated_at: string}>, total: int}
     */
    public function get_recent_with_excerpt( int $user_id, int $limit = 3 ): array {
        global $wpdb;

        $table = $this->get_table();

        $rows = $wpdb->get_results(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare(
                "SELECT id, title, turns, updated_at FROM %i WHERE user_id = %d ORDER BY updated_at DESC LIMIT %d", $table, // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $user_id,
                $limit
            ),
            ARRAY_A
        );

        $total = (int) $wpdb->get_var(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare( "SELECT COUNT(*) FROM %i WHERE user_id = %d", $table, $user_id ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        );

        return array(
            'data'  => array_map( array( $this, 'build_excerpt_row' ), null !== $rows ? $rows : array() ),
            'total' => $total,
        );
    }

    /**
     * Decodes one raw get_recent_with_excerpt() row into its response shape.
     *
     * @param array<string, mixed> $row Raw `id`/`title`/`turns`/`updated_at` row.
     * @return array{id: int, title: string, excerpt: string, updated_at: string}
     */
    private function build_excerpt_row( array $row ): array {
        $turns           = json_decode( (string) $row['turns'], true );
        $first_user_turn = null;

        if ( is_array( $turns ) ) {
            foreach ( $turns as $turn ) {
                if ( isset( $turn['role'], $turn['content'] ) && 'user' === $turn['role'] ) {
                    $first_user_turn = (string) $turn['content'];
                    break;
                }
            }
        }

        return array(
            'id'         => (int) $row['id'],
            'title'      => $row['title'],
            'excerpt'    => $this->build_excerpt( $first_user_turn ?? $row['title'] ),
            'updated_at' => $row['updated_at'],
        );
    }

    /**
     * Truncates a real first message down to EXCERPT_MAX_LENGTH.
     *
     * @param string $first_message Real first user message.
     * @return string Truncated to EXCERPT_MAX_LENGTH, with an ellipsis when cut.
     */
    private function build_excerpt( string $first_message ): string {
        $trimmed = trim( $first_message );

        if ( mb_strlen( $trimmed ) <= self::EXCERPT_MAX_LENGTH ) {
            return $trimmed;
        }

        return mb_substr( $trimmed, 0, self::EXCERPT_MAX_LENGTH - 1 ) . '…';
    }

    /**
     * One full conversation, `turns` already decoded - ownership-checked,
     * same as append_turns() below, so one admin can't read another's
     * thread just by guessing its id.
     *
     * @param int $id      vulopilot_ai_conversations.id.
     * @param int $user_id Must match the row's own `user_id`.
     * @return array{id: int, title: string, turns: array<int, mixed>, updated_at: string}|null Null if missing or not owned.
     */
    public function find_full( int $id, int $user_id ): ?array {
        global $wpdb;

        $row = $wpdb->get_row(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare(
                "SELECT * FROM %i WHERE id = %d AND user_id = %d", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $id,
                $user_id
            ),
            ARRAY_A
        );

        if ( ! $row ) {
            return null;
        }

        $turns = json_decode( (string) $row['turns'], true );

        return array(
            'id'         => (int) $row['id'],
            'title'      => $row['title'],
            'turns'      => is_array( $turns ) ? $turns : array(),
            'updated_at' => $row['updated_at'],
        );
    }

    /**
     * Starts a new conversation - `title` derived here from the real first
     * user message rather than trusted from any caller-supplied label.
     *
     * @param int               $user_id      Owning user.
     * @param string            $first_message The conversation's first, real user message.
     * @param array<int, mixed> $turns        Full turns array (already includes the first user turn and its reply).
     * @return int New conversation id.
     */
    public function create( int $user_id, string $first_message, array $turns ): int {
        $now = current_time( 'mysql' );

        return $this->insert(
            array(
                'user_id'    => $user_id,
                'title'      => $this->build_title( $first_message ),
                'turns'      => wp_json_encode( $turns ),
                'created_at' => $now,
                'updated_at' => $now,
            )
        );
    }

    /**
     * Appends to an existing conversation - ownership-checked directly in
     * the UPDATE's own WHERE clause (not a separate find_full() call first)
     * so this stays a single query.
     *
     * @param int               $id      vulopilot_ai_conversations.id.
     * @param int               $user_id Must match the row's own `user_id`.
     * @param array<int, mixed> $turns   Full, replacement turns array (existing turns plus whatever's new).
     * @return bool True if a row was actually updated (i.e. really owned by $user_id).
     */
    public function append_turns( int $id, int $user_id, array $turns ): bool {
        global $wpdb;

        return 0 < $wpdb->update(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $this->get_table(),
            array(
                'turns'      => wp_json_encode( $turns ),
                'updated_at' => current_time( 'mysql' ),
            ),
            array(
                'id'      => $id,
                'user_id' => $user_id,
            )
        );
    }

    /**
     * @param string $first_message Real first user message.
     * @return string Truncated to TITLE_MAX_LENGTH, with an ellipsis when cut.
     */
    private function build_title( string $first_message ): string {
        $trimmed = trim( $first_message );

        if ( mb_strlen( $trimmed ) <= self::TITLE_MAX_LENGTH ) {
            return $trimmed;
        }

        return mb_substr( $trimmed, 0, self::TITLE_MAX_LENGTH - 1 ) . '…';
    }
}
