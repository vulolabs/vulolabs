<?php
/**
 * GeoSemanticStructureScanner class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Geo\Scanners;


use VuloPilot\Contracts\Scanner\TracksScannedObjectsInterface;
use VuloPilot\ValueObjects\Finding;
use VuloPilot\ValueObjects\Severity;
use VuloPilot\Scanners\Basic\AbstractBasicScanner;
use VuloPilot\Scanners\Basic\ScannedPostsTrait;

defined( 'ABSPATH' ) || exit;

/**
 * Flags published posts/pages whose heading levels skip a level (e.g. an
 * `<h2>` followed later by an `<h4>` with no `<h3>` anywhere between
 * them, ignoring content in between at the same or shallower level).
 * AI systems that parse a page's heading outline to understand its
 * document structure (the same outline a screen reader or a browser's
 * table-of-contents feature would build) get a broken hierarchy from a
 * skipped level — distinct from HeadingStructureScanner's separate SEO
 * check (whether any subheading exists at all) and
 * AccessibilityScanner's (a second `<h1>` inside the content).
 *
 * @class       GeoSemanticStructureScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class GeoSemanticStructureScanner extends AbstractBasicScanner implements TracksScannedObjectsInterface {

    use ScannedPostsTrait;

    private const BATCH_SIZE = 50;

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'geo-semantic-structure';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'Semantic Structure', 'vulopilot' );
    }

    /**
     * @inheritDoc
     */
    public function get_category(): string {
        return 'geo';
    }

    /**
     * @inheritDoc
     */
    public function scan(): array {
        $settings = wp_parse_args( get_option( \VuloPilot\Utill::VULOPILOT_SETTINGS_KEY, array() ), \VuloPilot\Utill::VULOPILOT_SETTINGS_DEFAULTS );

        // GEO has no whole-category kill switch (see GeoSummaryBlockScanner's
        // own docblock) — this is this one scanner's own on/off switch,
        // Settings → Scanning → AI Visibility's "AI-readable structure"
        // row (Connections/AiVisibility.ts's own `ai_visibility_scans`
        // expandable-panel, Utill::VULOPILOT_SETTINGS_DEFAULTS). Moved
        // from the old flat `flag_missing_semantic` boolean into this
        // nested shape — same migration `visibility_alerts` already went
        // through for its own 3 rows.
        if ( empty( $settings['ai_visibility_scans']['structure']['enable'] ) ) {
            return array();
        }

        $findings = array();
        $posts    = get_posts(
            array(
                'post_type'      => array( 'post', 'page' ),
                'post_status'    => 'publish',
                'posts_per_page' => self::BATCH_SIZE,
                'orderby'        => 'modified',
                'order'          => 'DESC',
            )
        );

        foreach ( $posts as $post ) {
            $this->mark_post_scanned( $post->ID );

            if ( ! $this->has_heading_level_skip( $post->post_content ) ) {
                continue;
            }

            $findings[] = new Finding(
                sprintf(
                    /* translators: %s is the post/page title. */
                    __( 'Heading levels skip a level: %s', 'vulopilot' ),
                    get_the_title( $post )
                ),
                Severity::LOW,
                $this->get_category(),
                __( 'A heading jumps more than one level deeper than the previous one (e.g. an H2 followed directly by an H4). This breaks the document outline AI systems and screen readers rely on to understand structure.', 'vulopilot' ),
                'post',
                (string) $post->ID
            );
        }

        return $findings;
    }

    /**
     * Compares each heading only to the one immediately before it in
     * document order — the same "heading-order" definition of a skip
     * that accessibility checkers like axe-core use. Going shallower
     * (h3 → h2) is always fine; going deeper by more than one level
     * (h2 → h4) is a skip.
     *
     * @param string $content Post content (raw HTML).
     * @return bool
     */
    private function has_heading_level_skip( string $content ): bool {
        if ( ! preg_match_all( '/<h([1-6])[\s>]/i', $content, $matches ) ) {
            return false;
        }

        $levels   = array_map( 'intval', $matches[1] );
        $previous = $levels[0];

        for ( $i = 1, $count = count( $levels ); $i < $count; $i++ ) {
            if ( $levels[ $i ] > $previous + 1 ) {
                return true;
            }

            $previous = $levels[ $i ];
        }

        return false;
    }
}
