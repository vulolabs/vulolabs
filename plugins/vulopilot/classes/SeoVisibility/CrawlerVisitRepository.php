<?php
/**
 * CrawlerVisitRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\SeoVisibility;
use VuloPilot\Utill\FindingRepository;
use VuloPilot\Utill\RepositoryUtil;


defined( 'ABSPATH' ) || exit;

/**
 * @class       CrawlerVisitRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class CrawlerVisitRepository extends RepositoryUtil {

    /**
     * @var string[]
     */
    protected array $filterable_columns = array( 'bot_name' );

    /**
     * @var string[]
     */
    protected array $searchable_columns = array( 'requested_url' );

    /**
     * @inheritDoc
     */
    protected function get_table_key(): string {
        return 'crawler_visit';
    }

    /**
     * Records one detected bot visit - no IP address, user id, or any
     * other visitor-identifying data is ever stored (readme.txt's FAQ:
     * "It does not track human visitors, IP addresses, or personal data.").
     *
     * @param string $bot_name      Display name of the matched bot (CrawlerTrafficLogger::BOT_SIGNATURES value).
     * @param string $user_agent    The raw User-Agent header that matched.
     * @param string $requested_url The requested path.
     * @param bool   $is_404        Whether WordPress resolved this exact request to a 404 (`is_404()` at
     *                              `template_redirect` time, the same hook this is logged from) - AI Crawler
     *                              Alerts' "access limited" check reads this back via get_404_rate_for_bot().
     * @return int Inserted row id.
     */
    public function log( string $bot_name, string $user_agent, string $requested_url, bool $is_404 = false ): int {
        return $this->insert(
            array(
                'bot_name'      => $bot_name,
                'user_agent'    => $user_agent,
                'requested_url' => $requested_url,
                'is_404'        => $is_404 ? 1 : 0,
            )
        );
    }

    /**
     * Visit counts per bot - backs the Crawler Traffic page's filter-pill
     * bar, same "reuse count_by_column()" pattern
     * ActivityLogRepository::get_actor_type_counts() already uses.
     *
     * @return array<string, int>
     */
    public function get_bot_counts(): array {
        return $this->count_by_column( 'bot_name' );
    }

    /**
     * Most recent visit timestamp per bot - readme.txt's "Last-Seen
     * Timestamps." Still backs `GET /crawler-traffic/summary`, and
     * `get_period_comparison()` above also folds this same real value into
     * each of its own `top_crawlers` rows (that table's own "Last seen"
     * column, per direct instruction to merge the two).
     *
     * @return array<int, array{bot_name: string, last_seen_at: string}>
     */
    public function get_bot_last_seen(): array {
        global $wpdb;

        $rows = $wpdb->get_results(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare( 'SELECT bot_name, MAX(created_at) AS last_seen_at FROM %i GROUP BY bot_name ORDER BY last_seen_at DESC', $this->get_table() ), // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            ARRAY_A
        );

        return $rows ?: array();
    }

    /**
     * Most-requested URLs across every bot - readme.txt's "Most-Crawled
     * Pages."
     *
     * @param int $limit Max rows to return.
     * @return array<int, array{requested_url: string, total: int}>
     */
    public function get_most_crawled_pages( int $limit = 10 ): array {
        global $wpdb;

        $rows = $wpdb->get_results(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare(
                "SELECT requested_url, COUNT(*) AS total FROM %i GROUP BY requested_url ORDER BY total DESC LIMIT %d", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                max( 1, $limit )
            ),
            ARRAY_A
        );

        return $rows ?: array();
    }

    /**
     * Visit counts per calendar day over a trailing window, zero-filled for
     * days with no visits - readme.txt's "Crawl Volume Trend Over Time."
     * Zero-filling follows the same care FindingRepository::get_status_counts()
     * already takes, so a trend chart never shows a misleading gap.
     *
     * @param int $days Trailing window size.
     * @return array<int, array{date: string, total: int}> Oldest first.
     */
    public function get_daily_volume( int $days = 30 ): array {
        global $wpdb;

        $days = max( 1, $days );

        $rows = $wpdb->get_results(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare(
                "SELECT DATE(created_at) AS visit_date, COUNT(*) AS total FROM %i WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL %d DAY) GROUP BY visit_date", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $days
            ),
            ARRAY_A
        );

        $counts_by_date = array();
        foreach ( (array) $rows as $row ) {
            $counts_by_date[ $row['visit_date'] ] = (int) $row['total'];
        }

        $volume = array();
        for ( $offset = $days - 1; $offset >= 0; $offset-- ) {
            $date     = gmdate( 'Y-m-d', strtotime( "-{$offset} days" ) );
            $volume[] = array(
                'date'  => $date,
                'total' => $counts_by_date[ $date ] ?? 0,
            );
        }

        return $volume;
    }

    /**
     * @param int $days Trailing window size.
     * @return array<string, array<int, array{date: string, total: int}>> Bot name => daily volume, oldest first.
     */
    public function get_daily_volume_by_bot( int $days = 30 ): array {
        global $wpdb;

        $days = max( 1, $days );

        $rows = $wpdb->get_results(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare(
                "SELECT bot_name, DATE(created_at) AS visit_date, COUNT(*) AS total FROM %i WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL %d DAY) GROUP BY bot_name, visit_date", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $days
            ),
            ARRAY_A
        );

        $counts_by_bot = array();
        foreach ( (array) $rows as $row ) {
            $counts_by_bot[ $row['bot_name'] ][ $row['visit_date'] ] = (int) $row['total'];
        }

        $volume_by_bot = array();
        foreach ( $counts_by_bot as $bot_name => $counts_by_date ) {
            $volume = array();
            for ( $offset = $days - 1; $offset >= 0; $offset-- ) {
                $date     = gmdate( 'Y-m-d', strtotime( "-{$offset} days" ) );
                $volume[] = array(
                    'date'  => $date,
                    'total' => $counts_by_date[ $date ] ?? 0,
                );
            }
            $volume_by_bot[ $bot_name ] = $volume;
        }

        return $volume_by_bot;
    }

    /**
     * @param string $period_start Y-m-d, inclusive.
     * @param string $period_end   Y-m-d, inclusive.
     * @return array{total: int, by_bot: array<string, int>, top_pages: array<int, array{requested_url: string, total: int}>}
     */
    public function get_stats_for_period( string $period_start, string $period_end ): array {
        global $wpdb;

        $total = (int) $wpdb->get_var(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare(
                "SELECT COUNT(*) FROM %i WHERE created_at >= %s AND created_at < DATE_ADD(%s, INTERVAL 1 DAY)", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $period_start,
                $period_end
            )
        );

        $bot_rows = $wpdb->get_results(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare(
                "SELECT bot_name, COUNT(*) AS total FROM %i WHERE created_at >= %s AND created_at < DATE_ADD(%s, INTERVAL 1 DAY) GROUP BY bot_name", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $period_start,
                $period_end
            ),
            ARRAY_A
        );

        $by_bot = array();
        foreach ( (array) $bot_rows as $row ) {
            $by_bot[ $row['bot_name'] ] = (int) $row['total'];
        }

        $top_pages = $wpdb->get_results(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare(
                "SELECT requested_url, COUNT(*) AS total FROM %i WHERE created_at >= %s AND created_at < DATE_ADD(%s, INTERVAL 1 DAY) GROUP BY requested_url ORDER BY total DESC LIMIT 10", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $period_start,
                $period_end
            ),
            ARRAY_A
        );

        return array(
            'total'     => $total,
            'by_bot'    => $by_bot,
            'top_pages' => $top_pages ?: array(),
        );
    }

    /**
     * Current-vs-previous-period comparison - backs the Crawler Traffic
     * tab's own restyled "at a glance" stat row (total requests, unique
     * crawlers, blocked-pages count lives in the finding table instead -
     * see CrawlerTraffic.php's own `get_analytics()`), "Top Crawlers"
     * table, and "Most-Crawled Pages" table, each with a real %-change
     * figure against the immediately preceding period of equal length -
     * same real-comparison shape `get_stats_for_period()` already provides
     * for one period, computed twice here (current window, then the window
     * immediately before it) so every number on screen is a real count, not
     * a guess.
     *
     * @param int $days Trailing window size (also the length of the "previous" comparison window).
     * @return array{
     *     current_total: int,
     *     previous_total: int,
     *     current_unique_bots: int,
     *     previous_unique_bots: int,
     *     top_crawlers: array<int, array{bot_name: string, total: int, previous_total: int, last_seen_at: string|null}>,
     *     most_crawled_pages: array<int, array{requested_url: string, total: int, previous_total: int}>,
     * }
     */
    public function get_period_comparison( int $days = 30 ): array {
        global $wpdb;

        $days = max( 1, $days );

        $current_start  = gmdate( 'Y-m-d', strtotime( '-' . ( $days - 1 ) . ' days' ) );
        $previous_start = gmdate( 'Y-m-d', strtotime( '-' . ( 2 * $days - 1 ) . ' days' ) );
        $previous_end   = gmdate( 'Y-m-d', strtotime( '-' . $days . ' days' ) );

        $current  = $this->get_stats_for_period( $current_start, gmdate( 'Y-m-d' ) );
        $previous = $this->get_stats_for_period( $previous_start, $previous_end );

        // Same real `MAX(created_at)` per bot get_bot_last_seen() already
        // computes for the summary endpoint's own "Last seen" tiles - reused
        // here (not a second query shape) so Top Crawlers' own "Last seen"
        // column (direct instruction: "merge top crawlers and last seen
        // section add a column in top crawlers last seen") is the exact same
        // real timestamp, not a re-derived one that could disagree.
        $last_seen_by_bot = array();
        foreach ( $this->get_bot_last_seen() as $row ) {
            $last_seen_by_bot[ $row['bot_name'] ] = $row['last_seen_at'];
        }

        $bot_names = array_unique( array_merge( array_keys( $current['by_bot'] ), array_keys( $previous['by_bot'] ) ) );
        $top_crawlers = array();
        foreach ( $bot_names as $bot_name ) {
            $top_crawlers[] = array(
                'bot_name'       => $bot_name,
                'total'          => $current['by_bot'][ $bot_name ] ?? 0,
                'previous_total' => $previous['by_bot'][ $bot_name ] ?? 0,
                'last_seen_at'   => $last_seen_by_bot[ $bot_name ] ?? null,
            );
        }
        usort( $top_crawlers, static fn( $a, $b ) => $b['total'] <=> $a['total'] );

        $page_urls = array_column( $current['top_pages'], 'requested_url' );
        $previous_page_counts = array();
        if ( $page_urls ) {
            $placeholders          = implode( ',', array_fill( 0, count( $page_urls ), '%s' ) );
            $previous_page_rows    = $wpdb->get_results(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
                $wpdb->prepare(  // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
                    "SELECT requested_url, COUNT(*) AS total FROM %i WHERE created_at >= %s AND created_at < DATE_ADD(%s, INTERVAL 1 DAY) AND requested_url IN ({$placeholders}) GROUP BY requested_url", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared
                    array_merge( array( $this->get_table(), $previous_start, $previous_end ), $page_urls )
                ),
                ARRAY_A
            );
            foreach ( (array) $previous_page_rows as $row ) {
                $previous_page_counts[ $row['requested_url'] ] = (int) $row['total'];
            }
        }

        $most_crawled_pages = array_map(
            static fn( $page ) => array(
                'requested_url'  => $page['requested_url'],
                'total'          => (int) $page['total'],
                'previous_total' => $previous_page_counts[ $page['requested_url'] ] ?? 0,
            ),
            $current['top_pages']
        );

        return array(
            'current_total'        => $current['total'],
            'previous_total'       => $previous['total'],
            'current_unique_bots'  => count( $current['by_bot'] ),
            'previous_unique_bots' => count( $previous['by_bot'] ),
            'top_crawlers'         => $top_crawlers,
            'most_crawled_pages'   => $most_crawled_pages,
        );
    }

    /**
     * 404 rate for one bot's most recent visits - AI Crawler Alerts'
     * "access limited" check. Scoped to the last $recent_n visits (not a
     * time window) so a bot that visits rarely doesn't get judged on a
     * single stale hit from weeks ago, and returns null (not 0) when there
     * aren't yet $min_sample visits to judge from - same "don't flag on
     * too little data" restraint CrawlerAlertMonitor::calculate_volume_drop_percent()
     * already applies (requires 8 full days before computing a drop %).
     *
     * @param string $bot_name  Display name (CrawlerTrafficLogger::BOT_SIGNATURES value).
     * @param int    $recent_n  How many of the bot's most recent visits to look at.
     * @param int    $min_sample Minimum visits required before a rate is considered meaningful.
     * @return array{rate_percent: int, sample_size: int}|null
     */
    public function get_404_rate_for_bot( string $bot_name, int $recent_n = 20, int $min_sample = 5 ): ?array {
        global $wpdb;

        $rows = $wpdb->get_results(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare(
                "SELECT is_404 FROM %i WHERE bot_name = %s ORDER BY created_at DESC LIMIT %d", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $bot_name,
                max( 1, $recent_n )
            ),
            ARRAY_A
        );

        $sample_size = count( (array) $rows );

        if ( $sample_size < max( 1, $min_sample ) ) {
            return null;
        }

        $not_found = array_sum( array_column( (array) $rows, 'is_404' ) );

        return array(
            'rate_percent' => (int) round( ( $not_found / $sample_size ) * 100 ),
            'sample_size'  => $sample_size,
        );
    }

    /**
     * Every bot name that has ever logged at least one visit - AI Crawler
     * Alerts' "new crawler detected" check diffs this against a stored
     * "already known" list (CrawlerAlertMonitor::find_newly_detected_bots())
     * rather than a time-windowed query, since a bot's very first visit
     * could have happened at any point in this table's retention window.
     *
     * @return string[]
     */
    public function get_all_bot_names_ever_seen(): array {
        global $wpdb;

        $names = $wpdb->get_col( $wpdb->prepare( 'SELECT DISTINCT bot_name FROM %i', $this->get_table() ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared

        return $names ?: array();
    }

    /**
     * @param int $days Rows with `created_at` older than this many days are deleted.
     * @return int Number of rows deleted.
     */
    public function delete_older_than( int $days ): int {
        global $wpdb;

        $deleted = $wpdb->query(  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.
            $wpdb->prepare(
                "DELETE FROM %i WHERE created_at < DATE_SUB(NOW(), INTERVAL %d DAY)", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                max( 1, $days )
            )
        );

        return false !== $deleted ? (int) $deleted : 0;
    }
}
