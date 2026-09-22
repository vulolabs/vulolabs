<?php
/**
 * BrokenImagesScanner class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Seo\Scanners;

use VuloPilot\Contracts\Scanner\SupportsForceRunInterface;
use VuloPilot\Contracts\Scanner\TracksScannedObjectsInterface;
use VuloPilot\ValueObjects\Finding;
use VuloPilot\ValueObjects\Severity;
use VuloPilot\Scanners\Basic\AbstractBasicScanner;
use VuloPilot\Scanners\Basic\ScannedPostsTrait;

defined( 'ABSPATH' ) || exit;

/**
 * BrokenLinksScanner's own sibling for `<img src>` instead of `<a href>` —
 * extracts image sources from the most recently published posts/pages and
 * checks each one for a non-2xx/3xx HTTP response, flagging ones that
 * appear broken. Added alongside that class's own real `reason`/coverage
 * additions so BrokenLinksTab.tsx's "Broken images" tile is a real,
 * second scanner's real count, not a number this codebase never actually
 * computed. Neither ImagesScanner nor SeoImagesScanner cover this — both
 * only flag images missing alt text, never a broken `src`.
 *
 * Same two deliberate bounds (posts scanned, total images checked) as
 * BrokenLinksScanner, for the identical reason (performance.md — no
 * unbounded per-run crawl).
 *
 * @class       BrokenImagesScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class BrokenImagesScanner extends AbstractBasicScanner implements TracksScannedObjectsInterface, SupportsForceRunInterface {

    use ScannedPostsTrait;

    private const POSTS_BATCH_SIZE        = 20;
    private const MAX_IMAGES_PER_RUN      = 40;
    private const REQUEST_TIMEOUT_SECONDS = 5;

    /**
     * Stores when this scanner last genuinely ran — see due_to_run()'s
     * own docblock (BrokenLinksScanner.php) for why this scanner
     * self-rate-limits instead of the cadence being scheduled externally.
     */
    private const LAST_RUN_OPTION = 'vulopilot_broken_images_last_checked';

    /**
     * Set via set_force_run() (SupportsForceRunInterface) — see
     * BrokenLinksScanner::$force_run's own comment.
     */
    private bool $force_run = false;

    /**
     * Real per-run coverage stats — same shape/purpose as
     * BrokenLinksScanner::STATS_OPTION, read by Controllers\BrokenLinksStats
     * for BrokenLinksTab.tsx's own "Coverage"/"Link health" tiles.
     */
    public const STATS_OPTION = 'vulopilot_broken_images_last_run_stats';

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'broken-images';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'Broken Images', 'vulopilot' );
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
    public function set_force_run( bool $force ): void {
        $this->force_run = $force;
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
        if ( empty( $settings['flag_broken_images'] ) ) {
            return array();
        }

        if ( ! $this->due_to_run( (string) ( $settings['broken_image_check_frequency'] ?? 'daily' ), $this->force_run ) ) {
            return array();
        }

        $findings      = array();
        $images        = $this->extract_images_from_recent_content();
        $healthy_count = 0;

        foreach ( $images as $url => $post_id ) {
            $result = $this->check_image( $url );

            if ( null === $result ) {
                ++$healthy_count;
                continue;
            }

            $findings[] = new Finding(
                sprintf(
                    /* translators: %s is the broken image URL. */
                    __( 'Broken image: %s', 'vulopilot' ),
                    $url
                ),
                Severity::MEDIUM,
                $this->get_category(),
                sprintf(
                    /* translators: %s is an HTTP status or error description. */
                    __( 'Request failed with: %s', 'vulopilot' ),
                    $result['detail']
                ),
                'post',
                (string) $post_id,
                array(
                    'url'    => $url,
                    // Same 'unverified' vs 'broken' distinction
                    // BrokenLinksScanner's own Finding::meta carries — see
                    // that class's check_link()/check_image() docblocks.
                    'reason' => $result['reason'],
                )
            );
        }

        update_option(
            self::STATS_OPTION,
            array(
                'pages_scanned' => count( $this->scanned_post_ids ),
                'links_checked' => count( $images ),
                'healthy_count' => $healthy_count,
                'checked_at'    => time(),
            ),
            false
        );

        return $findings;
    }

    /**
     * Pulls every http(s) `<img src>` out of the most recently published
     * content, deduped, capped at MAX_IMAGES_PER_RUN — same shape as
     * BrokenLinksScanner::extract_links_from_recent_content(), matched on
     * `<img src="...">` instead of `<a href="...">`.
     *
     * @return array<string, int> URL => the post ID it was found in.
     */
    private function extract_images_from_recent_content(): array {
        $posts = get_posts(
            array(
                'post_type'      => array( 'post', 'page' ),
                'post_status'    => 'publish',
                'posts_per_page' => self::POSTS_BATCH_SIZE,
                'orderby'        => 'modified',
                'order'          => 'DESC',
            )
        );

        $images = array();

        foreach ( $posts as $post ) {
            $this->mark_post_scanned( $post->ID );

            if ( count( $images ) >= self::MAX_IMAGES_PER_RUN ) {
                break;
            }

            if ( ! preg_match_all( '/<img\s[^>]*src=["\']([^"\']+)["\']/i', $post->post_content, $matches ) ) {
                continue;
            }

            foreach ( $matches[1] as $url ) {
                if ( count( $images ) >= self::MAX_IMAGES_PER_RUN ) {
                    break;
                }

                if ( 0 !== strpos( $url, 'http://' ) && 0 !== strpos( $url, 'https://' ) ) {
                    continue;
                }

                if ( ! isset( $images[ $url ] ) ) {
                    $images[ $url ] = $post->ID;
                }
            }
        }

        return $images;
    }

    /**
     * Same real rate-limit shape as BrokenLinksScanner::due_to_run() —
     * see that method's own docblock, including what `$force` does.
     *
     * @param string $frequency 'daily' or 'weekly'.
     * @param bool   $force     True to bypass the interval check (a manual "Run scan").
     * @return bool True if this run should actually check images.
     */
    private function due_to_run( string $frequency, bool $force = false ): bool {
        $interval_seconds = 'weekly' === $frequency ? WEEK_IN_SECONDS : DAY_IN_SECONDS;
        $last_ran         = (int) get_option( self::LAST_RUN_OPTION, 0 );

        if ( ! $force && ( time() - $last_ran ) < $interval_seconds ) {
            return false;
        }

        update_option( self::LAST_RUN_OPTION, time(), false );

        return true;
    }

    /**
     * @param string $url Image URL to check.
     * @return array{reason: string, detail: string}|null 'reason' is 'unverified' (network/timeout/DNS failure — is_wp_error()) or 'broken' (a real non-2xx/3xx HTTP response); null if the image looks fine.
     */
    private function check_image( string $url ): ?array {
        $response = wp_remote_head(
            $url,
            array(
                'timeout'     => self::REQUEST_TIMEOUT_SECONDS,
                'redirection' => 5,
                'sslverify'   => false,
            )
        );

        if ( is_wp_error( $response ) ) {
            return array(
                'reason' => 'unverified',
                'detail' => $response->get_error_message(),
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );

        if ( $status_code >= 200 && $status_code < 400 ) {
            return null;
        }

        return array(
            'reason' => 'broken',
            'detail' => sprintf( 'HTTP %d', $status_code ),
        );
    }
}
