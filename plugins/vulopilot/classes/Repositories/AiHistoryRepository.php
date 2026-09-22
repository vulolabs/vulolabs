<?php
/**
 * AiHistoryRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Repositories;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for vulopilot_ai_history (DATABASE.md).
 *
 * @class       AiHistoryRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class AiHistoryRepository extends AbstractRepository {

    /**
     * The only 2 `surface` values that represent a real chat turn a human
     * had with VuloPilot (Controllers\Copilot.php/ContentAssistant.php) —
     * every other real caller of `ai_request_sender`/`request_sender`
     * (AiCopilot\ActionRunner, GeoAnalysis\GeoAnalyzer,
     * ContentIntelligence\ContentAnalyzer) tags its own rows with its own
     * real feature label instead, so this is the whitelist
     * get_conversations() scopes to — kept in sync with AIRequest's own
     * `$surface` values by hand, the same way ContentCreationOrchestrator's
     * CONTENT_CREATION_ACTIONS is kept in sync with each chat controller's
     * own system prompt.
     */
    private const CHAT_SURFACES = array( 'copilot_chat', 'content_assistant_chat' );

    /**
     * @var string[]
     */
    protected array $filterable_columns = array( 'provider', 'status', 'surface' );

    /**
     * @var string[]
     */
    protected array $searchable_columns = array( 'model', 'prompt_excerpt', 'response_excerpt' );

    /**
     * @inheritDoc
     */
    protected function get_table_key(): string {
        return 'ai_history';
    }

    /**
     * Success/failure counts, zero-filled — backs the AI Assistant table's
     * status-count pill bar (same reasoning as
     * AutomationsRepository::get_status_counts()).
     *
     * @return array{success: int, failure: int}
     */
    public function get_status_counts(): array {
        return array_merge(
            array(
                'success' => 0,
                'failure' => 0,
            ),
            $this->count_by_column( 'status' )
        );
    }

    /**
     * Call counts, token totals, and cost for one date range — what
     * Reports\Types\AiUsageReport's headline summary reads.
     *
     * @param string $period_start Y-m-d, inclusive.
     * @param string $period_end   Y-m-d, inclusive.
     * @return array{total_calls: int, successful_calls: int, failed_calls: int, prompt_tokens: int, completion_tokens: int, total_cost: float}
     */
    public function get_stats_for_period( string $period_start, string $period_end ): array {
        global $wpdb;

        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT COUNT(*) AS total_calls,
                        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_calls,
                        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) AS failed_calls,
                        COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                        COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                        COALESCE(SUM(cost_estimate), 0) AS total_cost
                 FROM {$this->get_table()} WHERE DATE(created_at) BETWEEN %s AND %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $period_start,
                $period_end
            ),
            ARRAY_A
        );

        return array(
            'total_calls'       => (int) ( $row['total_calls'] ?? 0 ),
            'successful_calls'  => (int) ( $row['successful_calls'] ?? 0 ),
            'failed_calls'      => (int) ( $row['failed_calls'] ?? 0 ),
            'prompt_tokens'     => (int) ( $row['prompt_tokens'] ?? 0 ),
            'completion_tokens' => (int) ( $row['completion_tokens'] ?? 0 ),
            'total_cost'        => (float) ( $row['total_cost'] ?? 0 ),
        );
    }

    /**
     * Paginated, searchable, date-ranged real chat turns — scoped to
     * CHAT_SURFACES so AI Copilot History's "Conversations" filter
     * (Controllers\History.php) shows real chat, not every other feature
     * that shares this same table. Same shape/pagination contract as
     * ActivityLogRepository::get_timeline() (its own docblock explains why
     * a dedicated method beats routing through find_all(): an explicit
     * allow-list alongside a separate free-text `search` needs both at
     * once, which find_all()'s generic filterable-column path can't do).
     *
     * @param array{search?: string, date_from?: string, date_to?: string, page?: int, per_page?: int} $args
     * @return array{data: array<int, array<string, mixed>>, total: int}
     */
    public function get_conversations( array $args ): array {
        global $wpdb;
        $table = $this->get_table();

        $page     = max( 1, (int) ( $args['page'] ?? 1 ) );
        $per_page = max( 1, min( 100, (int) ( $args['per_page'] ?? 20 ) ) );
        $offset   = ( $page - 1 ) * $per_page;

        $placeholders = implode( ', ', array_fill( 0, count( self::CHAT_SURFACES ), '%s' ) );
        $where        = "WHERE surface IN ({$placeholders})";
        $values       = self::CHAT_SURFACES;

        if ( ! empty( $args['search'] ) ) {
            $where   .= ' AND (prompt_excerpt LIKE %s OR response_excerpt LIKE %s)';
            $like     = '%' . $wpdb->esc_like( (string) $args['search'] ) . '%';
            $values[] = $like;
            $values[] = $like;
        }

        if ( ! empty( $args['date_from'] ) ) {
            $where   .= ' AND DATE(created_at) >= %s';
            $values[] = (string) $args['date_from'];
        }

        if ( ! empty( $args['date_to'] ) ) {
            $where   .= ' AND DATE(created_at) <= %s';
            $values[] = (string) $args['date_to'];
        }

        $total = (int) $wpdb->get_var(
            $wpdb->prepare( "SELECT COUNT(*) FROM {$table} {$where}", ...$values ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $where's %s count matches $values' size at runtime.
        );

        if ( 0 === $total ) {
            return array(
                'data'  => array(),
                'total' => 0,
            );
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare( "SELECT * FROM {$table} {$where} ORDER BY created_at DESC, id DESC LIMIT %d OFFSET %d", ...array_merge( $values, array( $per_page, $offset ) ) ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- same runtime-sized-array case as above.
            ARRAY_A
        );

        return array(
            'data'  => null !== $rows ? $rows : array(),
            'total' => $total,
        );
    }

    /**
     * Real conversation count for History's "Conversations" filter pill —
     * same CHAT_SURFACES scope as get_conversations() above.
     *
     * @return int
     */
    public function get_conversation_count(): int {
        global $wpdb;

        $placeholders = implode( ', ', array_fill( 0, count( self::CHAT_SURFACES ), '%s' ) );

        return (int) $wpdb->get_var(
            $wpdb->prepare( "SELECT COUNT(*) FROM {$this->get_table()} WHERE surface IN ({$placeholders})", ...self::CHAT_SURFACES ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- placeholder count matches CHAT_SURFACES' size, a fixed private const.
        );
    }

    /**
     * Distinct providers actually present in the table, with call counts —
     * backs the AI Assistant History table's "Provider" filter dropdown
     * with real values (e.g. 'groq') instead of a fixed guess, the same
     * `count_by_column()` pattern get_status_counts() above already uses.
     * Unlike that method, this has no fixed zero-filled shape — the set of
     * providers is whatever's actually been called, not a known-in-advance
     * enum.
     *
     * @return array<string, int> provider => call count.
     */
    public function get_provider_counts(): array {
        return $this->count_by_column( 'provider' );
    }

    /**
     * Call counts and cost broken down per provider for one date range —
     * what the report's "by provider" section table reads.
     *
     * @param string $period_start Y-m-d, inclusive.
     * @param string $period_end   Y-m-d, inclusive.
     * @return array<int, array{provider: string, calls: int, total_cost: float}>
     */
    public function get_breakdown_by_provider_for_period( string $period_start, string $period_end ): array {
        global $wpdb;

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT provider, COUNT(*) AS calls, COALESCE(SUM(cost_estimate), 0) AS total_cost
                 FROM {$this->get_table()} WHERE DATE(created_at) BETWEEN %s AND %s
                 GROUP BY provider ORDER BY calls DESC", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $period_start,
                $period_end
            ),
            ARRAY_A
        );

        return array_map(
            static fn( array $row ): array => array(
                'provider'   => $row['provider'],
                'calls'      => (int) $row['calls'],
                'total_cost' => (float) $row['total_cost'],
            ),
            $rows ?: array()
        );
    }
}
