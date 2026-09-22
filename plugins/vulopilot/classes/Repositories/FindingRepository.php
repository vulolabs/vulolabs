<?php
/**
 * FindingRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Repositories;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for vulopilot_scan_findings (DATABASE.md). category/severity/
 * status are exactly the filters the admin UI's FindingsTable component
 * (Health/SEO/GEO/WooCommerce/Dashboard pages) already sends. object_ref
 * was added in GEO-MODULE.md's pass so GeoAnalysis\GeoAnalyzer can read
 * every 'geo'-category finding already known about one specific post
 * without a bespoke query. object_type was added alongside it so
 * AutomationEngine\Actions\ResolveFindingAction can look up the one open
 * finding a Recommendation actually came from (object_ref alone isn't
 * unique across object types — e.g. post id 12 and attachment id 12).
 *
 * @class       FindingRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class FindingRepository extends AbstractRepository {

    /**
     * @var string[]
     */
    protected array $filterable_columns = array( 'category', 'severity', 'status', 'object_type', 'object_ref', 'scanner_id' );

    /**
     * @var string[]
     */
    protected array $searchable_columns = array( 'title', 'description' );

    /**
     * @inheritDoc
     */
    protected function get_table_key(): string {
        return 'scan_finding';
    }

    /**
     * The already-open finding a fresh re-detection of the exact same
     * problem should refresh instead of duplicating — originally added
     * specifically for BrokenLinksScanner/BrokenImagesScanner, now called
     * for every scanner by default (ScanPersistenceListener::NEVER_DEDUPE_ON_RESCAN's
     * own docblock explains why the allowlist approach was abandoned): a
     * problem that's still present on the next run (daily cron, or a
     * manual "Run scan") re-adds the same
     * `scanner_id`/`object_type`/`object_ref`/`title` every time
     * (ScanPersistenceListener's own insert loop had no existence check
     * at all), and any page grouping findings by object then shows one
     * duplicate child row per rescan for the one still-open problem — up
     * to 24 duplicate rows for a single object, confirmed live, before
     * this was generalized. Matches on `title` rather than digging into
     * the JSON `meta` column — every scanner already bakes whatever
     * distinguishes this specific finding into its own title (a URL, a
     * file path, ...), so it's already the natural per-object key without
     * a JSON comparison in SQL. Scoped to `status = 'open'` only — a
     * finding a site owner already resolved/ignored should get a
     * brand-new row if the same problem recurs later, not silently flip a
     * closed one back open.
     *
     * `$object_type`/`$object_ref` are nullable for the purely-sitewide
     * scanners that have no specific object to key on (e.g. `php-warnings`
     * — a PHP notice isn't "about" any one post) — those store SQL `NULL`
     * in both columns (AbstractRepository::insert() passes `null` straight
     * through to `$wpdb->insert()`, which stores a real `NULL`, not the
     * string `''`). A plain `column = %s` comparison is never true against
     * a `NULL` column regardless of what's bound, so matching on `NULL`
     * needs its own `IS NULL` branch rather than reusing the `%s`
     * comparison — confirmed live: without this, `php-warnings` piled up
     * 10 duplicate open rows for the identical warning message before
     * this was added, since every rescan's lookup silently matched
     * nothing and fell through to a fresh insert. `title` alone is still
     * enough of a natural key for most scanners (see this method's own
     * docblock above on why `title` already carries whatever distinguishes
     * one finding from another) — but not all of them: a scanner whose
     * title bakes in a live, scan-to-scan-fluctuating number (a word
     * count, a readability score, a byte size) breaks a plain `title`
     * match the moment that number ticks even slightly, same underlying
     * symptom as the `NULL`-object case above (confirmed live:
     * `ThinContentScanner`'s "Thin content (154 words): Sample Page" vs.
     * "Thin content (155 words): Sample Page" on unrelated later runs of
     * the identical page, two permanently-orphaned open rows for one real
     * problem). `$dedupe_key` is that scanner's opt-in fix: when a Finding
     * supplies one (Finding::get_dedupe_key()), matching uses it INSTEAD
     * of `title` entirely, so the volatile display text can keep changing
     * every run without ever affecting dedup. When a Finding doesn't
     * supply one (the default, `null`, for every scanner not rewritten to
     * need this), matching falls back to the exact legacy `title = %s`
     * behavior, scoped to rows that themselves have no `dedupe_key` either
     * — so a pre-existing title-matched row and a future dedupe_key-keyed
     * row for the same scanner can never cross-match each other by
     * accident.
     *
     * @param string      $scanner_id  Finding::get_category()'s owning scanner's own get_id().
     * @param string|null $object_type Finding::get_object_type().
     * @param string|null $object_ref  Finding::get_object_ref().
     * @param string      $title       Finding::get_title().
     * @param string|null $dedupe_key  Finding::get_dedupe_key().
     * @return array<string, mixed>|null
     */
    public function find_open_duplicate( string $scanner_id, ?string $object_type, ?string $object_ref, string $title, ?string $dedupe_key = null ): ?array {
        global $wpdb;

        $conditions = array( "status = 'open'", 'scanner_id = %s' );
        $params     = array( $scanner_id );

        foreach ( array(
            'object_type' => $object_type,
            'object_ref'  => $object_ref,
        ) as $column => $value ) {
            if ( null === $value || '' === $value ) {
                $conditions[] = "{$column} IS NULL";
            } else {
                $conditions[] = "{$column} = %s";
                $params[]     = $value;
            }
        }

        if ( null !== $dedupe_key ) {
            $conditions[] = 'dedupe_key = %s';
            $params[]     = $dedupe_key;
        } else {
            $conditions[] = 'title = %s';
            $conditions[] = 'dedupe_key IS NULL';
            $params[]     = $title;
        }

        $sql = "SELECT * FROM {$this->get_table()} WHERE " . implode( ' AND ', $conditions ) . ' ORDER BY id DESC LIMIT 1'; // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared

        $row = $wpdb->get_row( $wpdb->prepare( $sql, $params ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared

        return $row ?: null;
    }

    /**
     * Every currently-open row id for one scanner — unpaginated (unlike
     * `find_all()`, which caps at 100 rows), since
     * `ScanPersistenceListener::handle_scan_completed()`'s own real
     * auto-resolve step (see that method's own docblock) needs the
     * complete set to diff against, not a page of it, and a scanner like
     * `broken-links` can legitimately have more than 100 open rows on a
     * large site.
     *
     * @param string $scanner_id Finding::get_category()'s owning scanner's own get_id().
     * @return int[]
     */
    public function get_open_finding_ids_for_scanner( string $scanner_id ): array {
        global $wpdb;

        $ids = $wpdb->get_col(
            $wpdb->prepare(
                "SELECT id FROM {$this->get_table()} WHERE status = 'open' AND scanner_id = %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $scanner_id
            )
        );

        return array_map( 'intval', $ids );
    }

    /**
     * Open/resolved/ignored/snoozed counts, zero-filled and optionally
     * scoped to one category and/or one section's scanner_id list — backs
     * the Health/SEO/GEO/WooCommerce findings tables' status-count pill
     * bar, including SEO.tsx's per-section tables (e.g. "Titles & meta"
     * grouping several scanner_id values together, scoped independently of
     * every other SEO section's own pill bar). Delegates to
     * AbstractRepository::count_by_column() rather than hand-rolling
     * another grouped query (same reasoning as AutomationsRepository's
     * get_status_counts()).
     *
     * @param string|null   $category    One of the scanner category strings (SCANNERS.md), or null for every category.
     * @param string[]|null $scanner_ids Scanner ids to scope to (IN-matched), or null for every scanner in $category.
     * @return array{open: int, resolved: int, ignored: int, snoozed: int}
     */
    public function get_status_counts( ?string $category = null, ?array $scanner_ids = null ): array {
        $args = array();

        if ( null !== $category ) {
            $args['category'] = $category;
        }

        if ( null !== $scanner_ids ) {
            $args['scanner_id'] = $scanner_ids;
        }

        return array_merge(
            array(
                'open'     => 0,
                'resolved' => 0,
                'ignored'  => 0,
                'snoozed'  => 0,
            ),
            $this->count_by_column( 'status', $args )
        );
    }

    /**
     * Open findings bucketed into the 3-tier "priority" AI Copilot's
     * "Needs your attention" card shows (mockup: High/Medium/Low pills),
     * collapsed from the real 5-level severity scale rather than a 1:1
     * mapping — critical folds into "high" (nothing is more urgent),
     * info folds into "low" (nothing is less), so no open finding is
     * silently dropped from the total.
     *
     * @return array{high: int, medium: int, low: int}
     */
    public function get_priority_counts(): array {
        $raw = array_merge(
            array(
                'critical' => 0,
                'high'     => 0,
                'medium'   => 0,
                'low'      => 0,
                'info'     => 0,
            ),
            $this->count_by_column( 'severity', array( 'status' => 'open' ) )
        );

        return array(
            'high'   => $raw['critical'] + $raw['high'],
            'medium' => $raw['medium'],
            'low'    => $raw['low'] + $raw['info'],
        );
    }

    /**
     * Same 3-tier Critical+High/Medium/Low collapse as get_priority_counts(),
     * scoped to one scanner_id set instead of the whole site — what a
     * scanner_id-scoped Issues table (the "Schema & Knowledge" tab's own
     * grouped Issues section) needs for its own stat tiles, since
     * get_priority_counts() itself has no scoping parameter (every other
     * caller genuinely wants the sitewide picture regardless of whatever
     * category tab is active — see its own docblock via
     * Controllers/Findings.php's get_finding_groups()).
     *
     * @param string[] $scanner_ids Scanner ids to scope to.
     * @return array{high: int, medium: int, low: int}
     */
    public function get_priority_counts_for_scanner_ids( array $scanner_ids ): array {
        $raw = $this->get_severity_breakdown_for_scanner_ids( $scanner_ids );

        return array(
            'high'   => $raw['critical'] + $raw['high'],
            'medium' => $raw['medium'],
            'low'    => $raw['low'] + $raw['info'],
        );
    }

    /**
     * Groups every currently open finding by its scanner_id and returns
     * the top $limit groups, most-severe-first (ties broken by count) —
     * "Needs your attention"'s list rows read as real per-issue-type
     * counts (e.g. "8 findings: Meta Descriptions") instead of one row
     * per individual per-object finding the way FindingsTable/
     * IssuesList already show elsewhere.
     *
     * Each group's severity/category/object_type come from a sample of
     * open findings (the most recent 100 — find_all()'s own per_page
     * ceiling), not every row: a scanner_id absent from that sample even
     * though count_by_column() knows it has open findings is skipped
     * rather than guessing its severity from nothing, so this can
     * under-report on a site with 100+ distinct open-finding scanner
     * types on the same page — a genuinely rare shape (SCANNERS.md's
     * full catalog is ~65 scanners total, all categories combined).
     *
     * @param int      $limit      Max groups to return.
     * @param string[] $categories Optional real `category` values to scope both the
     *                             per-scanner counts and the representative sample to
     *                             (get_top_finding_group_for_categories() passes this so
     *                             "top 3 sitewide" and "top 1 within this category bucket"
     *                             share one implementation) — empty means sitewide, same as before.
     * @return array<int, array{scanner_id: string, count: int, severity: string, category: string, object_type: ?string}>
     */
    public function get_top_finding_groups( int $limit = 3, array $categories = array() ): array {
        $scope = array( 'status' => 'open' );

        if ( $categories ) {
            $scope['category'] = $categories;
        }

        $counts_by_scanner = $this->count_by_column( 'scanner_id', $scope );

        if ( empty( $counts_by_scanner ) ) {
            return array();
        }

        $sample = $this->find_all(
            array_merge(
                $scope,
                array(
                    'per_page' => 100,
                    'orderby'  => 'id',
                    'order'    => 'desc',
                )
            )
        );

        $severity_rank = array(
            'critical' => 0,
            'high'     => 1,
            'medium'   => 2,
            'low'      => 3,
            'info'     => 4,
        );

        // Worst (most urgent) severity seen per scanner_id in the sample —
        // some scanners (e.g. ProductCompletenessScanner) assign different
        // severities to different findings, so the first row seen isn't
        // reliably representative; the worst one is.
        $representatives = array();

        foreach ( $sample['data'] as $row ) {
            $scanner_id = (string) ( $row['scanner_id'] ?? '' );

            if ( '' === $scanner_id ) {
                continue;
            }

            $existing      = $representatives[ $scanner_id ] ?? null;
            $existing_rank = null !== $existing ? ( $severity_rank[ $existing['severity'] ] ?? 5 ) : 6;
            $row_rank      = $severity_rank[ $row['severity'] ] ?? 5;

            if ( null === $existing || $row_rank < $existing_rank ) {
                $representatives[ $scanner_id ] = $row;
            }
        }

        $groups = array();

        foreach ( $counts_by_scanner as $scanner_id => $count ) {
            $representative = $representatives[ $scanner_id ] ?? null;

            if ( null === $representative ) {
                continue;
            }

            $groups[] = array(
                'scanner_id'  => $scanner_id,
                'count'       => $count,
                'severity'    => $representative['severity'],
                'category'    => $representative['category'],
                'object_type' => $representative['object_type'],
            );
        }

        usort(
            $groups,
            static function ( $a, $b ) use ( $severity_rank ) {
                $rank_a = $severity_rank[ $a['severity'] ] ?? 5;
                $rank_b = $severity_rank[ $b['severity'] ] ?? 5;

                if ( $rank_a !== $rank_b ) {
                    return $rank_a <=> $rank_b;
                }

                return $b['count'] <=> $a['count'];
            }
        );

        return array_slice( $groups, 0, $limit );
    }

    /**
     * The single top open finding-type group within a fixed set of real
     * `category` values — AI Copilot's "Recommended by VuloPilot" card
     * uses this once per bucket (security/performance/ai-visibility) so
     * each bucket gets its own real top issue instead of `get_top_finding_groups()`'s
     * sitewide top 3, which could land two or three cards in the same
     * category and leave another bucket with nothing to show.
     *
     * @param string[] $categories Real category values (e.g. ['security', 'ssl', 'rest-api']).
     * @return array{scanner_id: string, count: int, severity: string, category: string, object_type: ?string}|null
     */
    public function get_top_finding_group_for_categories( array $categories ): ?array {
        $groups = $this->get_top_finding_groups( 1, $categories );

        return $groups[0] ?? null;
    }

    /**
     * Same worst-severity grouping get_finding_groups() computes, scoped to
     * exactly one scanner_id — what AI Copilot chat's "Add context" picker
     * (Controllers\Copilot.php) resolves a user-picked `finding_group`
     * context ref against, so the AI is always grounded with this group's
     * real, current count/severity rather than whatever stale numbers the
     * client had cached when the user picked it.
     *
     * @param string $scanner_id Scanner id to look up.
     * @return array{scanner_id: string, category: string, count: int, severity: string}|null Null if this scanner has no open findings right now.
     */
    public function get_group_by_scanner_id( string $scanner_id ): ?array {
        global $wpdb;

        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT category, COUNT(*) AS count, MIN( CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 WHEN 'info' THEN 4 ELSE 5 END ) AS severity_rank FROM {$this->get_table()} WHERE status = 'open' AND scanner_id = %s GROUP BY category", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $scanner_id
            ),
            ARRAY_A
        );

        if ( ! $row ) {
            return null;
        }

        $severity_by_rank = array(
            0 => 'critical',
            1 => 'high',
            2 => 'medium',
            3 => 'low',
            4 => 'info',
            5 => 'info',
        );

        return array(
            'scanner_id' => $scanner_id,
            'category'   => (string) $row['category'],
            'count'      => (int) $row['count'],
            'severity'   => $severity_by_rank[ (int) $row['severity_rank'] ] ?? 'info',
        );
    }

    /**
     * Open **group** counts per category — i.e. how many distinct
     * (scanner_id, category) rows get_finding_groups() would return for
     * each category, not how many raw findings exist in it. The Issues
     * table renders one row per group, and its `total`/pagination footer
     * are group counts too (get_finding_groups()'s own $total_groups), so
     * the category tab bar must count the same unit its own badge promises
     * — otherwise a tab reading "88" (88 raw findings, e.g. many pages
     * missing the same alt text) can click through to a handful of grouped
     * rows with no pagination, looking broken even though nothing's wrong.
     *
     * @return array<string, int> category => open group count.
     */
    public function get_category_group_counts(): array {
        global $wpdb;
        $table = $this->get_table();

        $rows = $wpdb->get_results( "SELECT category, COUNT(*) AS total FROM ( SELECT scanner_id, category FROM {$table} WHERE status = 'open' GROUP BY scanner_id, category ) grouped GROUP BY category", ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared -- $table is code-controlled, no user input in this query.

        $counts = array();

        foreach ( (array) $rows as $row ) {
            $counts[ $row['category'] ] = (int) $row['total'];
        }

        return $counts;
    }

    /**
     * Same grouping as get_top_finding_groups() — every open finding
     * bucketed by scanner_id, worst-severity-first — but paginated and
     * optionally scoped to one category, instead of a fixed top-3 preview.
     * Backs the AI Copilot Issues table (Controllers/Findings.php's
     * `GET /findings/groups`), which needs every group across every page,
     * not just the 3 most urgent.
     *
     * Expressed as one grouped query (MIN() over a severity->rank CASE
     * picks each group's worst severity) rather than get_top_finding_groups()'s
     * own "sample the 100 most recent rows client-side" approach — that
     * approach is fine for a 3-row preview but would under-report on a
     * paginated full list, since a scanner_id's open findings could easily
     * fall entirely outside the most recent 100 rows once pagination goes
     * past the first page.
     *
     * @param array{status?: string, category?: string|string[], scanner_ids?: string[], priority_ranks?: int[], page?: int, per_page?: int} $args Grouping/pagination args — `category` accepts several real category values at once (IN-matched), same reasoning as get_status_counts()'s own `$scanner_ids` param: the Issues table's "SEO & Visibility" tab, for example, folds 4 real category values ('seo'/'images'/'schema'/'links') into one tab. `scanner_ids` (IN-matched, ANDed with `category` when both are given) scopes to an explicit scanner_id set instead — what the "Schema & Knowledge" tab's own grouped Issues section needs, since its 5 real scanners span 3 different categories mixed with many unrelated scanners in those same categories, so `category` alone can't express it. `priority_ranks` filters to groups whose own worst-severity rank (this method's own severity->rank scale, 0=critical..4=info) is one of the given ranks — how the Issues table's High/Medium/Low stat tiles filter the table to match the same priority bucket Controllers/Findings.php maps their click to (same 3-tier collapse get_priority_counts() already uses for the tiles' own counts).
     * @return array{data: array<int, array{scanner_id: string, category: string, count: int, severity: string, object_type: ?string}>, total: int}
     */
    public function get_finding_groups( array $args = array() ): array {
        global $wpdb;
        $table = $this->get_table();

        $status         = ! empty( $args['status'] ) ? (string) $args['status'] : 'open';
        $category       = $args['category'] ?? '';
        $scanner_ids    = ! empty( $args['scanner_ids'] ) ? (array) $args['scanner_ids'] : array();
        $priority_ranks = ! empty( $args['priority_ranks'] ) ? array_map( 'intval', $args['priority_ranks'] ) : array();
        $page           = max( 1, (int) ( $args['page'] ?? 1 ) );
        $per_page       = max( 1, min( 100, (int) ( $args['per_page'] ?? 20 ) ) );
        $offset         = ( $page - 1 ) * $per_page;

        // 'all' is a real, deliberate escape hatch — not a real status
        // value any row ever has — for a caller that wants every real row
        // regardless of status (e.g. a "Show ignored" toggle: real open
        // findings AND real ignored ones together, not one or the other).
        if ( 'all' === $status ) {
            $where  = 'WHERE 1=1';
            $values = array();
        } else {
            $where  = 'WHERE status = %s';
            $values = array( $status );
        }

        if ( is_array( $category ) && $category ) {
            $placeholders = implode( ', ', array_fill( 0, count( $category ), '%s' ) );
            $where       .= " AND category IN ({$placeholders})";
            array_push( $values, ...$category );
        } elseif ( is_string( $category ) && '' !== $category ) {
            $where   .= ' AND category = %s';
            $values[] = $category;
        }

        if ( $scanner_ids ) {
            $scanner_placeholders = implode( ', ', array_fill( 0, count( $scanner_ids ), '%s' ) );
            $where                .= " AND scanner_id IN ({$scanner_placeholders})";
            array_push( $values, ...$scanner_ids );
        }

        // Grouped once, filtered by the group's own worst-severity rank in
        // an outer WHERE against this subquery rather than filtering raw
        // rows by severity before grouping — a scanner_id's `count` must
        // stay every open finding in that group regardless of which
        // priority tile is active, since the mockup's own "22 pages
        // affected" reads as the group's real total, not a subset matching
        // whichever severities happen to satisfy the current filter.
        $group_sql = "SELECT scanner_id, category, COUNT(*) AS count, MAX(object_type) AS object_type, MIN( CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 WHEN 'info' THEN 4 ELSE 5 END ) AS severity_rank FROM {$table} {$where} GROUP BY scanner_id, category"; // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $where's %s count matches $values' size at runtime; this string is only ever passed through $wpdb->prepare() by its two callers below, never queried directly.

        $having = '';

        if ( $priority_ranks ) {
            $rank_placeholders = implode( ', ', array_fill( 0, count( $priority_ranks ), '%d' ) );
            $having            = " WHERE severity_rank IN ({$rank_placeholders})";
        }

        $count_values = array_merge( $values, $priority_ranks );
        $count_sql    = "SELECT COUNT(*) FROM ( {$group_sql} ) grouped{$having}";
        // `$count_values` is genuinely empty only when `$status` is the
        // real 'all' escape hatch above with no category/priority filter
        // either — `$wpdb->prepare()` itself requires at least one real
        // value to bind, so this real no-placeholders-left case runs the
        // query directly instead (every piece of `$count_sql` at that
        // point is code-controlled — `$table`/`$where`/`$having` — not
        // user input, same real precedent this file's own
        // `get_category_group_counts()` already established for a
        // likewise placeholder-free query).
        $total_groups = (int) ( $count_values
            ? $wpdb->get_var( $wpdb->prepare( $count_sql, ...$count_values ) ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $where's/$having's placeholder count matches $values'/$priority_ranks' combined size at runtime.
            : $wpdb->get_var( $count_sql ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.NotPrepared -- no real placeholders left to bind in this branch; see comment above.

        if ( 0 === $total_groups ) {
            return array(
                'data'  => array(),
                'total' => 0,
            );
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare( "SELECT * FROM ( {$group_sql} ) grouped{$having} ORDER BY severity_rank ASC, count DESC LIMIT %d OFFSET %d", ...array_merge( $values, $priority_ranks, array( $per_page, $offset ) ) ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- same runtime-sized-array case as above, plus the trailing LIMIT/OFFSET pair.
            ARRAY_A
        );

        $severity_by_rank = array(
            0 => 'critical',
            1 => 'high',
            2 => 'medium',
            3 => 'low',
            4 => 'info',
            5 => 'info',
        );

        return array(
            'data'  => array_map(
                static function ( array $row ) use ( $severity_by_rank ): array {
                    return array(
                        'scanner_id'  => (string) $row['scanner_id'],
                        'category'    => (string) $row['category'],
                        'count'       => (int) $row['count'],
                        'severity'    => $severity_by_rank[ (int) $row['severity_rank'] ] ?? 'info',
                        'object_type' => '' !== (string) $row['object_type'] ? (string) $row['object_type'] : null,
                    );
                },
                null !== $rows ? $rows : array()
            ),
            'total' => $total_groups,
        );
    }

    /**
     * Counts findings by severity across every scan — what the dashboard's
     * summary cards and site-health scoring read, without pulling every
     * row into PHP to count them (performance.md).
     *
     * @param string $severity One of Severity's constants.
     * @return int
     */
    public function count_by_severity( string $severity ): int {
        global $wpdb;

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$this->get_table()} WHERE severity = %s AND status = 'open'", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $severity
            )
        );
    }

    /**
     * Counts open findings in one category — what each domain dashboard
     * widget (SEO/Performance/Security/Accessibility/WooCommerce) reads,
     * same shape as count_by_severity() above.
     *
     * @param string $category One of the scanner category strings (SCANNERS.md).
     * @return int
     */
    public function count_by_category( string $category ): int {
        global $wpdb;

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$this->get_table()} WHERE category = %s AND status = 'open'", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $category
            )
        );
    }

    /**
     * Findings first detected on or after $since — the Dashboard's "N new
     * issues this week" badge reads this, counting every finding created
     * in the window regardless of its current status (a finding opened
     * and then immediately resolved this week is still a real "new issue"
     * that appeared this week).
     *
     * @param string $since MySQL datetime (UTC), inclusive.
     * @return int
     */
    public function count_created_since( string $since ): int {
        global $wpdb;

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$this->get_table()} WHERE created_at >= %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $since
            )
        );
    }

    /**
     * Findings resolved on or after $since — the Dashboard's "N fixed"
     * badge reads this. `resolved_at` is only ever set when a finding's
     * status transitions to 'resolved' (Controllers\Findings::update_item()),
     * so this naturally excludes ignored/snoozed findings.
     *
     * @param string $since MySQL datetime (UTC), inclusive.
     * @return int
     */
    public function count_resolved_since( string $since ): int {
        global $wpdb;

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$this->get_table()} WHERE resolved_at >= %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $since
            )
        );
    }

    /**
     * Findings resolved within a bounded window, optionally scoped to one
     * category and/or scanner_id list — same "fixed" concept
     * count_resolved_since() already reads for the Dashboard's own badge,
     * but with an upper bound and the same category/scanner_ids scoping
     * get_stats_for_period()/get_top_findings_for_period() already
     * support, for Controllers\ReportsOverview's own period-over-period
     * "Fixed" count.
     *
     * @param string        $period_start MySQL datetime (UTC), inclusive.
     * @param string        $period_end   MySQL datetime (UTC), inclusive.
     * @param string|null   $category     One of the scanner category strings, or null for all.
     * @param string[]|null $scanner_ids  Scanner ids to additionally scope to, or null for every scanner in $category.
     * @return int
     */
    public function count_resolved_between( string $period_start, string $period_end, ?string $category = null, ?array $scanner_ids = null ): int {
        global $wpdb;

        $where  = 'WHERE resolved_at BETWEEN %s AND %s';
        $values = array( $period_start, $period_end );

        if ( null !== $category ) {
            $where   .= ' AND category = %s';
            $values[] = $category;
        }

        if ( null !== $scanner_ids && $scanner_ids ) {
            $where .= ' AND scanner_id IN (' . implode( ', ', array_fill( 0, count( $scanner_ids ), '%s' ) ) . ')';
            array_push( $values, ...$scanner_ids );
        }

        return (int) $wpdb->get_var(
            $wpdb->prepare( "SELECT COUNT(*) FROM {$this->get_table()} {$where}", ...$values ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $where's %s count matches $values' size at runtime.
        );
    }

    /**
     * Open-finding counts by severity within a single category, in one
     * grouped query rather than four count_by_severity()-style calls —
     * this is what Dashboard controller's per-category widget score
     * (SEO/Performance/Security/Accessibility/WooCommerce) is computed
     * from, using the same weighting Overall Health already uses, just
     * scoped down (performance.md: prefer one query over several).
     *
     * @param string $category One of the scanner category strings (SCANNERS.md).
     * @return array{critical: int, high: int, medium: int, low: int}
     */
    public function get_severity_breakdown_for_category( string $category ): array {
        global $wpdb;

        $counts = array_fill_keys( array( 'critical', 'high', 'medium', 'low' ), 0 );

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT severity, COUNT(*) AS total FROM {$this->get_table()} WHERE category = %s AND status = 'open' GROUP BY severity", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $category
            ),
            ARRAY_A
        );

        foreach ( (array) $rows as $row ) {
            if ( array_key_exists( $row['severity'], $counts ) ) {
                $counts[ $row['severity'] ] = (int) $row['total'];
            }
        }

        return $counts;
    }

    /**
     * Same shape as get_severity_breakdown_for_category(), scoped to an
     * explicit scanner_id list instead of one category string — what
     * Content Intelligence's own composite Content Score reads
     * (CONTENT-INTELLIGENCE-MODULE.md), since it spans scanners across two
     * categories (`content`'s own readability scanner plus a subset of
     * `seo`'s existing thin-content/duplicate-content/heading-structure/
     * internal-linking/orphan-pages scanners) — a single category string
     * can't express that, and recategorizing those existing `seo`
     * scanners into `content` would be exactly the kind of breaking
     * redesign this pass avoids (SEO.tsx's own SEO_SECTIONS groups them
     * as `seo` today).
     *
     * @param string[] $scanner_ids Scanner ids to scope to.
     * @return array{critical: int, high: int, medium: int, low: int, info: int}
     */
    public function get_severity_breakdown_for_scanner_ids( array $scanner_ids ): array {
        global $wpdb;

        // Every real Severity value (Severity::all()) — 'info' was missing
        // here until this fix, which silently dropped any info-severity
        // finding among $scanner_ids from every caller's total (this
        // method's own sum, get_priority_counts_for_scanner_ids()'s 'low'
        // bucket, SchemaCoverageAnalyzer's open_problems_total) rather than
        // counting it under 'low' the way get_priority_counts() already
        // does for the sitewide equivalent.
        $counts = array_fill_keys( array( 'critical', 'high', 'medium', 'low', 'info' ), 0 );

        if ( ! $scanner_ids ) {
            return $counts;
        }

        $placeholders = implode( ', ', array_fill( 0, count( $scanner_ids ), '%s' ) );

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT severity, COUNT(*) AS total FROM {$this->get_table()} WHERE scanner_id IN ({$placeholders}) AND status = 'open' GROUP BY severity", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $placeholders' %s count matches $scanner_ids' size at runtime.
                ...$scanner_ids
            ),
            ARRAY_A
        );

        foreach ( (array) $rows as $row ) {
            if ( array_key_exists( $row['severity'], $counts ) ) {
                $counts[ $row['severity'] ] = (int) $row['total'];
            }
        }

        return $counts;
    }

    /**
     * Same shape as get_severity_breakdown_for_category(), but reconstructed
     * as of a past moment instead of counting today's `status = 'open'`
     * rows — what a category score trend needs, since no daily per-category
     * score snapshot exists (only `vulopilot_site_health_snapshots.overall_score`
     * is ever written; see SiteHealthSnapshotRepository in vulopilot-pro).
     * A finding counts as "open as of $as_of" when it already existed
     * (`created_at <= $as_of`) and either is still `status = 'open'` right
     * now, or has a real `resolved_at` timestamp after `$as_of` — NOT a bare
     * `resolved_at IS NULL` check (this method's own original condition,
     * confirmed live to silently over-count: 120 of this table's 192
     * `status = 'resolved'` rows have a `NULL resolved_at` — resolved
     * before `resolved_at` tracking existed/was backfilled, not "still
     * open" — so treating a null timestamp as "not yet resolved" was
     * counting a majority of already-resolved findings as still open in
     * every historical reconstruction). A currently-resolved finding with
     * no real resolved timestamp is instead treated as already resolved by
     * `$as_of` — the honest assumption when the exact moment isn't known,
     * rather than the previous assumption that silently inflated every
     * "as of" score below its real historical value. Currently
     * ignored/snoozed findings stay excluded from both ends (same exclusion
     * get_severity_breakdown_for_category()'s `status = 'open'` filter
     * already applies today) since ignored/snoozed transitions don't carry
     * their own timestamp to reconstruct from.
     *
     * @param string $category One of the scanner category strings (SCANNERS.md).
     * @param string $as_of    MySQL datetime (UTC) to reconstruct the open set as of.
     * @return array{critical: int, high: int, medium: int, low: int}
     */
    public function get_severity_breakdown_for_category_as_of( string $category, string $as_of ): array {
        global $wpdb;

        $counts = array_fill_keys( array( 'critical', 'high', 'medium', 'low' ), 0 );

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT severity, COUNT(*) AS total FROM {$this->get_table()}
                WHERE category = %s AND status != 'ignored' AND status != 'snoozed'
                AND created_at <= %s AND ( status = 'open' OR ( resolved_at IS NOT NULL AND resolved_at > %s ) )
                GROUP BY severity", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $category,
                $as_of,
                $as_of
            ),
            ARRAY_A
        );

        foreach ( (array) $rows as $row ) {
            if ( array_key_exists( $row['severity'], $counts ) ) {
                $counts[ $row['severity'] ] = (int) $row['total'];
            }
        }

        return $counts;
    }

    /**
     * Same "as of a past moment" reconstruction as
     * get_severity_breakdown_for_category_as_of() — including that same
     * method's own fix for `status = 'resolved'` rows with a `NULL
     * resolved_at` (see its docblock) — scoped to an explicit scanner_id
     * list instead — what Content/Brand's composite scores' trend needs,
     * same reasoning as get_severity_breakdown_for_scanner_ids() own
     * docblock for why those two scores can't use a category string.
     *
     * @param string[] $scanner_ids Scanner ids to scope to.
     * @param string   $as_of       MySQL datetime (UTC) to reconstruct the open set as of.
     * @return array{critical: int, high: int, medium: int, low: int}
     */
    public function get_severity_breakdown_for_scanner_ids_as_of( array $scanner_ids, string $as_of ): array {
        global $wpdb;

        $counts = array_fill_keys( array( 'critical', 'high', 'medium', 'low' ), 0 );

        if ( ! $scanner_ids ) {
            return $counts;
        }

        $placeholders = implode( ', ', array_fill( 0, count( $scanner_ids ), '%s' ) );

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT severity, COUNT(*) AS total FROM {$this->get_table()}
                WHERE scanner_id IN ({$placeholders}) AND status != 'ignored' AND status != 'snoozed'
                AND created_at <= %s AND ( status = 'open' OR ( resolved_at IS NOT NULL AND resolved_at > %s ) )
                GROUP BY severity", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $placeholders' %s count matches $scanner_ids' size at runtime.
                ...array_merge( $scanner_ids, array( $as_of, $as_of ) )
            ),
            ARRAY_A
        );

        foreach ( (array) $rows as $row ) {
            if ( array_key_exists( $row['severity'], $counts ) ) {
                $counts[ $row['severity'] ] = (int) $row['total'];
            }
        }

        return $counts;
    }

    /**
     * Every currently-open — or, with `$as_of` set, real
     * historically-reconstructed open-as-of-that-moment (same exact
     * reconstruction `get_severity_breakdown_for_scanner_ids_as_of()`
     * already uses) — finding among `$scanner_ids` that's tied to a real
     * page/post, bucketed by post id. Seo.php's own "Pages that need
     * attention" table needs this to compute a real per-page score/Main
     * Problem/Change without an N+1 query per page.
     * `DuplicateContentScanner`'s own `object_ref` is a comma-joined list of
     * post ids (one finding genuinely spans multiple posts) — split and
     * attached to EACH matching post here, same real handling
     * `seoIssuesShared.tsx`'s own `bucketFindingsByPage()` already does
     * client-side for the current (non-as-of) case.
     *
     * @param string[]    $scanner_ids Scanner ids to scope to.
     * @param string|null $as_of       MySQL datetime (UTC) to reconstruct the open set as of; null for the real current open set.
     * @return array<int, array<int, array{id: int, title: string, severity: string}>> post_id => that post's own open findings.
     */
    public function get_open_findings_for_scanner_ids_by_post( array $scanner_ids, ?string $as_of = null ): array {
        global $wpdb;

        $buckets = array();

        if ( ! $scanner_ids ) {
            return $buckets;
        }

        $placeholders = implode( ', ', array_fill( 0, count( $scanner_ids ), '%s' ) );

        if ( null === $as_of ) {
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT id, title, severity, object_ref FROM {$this->get_table()}
                    WHERE scanner_id IN ({$placeholders}) AND status = 'open' AND object_type = 'post'", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $placeholders' %s count matches $scanner_ids' size at runtime.
                    ...$scanner_ids
                ),
                ARRAY_A
            );
        } else {
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT id, title, severity, object_ref FROM {$this->get_table()}
                    WHERE scanner_id IN ({$placeholders}) AND object_type = 'post'
                    AND status != 'ignored' AND status != 'snoozed'
                    AND created_at <= %s AND ( status = 'open' OR ( resolved_at IS NOT NULL AND resolved_at > %s ) )", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $placeholders' %s count matches $scanner_ids' size at runtime.
                    ...array_merge( $scanner_ids, array( $as_of, $as_of ) )
                ),
                ARRAY_A
            );
        }

        foreach ( (array) $rows as $row ) {
            $post_ids = array_filter(
                array_map( 'intval', explode( ',', (string) $row['object_ref'] ) ),
                static fn( $id ) => $id > 0
            );

            foreach ( $post_ids as $post_id ) {
                $buckets[ $post_id ][] = array(
                    'id'       => (int) $row['id'],
                    'title'    => $row['title'],
                    'severity' => $row['severity'],
                );
            }
        }

        return $buckets;
    }

    /**
     * Distinct real pages/posts/URLs with at least one currently-open
     * finding among $scanner_ids — the real "N pages affected" count
     * Seo.php's own category cards need alongside
     * get_severity_breakdown_for_scanner_ids()'s own per-severity counts.
     * `object_ref` is that finding's own real target (a `WP_Post::ID` for
     * most scanners, a URL string for the few that are — `canonical-url`'s
     * own object_type is `url`, not `post`); counted together rather than
     * scoped to `object_type = 'post'`, since a category can legitimately
     * mix both and every value is still a real distinct affected target
     * either way.
     *
     * @param string[] $scanner_ids Scanner ids to scope to.
     * @return int
     */
    public function get_affected_object_count_for_scanner_ids( array $scanner_ids ): int {
        global $wpdb;

        if ( ! $scanner_ids ) {
            return 0;
        }

        $placeholders = implode( ', ', array_fill( 0, count( $scanner_ids ), '%s' ) );

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(DISTINCT object_ref) FROM {$this->get_table()} WHERE scanner_id IN ({$placeholders}) AND status = 'open'", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $placeholders' %s count matches $scanner_ids' size at runtime.
                ...$scanner_ids
            )
        );
    }

    /**
     * Aggregate counts for one date range — what every Reports\Types\*
     * report reads instead of pulling every row in the period into PHP to
     * count them (performance.md). $category narrows to one scanner
     * category (e.g. 'seo', 'security'); null means every category, used
     * by Reports\Types\ScanSummaryReport/HealthReport. $scanner_ids
     * additionally narrows to an explicit scanner id list (Content
     * Intelligence's own report, which spans two categories — see
     * get_severity_breakdown_for_scanner_ids()'s own docblock for why);
     * combinable with $category, though no current caller needs both at
     * once.
     *
     * @param string        $period_start Y-m-d, inclusive.
     * @param string        $period_end   Y-m-d, inclusive.
     * @param string|null   $category     One of the scanner category strings (SCANNERS.md), or null for all.
     * @param string[]|null $scanner_ids  Scanner ids to additionally scope to, or null for every scanner in $category.
     * @return array{total: int, by_severity: array<string, int>, by_category: array<string, int>, by_status: array<string, int>}
     */
    public function get_stats_for_period( string $period_start, string $period_end, ?string $category = null, ?array $scanner_ids = null ): array {
        global $wpdb;

        $where  = 'WHERE DATE(created_at) BETWEEN %s AND %s';
        $values = array( $period_start, $period_end );

        if ( null !== $category ) {
            $where   .= ' AND category = %s';
            $values[] = $category;
        }

        if ( null !== $scanner_ids && $scanner_ids ) {
            $where .= ' AND scanner_id IN (' . implode( ', ', array_fill( 0, count( $scanner_ids ), '%s' ) ) . ')';
            array_push( $values, ...$scanner_ids );
        }

        $by_severity = array_fill_keys( array( 'critical', 'high', 'medium', 'low', 'info' ), 0 );

        $severity_rows = $wpdb->get_results(
            $wpdb->prepare( "SELECT severity, COUNT(*) AS total FROM {$this->get_table()} {$where} GROUP BY severity", ...$values ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $where's %s count matches $values' size at runtime.
            ARRAY_A
        );

        foreach ( (array) $severity_rows as $row ) {
            if ( array_key_exists( $row['severity'], $by_severity ) ) {
                $by_severity[ $row['severity'] ] = (int) $row['total'];
            }
        }

        $by_category = array();

        if ( null === $category ) {
            $category_rows = $wpdb->get_results(
                $wpdb->prepare( "SELECT category, COUNT(*) AS total FROM {$this->get_table()} {$where} GROUP BY category", ...$values ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- same runtime-sized-array case as above.
                ARRAY_A
            );

            foreach ( (array) $category_rows as $row ) {
                $by_category[ $row['category'] ] = (int) $row['total'];
            }
        }

        $status_rows = $wpdb->get_results(
            $wpdb->prepare( "SELECT status, COUNT(*) AS total FROM {$this->get_table()} {$where} GROUP BY status", ...$values ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- same runtime-sized-array case as above.
            ARRAY_A
        );

        $by_status = array();

        foreach ( (array) $status_rows as $row ) {
            $by_status[ $row['status'] ] = (int) $row['total'];
        }

        return array(
            'total'       => array_sum( $by_severity ),
            'by_severity' => $by_severity,
            'by_category' => $by_category,
            'by_status'   => $by_status,
        );
    }

    /**
     * Every object_type/object_ref pair from one scan run — used only to
     * build History's "Pages & posts" list (Controllers/History.php's own
     * build_affected_pages()), which needs every finding a scan produced to
     * count accurately per page, not find_all()'s own 100-row page cap. A
     * real, exact, indexed FK lookup (`idx_scan` on
     * vulopilot_scan_findings.scan_id, set once at insert time by
     * Services\ScanPersistenceListener::handle_scan_completed() in the same
     * request that creates the scan row itself) — not an approximation.
     *
     * @param int $scan_id vulopilot_scans.id.
     * @return array<int, array{object_type: string|null, object_ref: string|null}>
     */
    public function get_object_refs_for_scan( int $scan_id ): array {
        global $wpdb;

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT object_type, object_ref FROM {$this->get_table()} WHERE scan_id = %d LIMIT 2000", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $scan_id
            ),
            ARRAY_A
        );

        return null !== $rows ? $rows : array();
    }

    /**
     * The highest-severity currently-open findings, worst-first — what
     * Controllers\ReportsOverview's own "Your next priorities" list reads.
     * Unlike get_top_findings_for_period() (scoped to a created_at window,
     * any status), this is unbounded by date and scoped to `status = 'open'`
     * only — the point is "what's still outstanding right now", not "what
     * appeared recently".
     *
     * @param int $limit Max rows to return.
     * @return array<int, array<string, mixed>>
     */
    public function get_top_open_findings( int $limit = 10 ): array {
        global $wpdb;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT id, title, description, severity, category, created_at FROM {$this->get_table()} WHERE status = 'open' ORDER BY FIELD(severity, 'critical', 'high', 'medium', 'low', 'info') ASC, created_at DESC LIMIT %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                max( 1, $limit )
            ),
            ARRAY_A
        );

        return $rows ?: array();
    }

    /**
     * The highest-severity findings opened in one date range — what a
     * report's "top issues" section reads, ordered worst-first rather than
     * newest-first.
     *
     * @param string        $period_start Y-m-d, inclusive.
     * @param string        $period_end   Y-m-d, inclusive.
     * @param string|null   $category     One of the scanner category strings, or null for all.
     * @param int           $limit        Max rows to return.
     * @param string[]|null $scanner_ids  Scanner ids to additionally scope to — same reasoning as get_stats_for_period()'s own docblock.
     * @return array<int, array<string, mixed>>
     */
    public function get_top_findings_for_period( string $period_start, string $period_end, ?string $category = null, int $limit = 10, ?array $scanner_ids = null ): array {
        global $wpdb;

        $where  = 'WHERE DATE(created_at) BETWEEN %s AND %s';
        $values = array( $period_start, $period_end );

        if ( null !== $category ) {
            $where   .= ' AND category = %s';
            $values[] = $category;
        }

        if ( null !== $scanner_ids && $scanner_ids ) {
            $where .= ' AND scanner_id IN (' . implode( ', ', array_fill( 0, count( $scanner_ids ), '%s' ) ) . ')';
            array_push( $values, ...$scanner_ids );
        }

        $values[] = max( 1, $limit );

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT id, title, severity, category, status, created_at FROM {$this->get_table()} {$where} ORDER BY FIELD(severity, 'critical', 'high', 'medium', 'low', 'info') ASC, created_at DESC LIMIT %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $where's %s count matches $values' size at runtime.
                ...$values
            ),
            ARRAY_A
        );

        return $rows ?: array();
    }
}
