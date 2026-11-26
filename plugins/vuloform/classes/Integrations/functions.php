<?php
/**
 * VuloForm public API.
 *
 * These functions and the hooks listed in docs/developer/DEVELOPER-API.md are the supported way for
 * other code to work with VuloForm. Guard calls with `function_exists( 'vuloform_render' )`.
 *
 * @package VuloForm
 */

defined( 'ABSPATH' ) || exit;

if ( ! function_exists( 'vuloform_render' ) ) {
	/**
	 * Returns a form's HTML and loads its assets, like the `[vuloform]` shortcode.
	 *
	 * @since 1.0.0
	 *
	 * @param int $form_id Form id.
	 * @return string
	 */
	function vuloform_render( $form_id ) {
		return isset( VuloForm()->frontend ) ? VuloForm()->frontend->render( (int) $form_id ) : '';
	}
}

if ( ! function_exists( 'vuloform_get_form' ) ) {
	/**
	 * Returns a form: id, title, status, schema.
	 *
	 * @since 1.0.0
	 *
	 * @param int $form_id Form id.
	 * @return array|null
	 */
	function vuloform_get_form( $form_id ) {
		return VuloForm()->forms->get( (int) $form_id );
	}
}

if ( ! function_exists( 'vuloform_get_submission' ) ) {
	/**
	 * Returns a submission: id, form_id, status, data (field key => value), meta, created_at.
	 * Callers are responsible for checking that the current user may see it.
	 *
	 * @since 1.0.0
	 *
	 * @param int $submission_id Submission id.
	 * @return array|null
	 */
	function vuloform_get_submission( $submission_id ) {
		return VuloForm()->submissions->get( (int) $submission_id );
	}
}

if ( ! function_exists( 'vuloform_preview_available' ) ) {
	/**
	 * Whether a consumer's own admin preview of a VuloForm-built form can render right now --
	 * true once `vuloform_render()`/`vuloform_get_form()` are safe to call. Combine with your own
	 * `class_exists( '\VuloForm\VuloForm' )` check (VuloForm's classes only autoload while active)
	 * to tell "not installed" apart from "installed but this old a version".
	 *
	 * @since 1.0.1
	 *
	 * @return bool
	 */
	function vuloform_preview_available() {
		return function_exists( 'vuloform_render' ) && function_exists( 'vuloform_get_form' );
	}
}

if ( ! function_exists( 'vuloform_get_preview_fields' ) ) {
	/**
	 * The fields every consumer's own "preview this form, edit it in VuloForm" admin panel needs
	 * once a form id has been resolved: the rendered HTML, its edit-screen URL, and its stylesheet
	 * URL. Consumers (CatalogX, Notifima, ...) each still resolve/create their own default form id
	 * and build their own REST route -- this is only the part that's identical once a form id is
	 * in hand, so it isn't duplicated per consumer.
	 *
	 * @since 1.0.1
	 *
	 * @param int $form_id Form id, already confirmed to exist via `vuloform_get_form()`.
	 * @return array{edit_url: string, style_url: string, html: string}
	 */
	function vuloform_get_preview_fields( $form_id ) {
		$form_id = (int) $form_id;

		return array(
			'edit_url'  => admin_url( 'admin.php?page=vuloform#&tab=forms&form=' . $form_id ),
			'style_url' => VuloForm()->plugin_url . 'assets/styles/public/vuloform-form.min.css',
			'html'      => vuloform_render( $form_id ),
		);
	}
}
