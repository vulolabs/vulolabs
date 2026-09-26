<?php
/**
 * AutomationsRunRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Automations;
use VuloPilot\Utill\ActionInterface;
use VuloPilot\Utill\RepositoryUtil;

use VuloPilot\Utill as CoreUtill;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for vulopilot_automations_runs (DATABASE.md) - one row per
 * time AutomationEngine ran (or attempted to run) an automation's actions.
 * `result_log` stores the JSON-encoded array of
 * VuloPilot\Automations\AutomationsRunResult::to_array() entries, one
 * per action executed. `status` is one of 'running'/'completed'/'failed'
 * (AutomationEngine\AutomationEngine::run_automation()) - get_stats_for_period()
 * groups by whatever's actually there, but get_breakdown_by_automation_for_period()'s
 * own SQL below hardcodes those two exact strings, so a new status value
 * introduced without updating both places would silently undercount here.
 *
 * @class       AutomationsRunRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class AutomationsRunRepository extends RepositoryUtil {

    /**
     * @var string[]
     */
    protected array $filterable_columns = array( 'automation_id', 'status', 'triggered_by' );

    /**
     * @inheritDoc
     */
    protected function get_table_key(): string {
        return 'automations_run';
    }

    /**
     * Run/success/failure counts for one date range - what
     * Reports\Types\AutomationsReport's headline summary reads.
     *
     * @param string $period_start Y-m-d, inclusive.
     * @param string $period_end   Y-m-d, inclusive.
     * @return array{total: int, by_status: array<string, int>}
     */
    public function get_stats_for_period( string $period_start, string $period_end ): array {
        global $wpdb;

        $rows = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- {$this->get_table()} is this plugin's own table name, not user input.
            $wpdb->prepare(
                "SELECT status, COUNT(*) AS total FROM %i WHERE DATE(created_at) BETWEEN %s AND %s GROUP BY status", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $period_start,
                $period_end
            ),
            ARRAY_A
        );

        $by_status = array();

        foreach ( (array) $rows as $row ) {
            $by_status[ $row['status'] ] = (int) $row['total'];
        }

        return array(
            'total'     => array_sum( $by_status ),
            'by_status' => $by_status,
        );
    }

    /**
     * Sum of the already-persisted per-run `actions_executed`/`actions_failed`/
     * `changes_made` counters over one date range - same shape/reasoning as
     * get_stats_for_period() above, backing AutomationDashboardRest.php's
     * `period`-aware response. `changes_made` is always <= `executed` (see
     * AutomationEngine::execute_actions()) - a real, distinct count of how
     * many of those executed actions actually changed something on the
     * site, per ActionInterface::changes_site_state().
     *
     * @param string $period_start Y-m-d, inclusive.
     * @param string $period_end   Y-m-d, inclusive.
     * @return array{executed: int, failed: int, changes_made: int}
     */
    public function get_action_totals_for_period( string $period_start, string $period_end ): array {
        global $wpdb;

        $row = $wpdb->get_row( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- {$this->get_table()} is this plugin's own table name, not user input.
            $wpdb->prepare(
                "SELECT COALESCE(SUM(actions_executed), 0) AS executed, COALESCE(SUM(actions_failed), 0) AS failed, COALESCE(SUM(changes_made), 0) AS changes_made FROM %i WHERE DATE(created_at) BETWEEN %s AND %s", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $period_start,
                $period_end
            ),
            ARRAY_A
        );

        return array(
            'executed'     => (int) ( $row['executed'] ?? 0 ),
            'failed'       => (int) ( $row['failed'] ?? 0 ),
            'changes_made' => (int) ( $row['changes_made'] ?? 0 ),
        );
    }

    /**
     * Real per-action-type success counts for one date range - "N alerts
     * sent" (`create-notification`) / "N reports delivered" (`send-email`)
     * on the "Automate Work" page's own "This month" card. `result_log`
     * (JSON array of `{success, action_id, message}`, this class's own
     * docblock) has no dedicated column per action type, so this reads and
     * decodes it per matching run rather than a single aggregate SQL query
     * - the same real per-action `action_id` `AutomationLogsPanel.tsx`'s
     * own "View details" expansion already surfaces, just tallied instead
     * of listed. Counts successful entries only - a failed send-email
     * attempt wasn't actually "delivered".
     *
     * @param string $period_start Y-m-d, inclusive.
     * @param string $period_end   Y-m-d, inclusive.
     * @return array<string, int> Real action id => successful-execution count.
     */
    public function get_action_type_totals_for_period( string $period_start, string $period_end ): array {
        global $wpdb;

        $logs = $wpdb->get_col( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- {$this->get_table()} is this plugin's own table name, not user input.
            $wpdb->prepare(
                "SELECT result_log FROM %i WHERE DATE(created_at) BETWEEN %s AND %s AND result_log IS NOT NULL", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $period_start,
                $period_end
            )
        );

        $totals = array();

        foreach ( $logs as $log ) {
            $entries = json_decode( (string) $log, true );

            if ( ! is_array( $entries ) ) {
                continue;
            }

            foreach ( $entries as $entry ) {
                if ( ! is_array( $entry ) || empty( $entry['success'] ) || empty( $entry['action_id'] ) ) {
                    continue;
                }

                $action_id            = (string) $entry['action_id'];
                $totals[ $action_id ] = ( $totals[ $action_id ] ?? 0 ) + 1;
            }
        }

        return $totals;
    }

    /**
     * The single most recent run per automation, for however many of
     * `$automation_ids` actually have one - backs the "Automations" tab's
     * table ("Last run" column: real finished_at + a real
     * succeeded/failed/actions-taken outcome, not a placeholder). One query
     * (a self-join against each automation's own MAX(started_at)) rather
     * than N+1 per-row lookups (performance.md), same shape
     * get_breakdown_by_automation_for_period() above already uses for a
     * batch automation_id lookup.
     *
     * @param int[] $automation_ids Real automation ids to look up; empty returns empty.
     * @return array<int, array{status: string, actions_executed: int, actions_failed: int, changes_made: int, started_at: string, finished_at: string|null}> Keyed by automation_id.
     */
    public function get_latest_by_automation_ids( array $automation_ids ): array {
        global $wpdb;

        $automation_ids = array_values( array_filter( array_map( 'absint', $automation_ids ) ) );

        if ( empty( $automation_ids ) ) {
            return array();
        }

        $placeholders = implode( ',', array_fill( 0, count( $automation_ids ), '%d' ) );

        // {$this->get_table()}/{$placeholders} are this plugin's own table name and a run-time-built
        // string of %d placeholders (one per $automation_ids entry) - not user input, and
        // $automation_ids is passed below as prepare()'s array of values.
        // phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare
        $rows = $wpdb->get_results(
            $wpdb->prepare( // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- the table and optional filters are picked from fixed literals and every value is a bound placeholder; only the placeholder count varies at runtime.
                "SELECT r.automation_id, r.status, r.actions_executed, r.actions_failed, r.changes_made, r.started_at, r.finished_at
                 FROM %i r
                 INNER JOIN (
                     SELECT automation_id, MAX(started_at) AS max_started
                     FROM %i
                     WHERE automation_id IN ({$placeholders})
                     GROUP BY automation_id
                 ) latest ON latest.automation_id = r.automation_id AND latest.max_started = r.started_at",
                $this->get_table(),
                $this->get_table(),
                ...$automation_ids
            ),
            ARRAY_A
        );
        // phpcs:enable

        $by_automation_id = array();

        // A tie on started_at (two runs the same second) would return two
        // rows for one automation_id - keep the first and skip the rest
        // rather than letting the later one silently win, same defensive
        // shape a GROUP BY-then-join pattern always needs.
        foreach ( (array) $rows as $row ) {
            $automation_id = (int) $row['automation_id'];

            if ( isset( $by_automation_id[ $automation_id ] ) ) {
                continue;
            }

            $by_automation_id[ $automation_id ] = array(
                'status'           => (string) $row['status'],
                'actions_executed' => (int) $row['actions_executed'],
                'actions_failed'   => (int) $row['actions_failed'],
                'changes_made'     => (int) $row['changes_made'],
                'started_at'       => (string) $row['started_at'],
                'finished_at'      => $row['finished_at'] ?: null,
            );
        }

        return $by_automation_id;
    }

    /**
     * Real count of automation runs that failed to complete since a given
     * timestamp - backs "Commerce"'s "Store Automation" category card
     * (StoreReadiness.php) and its own "N automatic tasks failed" number.
     * Same single-status-count shape as get_stats_for_period()'s own
     * `by_status['failed']`, just windowed by a timestamp instead of a
     * Y-m-d date range (the caller wants "recently," not a report period).
     *
     * @param string $since_mysql_datetime 'Y-m-d H:i:s', inclusive.
     * @return int
     */
    public function get_failed_count_since( string $since_mysql_datetime ): int {
        global $wpdb;

        return (int) $wpdb->get_var( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- {$this->get_table()} is this plugin's own table name, not user input.
            $wpdb->prepare(
                "SELECT COUNT(*) FROM %i WHERE status = 'failed' AND created_at >= %s", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $since_mysql_datetime
            )
        );
    }

    /**
     * The single most recent real run across every automation - what the
     * "Automate Work" hero card's own real "Last check" stat reads (see
     * AutomationDashboardRest::get_items()'s own `last_check_at`), not a
     * per-automation lookup like get_latest_by_automation_ids().
     *
     * @return string|null 'Y-m-d H:i:s', or null if no automation has ever run.
     */
    public function get_most_recent_finished_at(): ?string {
        global $wpdb;

        $value = $wpdb->get_var( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- {$this->get_table()} is this plugin's own table name, not user input.
            $wpdb->prepare( 'SELECT MAX(finished_at) FROM %i WHERE finished_at IS NOT NULL', $this->get_table() )
        );

        return $value ?: null;
    }

    /**
     * Per-automation run counts for one date range, joined against
     * `vulopilot_automations` for the display name - what the report's
     * "automations" section table reads, one query instead of an N+1 name
     * lookup per row (performance.md).
     *
     * @param string $period_start Y-m-d, inclusive.
     * @param string $period_end   Y-m-d, inclusive.
     * @return array<int, array{automation_id: int, name: string, runs: int, succeeded: int, failed: int}>
     */
    public function get_breakdown_by_automation_for_period( string $period_start, string $period_end ): array {
        global $wpdb;

        $automations_table = $wpdb->prefix . CoreUtill::TABLES['automations'];

        // {$this->get_table()}/{$automations_table} are this plugin's own table names, not user input.
        // phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT r.automation_id AS automation_id, a.name AS name,
                        COUNT(*) AS runs,
                        SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS succeeded,
                        SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END) AS failed
                 FROM %i r
                 LEFT JOIN %i a ON a.id = r.automation_id
                 WHERE DATE(r.created_at) BETWEEN %s AND %s
                 GROUP BY r.automation_id, a.name
                 ORDER BY runs DESC", $this->get_table(),
                $automations_table,
                $period_start,
                $period_end
            ),
            ARRAY_A
        );
        // phpcs:enable

        return array_map(
            static fn( array $row ): array => array(
                'automation_id' => (int) $row['automation_id'],
                'name'          => $row['name'] ?? __( 'Deleted automation', 'vulopilot' ),
                'runs'          => (int) $row['runs'],
                'succeeded'     => (int) $row['succeeded'],
                'failed'        => (int) $row['failed'],
            ),
            $rows ?: array()
        );
    }
}
