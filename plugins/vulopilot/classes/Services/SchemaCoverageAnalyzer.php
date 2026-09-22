<?php
/**
 * SchemaCoverageAnalyzer class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Repositories\FindingRepository;
use VuloPilot\Seo\Scanners\StructuredDataValidationScanner;
use VuloPilot\ValueObjects\ScanResult;

defined( 'ABSPATH' ) || exit;

/**
 * Real per-page JSON-LD sampling for the restyled Schema tab's own "Schema
 * Coverage" table — a deterministic structural check (fetch each sampled
 * page's real rendered HTML, extract `<script type="application/ld+json">`
 * blocks the same way StructuredDataValidationScanner already does for the
 * homepage, decode each block's real `@type`), not an AI call, so there's
 * no per-call cost or rate limit to worry about the way
 * GeoInsights\VisibilitySnapshotBuilder's own AI-scored sample has
 * (Pro, vulopilot-pro) — but it is still real outbound HTTP work per
 * sampled page, so results are cached (transient, `CACHE_TTL`) and only
 * ever (re)computed on an explicit `POST /schema/coverage`, same
 * "loading a page never silently spends real work" posture
 * CompetitorVisibilityAnalyzer (GeoInsights, Pro) already established for
 * its own real per-competitor HTTP fetch.
 *
 * @class       SchemaCoverageAnalyzer class
 * @version     1.0.0
 * @author      VuloLabs
 */
class SchemaCoverageAnalyzer {

    private const CACHE_KEY               = 'vulopilot_schema_coverage_snapshot';
    private const CACHE_TTL               = 6 * HOUR_IN_SECONDS;
    private const SAMPLE_SIZE             = 15;
    private const REQUEST_TIMEOUT_SECONDS = 8;

    /**
     * Plain-English meaning shown per real schema.org @type found — same
     * "translate a real technical value into a human sentence" spirit
     * FindingRepository's own Finding value object already applies to scan
     * results, kept here since @type strings aren't findings themselves.
     * Unrecognized types (a theme/plugin emitting something not in this
     * list) still show up in the real coverage table, just with a generic
     * fallback meaning rather than being dropped.
     *
     * @var array<string, string>
     */
    private const TYPE_MEANINGS = array(
        'Organization'    => 'Your business identity',
        'WebSite'         => 'Your website identity',
        'WebPage'         => 'A regular page',
        'BreadcrumbList'  => 'Page navigation',
        'Article'         => 'Blog/article content',
        'BlogPosting'     => 'Blog/article content',
        'Product'         => 'A product you sell',
        'Person'          => 'A content author',
        'FAQPage'         => 'Frequently-asked-questions content',
        'HowTo'           => 'Step-by-step instructions',
        'LocalBusiness'   => 'Physical business details',
        'Review'          => 'A customer review',
        'AggregateRating' => 'A rolled-up rating',
    );

