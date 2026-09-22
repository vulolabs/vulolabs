<?php
/**
 * FirewallBlockRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Repositories;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for `vulopilot_security_events` (type `firewall_block`) (DATABASE.md) —
 * Services\FirewallGuard's own real request-block/log, backing
 * Scanners\Basic\FirewallScanner's Finding rows.
 *
 * @class       FirewallBlockRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class FirewallBlockRepository extends AbstractRepository {

    /**
     * This repository's `event_type` in the shared `vulopilot_security_events` table.
     */
    private const EVENT_TYPE = 'firewall_block';

    /**
     * @var string[]
     */
    protected array $filterable_columns = array( 'ip_address', 'action' );

    /**
     * @inheritDoc
     */
    /**
     * @inheritDoc
     */
    public function insert( array $data ): int {
        $data['event_type'] = self::EVENT_TYPE;

        return parent::insert( $data );
    }

    protected function get_table_key(): string {
        return 'security_event';
    }

    /**
     * Real block/log-row count in the last N days —
     * Scanners\Basic\FirewallScanner's own summary count.
     *
     * @param int $days Real lookback window.
     * @return int
     */
    public function count_recent( int $days ): int {
        global $wpdb;

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$this->get_table()} WHERE event_type = %s AND created_at >= %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                self::EVENT_TYPE,
                gmdate( 'Y-m-d H:i:s', time() - ( $days * DAY_IN_SECONDS ) )
            )
        );
    }

    /**
     * The single IP with the most matched-rule rows in the last N days —
     * Scanners\Basic\FirewallScanner's own "one IP repeatedly hit real
     * exploit-signature rules" severity escalation. Null when there's
     * nothing in the window at all.
     *
     * @param int $days Real lookback window.
     * @return array{ip_address: string, hit_count: int}|null
     */
    public function get_most_active_ip( int $days ): ?array {
        global $wpdb;

        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT ip_address, COUNT(*) AS hit_count FROM {$this->get_table()} WHERE event_type = %s AND created_at >= %s GROUP BY ip_address ORDER BY hit_count DESC LIMIT 1", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                self::EVENT_TYPE,
                gmdate( 'Y-m-d H:i:s', time() - ( $days * DAY_IN_SECONDS ) )
            ),
            ARRAY_A
        );

        if ( ! $row ) {
            return null;
        }

        return array(
            'ip_address' => (string) $row['ip_address'],
            'hit_count'  => (int) $row['hit_count'],
        );
    }
}
