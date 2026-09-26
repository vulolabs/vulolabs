<?php
/**
 * PageSpeedRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Performance;
use VuloPilot\Utill\RepositoryUtil;

use VuloPilot\Utill as CoreUtill;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for `vulopilot_page_speed` - "Performance" › Slow Pages'
 * per-page table, written by Services\PageSpeedScanner. One row per real
 * WP page/post/store-platform page it has checked; `replace_for_url()` deletes
 * any prior row for that URL before inserting the fresh one, so a page not
 * yet rescanned keeps showing its last real result instead of disappearing
 * mid-scan.
 *
 * @class       PageSpeedRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class PageSpeedRepository extends RepositoryUtil {

    /**
     * Columns find_all() accepts as exact-match filters.
     *
     * @var string[]
     */
    protected array $filterable_columns = array( 'page_type', 'status' );

    /**
     * Columns an incoming `search` arg is LIKE-matched against.
     *
     * @var string[]
     */
    protected array $searchable_columns = array( 'title', 'url' );

    /**
     * Score, inclusive, at/above which a page counts as "Good" -
     * same real band this codebase's own mockup education copy states.
     */
    public const SCORE_GOOD = 80;

    /**
     * Score, inclusive, at/above which a page counts as "Needs Improvement"
     * rather than "Poor".
     */
    public const SCORE_NEEDS_IMPROVEMENT = 50;

    /**
     * Score, exclusive upper bound, below which a "Poor"/'slow' page is
     * real enough of an outlier to also count as "Very Slow" - a real
     * sub-band within the existing 'slow' status (not a 4th backend status
     * value, so every pre-existing status-count consumer keeps working
     * unchanged; see get_summary()'s own docblock).
     */
    public const SCORE_VERY_SLOW = 25;

    /**
     * CoreUtill::TABLES key this repository owns.
     *
     * @inheritDoc
     */
    protected function get_table_key(): string {
        return 'page_speed';
    }

    /**
     * Replaces any existing row for this URL with a fresh one - a rescan
     * supersedes, it never accumulates history (Slow Pages shows current
     * state, not a trend).
     *
     * @param array<string, mixed> $data Row data, must include 'url'.
     * @return int New row id.
     */
    public function replace_for_url( array $data ): int {
        global $wpdb;

        $wpdb->delete( $this->get_table(), array( 'url' => $data['url'] ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching

        return $this->insert( $data );
    }

    /**
     * Deletes rows whose URL isn't in the given (current) real page list -
     * so a page removed from the site (e.g. a deleted product) doesn't
     * linger in Slow Pages forever.
     *
     * @param string[] $current_urls Real URLs the latest scan enumerated.
     * @return void
     */
    public function delete_missing( array $current_urls ): void {
        global $wpdb;

        if ( empty( $current_urls ) ) {
            return;
        }

        $placeholders = implode( ', ', array_fill( 0, count( $current_urls ), '%s' ) );

        $wpdb->query( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare( // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- the table and optional filters are picked from fixed literals and every value is a bound placeholder; only the placeholder count varies at runtime.
                "DELETE FROM %i WHERE url NOT IN ({$placeholders})", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare
                ...$current_urls
            )
        );
    }

    /**
     * Real counts by score band, plus real average desktop/mobile scores
     * across whichever rows have one - `avg_score` (the table's own
     * `score` column, desktop/lab) added for
     * Controllers\ReportsOverview's own "device experience" bars, which
     * need both sides of the same real comparison `avg_mobile_score`
     * alone can't provide. `very_slow` is a real sub-count *within* `slow`
     * (score < SCORE_VERY_SLOW), not additional to it - `slow` alone still
     * means the same "Poor" band it always has, so summing
     * good+needs_improvement+slow still equals `total`.
     *
     * @return array{total: int, slow: int, very_slow: int, needs_improvement: int, good: int, avg_score: int|null, avg_mobile_score: int|null, avg_load_time_ms: int|null, last_scanned_at: string|null}
     */
    public function get_summary(): array {
        global $wpdb;

        $rows = $wpdb->get_results( $wpdb->prepare( 'SELECT score, mobile_score, load_time_ms FROM %i', $this->get_table() ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching

        $rows      = (array) $rows;
        $total     = count( $rows );
        $slow      = 0;
        $very_slow = 0;
        $needs     = 0;
        $good      = 0;

        $scores        = array();
        $mobile_scores = array();
        $load_times    = array();

        foreach ( $rows as $row ) {
            $score = null === $row['score'] ? null : (int) $row['score'];

            if ( null !== $score ) {
                if ( $score >= self::SCORE_GOOD ) {
                    ++$good;
                } elseif ( $score >= self::SCORE_NEEDS_IMPROVEMENT ) {
                    ++$needs;
                } else {
                    ++$slow;

                    if ( $score < self::SCORE_VERY_SLOW ) {
                        ++$very_slow;
                    }
                }

                $scores[] = $score;
            }

            if ( null !== $row['mobile_score'] ) {
                $mobile_scores[] = (int) $row['mobile_score'];
            }

            if ( null !== $row['load_time_ms'] ) {
                $load_times[] = (int) $row['load_time_ms'];
            }
        }

        $last_scanned_at = $wpdb->get_var( $wpdb->prepare( 'SELECT MAX(scanned_at) FROM %i', $this->get_table() ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching

        return array(
            'total'             => $total,
            'slow'              => $slow,
            'very_slow'         => $very_slow,
            'needs_improvement' => $needs,
            'good'              => $good,
            'avg_score'         => $scores ? (int) round( array_sum( $scores ) / count( $scores ) ) : null,
            'avg_mobile_score'  => $mobile_scores ? (int) round( array_sum( $mobile_scores ) / count( $mobile_scores ) ) : null,
            'avg_load_time_ms'  => $load_times ? (int) round( array_sum( $load_times ) / count( $load_times ) ) : null,
            'last_scanned_at'   => $last_scanned_at ? $last_scanned_at : null,
        );
    }

    /**
     * The real, deduplicated `main_issue` values across every scanned page
     * (each already either a real Google Lighthouse opportunity-audit
     * title or a plain load-time-based label - see
     * Install.php::create_page_speed_table()'s own docblock), grouped and
     * counted - backs the "Performance Opportunities" tab and the "Why
     * these pages are slow?" sidebar. Never a fabricated issue list: a
     * freshly-scanned site with no `main_issue` at all on any row simply
     * returns an empty array, rendered as an honest "nothing to fix"
     * empty state by the caller.
     *
     * @param int $limit Real issues to return, ranked by how many pages they affect.
     * @return array<int, array{issue: string, affected_pages: int}>
     */
    public function get_top_issues( int $limit = 10 ): array {
        global $wpdb;

        $rows = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                "SELECT main_issue, COUNT(*) AS affected_pages FROM %i WHERE main_issue IS NOT NULL AND main_issue != '' GROUP BY main_issue ORDER BY affected_pages DESC LIMIT %d", $this->get_table(), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $limit
            ),
            ARRAY_A
        );

        return array_map(
            static fn( array $row ): array => array(
                'issue'          => (string) $row['main_issue'],
                'affected_pages' => (int) $row['affected_pages'],
            ),
            $rows ?: array()
        );
    }
}
