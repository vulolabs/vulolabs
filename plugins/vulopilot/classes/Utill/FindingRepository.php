<?php
/**
 * FindingRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for vulopilot_scan_findings (DATABASE.md). category/severity/
 * status are exactly the filters the admin UI's FindingsTable component
 * (Health/SEO/GEO/Commerce/Dashboard pages) already sends. object_ref
 * was added in GEO-MODULE.md's pass so GeoAnalysis\GeoAnalyzer can read
 * every 'geo'-category finding already known about one specific post
 * without a bespoke query. object_type was added alongside it so
 * AutomationEngine\Actions\ResolveFindingAction can look up the one open
 * finding a Recommendation actually came from (object_ref alone isn't
 * unique across object types - e.g. post id 12 and attachment id 12).
 *
 * Every query in this class goes through the four private `get_*()` runners
 * below: each one takes SQL that only ever contains literal fragments and
 * `%s`/`%d`/`%i` placeholders, binds this table's name as the first `%i`, and
 * carries the one `$wpdb` suppression for its query type - so no method here
 * touches `$wpdb` directly.
 *
 * @class       FindingRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class FindingRepository extends RepositoryUtil {

    /**
     * Severity => urgency rank (0 is the most urgent). Same scale as
     * SEVERITY_RANK_SQL below; anything unknown ranks 5.
     */
    private const SEVERITY_RANK = array(
        'critical' => 0,
        'high'     => 1,
        'medium'   => 2,
        'low'      => 3,
        'info'     => 4,
    );

    /**
     * Inverse of SEVERITY_RANK - a rank outside it reads as 'info'.
     */
    private const SEVERITY_BY_RANK = array(
        0 => 'critical',
        1 => 'high',
        2 => 'medium',
        3 => 'low',
        4 => 'info',
    );

    /**
     * A group's worst severity as a SQL rank - MIN() over SEVERITY_RANK's own scale.
     */
    private const SEVERITY_RANK_SQL = "MIN( CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 WHEN 'info' THEN 4 ELSE 5 END )";

    /**
     * Worst-first ordering by severity.
     */
    private const SEVERITY_ORDER_SQL = "FIELD(severity, 'critical', 'high', 'medium', 'low', 'info')";

    /**
     * "Was open at a past moment" condition - takes the as-of datetime twice.
     * Ignored/snoozed rows never count, and a resolved row counts until its
     * `resolved_at`.
     */
    private const AS_OF_SQL = "status != 'ignored' AND status != 'snoozed' AND created_at <= %s AND ( status = 'open' OR ( resolved_at IS NOT NULL AND resolved_at > %s ) )";

    /**
     * Columns the admin UI filters on.
     *
     * @var string[]
     */
    protected array $filterable_columns = array( 'category', 'severity', 'status', 'object_type', 'object_ref', 'scanner_id' );

    /**
     * Columns the admin UI's search box matches against.
     *
     * @var string[]
     */
    protected array $searchable_columns = array( 'title', 'description' );

    /**
     * Table key in Utill::TABLES.
     *
     * @return string
     */
    protected function get_table_key(): string {
        return 'scan_finding';
    }

    /**
     * The already-open finding a fresh re-detection of the exact same
     * problem should refresh instead of duplicating - originally added
     * specifically for BrokenLinksScanner/BrokenImagesScanner, now called
     * for every scanner by default (ScanPersistenceListener::NEVER_DEDUPE_ON_RESCAN's
     * own docblock explains why the allowlist approach was abandoned): a
     * problem that's still present on the next run (daily cron, or a
     * manual "Run scan") re-adds the same
     * `scanner_id`/`object_type`/`object_ref`/`title` every time
     * (ScanPersistenceListener's own insert loop had no existence check
     * at all), and any page grouping findings by object then shows one
     * duplicate child row per rescan for the one still-open problem - up
     * to 24 duplicate rows for a single object, confirmed live, before
     * this was generalized. Matches on `title` rather than digging into
     * the JSON `meta` column - every scanner already bakes whatever
     * distinguishes this specific finding into its own title (a URL, a
     * file path, ...), so it's already the natural per-object key without
     * a JSON comparison in SQL. Scoped to `status = 'open'` only - a
     * finding a site owner already resolved/ignored should get a
     * brand-new row if the same problem recurs later, not silently flip a
     * closed one back open.
     *
     * `$object_type`/`$object_ref` are nullable for the purely-sitewide
     * scanners that have no specific object to key on (e.g. `php-warnings`
     * - a PHP notice isn't "about" any one post) - those store SQL `NULL`
     * in both columns (RepositoryUtil::insert() passes `null` straight
     * through to `$wpdb->insert()`, which stores a real `NULL`, not the
     * string `''`). A plain `column = %s` comparison is never true against
     * a `NULL` column regardless of what's bound, so matching on `NULL`
     * needs its own `IS NULL` branch rather than reusing the `%s`
     * comparison - confirmed live: without this, `php-warnings` piled up
     * 10 duplicate open rows for the identical warning message before
     * this was added, since every rescan's lookup silently matched
     * nothing and fell through to a fresh insert. `title` alone is still
     * enough of a natural key for most scanners (see this method's own
     * docblock above on why `title` already carries whatever distinguishes
     * one finding from another) - but not all of them: a scanner whose
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
     * - so a pre-existing title-matched row and a future dedupe_key-keyed
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
        // Column names are bound with %i and each optional condition is picked
        // (never assembled) so the query text stays fixed apart from that choice.
        $sql    = "SELECT * FROM %i WHERE status = 'open' AND scanner_id = %s";
        $values = array( $scanner_id );

        foreach ( array(
            'object_type' => $object_type,
            'object_ref'  => $object_ref,
        ) as $column => $value ) {
            if ( null === $value || '' === $value ) {
                $sql     .= ' AND %i IS NULL';
                $values[] = $column;
            } else {
                $sql     .= ' AND %i = %s';
                $values[] = $column;
                $values[] = $value;
            }
        }

        if ( null !== $dedupe_key ) {
            $sql     .= ' AND dedupe_key = %s';
            $values[] = $dedupe_key;
        } else {
            $sql     .= ' AND title = %s AND dedupe_key IS NULL';
            $values[] = $title;
        }

        $rows = $this->get_rows( $sql . ' ORDER BY id DESC LIMIT 1', $values );

        return $rows[0] ?? null;
    }

    /**
     * Every currently-open row id for one scanner - unpaginated (unlike
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
        $ids = $this->get_column( "SELECT id FROM %i WHERE status = 'open' AND scanner_id = %s", array( $scanner_id ) );

        return array_map( 'intval', $ids );
    }

    /**
     * Open/resolved/ignored/snoozed counts, zero-filled and optionally
     * scoped to one category and/or one section's scanner_id list - backs
     * the Health/SEO/GEO/Commerce findings tables' status-count pill
     * bar, including SEO.tsx's per-section tables (e.g. "Titles & meta"
     * grouping several scanner_id values together, scoped independently of
     * every other SEO section's own pill bar). Delegates to
     * RepositoryUtil::count_by_column() rather than hand-rolling
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
     * mapping - critical folds into "high" (nothing is more urgent),
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

        return self::collapse_priority( $raw );
    }

    /**
     * Same 3-tier Critical+High/Medium/Low collapse as get_priority_counts(),
     * scoped to one scanner_id set instead of the whole site - what a
     * scanner_id-scoped Issues table (the "Schema & Knowledge" tab's own
     * grouped Issues section) needs for its own stat tiles, since
     * get_priority_counts() itself has no scoping parameter (every other
     * caller genuinely wants the sitewide picture regardless of whatever
     * category tab is active - see its own docblock via
     * Controllers/Findings.php's get_finding_groups()).
     *
     * @param string[] $scanner_ids Scanner ids to scope to.
     * @return array{high: int, medium: int, low: int}
     */
    public function get_priority_counts_for_scanner_ids( array $scanner_ids ): array {
        return self::collapse_priority( $this->get_severity_breakdown_for_scanner_ids( $scanner_ids ) );
    }

    /**
     * Groups every currently open finding by its scanner_id and returns
     * the top $limit groups, most-severe-first (ties broken by count) -
     * "Needs your attention"'s list rows read as real per-issue-type
     * counts (e.g. "8 findings: Meta Descriptions") instead of one row
     * per individual per-object finding the way FindingsTable/
     * IssuesList already show elsewhere.
     *
     * Each group's severity/category/object_type come from a sample of
     * open findings (the most recent 100 - find_all()'s own per_page
     * ceiling), not every row: a scanner_id absent from that sample even
     * though count_by_column() knows it has open findings is skipped
     * rather than guessing its severity from nothing, so this can
     * under-report on a site with 100+ distinct open-finding scanner
     * types on the same page - a genuinely rare shape (SCANNERS.md's
     * full catalog is ~65 scanners total, all categories combined).
     *
     * @param int      $limit      Max groups to return.
     * @param string[] $categories Optional real `category` values to scope both the
     *                             per-scanner counts and the representative sample to
     *                             (get_top_finding_group_for_categories() passes this so
     *                             "top 3 sitewide" and "top 1 within this category bucket"
     *                             share one implementation) - empty means sitewide, same as before.
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

        // Worst (most urgent) severity seen per scanner_id in the sample -
        // some scanners (e.g. ProductCompletenessScanner) assign different
        // severities to different findings, so the first row seen isn't
        // reliably representative; the worst one is.
        $representatives = array();
        $best_ranks      = array();

        foreach ( $sample['data'] as $row ) {
            $scanner_id = (string) ( $row['scanner_id'] ?? '' );

            if ( '' === $scanner_id ) {
                continue;
            }

            $rank = self::SEVERITY_RANK[ $row['severity'] ] ?? 5;

            if ( ! isset( $best_ranks[ $scanner_id ] ) || $rank < $best_ranks[ $scanner_id ] ) {
                $best_ranks[ $scanner_id ]      = $rank;
                $representatives[ $scanner_id ] = $row;
            }
        }

        $groups = array();

        foreach ( $counts_by_scanner as $scanner_id => $count ) {
            if ( ! isset( $representatives[ $scanner_id ] ) ) {
                continue;
            }

            $representative = $representatives[ $scanner_id ];

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
            static function ( $a, $b ) {
                $rank_a = self::SEVERITY_RANK[ $a['severity'] ] ?? 5;
                $rank_b = self::SEVERITY_RANK[ $b['severity'] ] ?? 5;

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
     * `category` values - AI Copilot's "Recommended by VuloPilot" card
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
     * exactly one scanner_id - what AI Copilot chat's "Add context" picker
     * (Controllers\Copilot.php) resolves a user-picked `finding_group`
     * context ref against, so the AI is always grounded with this group's
     * real, current count/severity rather than whatever stale numbers the
     * client had cached when the user picked it.
     *
     * @param string $scanner_id Scanner id to look up.
     * @return array{scanner_id: string, category: string, count: int, severity: string}|null Null if this scanner has no open findings right now.
     */
    public function get_group_by_scanner_id( string $scanner_id ): ?array {
        $rows = $this->get_rows(
            'SELECT category, COUNT(*) AS count, ' . self::SEVERITY_RANK_SQL . " AS severity_rank FROM %i WHERE status = 'open' AND scanner_id = %s GROUP BY category",
            array( $scanner_id )
        );

        if ( ! $rows ) {
            return null;
        }

        return array(
            'scanner_id' => $scanner_id,
            'category'   => (string) $rows[0]['category'],
            'count'      => (int) $rows[0]['count'],
            'severity'   => self::SEVERITY_BY_RANK[ (int) $rows[0]['severity_rank'] ] ?? 'info',
        );
    }

    /**
     * Open **group** counts per category - i.e. how many distinct
     * (scanner_id, category) rows get_finding_groups() would return for
     * each category, not how many raw findings exist in it. The Issues
     * table renders one row per group, and its `total`/pagination footer
     * are group counts too (get_finding_groups()'s own $total_groups), so
     * the category tab bar must count the same unit its own badge promises
     * - otherwise a tab reading "88" (88 raw findings, e.g. many pages
     * missing the same alt text) can click through to a handful of grouped
     * rows with no pagination, looking broken even though nothing's wrong.
     *
     * @return array<string, int> category => open group count.
     */
    public function get_category_group_counts(): array {
        $rows = $this->get_rows( "SELECT category, COUNT(*) AS total FROM ( SELECT scanner_id, category FROM %i WHERE status = 'open' GROUP BY scanner_id, category ) grouped GROUP BY category" );

        $counts = array();

        foreach ( $rows as $row ) {
            $counts[ $row['category'] ] = (int) $row['total'];
        }

        return $counts;
    }

    /**
     * Same grouping as get_top_finding_groups() - every open finding
     * bucketed by scanner_id, worst-severity-first - but paginated and
     * optionally scoped to one category, instead of a fixed top-3 preview.
     * Backs the AI Copilot Issues table (Controllers/Findings.php's
     * `GET /findings/groups`), which needs every group across every page,
     * not just the 3 most urgent.
     *
     * Expressed as one grouped query (MIN() over a severity->rank CASE
     * picks each group's worst severity) rather than get_top_finding_groups()'s
     * own "sample the 100 most recent rows client-side" approach - that
     * approach is fine for a 3-row preview but would under-report on a
     * paginated full list, since a scanner_id's open findings could easily
     * fall entirely outside the most recent 100 rows once pagination goes
     * past the first page.
     *
     * @param array{status?: string, category?: string|string[], scanner_ids?: string[], priority_ranks?: int[], page?: int, per_page?: int} $args Grouping/pagination args - `category` accepts several real category values at once (IN-matched), same reasoning as get_status_counts()'s own `$scanner_ids` param: the Issues table's "SEO & Visibility" tab, for example, folds 4 real category values ('seo'/'images'/'schema'/'links') into one tab. `scanner_ids` (IN-matched, ANDed with `category` when both are given) scopes to an explicit scanner_id set instead - what the "Schema & Knowledge" tab's own grouped Issues section needs, since its 5 real scanners span 3 different categories mixed with many unrelated scanners in those same categories, so `category` alone can't express it. `priority_ranks` filters to groups whose own worst-severity rank (this method's own severity->rank scale, 0=critical..4=info) is one of the given ranks - how the Issues table's High/Medium/Low stat tiles filter the table to match the same priority bucket Controllers/Findings.php maps their click to (same 3-tier collapse get_priority_counts() already uses for the tiles' own counts).
     * @return array{data: array<int, array{scanner_id: string, category: string, count: int, severity: string, object_type: ?string}>, total: int}
     */
    public function get_finding_groups( array $args = array() ): array {
        $status         = ! empty( $args['status'] ) ? (string) $args['status'] : 'open';
        $category       = $args['category'] ?? '';
        $scanner_ids    = ! empty( $args['scanner_ids'] ) ? array_values( (array) $args['scanner_ids'] ) : array();
        $priority_ranks = ! empty( $args['priority_ranks'] ) ? array_map( 'intval', array_values( $args['priority_ranks'] ) ) : array();
        $page           = max( 1, (int) ( $args['page'] ?? 1 ) );
        $per_page       = max( 1, min( 100, (int) ( $args['per_page'] ?? 20 ) ) );
        $offset         = ( $page - 1 ) * $per_page;

        $category_values = array();

        if ( is_array( $category ) ) {
            $category_values = array_map( 'strval', array_values( $category ) );
        } elseif ( is_string( $category ) && '' !== $category ) {
            $category_values = array( $category );
        }

        // 'all' is a real, deliberate escape hatch - not a real status
        // value any row ever has - for a caller that wants every real row
        // regardless of status (e.g. a "Show ignored" toggle: real open
        // findings AND real ignored ones together, not one or the other).
        // Each optional filter is picked, never assembled, so the query text
        // stays fixed apart from these choices and their placeholder counts.
        $where  = '1 = 1';
        $values = array();

        if ( 'all' !== $status ) {
            $where   .= ' AND status = %s';
            $values[] = $status;
        }

        if ( $category_values ) {
            $where .= ' AND category IN (' . $this->placeholders( count( $category_values ) ) . ')';
            $values = array_merge( $values, $category_values );
        }

        if ( $scanner_ids ) {
            $where .= ' AND scanner_id IN (' . $this->placeholders( count( $scanner_ids ) ) . ')';
            $values = array_merge( $values, $scanner_ids );
        }

        // Grouped once, filtered by the group's own worst-severity rank in
        // an outer WHERE against this subquery rather than filtering raw
        // rows by severity before grouping - a scanner_id's `count` must
        // stay every open finding in that group regardless of which
        // priority tile is active, since the mockup's own "22 pages
        // affected" reads as the group's real total, not a subset matching
        // whichever severities happen to satisfy the current filter.
        $having = '1 = 1';

        if ( $priority_ranks ) {
            $having .= ' AND severity_rank IN (' . $this->placeholders( count( $priority_ranks ), '%d' ) . ')';
            $values  = array_merge( $values, $priority_ranks );
        }

        $total_groups = (int) $this->get_scalar(
            'SELECT COUNT(*) FROM ( SELECT scanner_id, category, ' . self::SEVERITY_RANK_SQL . ' AS severity_rank FROM %i WHERE ' . $where . ' GROUP BY scanner_id, category ) grouped WHERE ' . $having,
            $values
        );

        if ( 0 === $total_groups ) {
            return array(
                'data'  => array(),
                'total' => 0,
            );
        }

        $rows = $this->get_rows(
            'SELECT * FROM ( SELECT scanner_id, category, COUNT(*) AS count, MAX(object_type) AS object_type, ' . self::SEVERITY_RANK_SQL . ' AS severity_rank FROM %i WHERE ' . $where . ' GROUP BY scanner_id, category ) grouped WHERE ' . $having . ' ORDER BY severity_rank ASC, count DESC, scanner_id ASC LIMIT %d OFFSET %d',
            array_merge( $values, array( $per_page, $offset ) )
        );

        $data = array();

        foreach ( $rows as $row ) {
            $data[] = array(
                'scanner_id'  => (string) $row['scanner_id'],
                'category'    => (string) $row['category'],
                'count'       => (int) $row['count'],
                'severity'    => self::SEVERITY_BY_RANK[ (int) $row['severity_rank'] ] ?? 'info',
                'object_type' => '' !== (string) $row['object_type'] ? (string) $row['object_type'] : null,
            );
        }

        return array(
            'data'  => $data,
            'total' => $total_groups,
        );
    }

    /**
     * Counts findings by severity across every scan - what the dashboard's
     * summary cards and site-health scoring read, without pulling every
     * row into PHP to count them (performance.md).
     *
     * @param string $severity One of Severity's constants.
     * @return int
     */
    public function count_by_severity( string $severity ): int {
        return (int) $this->get_scalar( "SELECT COUNT(*) FROM %i WHERE severity = %s AND status = 'open'", array( $severity ) );
    }

    /**
     * Counts open findings in one category - what each domain dashboard
     * widget (SEO/Performance/Security/Accessibility/Commerce) reads,
     * same shape as count_by_severity() above.
     *
     * @param string $category One of the scanner category strings (SCANNERS.md).
     * @return int
     */
    public function count_by_category( string $category ): int {
        return (int) $this->get_scalar( "SELECT COUNT(*) FROM %i WHERE category = %s AND status = 'open'", array( $category ) );
    }

    /**
     * Findings first detected on or after $since - the Dashboard's "N new
     * issues this week" badge reads this, counting every finding created
     * in the window regardless of its current status (a finding opened
     * and then immediately resolved this week is still a real "new issue"
     * that appeared this week).
     *
     * @param string $since MySQL datetime (UTC), inclusive.
     * @return int
     */
    public function count_created_since( string $since ): int {
        return (int) $this->get_scalar( 'SELECT COUNT(*) FROM %i WHERE created_at >= %s', array( $since ) );
    }

    /**
     * Findings resolved on or after $since - the Dashboard's "N fixed"
     * badge reads this. `resolved_at` is only ever set when a finding's
     * status transitions to 'resolved' (Controllers\Findings::update_item()),
     * so this naturally excludes ignored/snoozed findings.
     *
     * @param string $since MySQL datetime (UTC), inclusive.
     * @return int
     */
    public function count_resolved_since( string $since ): int {
        return (int) $this->get_scalar( 'SELECT COUNT(*) FROM %i WHERE resolved_at >= %s', array( $since ) );
    }

    /**
     * Findings resolved within a bounded window, optionally scoped to one
     * category and/or scanner_id list - same "fixed" concept
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
        list( $scope_sql, $scope_values ) = $this->build_scope( $category, $scanner_ids );

        return (int) $this->get_scalar(
            'SELECT COUNT(*) FROM %i WHERE resolved_at BETWEEN %s AND %s' . $scope_sql,
            array_merge( array( $period_start, $period_end ), $scope_values )
        );
    }

    /**
     * Open-finding counts by severity within a single category, in one
     * grouped query rather than four count_by_severity()-style calls -
     * this is what Dashboard controller's per-category widget score
     * (SEO/Performance/Security/Accessibility/Commerce) is computed
     * from, using the same weighting Overall Health already uses, just
     * scoped down (performance.md: prefer one query over several).
     *
     * @param string $category One of the scanner category strings (SCANNERS.md).
     * @return array{critical: int, high: int, medium: int, low: int}
     */
    public function get_severity_breakdown_for_category( string $category ): array {
        return $this->get_severity_breakdown( "category = %s AND status = 'open'", array( $category ), false );
    }

    /**
     * Same shape as get_severity_breakdown_for_category(), scoped to an
     * explicit scanner_id list instead of one category string - what
     * Content Intelligence's own composite Content Score reads
     * (CONTENT-INTELLIGENCE-MODULE.md), since it spans scanners across two
     * categories (`content`'s own readability scanner plus a subset of
     * `seo`'s existing thin-content/duplicate-content/heading-structure/
     * internal-linking/orphan-pages scanners) - a single category string
     * can't express that, and recategorizing those existing `seo`
     * scanners into `content` would be exactly the kind of breaking
     * redesign this pass avoids (SEO.tsx's own SEO_SECTIONS groups them
     * as `seo` today).
     *
     * Every real Severity value counts here, 'info' included - dropping it
     * would silently lose any info-severity finding among $scanner_ids from
     * every caller's total (this method's own sum,
     * get_priority_counts_for_scanner_ids()'s 'low' bucket,
     * SchemaCoverageAnalyzer's open_problems_total) instead of counting it
     * under 'low' the way get_priority_counts() already does sitewide.
     *
     * @param string[] $scanner_ids Scanner ids to scope to.
     * @return array{critical: int, high: int, medium: int, low: int, info: int}
     */
    public function get_severity_breakdown_for_scanner_ids( array $scanner_ids ): array {
        if ( ! $scanner_ids ) {
            return $this->count_severities( array(), true );
        }

        return $this->get_severity_breakdown(
            'scanner_id IN (' . $this->placeholders( count( $scanner_ids ) ) . ") AND status = 'open'",
            array_values( $scanner_ids ),
            true
        );
    }

    /**
     * Same as get_severity_breakdown_for_category(), reconstructed as of a
     * past moment.
     *
     * @param string $category One of the scanner category strings (SCANNERS.md).
     * @param string $as_of    MySQL datetime (UTC) to reconstruct the open set as of.
     * @return array{critical: int, high: int, medium: int, low: int}
     */
    public function get_severity_breakdown_for_category_as_of( string $category, string $as_of ): array {
        return $this->get_severity_breakdown( 'category = %s AND ' . self::AS_OF_SQL, array( $category, $as_of, $as_of ), false );
    }

    /**
     * Same "as of a past moment" reconstruction as
     * get_severity_breakdown_for_category_as_of() - including that same
     * method's own fix for `status = 'resolved'` rows with a `NULL
     * resolved_at` (see AS_OF_SQL) - scoped to an explicit scanner_id
     * list instead - what Content/Brand's composite scores' trend needs,
     * same reasoning as get_severity_breakdown_for_scanner_ids() own
     * docblock for why those two scores can't use a category string.
     *
     * @param string[] $scanner_ids Scanner ids to scope to.
     * @param string   $as_of       MySQL datetime (UTC) to reconstruct the open set as of.
     * @return array{critical: int, high: int, medium: int, low: int}
     */
    public function get_severity_breakdown_for_scanner_ids_as_of( array $scanner_ids, string $as_of ): array {
        if ( ! $scanner_ids ) {
            return $this->count_severities( array(), false );
        }

        return $this->get_severity_breakdown(
            'scanner_id IN (' . $this->placeholders( count( $scanner_ids ) ) . ') AND ' . self::AS_OF_SQL,
            array_merge( array_values( $scanner_ids ), array( $as_of, $as_of ) ),
            false
        );
    }

    /**
     * Every currently-open - or, with `$as_of` set, real
     * historically-reconstructed open-as-of-that-moment (same exact
     * reconstruction `get_severity_breakdown_for_scanner_ids_as_of()`
     * already uses) - finding among `$scanner_ids` that's tied to a real
     * page/post, bucketed by post id. Seo.php's own "Pages that need
     * attention" table needs this to compute a real per-page score/Main
     * Problem/Change without an N+1 query per page.
     * `DuplicateContentScanner`'s own `object_ref` is a comma-joined list of
     * post ids (one finding genuinely spans multiple posts) - split and
     * attached to EACH matching post here, same real handling
     * `seoIssuesShared.tsx`'s own `bucketFindingsByPage()` already does
     * client-side for the current (non-as-of) case.
     *
     * @param string[]    $scanner_ids Scanner ids to scope to.
     * @param string|null $as_of       MySQL datetime (UTC) to reconstruct the open set as of; null for the real current open set.
     * @return array<int, array<int, array{id: int, title: string, severity: string}>> post_id => that post's own open findings.
     */
    public function get_open_findings_for_scanner_ids_by_post( array $scanner_ids, ?string $as_of = null ): array {
        $buckets = array();

        if ( ! $scanner_ids ) {
            return $buckets;
        }

        $sql    = 'SELECT id, title, severity, object_ref FROM %i WHERE scanner_id IN (' . $this->placeholders( count( $scanner_ids ) ) . ") AND object_type = 'post' AND ";
        $values = array_values( $scanner_ids );

        if ( null === $as_of ) {
            $sql .= "status = 'open'";
        } else {
            $sql     .= self::AS_OF_SQL;
            $values[] = $as_of;
            $values[] = $as_of;
        }

        foreach ( $this->get_rows( $sql, $values ) as $row ) {
            $finding = array(
                'id'       => (int) $row['id'],
                'title'    => $row['title'],
                'severity' => $row['severity'],
            );

            foreach ( explode( ',', (string) $row['object_ref'] ) as $object_ref ) {
                $post_id = (int) $object_ref;

                if ( $post_id > 0 ) {
                    $buckets[ $post_id ][] = $finding;
                }
            }
        }

        return $buckets;
    }

    /**
     * Distinct real pages/posts/URLs with at least one currently-open
     * finding among $scanner_ids - the real "N pages affected" count
     * Seo.php's own category cards need alongside
     * get_severity_breakdown_for_scanner_ids()'s own per-severity counts.
     * `object_ref` is that finding's own real target (a `WP_Post::ID` for
     * most scanners, a URL string for the few that are - `canonical-url`'s
     * own object_type is `url`, not `post`); counted together rather than
     * scoped to `object_type = 'post'`, since a category can legitimately
     * mix both and every value is still a real distinct affected target
     * either way.
     *
     * @param string[] $scanner_ids Scanner ids to scope to.
     * @return int
     */
    public function get_affected_object_count_for_scanner_ids( array $scanner_ids ): int {
        if ( ! $scanner_ids ) {
            return 0;
        }

        return (int) $this->get_scalar(
            'SELECT COUNT(DISTINCT object_ref) FROM %i WHERE scanner_id IN (' . $this->placeholders( count( $scanner_ids ) ) . ") AND status = 'open'",
            array_values( $scanner_ids )
        );
    }

    /**
     * Aggregate counts for one date range - what every Reports\Types\*
     * report reads instead of pulling every row in the period into PHP to
     * count them (performance.md). $category narrows to one scanner
     * category (e.g. 'seo', 'security'); null means every category, used
     * by Reports\Types\ScanSummaryReport/HealthReport. $scanner_ids
     * additionally narrows to an explicit scanner id list (Content
     * Intelligence's own report, which spans two categories - see
     * get_severity_breakdown_for_scanner_ids()'s own docblock for why);
     * combinable with $category, though no current caller needs both at
     * once.
     *
     * One grouped query feeds all three breakdowns (severity, category,
     * status) - they share a single WHERE, so the rows are folded in PHP
     * instead of scanning the period three times.
     *
     * @param string        $period_start Y-m-d, inclusive.
     * @param string        $period_end   Y-m-d, inclusive.
     * @param string|null   $category     One of the scanner category strings (SCANNERS.md), or null for all.
     * @param string[]|null $scanner_ids  Scanner ids to additionally scope to, or null for every scanner in $category.
     * @return array{total: int, by_severity: array<string, int>, by_category: array<string, int>, by_status: array<string, int>}
     */
    public function get_stats_for_period( string $period_start, string $period_end, ?string $category = null, ?array $scanner_ids = null ): array {
        list( $scope_sql, $scope_values ) = $this->build_scope( $category, $scanner_ids );

        $rows = $this->get_rows(
            'SELECT severity, category, status, COUNT(*) AS total FROM %i WHERE DATE(created_at) BETWEEN %s AND %s' . $scope_sql . ' GROUP BY severity, category, status',
            array_merge( array( $period_start, $period_end ), $scope_values )
        );

        $by_severity = $this->count_severities( array(), true );
        $by_category = array();
        $by_status   = array();

        foreach ( $rows as $row ) {
            $total = (int) $row['total'];

            if ( isset( $by_severity[ $row['severity'] ] ) ) {
                $by_severity[ $row['severity'] ] += $total;
            }

            if ( null === $category ) {
                $by_category[ $row['category'] ] = ( $by_category[ $row['category'] ] ?? 0 ) + $total;
            }

            $by_status[ $row['status'] ] = ( $by_status[ $row['status'] ] ?? 0 ) + $total;
        }

        return array(
            'total'       => array_sum( $by_severity ),
            'by_severity' => $by_severity,
            'by_category' => $by_category,
            'by_status'   => $by_status,
        );
    }

    /**
     * Every object_type/object_ref pair from one scan run - used only to
     * build History's "Pages & posts" list (Controllers/History.php's own
     * build_affected_pages()), which needs every finding a scan produced to
     * count accurately per page, not find_all()'s own 100-row page cap. A
     * real, exact, indexed FK lookup (`idx_scan` on
     * vulopilot_scan_findings.scan_id, set once at insert time by
     * Services\ScanPersistenceListener::handle_scan_completed() in the same
     * request that creates the scan row itself) - not an approximation.
     *
     * @param int $scan_id vulopilot_scans.id.
     * @return array<int, array{object_type: string|null, object_ref: string|null}>
     */
    public function get_object_refs_for_scan( int $scan_id ): array {
        return $this->get_rows( 'SELECT object_type, object_ref FROM %i WHERE scan_id = %d LIMIT 2000', array( $scan_id ) );
    }

    /**
     * The highest-severity currently-open findings, worst-first - what
     * Controllers\ReportsOverview's own "Your next priorities" list reads.
     * Unlike get_top_findings_for_period() (scoped to a created_at window,
     * any status), this is unbounded by date and scoped to `status = 'open'`
     * only - the point is "what's still outstanding right now", not "what
     * appeared recently".
     *
     * @param int $limit Max rows to return.
     * @return array<int, array<string, mixed>>
     */
    public function get_top_open_findings( int $limit = 10 ): array {
        return $this->get_rows(
            "SELECT id, title, description, severity, category, created_at FROM %i WHERE status = 'open' ORDER BY " . self::SEVERITY_ORDER_SQL . ' ASC, created_at DESC LIMIT %d',
            array( max( 1, $limit ) )
        );
    }

    /**
     * The highest-severity findings opened in one date range - what a
     * report's "top issues" section reads, ordered worst-first rather than
     * newest-first.
     *
     * @param string        $period_start Y-m-d, inclusive.
     * @param string        $period_end   Y-m-d, inclusive.
     * @param string|null   $category     One of the scanner category strings, or null for all.
     * @param int           $limit        Max rows to return.
     * @param string[]|null $scanner_ids  Scanner ids to additionally scope to - same reasoning as get_stats_for_period()'s own docblock.
     * @return array<int, array<string, mixed>>
     */
    public function get_top_findings_for_period( string $period_start, string $period_end, ?string $category = null, int $limit = 10, ?array $scanner_ids = null ): array {
        list( $scope_sql, $scope_values ) = $this->build_scope( $category, $scanner_ids );

        return $this->get_rows(
            'SELECT id, title, severity, category, status, created_at FROM %i WHERE DATE(created_at) BETWEEN %s AND %s' . $scope_sql . ' ORDER BY ' . self::SEVERITY_ORDER_SQL . ' ASC, created_at DESC LIMIT %d',
            array_merge( array( $period_start, $period_end ), $scope_values, array( max( 1, $limit ) ) )
        );
    }

    /**
     * Severity => open-count map for one WHERE condition.
     *
     * @param string            $where        Condition using only literal fragments and placeholders.
     * @param array<int, mixed> $values       Values for `$where`'s placeholders, in order.
     * @param bool              $include_info Whether 'info' is a bucket of its own.
     * @return array<string, int>
     */
    private function get_severity_breakdown( string $where, array $values, bool $include_info ): array {
        $rows = $this->get_rows( 'SELECT severity, COUNT(*) AS total FROM %i WHERE ' . $where . ' GROUP BY severity', $values );

        return $this->count_severities( $rows, $include_info );
    }

    /**
     * Zero-filled severity => count map, filled from grouped `severity`/`total` rows.
     * A severity outside the buckets is ignored.
     *
     * @param array<int, array<string, mixed>> $rows         Rows with `severity` and `total`.
     * @param bool                             $include_info Whether 'info' is a bucket of its own.
     * @return array<string, int>
     */
    private function count_severities( array $rows, bool $include_info ): array {
        $counts = array(
            'critical' => 0,
            'high'     => 0,
            'medium'   => 0,
            'low'      => 0,
        );

        if ( $include_info ) {
            $counts['info'] = 0;
        }

        foreach ( $rows as $row ) {
            if ( isset( $counts[ $row['severity'] ] ) ) {
                $counts[ $row['severity'] ] = (int) $row['total'];
            }
        }

        return $counts;
    }

    /**
     * Collapses the 5-level severity counts into the 3-tier priority buckets.
     *
     * @param array<string, int> $raw Counts keyed by critical/high/medium/low/info.
     * @return array{high: int, medium: int, low: int}
     */
    private static function collapse_priority( array $raw ): array {
        return array(
            'high'   => $raw['critical'] + $raw['high'],
            'medium' => $raw['medium'],
            'low'    => $raw['low'] + $raw['info'],
        );
    }

    /**
     * Optional category/scanner_id filter shared by the reporting queries.
     *
     * @param string|null   $category    Category to scope to, or null.
     * @param string[]|null $scanner_ids Scanner ids to scope to, or null/empty.
     * @return array{0: string, 1: array<int, string>} SQL fragment (each condition prefixed with ` AND `) and its values, in placeholder order.
     */
    private function build_scope( ?string $category, ?array $scanner_ids ): array {
        $sql    = '';
        $values = array();

        if ( null !== $category ) {
            $sql     .= ' AND category = %s';
            $values[] = $category;
        }

        if ( $scanner_ids ) {
            $sql   .= ' AND scanner_id IN (' . $this->placeholders( count( $scanner_ids ) ) . ')';
            $values = array_merge( $values, array_values( $scanner_ids ) );
        }

        return array( $sql, $values );
    }

    /**
     * Comma-separated placeholder list for an `IN (...)` clause.
     *
     * @param int    $count  How many placeholders.
     * @param string $format Placeholder, `%s` or `%d`.
     * @return string
     */
    private function placeholders( int $count, string $format = '%s' ): string {
        return implode( ', ', array_fill( 0, $count, $format ) );
    }

    /**
     * Runs a SELECT and returns every row.
     *
     * @param string            $sql    Literal SQL fragments and placeholders; this table's name is the first `%i`.
     * @param array<int, mixed> $values Values for the placeholders after the table, in order.
     * @return array<int, array<string, mixed>>
     */
    private function get_rows( string $sql, array $values = array() ): array {
        global $wpdb;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- the SQL is built from literal fragments by the callers, every value is a bound placeholder, and only the placeholder count varies at runtime.
        $rows = $wpdb->get_results( $wpdb->prepare( $sql, array_merge( array( $this->get_table() ), $values ) ), ARRAY_A );

        return is_array( $rows ) ? $rows : array();
    }

    /**
     * Runs a SELECT and returns its first column.
     *
     * @param string            $sql    See get_rows().
     * @param array<int, mixed> $values See get_rows().
     * @return array<int, string>
     */
    private function get_column( string $sql, array $values = array() ): array {
        global $wpdb;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- see get_rows().
        $column = $wpdb->get_col( $wpdb->prepare( $sql, array_merge( array( $this->get_table() ), $values ) ) );

        return is_array( $column ) ? $column : array();
    }

    /**
     * Runs a SELECT and returns its single value.
     *
     * @param string            $sql    See get_rows().
     * @param array<int, mixed> $values See get_rows().
     * @return string|null
     */
    private function get_scalar( string $sql, array $values = array() ): ?string {
        global $wpdb;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- see get_rows().
        return $wpdb->get_var( $wpdb->prepare( $sql, array_merge( array( $this->get_table() ), $values ) ) );
    }
}
