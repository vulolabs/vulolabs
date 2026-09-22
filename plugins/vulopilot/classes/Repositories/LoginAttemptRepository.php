<?php
/**
 * LoginAttemptRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Repositories;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for `vulopilot_security_events` (type `login_attempt`) (DATABASE.md) —
 * Services\LoginProtectionGuard's own real failed/successful login log,
 * backing both the live brute-force lockout check and
 * Scanners\Basic\LoginProtectionScanner's Finding rows.
 *
 * @class       LoginAttemptRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class LoginAttemptRepository extends AbstractRepository {

    /**
     * This repository's `event_type` in the shared `vulopilot_security_events` table.
     */
    private const EVENT_TYPE = 'login_attempt';

    /**
     * @var string[]
     */
    protected array $filterable_columns = array( 'ip_address', 'success' );

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
     * Real failed-attempt count for one IP within a rolling time window —
     * LoginProtectionGuard::block_if_locked_out()'s only query.
     *
     * @param string $ip_address   Real client IP.
     * @param int    $minutes      Rolling window size.
     * @return int
     */
    public function count_recent_failures( string $ip_address, int $minutes ): int {
        global $wpdb;

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$this->get_table()} WHERE event_type = %s AND ip_address = %s AND success = 0 AND created_at >= %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                self::EVENT_TYPE,
                $ip_address,
                gmdate( 'Y-m-d H:i:s', time() - ( $minutes * MINUTE_IN_SECONDS ) )
            )
        );
    }

    /**
     * Every distinct IP that actually tripped the lockout threshold at some
     * point in the last N days, with its own real failure count in that
     * window — Scanners\Basic\LoginProtectionScanner's own data source.
     * Deliberately re-derives "did this IP ever exceed the threshold" from
     * raw attempt rows rather than a separate "lockouts" table — the
     * threshold itself is a live setting (`login_max_attempts`), so a fixed
     * lockout-event table would drift out of sync with it the moment an
     * admin changes the setting.
     *
     * @param int $days       Real lookback window.
     * @param int $threshold  Real, current `login_max_attempts` setting value.
     * @return array<int, array{ip_address: string, failure_count: int}>
     */
    public function get_recent_lockouts( int $days, int $threshold ): array {
        global $wpdb;

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT ip_address, COUNT(*) AS failure_count FROM {$this->get_table()} WHERE event_type = %s AND success = 0 AND created_at >= %s GROUP BY ip_address HAVING failure_count >= %d ORDER BY failure_count DESC", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                self::EVENT_TYPE,
                gmdate( 'Y-m-d H:i:s', time() - ( $days * DAY_IN_SECONDS ) ),
                $threshold
            ),
            ARRAY_A
        );

        return array_map(
            static fn( array $row ): array => array(
                'ip_address'    => (string) $row['ip_address'],
                'failure_count' => (int) $row['failure_count'],
            ),
            (array) $rows
        );
    }
}
