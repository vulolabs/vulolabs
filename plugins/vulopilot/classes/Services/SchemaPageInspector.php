<?php
/**
 * SchemaPageInspector class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Seo\Scanners\StructuredDataValidationScanner;

defined( 'ABSPATH' ) || exit;

/**
 * Real single-page JSON-LD inspection for the "Schema & Knowledge" tab's
 * own Inspector section — a real `wp_remote_get()` of the requested page
 * plus the exact same `StructuredDataValidationScanner::extract_json_ld_blocks()`
 * extraction SchemaCoverageAnalyzer already uses for its own multi-page
 * sample (public+static specifically so this class can reuse it too — see
 * that method's own docblock), decoded the same `@graph`/list/object way
 * SchemaCoverageAnalyzer::extract_types_from_url() already does. No AI, no
 * fabricated data: every type/problem/preview field below is either
 * directly read off the real decoded JSON-LD or explicitly absent.
 *
 * @class       SchemaPageInspector class
 * @version     1.0.0
 * @author      VuloLabs
 */
class SchemaPageInspector {

    private const REQUEST_TIMEOUT_SECONDS = 8;

    /**
     * Fields a real crawler/rich-results consumer expects for each @type —
     * StructuredDataValidationScanner only ever checks JSON *validity*, not
     * field presence, so this is genuinely new, not a duplicate of
     * anything already computed elsewhere.
     *
     * @var array<string, string[]>
     */
    private const EXPECTED_FIELDS = array(
        'Product'       => array( 'name', 'offers' ),
        'Organization'  => array( 'name', 'logo' ),
        'LocalBusiness' => array( 'name', 'address' ),
        'Article'       => array( 'headline', 'datePublished', 'author' ),
        'BlogPosting'   => array( 'headline', 'datePublished', 'author' ),
        'Review'        => array( 'reviewRating' ),
        'Person'        => array( 'name' ),
    );

    /**
     * @param string $url Real URL to fetch and inspect.
     * @return array{url: string, fetched_at: string, types: string[], blocks: array<int, array{index: int, type: string|null, raw: string}>, problems: array<int, array{type: string, block_index: int, field: string, message: string}>, conflicts: array<int, array{type: string, block_indexes: int[]}>, preview: array<string, mixed>|null}|null Null on a real fetch failure.
     */
    public function inspect( string $url ): ?array {
        $response = wp_remote_get(
            $url,
            array(
                'timeout'   => self::REQUEST_TIMEOUT_SECONDS,
                'sslverify' => false,
            )
        );

        if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
            return null;
        }

        $body       = wp_remote_retrieve_body( $response );
        $raw_blocks = StructuredDataValidationScanner::extract_json_ld_blocks( $body );
        $blocks_out = array();
        $types_seen = array();
        $problems   = array();
        $by_type    = array();
        $preview    = null;

        foreach ( $raw_blocks as $index => $raw_block ) {
            $decoded = json_decode( $raw_block, true );

            if ( JSON_ERROR_NONE !== json_last_error() || ! is_array( $decoded ) ) {
                $blocks_out[] = array(
                    'index' => $index,
                    'type'  => null,
                    'raw'   => $raw_block,
                );
                continue;
            }

            // Same 3 real shapes SchemaCoverageAnalyzer::extract_types_from_url()
            // already handles — a single object, a @graph of several, or a
            // JSON array of several top-level objects. array_keys() ===
            // range() is the min-PHP-8.0-compatible list check
            // (array_is_list() is 8.1+, this plugin's composer.json floor
            // is 8.0).
            $is_list    = array_keys( $decoded ) === range( 0, count( $decoded ) - 1 );
            $candidates = isset( $decoded['@graph'] ) && is_array( $decoded['@graph'] )
                ? $decoded['@graph']
                : ( $is_list ? $decoded : array( $decoded ) );

            $block_type = null;

            foreach ( $candidates as $candidate ) {
                if ( ! is_array( $candidate ) || empty( $candidate['@type'] ) ) {
                    continue;
                }

                foreach ( (array) $candidate['@type'] as $type ) {
                    if ( ! is_string( $type ) || '' === $type ) {
                        continue;
                    }

                    $block_type         = $block_type ?? $type;
                    $types_seen[]       = $type;
                    $by_type[ $type ][] = $index;

                    foreach ( self::EXPECTED_FIELDS[ $type ] ?? array() as $field ) {
                        if ( ! array_key_exists( $field, $candidate ) || '' === $candidate[ $field ] ) {
                            $problems[] = array(
                                'type'        => $type,
                                'block_index' => $index,
                                'field'       => $field,
                                'message'     => sprintf(
                                    /* translators: 1: schema.org field name, e.g. "offers", 2: schema.org @type, e.g. "Product". */
                                    __( '%1$s information missing from this page’s %2$s schema.', 'vulopilot' ),
                                    self::humanize_field( $field ),
                                    $type
                                ),
                            );
                        }
                    }

                    if ( null === $preview && in_array( $type, array( 'Product', 'Article', 'BlogPosting' ), true ) ) {
                        $preview = self::build_preview( $type, $candidate );
                    }
                }
            }

            $blocks_out[] = array(
                'index' => $index,
                'type'  => $block_type,
                'raw'   => $raw_block,
            );
        }

