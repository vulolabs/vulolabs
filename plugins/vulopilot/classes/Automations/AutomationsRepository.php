<?php
/**
 * AutomationsRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Automations;
use VuloPilot\Utill\FindingRepository;
use VuloPilot\Utill\RepositoryUtil;


defined( 'ABSPATH' ) || exit;

/**
 * Persistence for vulopilot_automations (DATABASE.md).
 *
 * @class       AutomationsRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class AutomationsRepository extends RepositoryUtil {

    /**
     * @var string[]
     */
    protected array $filterable_columns = array( 'status', 'category' );

    /**
     * @var string[]
     */
    protected array $searchable_columns = array( 'name' );

    /**
     * @inheritDoc
     */
    protected function get_table_key(): string {
        return 'automations';
    }

    /**
     * @return int Count of currently enabled automations - what the
     *             dashboard's "active automations" stat card reads.
     */
    public function count_enabled(): int {
        global $wpdb;

        return (int) $wpdb->get_var( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- {$this->get_table()} is this plugin's own table name, not user input.
            $wpdb->prepare( "SELECT COUNT(*) FROM %i WHERE status = 'enabled'", $this->get_table() )
        );
    }

    /**
     * Enabled/disabled/draft counts, zero-filled - backs both the
     * "Automation Status" dashboard widget and the Automations table's
     * status-count pill bar ("Active"/"Paused"/"Drafts" - Automations'
     * own filter chips read 'enabled'/'disabled'/'draft' by these exact
     * keys). Delegates the actual grouped query to
     * RepositoryUtil::count_by_column() rather than running its own
     * SQL (database.md: prefer one query over several, and don't duplicate
     * query-building logic that already exists).
     *
     * @return array{enabled: int, disabled: int, draft: int}
     */
    public function get_status_counts(): array {
        return array_merge(
            array(
                'enabled'  => 0,
                'disabled' => 0,
                'draft'    => 0,
            ),
            $this->count_by_column( 'status' )
        );
    }

    /**
     * @param string $marker The exact `system_default` value to look for.
     * @return array<string, mixed>|null
     */
    public function find_by_system_default_marker( string $marker ): ?array {
        global $wpdb;

        $row = $wpdb->get_row( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- {$this->get_table()} is this plugin's own table name, not user input.
            $wpdb->prepare(
                "SELECT * FROM %i WHERE trigger_config LIKE %s ORDER BY id ASC LIMIT 1", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                '%"system_default":"' . $wpdb->esc_like( $marker ) . '"%'
            ),
            ARRAY_A
        );

        return $row ?: null;
    }
}
