<?php
/**
 * RobotsTxtBotAccess class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

defined( 'ABSPATH' ) || exit;

/**
 * Parses `/robots.txt` into per-user-agent Disallow groups, scoped to the
 * known AI bot tokens (CrawlerTrafficLogger::get_bot_signatures()) — the
 * one piece Seo\Scanners\RobotsTxtScanner deliberately doesn't cover
 * (its own docblock: a narrow, wildcard-only check, not a full parser).
 * Real RFC 9309 precedence (Allow overrides, longest-match) is out of
 * scope here too — same "narrow, deliberate check" restraint, just applied
 * to a second, AI-bot-specific question: does a given bot have its OWN
 * named group, or does it fall back to the wildcard (`*`) group's rules,
 * the one piece of real robots.txt semantics this feature needs to be
 * useful (most site owners only ever write a `User-agent: *` block).
 *
 * @class       RobotsTxtBotAccess class
 * @version     1.0.0
 * @author      VuloLabs
 */
class RobotsTxtBotAccess {

    private const REQUEST_TIMEOUT_SECONDS = 8;
    private const CACHE_KEY               = 'vulopilot_robots_txt_bot_groups';
    private const CACHE_TTL_SECONDS       = HOUR_IN_SECONDS;

    /**
     * Settings → Developer Tools' "Clear cache" — same public
     * `clear_cache()` shape `Services\EntityExtractor` already establishes.
     *
     * @return void
     */
    public function clear_cache(): void {
        delete_transient( self::CACHE_KEY );
    }

    /**
     * Disallow paths for one bot token — its own named group if robots.txt
     * has one, otherwise the wildcard group's rules, otherwise empty (no
     * restriction found for that bot).
     *
     * @param string $bot_token Literal User-Agent token, e.g. 'GPTBot'.
     * @return string[] Disallow paths (may include '/').
     */
    public function get_disallowed_paths_for_bot( string $bot_token ): array {
        return $this->resolve_from_groups( $this->get_groups(), $bot_token );
    }

    /**
     * The actual "named group, or fall back to wildcard" resolution —
     * split out from get_disallowed_paths_for_bot() so it's testable
     * against a fixture $groups array without mocking the network fetch
     * get_groups() itself needs.
     *
     * @param array<string, string[]> $groups    Parsed robots.txt groups.
     * @param string                  $bot_token Literal User-Agent token.
     * @return string[]
     */
    private function resolve_from_groups( array $groups, string $bot_token ): array {
        if ( isset( $groups[ $bot_token ] ) ) {
            return $groups[ $bot_token ];
        }

        return $groups['*'] ?? array();
    }

    /**
     * @return array<string, string[]> User-agent token => Disallow paths.
     */
    private function get_groups(): array {
        $cached = get_transient( self::CACHE_KEY );

        if ( is_array( $cached ) ) {
            return $cached;
        }

        $groups   = array();
        $response = wp_remote_get(
            home_url( '/robots.txt' ),
            array(
                'timeout'   => self::REQUEST_TIMEOUT_SECONDS,
                'sslverify' => false,
            )
        );

        if ( ! is_wp_error( $response ) && 200 === wp_remote_retrieve_response_code( $response ) ) {
            $groups = $this->parse_groups( wp_remote_retrieve_body( $response ) );
        }

        set_transient( self::CACHE_KEY, $groups, self::CACHE_TTL_SECONDS );

        return $groups;
    }

    /**
     * @param string $body robots.txt contents.
     * @return array<string, string[]>
     */
    private function parse_groups( string $body ): array {
        $lines               = preg_split( '/\r\n|\r|\n/', $body );
        $current_agents      = array();
        $last_line_was_agent = false;
        $groups              = array();

        foreach ( (array) $lines as $line ) {
            $line = trim( (string) $line );

            if ( '' === $line || '#' === $line[0] ) {
                continue;
            }

            if ( preg_match( '/^user-agent:\s*(.+)$/i', $line, $matches ) ) {
                // A run of consecutive User-agent lines shares the rules
                // that follow (standard robots.txt grouping) — reset the
                // list only when this line doesn't immediately follow
                // another User-agent line.
                if ( ! $last_line_was_agent ) {
                    $current_agents = array();
                }

                $current_agents[]    = trim( $matches[1] );
                $last_line_was_agent = true;
                continue;
            }

            $last_line_was_agent = false;

            if ( empty( $current_agents ) || ! preg_match( '/^disallow:\s*(\S*)\s*$/i', $line, $matches ) ) {
                continue;
            }

            $path = trim( $matches[1] );

            if ( '' === $path ) {
                continue;
            }

            foreach ( $current_agents as $agent ) {
                $groups[ $agent ]   = $groups[ $agent ] ?? array();
                $groups[ $agent ][] = $path;
            }
        }

        return $groups;
    }
}
