<?php
/**
 * NotFoundLogRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Content;
use VuloPilot\Utill\RepositoryUtil;

use VuloPilot\Utill as CoreUtill;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for vulopilot_not_found_logs - one row per unique missing
 * URL visitors actually hit, not one row per visit (Install.php's own
 * schema: `requested_path` is UNIQUE). log_or_increment() is the only way
 * rows are ever written to this table (Services\NotFoundLogger), keeping
 * the upsert-by-unique-key logic in one place rather than duplicated at
 * the call site.
 *
 * @class       NotFoundLogRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class NotFoundLogRepository extends RepositoryUtil {

    /**
     * Columns find_all() may filter on - `is_system` is what lets
     * RedirectsTab.tsx's main 404 log fetch real content pages only
     * (`is_system=0`) while its own "System 404s" popup fetches the rest
     * (`is_system=1`), both from this one table.
     *
     * @var string[]
     */
    protected array $filterable_columns = array( 'is_system' );

    /**
     * Columns an incoming `search` arg is matched against.
     *
     * @var string[]
     */
    protected array $searchable_columns = array( 'requested_path' );

    /**
     * CoreUtill::TABLES key this repository owns.
     *
     * @inheritDoc
     */
    protected function get_table_key(): string {
        return 'not_found_log';
    }

    /**
     * Looks up a 404 log row by its exact requested path.
     *
     * @param string $requested_path Already-normalized path (RedirectRepository::normalize_path()).
     * @return array<string, mixed>|null
     */
    public function find_by_requested_path( string $requested_path ): ?array {
        global $wpdb;

        $row = $wpdb->get_row(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare( "SELECT * FROM %i WHERE requested_path = %s", $this->get_table(), $requested_path ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            ARRAY_A
        );

        return $row ? $row : null;
    }

    /**
     * Records one 404 visit - inserts a new row for a path seen for the
     * first time, or bumps `hit_count`/`last_seen_at` on an existing one.
     * Deliberately not a raw `INSERT ... ON DUPLICATE KEY UPDATE` - this
     * only ever runs once per real 404 page load (Services\NotFoundLogger's
     * own template_redirect hook), nowhere near the request volume that
     * would make the extra find-then-write round trip a real concern, and
     * it keeps this class consistent with every other repository's
     * plain find()/insert()/update() calls rather than introducing the
     * only raw upsert statement in this codebase.
     *
     * @param string      $requested_path Already-normalized path.
     * @param string|null $referrer       The visit's HTTP referrer, if any.
     * @param bool        $is_system      True for a theme/plugin/core-file or static-asset path (Services\NotFoundLogger::is_noise_path()) - a real 404, just not a missing CONTENT page.
     * @return void
     */
    public function log_or_increment( string $requested_path, ?string $referrer, bool $is_system = false ): void {
        $existing = $this->find_by_requested_path( $requested_path );

        if ( $existing ) {
            $this->update(
                (int) $existing['id'],
                array(
                    'hit_count'    => (int) $existing['hit_count'] + 1,
                    'referrer'     => $referrer,
                    'last_seen_at' => current_time( 'mysql' ),
                    // $is_system is recomputed the same way from the same
                    // path every time, not user/environment-dependent, so
                    // re-asserting it here on a repeat hit is harmless and
                    // self-heals a row that predates this column
                    // (defaulted to 0 by dbDelta's own ADD COLUMN).
                    'is_system'    => $is_system ? 1 : 0,
                )
            );

            return;
        }

        $this->insert(
            array(
                'requested_path' => $requested_path,
                'referrer'       => $referrer,
                'hit_count'      => 1,
                'last_seen_at'   => current_time( 'mysql' ),
                'is_system'      => $is_system ? 1 : 0,
            )
        );
    }
}
