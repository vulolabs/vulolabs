<?php
namespace VuloPilot\SeoVisibility;

use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Scanning → SEO's "Add Open Graph & Twitter Card tags" toggle.
 *
 * @class       SocialMetaTagsManager class
 * @version     1.0.0
 * @author      VuloLabs
 */
class SocialMetaTagsManager {

	/**
	 * SocialMetaTagsManager constructor.
	 */
	public function __construct() {
		add_action( 'wp_head', array( $this, 'maybe_output_tags' ), 5 );
	}

	/**
	 * Outputs Open Graph/Twitter Card tags on wp_head, if enabled or overridden for this post.
	 *
	 * @return void
	 */
	public function maybe_output_tags(): void {
		$settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );
		$post_id  = is_singular() ? get_queried_object_id() : 0;

		// A per-post override from the post-editor metabox's Social tab is a deliberate, explicit
		// action for THAT post.
		if ( empty( $settings['social_meta_tags_enabled'] ) && ! ( $post_id && $this->has_post_override( $post_id ) ) ) {
			return;
		}

		$tags = $this->build_tags();

		if ( ! $tags ) {
			return;
		}

		if ( '' !== (string) ( $settings['facebook_app_id'] ?? '' ) ) {
			$tags['fb:app_id'] = (string) $settings['facebook_app_id'];
		}

		if ( '' !== (string) ( $settings['facebook_admin_id'] ?? '' ) ) {
			$tags['fb:admin_id'] = (string) $settings['facebook_admin_id'];
		}

		foreach ( $tags as $property => $content ) {
			if ( '' === $content ) {
				continue;
			}

			$attribute = ( 0 === strpos( $property, 'twitter:' ) ) ? 'name' : 'property';

			echo '<meta ' . esc_attr( $attribute ) . '="' . esc_attr( $property ) . '" content="' . esc_attr( $content ) . '" />' . "\n";
		}
	}

	/**
	 * Checks whether the post-editor metabox's Social tab has any override set for this post.
	 *
	 * @param int $post_id Post id.
	 * @return bool
	 */
	private function has_post_override( int $post_id ): bool {
		return (bool) get_post_meta( $post_id, PostSeoMetaFields::META_KEYS['social_title'], true )
			|| (bool) get_post_meta( $post_id, PostSeoMetaFields::META_KEYS['social_description'], true )
			|| (bool) get_post_meta( $post_id, PostSeoMetaFields::META_KEYS['social_image_id'], true );
	}

	/**
	 * Builds the property/name => content map to output, or null off singular/home.
	 *
	 * @return array<string, string>|null
	 */
	private function build_tags(): ?array {
		$settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

		if ( is_singular() ) {
			$post_id           = get_queried_object_id();
			$override_image_id = absint( get_post_meta( $post_id, PostSeoMetaFields::META_KEYS['social_image_id'], true ) );
			$override_title    = get_post_meta( $post_id, PostSeoMetaFields::META_KEYS['social_title'], true );
			$override_excerpt  = get_post_meta( $post_id, PostSeoMetaFields::META_KEYS['social_description'], true );

			$title   = '' !== $override_title ? $override_title : get_the_title( $post_id );
			$excerpt = '' !== $override_excerpt ? $override_excerpt : get_the_excerpt( $post_id );
			$image   = $override_image_id ? wp_get_attachment_image_url( $override_image_id, 'large' ) : get_the_post_thumbnail_url( $post_id, 'large' );
		} elseif ( is_front_page() || is_home() ) {
			$title   = get_bloginfo( 'name' );
			$excerpt = get_bloginfo( 'description' );
			$image   = get_site_icon_url( 512 );
		} else {
			return null; // Archives/search/404 - same scope CanonicalUrlManager limits itself to.
		}

		if ( ! $image ) {
			$default_image_id = absint( $settings['social_default_image_id'] ?? 0 );
			$image            = $default_image_id ? wp_get_attachment_image_url( $default_image_id, 'large' ) : '';
		}

		$card_type = $image ? (string) ( $settings['social_twitter_card_type'] ?? 'summary_large_image' ) : 'summary';

		$tags = array(
			'og:title'            => $title,
			'og:description'      => $excerpt,
			'twitter:card'        => $card_type,
			'twitter:title'       => $title,
			'twitter:description' => $excerpt,
		);

		if ( $image ) {
			$tags['og:image']      = $image;
			$tags['twitter:image'] = $image;
		}

		return $tags;
	}
}