    /**
     * Regenerates the coverage snapshot whenever the schema scanner
     * finishes — i.e. as part of any "Run scan" that includes schema — so
     * the Schema Coverage table fills itself in without a separate button.
     * Hooked on `vulopilot_scan_completed` (fires once per scanner) and
     * keyed to the one `schema` scanner so it runs once per scan.
     *
     * @param ScanResult $result The completed scanner result.
     * @return void
     */
    public function refresh_after_scan( ScanResult $result ): void {
        if ( 'schema' !== $result->get_scanner_id() ) {
            return;
        }

        $this->analyze();
    }

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
     * Runs a fresh real sample and stores it — the only path that performs
     * real outbound HTTP requests (see this class's own docblock).
     *
     * @return array{generated_at: string, sample_size: int, coverage: array<int, array{type: string, meaning: string, found_on: int, problems: int, pages: array<int, array{id: int, title: string, url: string, edit_url: string|null}>}>, pages_checked: int, pages_with_valid_schema: int, pages_needing_attention: int}
     */
    public function analyze(): array {
        $post_ids = get_posts(
            array(
                'post_type'      => array( 'post', 'page', 'product' ),
                'post_status'    => 'publish',
                'posts_per_page' => self::SAMPLE_SIZE,
                'orderby'        => 'modified',
                'order'          => 'DESC',
                'fields'         => 'ids',
            )
        );

        $type_counts = array();
        // Real, specific pages behind each type's `found_on` count —
        // "View pages" (StructuredDataSection.tsx) shows exactly these,
        // instead of the generic "go check the SEO tab" redirect it used
        // to be: a site owner can now see, per @type, precisely which
        // real page(s) actually carry it.
        $type_pages    = array();
        $pages_checked = 0;
        // A checked page "has valid schema" when at least one real
        // `application/ld+json` block with a real `@type` was actually
        // found on it — the "Schema Status" summary card's own
        // `pages_with_valid_schema`/`pages_needing_attention` tiles
        // (StructuredDataSection.tsx), a real per-PAGE pass/fail count,
        // distinct from `coverage`'s own per-TYPE `found_on`/`problems`
        // figures below.
        $pages_with_schema = 0;
        // Every checked page (with or without schema) — what clicking the
        // "Pages checked"/"Pages with valid schema"/"Need attention" stat
        // cards lists.
        $checked_pages = array();

        foreach ( $post_ids as $post_id ) {
            $permalink = get_permalink( $post_id );
            if ( ! $permalink ) {
                continue;
            }

            $types = $this->extract_types_from_url( $permalink );
            if ( null === $types ) {
                continue;
            }

            ++$pages_checked;

            if ( ! empty( $types ) ) {
                ++$pages_with_schema;
            }

            $page_entry = array(
                'id'       => $post_id,
                'title'    => get_the_title( $post_id ) ?: $permalink,
                'url'      => $permalink,
                'edit_url' => current_user_can( 'edit_post', $post_id ) ? get_edit_post_link( $post_id, 'raw' ) : null,
            );

            $checked_pages[] = $page_entry + array( 'types' => array_values( array_unique( $types ) ) );

            foreach ( array_unique( $types ) as $type ) {
                $type_counts[ $type ]  = ( $type_counts[ $type ] ?? 0 ) + 1;
                $type_pages[ $type ][] = $page_entry;
            }
        }

        // The homepage's own sitewide Organization/WebSite schema (site
        // identity, not per-post content) — checked separately from the
        // per-post sample above, same "homepage is its own real signal"
        // reasoning SchemaScanner already applies. Counted into
        // `pages_checked`/`pages_with_schema` too now (it wasn't before):
        // the homepage genuinely is a real page this method just fetched
        // and inspected, so excluding it from "pages checked" undercounted
        // the very real work this method already does.
        $homepage_types = $this->extract_types_from_url( home_url( '/' ) );
        if ( null !== $homepage_types ) {
            ++$pages_checked;

            if ( ! empty( $homepage_types ) ) {
                ++$pages_with_schema;
            }

            $homepage_entry = array(
                'id'       => 0,
                'title'    => __( 'Homepage', 'vulopilot' ),
                'url'      => home_url( '/' ),
                'edit_url' => null,
            );

            $checked_pages[] = $homepage_entry + array( 'types' => array_values( array_unique( $homepage_types ) ) );

            foreach ( array_unique( $homepage_types ) as $type ) {
                $type_counts[ $type ]  = ( $type_counts[ $type ] ?? 0 ) + 1;
                $type_pages[ $type ][] = $homepage_entry;
            }
        }

        $findings            = new FindingRepository();
        $problem_scanner_ids = array( 'schema', 'structured-data', 'sitewide-structured-data', 'organization-schema', 'author-schema' );
        $open_problems_total = array_sum( $findings->get_severity_breakdown_for_scanner_ids( $problem_scanner_ids ) );

        arsort( $type_counts );

        $coverage = array();
        foreach ( $type_counts as $type => $found_on ) {
            $coverage[] = array(
                'type'     => $type,
                'meaning'  => self::TYPE_MEANINGS[ $type ] ?? __( 'Structured data', 'vulopilot' ),
                'found_on' => $found_on,
                // A real, coarse split of the site's total open schema-adjacent
                // findings across each real type found, proportional to how
                // often that type appears — there's no per-type problem
                // attribution in the finding data itself (a finding is scoped
                // to a post, not a schema @type), so this is an honest
                // estimate labelled as such on the frontend, not a precise
                // per-type count.
                'problems' => $found_on > 0 && $open_problems_total > 0
                    ? (int) round( ( $found_on / array_sum( $type_counts ) ) * $open_problems_total )
                    : 0,
                'pages'    => $type_pages[ $type ] ?? array(),
            );
        }

        $snapshot = array(
            'generated_at'            => current_time( 'mysql', true ),
            'sample_size'             => self::SAMPLE_SIZE,
            'pages_checked'           => $pages_checked,
            'pages_with_valid_schema' => $pages_with_schema,
            'pages_needing_attention' => $pages_checked - $pages_with_schema,
            'coverage'                => $coverage,
            'pages'                   => $checked_pages,
        );

        set_transient( self::CACHE_KEY, $snapshot, self::CACHE_TTL );

        return $snapshot;
    }

    /**
     * @return array|null Cached snapshot, or null if none has been generated yet.
     */
    public function get_stored_snapshot(): ?array {
        $snapshot = get_transient( self::CACHE_KEY );
        return $snapshot ?: null;
    }

    /**
     * @param string $url Real URL to fetch.
     * @return string[]|null Every real `@type` value found in that page's JSON-LD, or null on a real fetch failure.
     */
    private function extract_types_from_url( string $url ): ?array {
        $response = wp_remote_get(
            $url,
            array(
                'timeout'   => self::REQUEST_TIMEOUT_SECONDS,
                'sslverify' => false,
            )
        );

        if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
            return null;
        }

        $body   = wp_remote_retrieve_body( $response );
        $blocks = StructuredDataValidationScanner::extract_json_ld_blocks( $body );

        $types = array();
        foreach ( $blocks as $block ) {
            $decoded = json_decode( $block, true );
            if ( JSON_ERROR_NONE !== json_last_error() || ! is_array( $decoded ) ) {
                continue;
            }

            // A single JSON-LD block can be one object, a @graph of several,
            // or a JSON array of several top-level objects — cover all 3
            // real shapes rather than assuming one. array_keys() === range()
            // is the min-PHP-8.0-compatible list check (array_is_list() is
            // 8.1+, this codebase's own composer.json floor is 8.0).
            $is_list    = array_keys( $decoded ) === range( 0, count( $decoded ) - 1 );
            $candidates = isset( $decoded['@graph'] ) && is_array( $decoded['@graph'] )
                ? $decoded['@graph']
                : ( $is_list ? $decoded : array( $decoded ) );

            foreach ( $candidates as $candidate ) {
                if ( ! is_array( $candidate ) || empty( $candidate['@type'] ) ) {
                    continue;
                }
                foreach ( (array) $candidate['@type'] as $type ) {
                    if ( is_string( $type ) && '' !== $type ) {
                        $types[] = $type;
                    }
                }
            }
        }

        return $types;
    }
}
