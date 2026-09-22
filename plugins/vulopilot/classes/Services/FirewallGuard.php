<?php
/**
 * FirewallGuard class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Repositories\FirewallBlockRepository;
use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Real, always-on request-time pattern blocking — Protect My Site's
 * "Firewall" tile. Unconditionally constructed in VuloPilot::init_classes()
 * (not a Modules-page module), hooks `init` at priority 1 (as early as a
 * plugin can practically run).
 *
 * Checks only the request URI + raw query string — deliberately never
 * `$_POST`, since inspecting POST bodies for these same substrings would
 * false-positive on entirely legitimate content (e.g. an admin editing a
 * blog post that happens to discuss SQL injection, or pasting a `../`
 * relative path into a code sample). A small, well-known, low-false-
 * positive pattern set: SQL-injection markers, path traversal, a direct
 * PHP-execution attempt inside `wp-content/uploads/` (the same signal
 * Scanners\Basic\MalwareScanner's Check A uses, here checked at request
 * time instead of at rest), and null-byte injection.
 *
 * On a match, **always** logs a real row (`vulopilot_security_events` (type `firewall_block`)).
 * Only actually blocks (403 + terminate) when `enable_firewall_blocking`
 * is explicitly turned on — off by default, so a false positive can't lock
 * out a legitimate request the moment this ships. See
 * Scanners\Basic\FirewallScanner for the real summary Finding built from
 * this same log.
 *
 * @class       FirewallGuard class
 * @version     1.0.0
 * @author      VuloLabs
 */
class FirewallGuard {

    /**
     * Pattern => human-readable rule name, checked against the decoded
     * request URI + raw query string. Kept small and well-known — same
     * "hardening check, not a comprehensive WAF" posture MalwareScanner's
     * own signature list uses.
     *
     * @var array<string, string>
     */
    private const RULES = array(
        '/union\s+select/i'          => 'sql-injection',
        '/information_schema/i'      => 'sql-injection',
        "/'\\s*or\\s*'?1'?\\s*=\\s*'?1/i" => 'sql-injection',
        '/\.\.\/\.\.\//'             => 'path-traversal',
        '/wp-content\/uploads\/.*\.(php|phtml)/i' => 'uploads-php-execution',
        '/%00/i'                     => 'null-byte-injection',
    );

    /**
     * FirewallGuard constructor.
     */
    public function __construct() {
        add_action( 'init', array( $this, 'inspect_request' ), 1 );
    }

    /**
     * Real client IP, `$_SERVER['REMOTE_ADDR']` only — same reasoning as
     * LoginProtectionGuard::get_client_ip().
     *
     * @return string
     */
    private function get_client_ip(): string {
        $raw = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.MissingUnslash

        $valid = filter_var( $raw, FILTER_VALIDATE_IP );

        return $valid ? $valid : '0.0.0.0';
    }

    /**
     * `init` callback (priority 1) — checked on every real front-end/admin
     * request.
     *
     * @return void
     */
    public function inspect_request(): void {
        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['enable_firewall'] ) ) {
            return;
        }

        $request_uri = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.MissingUnslash

        if ( '' === $request_uri ) {
            return;
        }

        $decoded_uri = rawurldecode( $request_uri );

        foreach ( self::RULES as $pattern => $rule_name ) {
            if ( ! preg_match( $pattern, $decoded_uri ) ) {
                continue;
            }

            $blocking_on = ! empty( $settings['enable_firewall_blocking'] );

            ( new FirewallBlockRepository() )->insert(
                array(
                    'ip_address'   => $this->get_client_ip(),
                    'request_uri'  => $request_uri,
                    'rule_matched' => $rule_name,
                    'action'       => $blocking_on ? 'blocked' : 'logged',
                    'created_at'   => current_time( 'mysql' ),
                )
            );

            if ( $blocking_on ) {
                nocache_headers();
                status_header( 403 );
                wp_die(
                    esc_html__( 'Request blocked.', 'vulopilot' ),
                    esc_html__( 'Forbidden', 'vulopilot' ),
                    array( 'response' => 403 )
                );
            }

            // One matched rule is enough to act on — no need to keep
            // checking the remaining rules against this same request.
            return;
        }
    }
}
