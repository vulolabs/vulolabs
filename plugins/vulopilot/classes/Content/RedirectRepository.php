<?php
/**
 * RedirectRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Content;
use VuloPilot\Utill\RepositoryUtil;

use VuloPilot\Utill as CoreUtill;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for vulopilot_redirects - the "Redirects & 404s" feature's
 * user-managed 301/302 redirect table. `source_path` is unique (Install.php's
 * own schema), so find_by_source_path() below is the one real hot-path
 * lookup: Services\RedirectManager calls it on every single front-end
 * request while the redirect manager setting is on, so it's a direct
 * indexed query rather than routing through find_all()'s paginated
 * count-then-select shape.
 *
 * @class       RedirectRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class RedirectRepository extends RepositoryUtil {

    /**
     * Columns find_all() may filter on.
     *
     * @var string[]
     */
    protected array $filterable_columns = array( 'is_active', 'source_path' );

    /**
     * Columns an incoming `search` arg is matched against.
     *
     * @var string[]
     */
    protected array $searchable_columns = array( 'source_path', 'target_url' );

    /**
     * CoreUtill::TABLES key this repository owns.
     *
     * @inheritDoc
     */
    protected function get_table_key(): string {
        return 'redirect';
    }

    /**
     * Looks up a redirect row by its exact source path.
     *
     * @param string $source_path Already-normalized path (see normalize_path()).
     * @return array<string, mixed>|null
     */
    public function find_by_source_path( string $source_path ): ?array {
        global $wpdb;

        $row = $wpdb->get_row(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare( "SELECT * FROM %i WHERE source_path = %s", $this->get_table(), $source_path ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            ARRAY_A
        );

        return $row ? $row : null;
    }

    /**
     * Bumps a redirect's own hit counter and records the moment - called by
     * Services\RedirectManager every time it actually redirects a real
     * visitor through this row, so the Redirects page can show both which
     * rules are actually being hit and when one was last used.
     * `current_time( 'mysql' )` matches NotFoundLogRepository::log_or_increment()'s
     * own `last_seen_at` write, this table's equivalent field.
     *
     * @param int $id Redirect row id.
     * @return void
     */
    public function increment_hit_count( int $id ): void {
        global $wpdb;

        $wpdb->query( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                "UPDATE %i SET hit_count = hit_count + 1, last_accessed_at = %s WHERE id = %d", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                current_time( 'mysql' ),
                $id
            )
        );
    }

    /**
     * Normalizes a raw request path into the exact comparable form both
     * `source_path` (this table) and `requested_path`
     * (NotFoundLogRepository) are stored/matched in - a single shared
     * definition of "what counts as the same path" is what makes "convert
     * this 404 log entry into a redirect" (the Redirects page's own
     * feature) actually produce a redirect that will match the same
     * request again: strips the site's own subdirectory-install prefix (if
     * any), forces a leading slash, and drops any trailing slash except
     * for the root itself.
     *
     * @param string $raw_path A raw REQUEST_URI path component (no query string) or a user-typed path.
     * @return string
     */
    public static function normalize_path( string $raw_path ): string {
        $home_path = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );

        if ( $home_path && '/' !== $home_path && 0 === strpos( $raw_path, $home_path ) ) {
            $raw_path = substr( $raw_path, strlen( $home_path ) );
        }

        $path = '/' . ltrim( $raw_path, '/' );

        return '/' !== $path ? untrailingslashit( $path ) : $path;
    }
}
