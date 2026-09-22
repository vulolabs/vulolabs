<?php
/**
 * FirewallScanner class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Scanners\Basic;

use VuloPilot\Repositories\FirewallBlockRepository;
use VuloPilot\ValueObjects\Finding;
use VuloPilot\ValueObjects\Severity;
use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Turns Services\FirewallGuard's own real request block/log
 * (`vulopilot_security_events` (type `firewall_block`)) into one real summary Finding when there's
 * been any activity in the last 7 days — `HIGH` when a single IP repeatedly
 * hit real exploit-signature rules (a real, escalating threat signal, not a
 * one-off), `MEDIUM` otherwise. Zero findings when the log is empty, or
 * when the Firewall is disabled entirely.
 *
 * @class       FirewallScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class FirewallScanner extends AbstractBasicScanner {

    /**
     * Real lookback window for the summary.
     *
     * @var int
     */
    private const LOOKBACK_DAYS = 7;

    /**
     * A single IP hitting this many real matched-rule requests in the
     * lookback window is escalated to HIGH — a real repeated-targeting
     * signal, not a one-off.
     *
     * @var int
     */
    private const REPEAT_OFFENDER_THRESHOLD = 5;

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'firewall';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'Firewall', 'vulopilot' );
    }

    /**
     * @inheritDoc
     */
    public function get_category(): string {
        return 'security';
    }

    /**
     * @inheritDoc
     */
    public function scan(): array {
        $findings = array();

        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['enable_firewall'] ) ) {
            return $findings;
        }

        $repository = new FirewallBlockRepository();
        $total      = $repository->count_recent( self::LOOKBACK_DAYS );

        if ( 0 === $total ) {
            return $findings;
        }

        $most_active   = $repository->get_most_active_ip( self::LOOKBACK_DAYS );
        $is_repeat_hit = $most_active && $most_active['hit_count'] >= self::REPEAT_OFFENDER_THRESHOLD;
        $blocking_on   = ! empty( $settings['enable_firewall_blocking'] );

        $description = $blocking_on
            ? __( 'These requests matched a known attack pattern (SQL injection, path traversal, or a direct PHP execution attempt inside the uploads directory) and were blocked in real time.', 'vulopilot' )
            : __( 'These requests matched a known attack pattern but were only logged — real-time blocking is currently off. Turn on "Enable active blocking" in Settings → Scanning → Security to have these blocked automatically.', 'vulopilot' );

        if ( $is_repeat_hit && $most_active ) {
            $findings[] = new Finding(
                sprintf(
                    /* translators: 1: number of requests, 2: IP address. */
                    __( '%1$d malicious requests from IP %2$s in the last 7 days', 'vulopilot' ),
                    $most_active['hit_count'],
                    $most_active['ip_address']
                ),
                Severity::HIGH,
                $this->get_category(),
                $description,
                'ip_address',
                $most_active['ip_address'],
                array(),
                'firewall-ip-activity'
            );
        } else {
            $findings[] = new Finding(
                sprintf(
                    /* translators: %d is the number of matched requests. */
                    __( '%d malicious requests logged in the last 7 days', 'vulopilot' ),
                    $total
                ),
                Severity::MEDIUM,
                $this->get_category(),
                $description,
                null,
                null,
                array(),
                'firewall-sitewide-activity'
            );
        }

        return $findings;
    }
}