        $conflicts = array();
        foreach ( $by_type as $type => $indexes ) {
            if ( count( array_unique( $indexes ) ) > 1 ) {
                $conflicts[] = array(
                    'type'          => $type,
                    'block_indexes' => array_values( array_unique( $indexes ) ),
                );
            }
        }

        return array(
            'url'        => $url,
            'fetched_at' => current_time( 'mysql', true ),
            'types'      => array_values( array_unique( $types_seen ) ),
            'blocks'     => $blocks_out,
            'problems'   => $problems,
            'conflicts'  => $conflicts,
            'preview'    => $preview,
        );
    }

    /**
     * @param string $field e.g. 'offers'.
     * @return string e.g. 'Availability' — only the handful of fields this class actually checks need a mapping.
     */
    private static function humanize_field( string $field ): string {
        $labels = array(
            'name'          => __( 'Name', 'vulopilot' ),
            'offers'        => __( 'Price/availability', 'vulopilot' ),
            'logo'          => __( 'Logo', 'vulopilot' ),
            'address'       => __( 'Address', 'vulopilot' ),
            'headline'      => __( 'Headline', 'vulopilot' ),
            'datePublished' => __( 'Publish date', 'vulopilot' ),
            'author'        => __( 'Author', 'vulopilot' ),
            'reviewRating'  => __( 'Review rating', 'vulopilot' ),
        );

        return $labels[ $field ] ?? ucfirst( $field );
    }

    /**
     * Every field individually optional — a missing one is reported as
     * genuinely absent on the frontend, never backfilled with a
     * placeholder.
     *
     * @param string               $type      'Product'|'Article'|'BlogPosting'.
     * @param array<string, mixed> $candidate Decoded JSON-LD object.
     * @return array<string, mixed>
     */
    private static function build_preview( string $type, array $candidate ): array {
        $availability = null;
        $rating       = null;
        $rating_count = null;

        if ( 'Product' === $type && isset( $candidate['offers'] ) && is_array( $candidate['offers'] ) ) {
            $offers       = isset( $candidate['offers'][0] ) && is_array( $candidate['offers'][0] )
                ? $candidate['offers'][0]
                : $candidate['offers'];
            $availability = isset( $offers['availability'] ) && is_string( $offers['availability'] )
                ? basename( str_replace( 'http://schema.org/', '', $offers['availability'] ) )
                : null;
        }

        if ( isset( $candidate['aggregateRating'] ) && is_array( $candidate['aggregateRating'] ) ) {
            $rating       = isset( $candidate['aggregateRating']['ratingValue'] ) ? (float) $candidate['aggregateRating']['ratingValue'] : null;
            $rating_count = isset( $candidate['aggregateRating']['ratingCount'] ) ? (int) $candidate['aggregateRating']['ratingCount'] : null;
        }

        return array(
            'title'        => is_string( $candidate['name'] ?? null ) ? $candidate['name'] : ( is_string( $candidate['headline'] ?? null ) ? $candidate['headline'] : null ),
            'description'  => is_string( $candidate['description'] ?? null ) ? $candidate['description'] : null,
            'rating'       => $rating,
            'rating_count' => $rating_count,
            'availability' => $availability,
        );
    }
}
