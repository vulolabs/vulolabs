<?php
/**
 * Server-side render for the `vulopilot/faq` block.
 *
 * Deliberately declaration-free - see table-of-contents/render.php's own
 * comment for why. All real logic (including the real FAQPage JSON-LD)
 * lives in VuloPilot\Content\FaqRenderer.
 *
 * @package VuloPilot
 * @var array $attributes Real block attributes.
 */

defined( 'ABSPATH' ) || exit;

echo wp_kses_post( \VuloPilot\Content\FaqRenderer::render( $attributes ) );
\VuloPilot\Content\FaqRenderer::print_schema( $attributes );
