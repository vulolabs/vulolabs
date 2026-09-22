<?php
/**
 * ImagesScanner class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Seo\Scanners;


use VuloPilot\ValueObjects\Finding;
use VuloPilot\ValueObjects\Severity;
use VuloPilot\Scanners\Basic\AbstractBasicScanner;

defined( 'ABSPATH' ) || exit;

/**
 * Flags image attachments with no alt text set. Bounded to the most
 * recent batch of attachments (per performance.md — an unbounded
 * media-library scan on every run doesn't scale on large sites) rather
 * than the whole media library every time.
 *
 * @class       ImagesScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class ImagesScanner extends AbstractBasicScanner {

    /**
     * How many of the most recent image attachments to check per run.
     */
    private const BATCH_SIZE = 100;

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'images';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'Images', 'vulopilot' );
    }

    /**
     * @inheritDoc
     */
    public function get_category(): string {
        return 'images';
    }

    /**
     * @inheritDoc
     */
    public function scan(): array {
        $settings = wp_parse_args( get_option( \VuloPilot\Utill::VULOPILOT_SETTINGS_KEY, array() ), \VuloPilot\Utill::VULOPILOT_SETTINGS_DEFAULTS );

        // Flat, standalone key — Settings → Scanning → SEO & Content →
        // "Images" (SeoContent.ts). See Utill::VULOPILOT_SETTINGS_DEFAULTS's
        // own docblock on this key for why it's no longer nested under
        // content_search_scans.images.
        if ( empty( $settings['flag_missing_alt_text'] ) ) {
            return array();
        }

        $findings    = array();
        $attachments = get_posts(
            array(
                'post_type'      => 'attachment',
                'post_mime_type' => 'image',
                'post_status'    => 'inherit',
                'posts_per_page' => self::BATCH_SIZE,
                'orderby'        => 'date',
                'order'          => 'DESC',
                'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
                    array(
                        'key'     => '_wp_attachment_image_alt',
                        'compare' => 'NOT EXISTS',
                    ),
                ),
                'fields'         => 'ids',
            )
        );

        foreach ( $attachments as $attachment_id ) {
            $findings[] = new Finding(
                sprintf(
                    /* translators: %s is the image filename. */
                    __( 'Image missing alt text: %s', 'vulopilot' ),
                    wp_basename( get_attached_file( $attachment_id ) )
                ),
                Severity::LOW,
                $this->get_category(),
                __( 'Alt text helps search engines and screen reader users understand what an image shows.', 'vulopilot' ),
                'attachment',
                (string) $attachment_id
            );
        }

        return $findings;
    }
}
