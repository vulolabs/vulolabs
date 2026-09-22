<?php
/**
 * LoginProtectionGuard class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Repositories\LoginAttemptRepository;
use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Real, always-on brute-force login protection — Protect My Site's "Login
 * Protection" tile. Unconditionally constructed in VuloPilot::init_classes()
 * (not a Modules-page module), self-registers its own hooks:
 *
 * - `authenticate` (priority 30, after core's own username/email password
 *   checks at priority 20) — before letting this attempt proceed, counts
 *   real recent failures for the requesting IP
 *   (LoginAttemptRepository::count_recent_failures()) within
 *   `login_lockout_minutes`; at/over `login_max_attempts`, returns a
 *   WP_Error — core's own documented short-circuit contract for this
 *   filter, the same mechanism every login-limiter plugin relies on. The
 *   lockout check doesn't depend on whether the guessed password was
 *   correct — that's the point: it blocks the *attempt*, not just a
 *   specific wrong password.
 * - `wp_login_failed` — records one real `success=0` row.
 * - `wp_login` — records one real `success=1` row.
 *
 * IP is read from `$_SERVER['REMOTE_ADDR']` only — never a client-supplied
 * `X-Forwarded-For`-style header, which is trivially spoofable and would
 * let an attacker blame (or exempt) an arbitrary IP.
 *
 * @class       LoginProtectionGuard class
 * @version     1.0.0
 * @author      VuloLabs
 */
class LoginProtectionGuard {

    /**
     * LoginProtectionGuard constructor.
     */
    public function __construct() {
        add_filter( 'authenticate', array( $this, 'block_if_locked_out' ), 30, 3 );
        add_action( 'wp_login_failed', array( $this, 'record_failure' ), 10, 2 );
        add_action( 'wp_login', array( $this, 'record_success' ), 10, 2 );
    }

    /**
     * Real client IP, `$_SERVER['REMOTE_ADDR']` only — see class docblock
     * for why a forwarded-for header is never trusted here.
     *
     * @return string Real IP, or '0.0.0.0' if genuinely unavailable (e.g. CLI context).
     */
    private function get_client_ip(): string {
        $raw = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.MissingUnslash

        $valid = filter_var( $raw, FILTER_VALIDATE_IP );

        return $valid ? $valid : '0.0.0.0';
    }

    /**
     * Real settings, parsed with defaults — same `wp_parse_args()` shape
     * every scanner in this codebase already reads settings with.
     *
     * @return array<string, mixed>
     */
    private function get_settings(): array {
        return wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );
    }

    /**
     * The `authenticate` filter callback — see class docblock.
     *
     * @param \WP_User|\WP_Error|null $user     Current authentication result.
     * @param string                  $username Real username/email being attempted.
     * @param string                  $password Real password being attempted (never stored).
     * @return \WP_User|\WP_Error|null
     */
    public function block_if_locked_out( $user, string $username, string $password ) {
        // No credentials submitted yet (e.g. the login form's first load) —
        // nothing to check.
        if ( '' === $username && '' === $password ) {
            return $user;
        }

        $settings = $this->get_settings();

        if ( empty( $settings['enable_login_protection'] ) ) {
            return $user;
        }

        $max_attempts    = max( 1, absint( $settings['login_max_attempts'] ) ?: 5 );
        $lockout_minutes = max( 1, absint( $settings['login_lockout_minutes'] ) ?: 15 );

        $repository = new LoginAttemptRepository();
        $ip_address = $this->get_client_ip();

        if ( $repository->count_recent_failures( $ip_address, $lockout_minutes ) < $max_attempts ) {
            return $user;
        }

        return new \WP_Error(
            'vulopilot_locked_out',
            sprintf(
                /* translators: %d is how many minutes until this IP can try again. */
                __( '<strong>Error:</strong> Too many failed login attempts. Please try again in %d minutes.', 'vulopilot' ),
                $lockout_minutes
            )
        );
    }

    /**
     * `wp_login_failed` callback — records one real failed attempt.
     *
     * @param string          $username Real username/email that was attempted.
     * @param \WP_Error|mixed $error    Core's own real authentication error (unused — only the fact of failure matters here).
     * @return void
     */
    public function record_failure( string $username, $error = null ): void {
        $settings = $this->get_settings();

        if ( empty( $settings['enable_login_protection'] ) ) {
            return;
        }

        ( new LoginAttemptRepository() )->insert(
            array(
                'ip_address'         => $this->get_client_ip(),
                'username_attempted' => sanitize_user( $username ),
                'success'            => 0,
                'created_at'         => current_time( 'mysql' ),
            )
        );
    }

    /**
     * `wp_login` callback — records one real successful attempt. Failures
     * still age out of the rolling lockout window naturally (no need to
     * clear them here) — see LoginAttemptRepository::count_recent_failures().
     *
     * @param string           $user_login Real username that logged in.
     * @param \WP_User|mixed   $user       Core's own real WP_User (unused).
     * @return void
     */
    public function record_success( string $user_login, $user = null ): void {
        $settings = $this->get_settings();

        if ( empty( $settings['enable_login_protection'] ) ) {
            return;
        }

        ( new LoginAttemptRepository() )->insert(
            array(
                'ip_address'         => $this->get_client_ip(),
                'username_attempted' => sanitize_user( $user_login ),
                'success'            => 1,
                'created_at'         => current_time( 'mysql' ),
            )
        );
    }
}
