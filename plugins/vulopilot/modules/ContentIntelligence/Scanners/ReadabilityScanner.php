<?php
/**
 * ReadabilityScanner class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\ContentIntelligence\Scanners;

use VuloPilot\Contracts\Scanner\TracksScannedObjectsInterface;
use VuloPilot\ValueObjects\Finding;
use VuloPilot\ValueObjects\Severity;
use VuloPilot\Scanners\Basic\AbstractBasicScanner;
use VuloPilot\Scanners\Basic\ScannedPostsTrait;

defined( 'ABSPATH' ) || exit;

/**
 * Content Intelligence's own deterministic readability check — the one
 * genuinely new scanner this module adds (Thin Content/Duplicate Content/
 * Heading Structure/Internal Linking already exist as `seo`-category
 * scanners and aren't duplicated here; see CONTENT-INTELLIGENCE-MODULE.md's
 * audit). Category `content` — a new category, not `seo`, the same
 * "related but distinct pillar gets its own category" precedent GEO
 * already set alongside SEO.
 *
 * Real Flesch Reading Ease score (a standard, decades-old, publicly
 * documented formula — not an invented metric): `206.835 - 1.015 *
 * (words/sentences) - 84.6 * (syllables/words)`. Syllable counting is a
 * standard vowel-group heuristic (count vowel-group transitions, drop a
 * trailing silent "e"), not a claim of dictionary-perfect accuracy — the
 * same "real, bounded, deterministic proxy, not scientific precision"
 * posture ThinContentScanner's own docblock already takes for word count.
 *
 * @class       ReadabilityScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class ReadabilityScanner extends AbstractBasicScanner implements TracksScannedObjectsInterface {

    use ScannedPostsTrait;

    private const BATCH_SIZE = 50;

    /**
     * A post under this many words is already flagged by ThinContentScanner
     * for a different reason (not enough substance) — a short excerpt's
     * Flesch score is statistically unstable (one long sentence can swing
     * it wildly), so this scanner skips it rather than double-flagging
     * with a noisy number.
     */
    private const MIN_WORDS_TO_SCORE = 100;

    /**
     * Fallback only — the real threshold is Scanning → SEO & Content's
     * flat `content_readability_min_score` setting (see that key's own
     * docblock in Utill::VULOPILOT_SETTINGS_DEFAULTS).
     */
    private const DEFAULT_MIN_SCORE = 50;

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'readability';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'Readability', 'vulopilot' );
    }

    /**
     * @inheritDoc
     */
    public function get_category(): string {
        return 'content';
    }

    /**
     * @inheritDoc
     */
    public function scan(): array {
        $settings = wp_parse_args( get_option( \VuloPilot\Utill::VULOPILOT_SETTINGS_KEY, array() ), \VuloPilot\Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['content_search_scans']['readability']['enable'] ) ) {
            return array();
        }

        $min_score = is_numeric( $settings['content_readability_min_score'] ?? null )
            ? (int) $settings['content_readability_min_score']
            : self::DEFAULT_MIN_SCORE;

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

            $plain_text = wp_strip_all_tags( $post->post_content );
            $word_count = str_word_count( $plain_text );

            if ( $word_count < self::MIN_WORDS_TO_SCORE ) {
                continue;
            }

            $score = $this->calculate_flesch_reading_ease( $plain_text );

            if ( $score >= $min_score ) {
                continue;
            }

            $findings[] = new Finding(
                sprintf(
                    /* translators: 1: post/page title, 2: Flesch Reading Ease score (0-100). */
                    __( 'Difficult to read (score %2$d/100): %1$s', 'vulopilot' ),
                    get_the_title( $post ),
                    $score
                ),
                Severity::LOW,
                $this->get_category(),
                __( 'Shorter sentences and simpler words generally read easier for both visitors and AI systems summarizing this content.', 'vulopilot' ),
                'post',
                (string) $post->ID,
                array( 'readability_score' => $score ),
                'readability-score'
            );
        }

        return $findings;
    }

    /**
     * Standard Flesch Reading Ease formula. 0-100, higher is easier to
     * read (90-100 "Very Easy" through 0-30 "Very Confusing", per the
     * formula's own original published scale) — clamped to that range
     * since the raw formula can mathematically exceed it on extreme input.
     *
     * @param string $plain_text Already-stripped-of-HTML content.
     * @return int 0-100.
     */
    public function calculate_flesch_reading_ease( string $plain_text ): int {
        $word_count     = str_word_count( $plain_text );
        $sentence_count = max( 1, preg_match_all( '/[.!?]+/', $plain_text ) );
        $syllable_count = $this->count_syllables( $plain_text );

        if ( 0 === $word_count ) {
            return 100;
        }

        $words_per_sentence = $word_count / $sentence_count;
        $syllables_per_word = $syllable_count / $word_count;

        $score = 206.835 - ( 1.015 * $words_per_sentence ) - ( 84.6 * $syllables_per_word );

        return (int) round( max( 0, min( 100, $score ) ) );
    }

    /**
     * Standard vowel-group heuristic: count transitions into a vowel
     * group (a run of a/e/i/o/u/y not preceded by another vowel), drop a
     * trailing silent "e", and floor every word at 1 syllable — the same
     * approximation most plain-text readability tools use when a real
     * pronunciation dictionary isn't available.
     *
     * @param string $plain_text Already-stripped-of-HTML content.
     * @return int
     */
    private function count_syllables( string $plain_text ): int {
        $words = preg_split( '/\s+/', strtolower( trim( $plain_text ) ), -1, PREG_SPLIT_NO_EMPTY );
        $total = 0;

        foreach ( $words as $word ) {
            $word = preg_replace( '/[^a-z]/', '', $word );

            if ( '' === $word ) {
                continue;
            }

            // Drop a trailing silent "e" (e.g. "make" -> "mak") since it
            // doesn't form its own syllable — except a "-le" ending (e.g.
            // "apple", "table"), where the e-sound genuinely is one.
            if ( strlen( $word ) > 1 && 'e' === substr( $word, -1 ) && 'le' !== substr( $word, -2 ) ) {
                $word = substr( $word, 0, -1 );
            }

            $syllable_count = preg_match_all( '/[aeiouy]+/', $word );
            $total         += max( 1, $syllable_count );
        }

        return $total;
    }
}
