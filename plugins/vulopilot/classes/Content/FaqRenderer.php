<?php
namespace VuloPilot\Content;

defined( 'ABSPATH' ) || exit;

/**
 * Real render logic for the `vulopilot/faq` block
 * (`src/blocks/faq/render.php` calls straight into this - see
 * TableOfContentsRenderer's own docblock for why render.php itself must
 * stay declaration-free).
 *
 * Builds real FAQPage JSON-LD directly from this block instance's own
 * saved `questions` attribute - deliberately independent of
 * Services\SchemaJsonLdRenderer's `_vulopilot_schema_json` postmeta (that
 * mechanism is one generic schema blob per POST; a post can have zero, one,
 * or several FAQ blocks, so a per-post postmeta key is the wrong shape
 * entirely - this schema is scoped to, and printed at, this one block
 * instance).
 *
 * @class       FaqRenderer class
 * @version     1.0.0
 * @author      VuloLabs
 */
class FaqRenderer {

    /**
     * @param array<string, mixed> $attributes Real block attributes - `questions: array<{question,answer}>`.
     * @return string Visible HTML (<details> UI, safe to pass through `wp_kses_post()`), or '' if every row was blank. The FAQPage JSON-LD is printed separately by print_schema().
     */
    public static function render( array $attributes ): string {
        $questions = self::sanitize_questions( $attributes['questions'] ?? array() );

        if ( empty( $questions ) ) {
            return '';
        }

        $wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'vulopilot-faq' ) );
        $html               = '<div ' . $wrapper_attributes . '>';

        foreach ( $questions as $item ) {
            $html .= sprintf(
                '<details class="vulopilot-faq__item"><summary class="vulopilot-faq__question">%1$s</summary><div class="vulopilot-faq__answer">%2$s</div></details>',
                wp_kses_post( $item['question'] ),
                wp_kses_post( $item['answer'] )
            );
        }

        $html .= '</div>';

        return $html;
    }

    /**
     * Prints the FAQPage JSON-LD for the same rows render() shows - nothing when
     * every row was blank.
     *
     * @param array<string, mixed> $attributes Real block attributes - `questions: array<{question,answer}>`.
     * @return void
     */
    public static function print_schema( array $attributes ): void {
        $questions = self::sanitize_questions( $attributes['questions'] ?? array() );

        if ( ! empty( $questions ) ) {
            self::print_schema_tag( $questions );
        }
    }

    /**
     * Never lets a blank question/answer row reach EITHER the visible
     * markup or the JSON-LD - one guard, applied upstream of both, rather
     * than two separate checks that could drift apart.
     *
     * @param mixed $raw The block's own `questions` attribute value.
     * @return array<int, array{question: string, answer: string}>
     */
    private static function sanitize_questions( $raw ): array {
        if ( ! is_array( $raw ) ) {
            return array();
        }

        $clean = array();

        foreach ( $raw as $row ) {
            if ( ! is_array( $row ) ) {
                continue;
            }

            $question = isset( $row['question'] ) ? trim( wp_kses_post( (string) $row['question'] ) ) : '';
            $answer   = isset( $row['answer'] ) ? trim( wp_kses_post( (string) $row['answer'] ) ) : '';

            if ( '' === wp_strip_all_tags( $question ) || '' === wp_strip_all_tags( $answer ) ) {
                continue;
            }

            $clean[] = array(
                'question' => $question,
                'answer'   => $answer,
            );
        }

        return $clean;
    }

    /**
     * @param array<int, array{question: string, answer: string}> $questions Already sanitized, never empty.
     * @return void
     */
    private static function print_schema_tag( array $questions ): void {
        $entities = array();

        foreach ( $questions as $item ) {
            $entities[] = array(
                '@type'          => 'Question',
                'name'           => wp_strip_all_tags( $item['question'] ),
                'acceptedAnswer' => array(
                    '@type' => 'Answer',
                    'text'  => wp_strip_all_tags( $item['answer'] ),
                ),
            );
        }

        $schema = array(
            '@context'   => 'https://schema.org',
            '@type'      => 'FAQPage',
            'mainEntity' => $entities,
        );

        wp_print_inline_script_tag( (string) wp_json_encode( $schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ), array( 'type' => 'application/ld+json' ) );
    }
}
