<?php
/**
 * AeoSchemaScanner class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Scanners\Basic;

use VuloPilot\Contracts\Scanner\TracksScannedObjectsInterface;
use VuloPilot\ValueObjects\Finding;
use VuloPilot\ValueObjects\Severity;

defined( 'ABSPATH' ) || exit;

/**
 * AEO (Answer Engine Optimization) — the one GEO check this pass adds that
 * the existing 9 `geo`-category scanners don't already cover: whether a
 * post whose own content is *already shaped* like an answer-engine-ready
 * FAQ or HowTo (question-phrased headings, or a numbered step list) also
 * has the matching `FAQPage`/`HowTo` schema.org markup search/answer
 * engines actually read to lift it into a rich answer box. This is
 * deliberately narrower than GeoFaqOpportunityScanner (which flags content
 * with NO question headings at all) — this scanner only ever fires for
 * content that already looks FAQ/HowTo-shaped but is missing the schema
 * that would let an answer engine recognize it as such, a distinct,
 * currently-uncovered signal, not a restatement of that scanner's own
 * check.
 *
 * Reads `_vulopilot_schema_json` postmeta directly (Services\SchemaJsonLdRenderer's
 * own key — the same JSON-LD this codebase already renders on `wp_head` for
 * a post, see GenerateSchemaAction/SchemaJsonLdRenderer) rather than making
 * a real HTTP request per post — every signal this scanner needs already
 * exists locally, so there's no reason to fetch the page over the network
 * the way Pro's SitewideStructuredDataScanner does for its own, different
 * ("is there any JSON-LD present at all") check.
 *
 * @class       AeoSchemaScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class AeoSchemaScanner extends AbstractBasicScanner implements TracksScannedObjectsInterface {

    use ScannedPostsTrait;

    private const BATCH_SIZE = 50;

    /**
     * Must match SchemaJsonLdRenderer::META_KEY / GenerateSchemaAction::META_KEY.
     */
    private const SCHEMA_META_KEY = '_vulopilot_schema_json';

    /**
     * A numbered/ordered list with at least this many steps reads as a
     * genuine "how to" sequence rather than an incidental short list.
     */
    private const MIN_HOWTO_STEPS = 3;

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'aeo-schema';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'AEO Schema Coverage', 'vulopilot' );
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

            $schema_types = $this->get_declared_schema_types( $post->ID );

            if ( $this->looks_faq_shaped( $post->post_content ) && ! in_array( 'FAQPage', $schema_types, true ) ) {
                $findings[] = $this->build_finding( $post, 'FAQPage', 'faq' );
            }

            if ( $this->looks_howto_shaped( $post->post_content ) && ! in_array( 'HowTo', $schema_types, true ) ) {
                $findings[] = $this->build_finding( $post, 'HowTo', 'howto' );
            }
        }

        return $findings;
    }

    /**
     * @param string $content Post content HTML.
     * @return bool Whether this content already has GeoFaqOpportunityScanner's own "question-phrased heading" signal.
     */
    private function looks_faq_shaped( string $content ): bool {
        return 1 === preg_match( '/<h[2-6][^>]*>[^<]*\?\s*<\/h[2-6]>/i', $content );
    }

    /**
     * @param string $content Post content HTML.
     * @return bool Whether an ordered list with at least MIN_HOWTO_STEPS items is present.
     */
    private function looks_howto_shaped( string $content ): bool {
        if ( ! preg_match_all( '/<ol[^>]*>(.*?)<\/ol>/is', $content, $lists ) ) {
            return false;
        }

        foreach ( $lists[1] as $list_body ) {
            if ( preg_match_all( '/<li[^>]*>/i', $list_body ) >= self::MIN_HOWTO_STEPS ) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param int $post_id Post to read declared schema types for.
     * @return string[] `@type` value(s) already saved to this post's own SCHEMA_META_KEY, empty if none/malformed.
     */
    private function get_declared_schema_types( int $post_id ): array {
        $raw = get_post_meta( $post_id, self::SCHEMA_META_KEY, true );

        if ( '' === $raw || ! is_string( $raw ) ) {
            return array();
        }

        $decoded = json_decode( $raw, true );

        if ( ! is_array( $decoded ) || empty( $decoded['@type'] ) ) {
            return array();
        }

        return is_array( $decoded['@type'] ) ? $decoded['@type'] : array( $decoded['@type'] );
    }

    /**
     * @param \WP_Post $post        The post missing schema.
     * @param string   $schema_type 'FAQPage' or 'HowTo'.
     * @param string   $shape       'faq' or 'howto' — recorded in meta for AiCopilot\Actions\GenerateSchemaAction to read a hint from, same convention GeoTrustSignalsScanner's own meta already establishes.
     * @return Finding
     */
    private function build_finding( \WP_Post $post, string $schema_type, string $shape ): Finding {
        return new Finding(
            sprintf(
                /* translators: 1: schema.org type (FAQPage/HowTo), 2: post/page title. */
                __( 'Missing %1$s schema: %2$s', 'vulopilot' ),
                $schema_type,
                get_the_title( $post )
            ),
            Severity::MEDIUM,
            $this->get_category(),
            sprintf(
                /* translators: %s is the schema.org type (FAQPage/HowTo). */
                __( "This content is already shaped like %s content (matching headings/list structure) but has no matching schema.org markup, so AI answer engines can't confidently recognize it as one.", 'vulopilot' ),
                $schema_type
            ),
            'post',
            (string) $post->ID,
            array(
                'aeo_schema_gap'     => true,
                'aeo_suggested_type' => $schema_type,
                'aeo_content_shape'  => $shape,
            )
        );
    }
}
