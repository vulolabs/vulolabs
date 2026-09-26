<?php
/**
 * Server-side render for the `vulopilot/table-of-contents` block.
 *
 * Deliberately declaration-free - WP loads this file via `require`, not
 * `require_once`, so a top-level function/class here would fatal the
 * moment this block appears twice on one page. All real logic lives in
 * VuloPilot\Content\TableOfContentsRenderer.
 *
 * @package VuloPilot
 * @var array $attributes Real block attributes.
 */

defined( 'ABSPATH' ) || exit;

echo wp_kses_post( \VuloPilot\Content\TableOfContentsRenderer::render( $attributes, get_the_ID() ) );
