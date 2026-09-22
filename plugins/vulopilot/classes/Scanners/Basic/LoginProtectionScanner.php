<?php
/**
 * LoginProtectionScanner class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Scanners\Basic;

use VuloPilot\Repositories\LoginAttemptRepository;
use VuloPilot\ValueObjects\Finding;
use VuloPilot\ValueObjects\Severity;
use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Turns Services\LoginProtectionGuard's own real login-attempt log
 * (`vulopilot_security_events` (type `login_attempt`)) into real Finding rows — one per IP that
 * actually tripped the real, currently-configured `login_max_attempts`
 * lockout threshold in the last 7 days. Deliberately re-derives "did this
 * IP trip the threshold" from the raw attempt rows against the *current*
 * setting value at scan time, rather than a separate persisted
 * lockout-event log — see LoginAttemptRepository::get_recent_lockouts()'s
 * own docblock for why. Zero findings when nothing tripped it, or when
 * Login Protection is disabled entirely (no nagging about a disabled
 * feature).
 *
 * @class       LoginProtectionScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class LoginProtectionScanner extends AbstractBasicScanner {

    /**
     * Real lookback window for "recent" lockouts.
     *
     * @var int
     */
    private const LOOKBACK_DAYS = 7;

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'login-protection';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'Login Protection', 'vulopilot' );
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

        if ( empty( $settings['enable_login_protection'] ) ) {
            return $findings;
        }

        $threshold  = max( 1, absint( $settings['login_max_attempts'] ) ?: 5 );
        $repository = new LoginAttemptRepository();
        $lockouts   = $repository->get_recent_lockouts( self::LOOKBACK_DAYS, $threshold );

        foreach ( $lockouts as $lockout ) {
            $findings[] = new Finding(
                sprintf(
                    /* translators: 1: IP address, 2: number of failed attempts. */
                    __( 'IP %1$s was blocked after %2$d failed login attempts', 'vulopilot' ),
                    $lockout['ip_address'],
                    $lockout['failure_count']
                ),
                Severity::MEDIUM,
                $this->get_category(),
                sprintf(
                    /* translators: %d is how many days this report covers. */
                    __( 'Real login attempts logged by Login Protection in the last %d days. If this wasn\'t you, no action is needed — the attempts were already blocked.', 'vulopilot' ),
                    self::LOOKBACK_DAYS
                ),
                'ip_address',
                $lockout['ip_address'],
                array(),
                'login-lockout'
            );
        }

        return $findings;
    }
}
