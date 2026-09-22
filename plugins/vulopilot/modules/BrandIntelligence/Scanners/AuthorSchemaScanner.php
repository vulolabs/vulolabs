<?php
/**
 * AuthorSchemaScanner class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\BrandIntelligence\Scanners;

use VuloPilot\Contracts\Scanner\TracksScannedObjectsInterface;
use VuloPilot\ValueObjects\Finding;
use VuloPilot\ValueObjects\Severity;
use VuloPilot\Scanners\Basic\AbstractBasicScanner;
use VuloPilot\Scanners\Basic\ScannedPostsTrait;

defined( 'ABSPATH' ) || exit;

/**
 * Brand Intelligence's own new check (BRAND-INTELLIGENCE-MODULE.md) —
 * distinct from GeoAuthorInfoScanner's own check (does the author have a
 * bio *at all*, on their WordPress user profile) and from
 * GeoEeatSignalsScanner (bio OR freshness). This checks whether a
 * published post's own structured data
 * (`_vulopilot_schema_json` — Services\SchemaJsonLdRenderer's key, same
 * one AeoSchemaScanner already reads) actually includes a `Person`
 * reference identifying its author — the machine-readable signal AI
 * answer engines and Google Knowledge Panels read, which a human-visible
 * bio field alone doesn't provide.
 *
 * Reads the postmeta directly rather than fetching the live page (same
 * "every signal this scanner needs already exists locally" reasoning
 * AeoSchemaScanner's own docblock gives for the identical choice).
 *
 * @class       AuthorSchemaScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class AuthorSchemaScanner extends AbstractBasicScanner implements TracksScannedObjectsInterface {

    use ScannedPostsTrait;

    private const BATCH_SIZE = 50;

    /**
     * Must match SchemaJsonLdRenderer::META_KEY / GenerateSchemaAction::META_KEY.
     */
    private const SCHEMA_META_KEY = '_vulopilot_schema_json';

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'author-schema';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'Author Schema', 'vulopilot' );
    }

    /**
     * @inheritDoc
     */
    public function get_category(): string {
        return 'brand';
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

            if ( $this->has_person_schema( $post->ID ) ) {
                continue;
            }

            $findings[] = new Finding(
                sprintf(
                    /* translators: %s is the post/page title. */
                    __( 'No author schema found: %s', 'vulopilot' ),
                    get_the_title( $post )
                ),
                Severity::LOW,
                $this->get_category(),
                __( 'A Person reference in this content\'s structured data is what AI answer engines and Knowledge Panels read to resolve who wrote it — separate from a human-visible author bio, which alone isn\'t machine-readable.', 'vulopilot' ),
                'post',
                (string) $post->ID
            );
        }

        return $findings;
    }

    /**
     * Simple raw-string presence check (nested-safe — a Person reference
     * commonly lives as an "author" sub-object of an Article block rather
     * than a standalone top-level type), same posture
     * OrganizationSchemaScanner's own check takes.
     *
     * @param int $post_id Post to check.
     * @return bool
     */
    private function has_person_schema( int $post_id ): bool {
        $raw = get_post_meta( $post_id, self::SCHEMA_META_KEY, true );

        if ( '' === $raw || ! is_string( $raw ) ) {
            return false;
        }

        return 1 === preg_match( '/"@type"\s*:\s*"Person"/i', $raw );
    }
}
