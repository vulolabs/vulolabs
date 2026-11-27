<?php
/**
 * Renderer class file.
 *
 * @package VuloForm
 */

namespace VuloForm\Frontend;

use VuloForm\Fields\CountryCodes;
use VuloForm\Fields\Registry;
use VuloForm\Forms\DynamicValues;
use VuloForm\Security\Recaptcha;
use VuloForm\Security\Spam;
use VuloForm\Security\Token;
use VuloForm\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Turns a form's schema into accessible HTML.
 *
 * The markup works on its own: without JavaScript every page of a multi-step form is shown and the
 * form posts to admin-post.php. public/js/form.js then layers on live validation, conditional
 * fields, steps and submitting without a reload.
 */
class Renderer {

	/**
	 * Forms rendered so far in this request, so each instance gets unique element ids.
	 *
	 * @var int
	 */
	private static $instances = 0;

	/**
	 * @param array $form Form (id, title, status, schema).
	 * @param array $args {
	 *     Optional.
	 *
	 *     @type array  $values  Field key => value to prefill (a failed no-JavaScript submission).
	 *     @type array  $errors  Field id => error message.
	 *     @type string $message Message to show above the form.
	 *     @type bool   $success Whether $message reports success.
	 *     @type bool   $preview Render a draft for the builder's preview; it can't be submitted.
	 * }
	 * @return string HTML.
	 */
	public static function render( array $form, array $args = array() ) {
		$args = array_merge(
			array(
				'values'  => array(),
				'errors'  => array(),
				'message' => '',
				'success' => false,
				'preview' => false,
			),
			$args
		);

		if ( 'published' !== $form['status'] && ! $args['preview'] ) {
			// Editors see why nothing shows; visitors see nothing.
			return current_user_can( 'edit_posts' )
				? '<p class="vuloform-notice">' . esc_html__( 'This form is a draft. Publish it in VuloForm to show it here.', 'vuloform' ) . '</p>'
				: '';
		}

		++self::$instances;

		$settings = $form['schema']['settings'];
		$style    = $settings['style'];
		$uid      = 'vuloform-' . (int) $form['id'] . '-' . self::$instances;
		$pages    = self::pages( $form['schema']['fields'] );
		$has_file = array_intersect( array( 'file', 'signature' ), array_column( $form['schema']['fields'], 'type' ) );

		$classes = array_filter(
			array(
				'vuloform-wrap',
				'vuloform--labels-' . $style['label_position'],
				'vuloform--spacing-' . $style['spacing'],
				'vuloform--button-' . $style['button_align'],
				$style['css_class'],
			)
		);

		$vars = array_filter(
			array(
				'--vf-accent'    => $style['accent_color'],
				'--vf-text'      => $style['text_color'],
				'--vf-font-size' => ! empty( $style['font_size'] ) ? $style['font_size'] . 'px' : '',
				'--vf-radius'    => ! empty( $style['radius'] ) ? $style['radius'] . 'px' : '',
			)
		);

		$inline = '';

		foreach ( $vars as $name => $value ) {
			$inline .= $name . ':' . $value . ';';
		}

		// A successful no-JavaScript submission shows the confirmation instead of the form.
		if ( $args['success'] ) {
			return sprintf(
				'<div class="%s" style="%s"><div class="vuloform-message vuloform-message--success" role="status">%s</div></div>',
				esc_attr( implode( ' ', $classes ) ),
				esc_attr( $inline ),
				wp_kses_post( $args['message'] )
			);
		}

		$html  = sprintf( '<div class="%s" id="%s" style="%s">', esc_attr( implode( ' ', $classes ) ), esc_attr( $uid ), esc_attr( $inline ) );
		$html .= sprintf(
			'<form class="vuloform" method="post" action="%s"%s novalidate data-vuloform="%s">',
			esc_url( admin_url( 'admin-post.php' ) ),
			$has_file ? ' enctype="multipart/form-data"' : '',
			esc_attr( wp_json_encode( self::client_config( $form, $args['preview'] ) ) )
		);

		if ( count( $pages ) > 1 && 'none' !== $settings['progress'] ) {
			$html .= self::progress( count( $pages ), $settings['progress'] );
		}

		$html .= sprintf(
			'<div class="vuloform-message%s" role="alert" aria-live="assertive"%s>%s</div>',
			! empty( $args['message'] ) ? ' vuloform-message--error' : '',
			! empty( $args['message'] ) ? '' : ' hidden',
			esc_html( $args['message'] )
		);

		foreach ( $pages as $index => $fields ) {
			$html .= sprintf( '<div class="vuloform-page" data-page="%d"><div class="vuloform-fields">', $index + 1 );

			foreach ( $fields as $field ) {
				$field_html = self::field( $field, $uid, $args['values'][ $field['key'] ] ?? null, $args['errors'][ $field['id'] ] ?? '' );

				/**
				 * Filters one field's HTML.
				 *
				 * @param string $field_html Field HTML.
				 * @param array  $field      Field definition.
				 * @param array  $form       Form.
				 */
				$html .= apply_filters( 'vuloform_render_field', $field_html, $field, $form );
			}

			$html .= '</div></div>';
		}

		if ( ! empty( Utill::settings()['honeypot'] ) ) {
			// Hidden from people (and from screen readers and tab order), irresistible to bots.
			$html .= sprintf(
				'<div class="vuloform-hp" aria-hidden="true"><label for="%1$s-hp">%2$s</label><input type="text" id="%1$s-hp" name="%3$s" value="" tabindex="-1" autocomplete="off"></div>',
				esc_attr( $uid ),
				esc_html__( 'Leave this field empty', 'vuloform' ),
				esc_attr( Spam::HONEYPOT )
			);
		}

		if ( ! $args['preview'] && Recaptcha::is_active( $form ) ) {
			// form.js fills these in; without JavaScript the visitor is told reCAPTCHA can't run.
			$html .= sprintf(
				'<div class="vuloform-recaptcha"><input type="hidden" name="%s" value=""><noscript><p>%s</p></noscript></div>',
				esc_attr( Recaptcha::FIELD ),
				esc_html__( 'This form is protected by Google reCAPTCHA, which needs JavaScript. Please switch JavaScript on to send it.', 'vuloform' )
			);
		}

		$html .= '<input type="hidden" name="action" value="vuloform_submit">';
		$html .= sprintf( '<input type="hidden" name="vf_form_id" value="%d">', (int) $form['id'] );
		$html .= sprintf( '<input type="hidden" name="vf_token" value="%s">', esc_attr( $args['preview'] ? '' : Token::issue( $form['id'] ) ) );
		$html .= '<input type="hidden" name="vf_page" value="">';

		$html .= '<div class="vuloform-actions">';
		$html .= sprintf( '<button type="button" class="vuloform-button vuloform-button--secondary vuloform-prev" hidden>%s</button>', esc_html( $settings['previous_label'] ) );
		$html .= sprintf( '<button type="button" class="vuloform-button vuloform-next" hidden>%s</button>', esc_html( $settings['next_label'] ) );
		$html .= sprintf( '<button type="submit" class="vuloform-button vuloform-submit">%s</button>', esc_html( $settings['submit_label'] ) );
		$html .= '</div></form></div>';

		return $html;
	}

	/**
	 * Splits the fields into pages at each page break.
	 *
	 * @param array $fields Fields in order.
	 * @return array<int, array> One list of fields per page.
	 */
	public static function pages( array $fields ) {
		$pages = array( array() );

		foreach ( $fields as $field ) {
			if ( ! Registry::get( $field['type'] ) ) {
				// Belongs to an extension that is not active.
				continue;
			}

			if ( 'page_break' === $field['type'] ) {
				$pages[] = array();
			} else {
				$pages[ count( $pages ) - 1 ][] = $field;
			}
		}

		// A break at the very start or two in a row would leave an empty page.
		$filtered = array_values( array_filter( $pages ) );

		return $filtered ? $filtered : array( array() );
	}

	/**
	 * What the browser script needs to know about the form. Notifications, webhooks and anything
	 * else private stay on the server.
	 *
	 * @param array $form    Form.
	 * @param bool  $preview Whether this is the builder's preview.
	 * @return array
	 */
	public static function client_config( array $form, $preview = false ) {
		$fields = array();
		$keep   = array( 'id', 'key', 'type', 'required', 'conditions', 'formula', 'decimals', 'prefix', 'min', 'max', 'minlength', 'maxlength', 'max_size_mb', 'max_files', 'allowed_types' );

		$dynamic = array();

		foreach ( $form['schema']['fields'] as $field ) {
			if ( Registry::is_input( $field['type'] ) ) {
				$fields[] = array_intersect_key( $field, array_flip( $keep ) );

				// Address/page-dependent defaults are re-resolved in the browser, not here.
				$template = DynamicValues::browser_template( $field['default'] ?? '' );

				if ( ! empty( $template ) ) {
					$dynamic[ $field['key'] ] = $template;
				}
			}
		}

		$settings = $form['schema']['settings'];

		return array(
			'id'        => (int) $form['id'],
			'preview'   => (bool) $preview,
			// Present only for a form that uses reCAPTCHA; nothing is loaded from Google otherwise.
			'recaptcha' => ! $preview && Recaptcha::is_active( $form ) ? Recaptcha::client_config() : null,
			'endpoint'  => esc_url_raw( rest_url( 'vuloform/v1/public/forms/' . (int) $form['id'] . '/submit' ) ),
			'token'     => esc_url_raw( rest_url( 'vuloform/v1/public/forms/' . (int) $form['id'] . '/token' ) ),
			'restNonce' => ! $preview && is_user_logged_in() ? wp_create_nonce( 'wp_rest' ) : null,
			'progress'  => $settings['progress'],
			'dynamic'   => $dynamic,
			'messages'  => array_merge(
				$settings['messages'],
				array(
					'email'          => __( 'Enter a valid email address.', 'vuloform' ),
					'url'            => __( 'Enter a valid web address, starting with https://.', 'vuloform' ),
					'number'         => __( 'Enter a number.', 'vuloform' ),
					'file'           => __( 'That file is too large or not an allowed type.', 'vuloform' ),
					'signatureClear' => __( 'Clear', 'vuloform' ),
					'network'        => __( 'Something went wrong. Please check your connection and try again.', 'vuloform' ),
					'sending'        => __( 'Sending…', 'vuloform' ),
					'preview'        => __( 'This is a preview. Nothing was sent.', 'vuloform' ),
					/* translators: 1: current step, 2: number of steps. */
					'step'           => __( 'Step %1$s of %2$s', 'vuloform' ),
				)
			),
			'fields'    => $fields,
		);
	}

	/**
	 * @param int    $count Number of pages.
	 * @param string $type  steps or bar.
	 * @return string
	 */
	private static function progress( $count, $type ) {
		/* translators: 1: current step, 2: number of steps. */
		$label = sprintf( __( 'Step %1$s of %2$s', 'vuloform' ), 1, $count );
		$html  = sprintf( '<div class="vuloform-progress vuloform-progress--%s" hidden><p class="vuloform-progress-label" aria-live="polite">%s</p>', esc_attr( $type ), esc_html( $label ) );

		if ( 'bar' === $type ) {
			$html .= sprintf( '<div class="vuloform-progress-bar" role="progressbar" aria-valuemin="1" aria-valuemax="%d" aria-valuenow="1"><span></span></div>', (int) $count );
		} else {
			$html .= '<ol class="vuloform-progress-steps" aria-hidden="true">' . str_repeat( '<li></li>', (int) $count ) . '</ol>';
		}

		return $html . '</div>';
	}

	/**
	 * @param array       $field Field definition.
	 * @param string      $uid   Form instance id.
	 * @param mixed       $value Value to prefill, or null for the field's default.
	 * @param string      $error Error to show.
	 * @param string|null $name  Override for the submitted name, used for a repeater row's own fields.
	 * @param string|null $id    Override for the element id, for the same reason.
	 * @return string
	 */
	private static function field( array $field, $uid, $value, $error, $name = null, $id = null ) {
		$type = $field['type'];
		$id   = $id ?? ( $uid . '-' . $field['id'] );
		$name = $name ?? ( 'vf[' . $field['key'] . ']' );

		if ( 'hidden' === $type ) {
			return sprintf( '<input type="hidden" name="%s" value="%s">', esc_attr( $name ), esc_attr( DynamicValues::resolve( $field['default'] ) ) );
		}

		$classes = array_filter(
			array(
				'vuloform-field',
				'vuloform-field--' . $type,
				'vuloform-w-' . (int) $field['width'],
				! empty( $error ) ? 'vuloform-field--invalid' : '',
				$field['css_class'],
			)
		);

		$open = sprintf( '<div class="%s" data-field="%s" data-key="%s">', esc_attr( implode( ' ', $classes ) ), esc_attr( $field['id'] ), esc_attr( $field['key'] ) );

		switch ( $type ) {
			case 'heading':
				return $open . sprintf( '<h%1$d class="vuloform-heading">%2$s</h%1$d>', (int) $field['level'], esc_html( $field['label'] ) ) . self::description( $field, $id ) . '</div>';

			case 'html':
				return $open . '<div class="vuloform-html">' . wp_kses_post( $field['content'] ) . '</div></div>';

			case 'divider':
				return $open . '<hr class="vuloform-divider"></div>';
		}

		$value    = null === $value ? DynamicValues::resolve( $field['default'] ?? '' ) : $value;
		$required = ! empty( $field['required'] );
		$describe = trim( ( ! empty( $field['description'] ) ? $id . '-desc ' : '' ) . $id . '-error' );
		$common   = sprintf( ' aria-describedby="%s"%s%s', esc_attr( $describe ), $required ? ' aria-required="true" required' : '', ! empty( $error ) ? ' aria-invalid="true"' : '' );
		$star     = $required ? ' <span class="vuloform-required" aria-hidden="true">*</span>' : '';
		$hide     = ! empty( $field['hide_label'] ) ? ' vuloform-sr-only' : '';
		$label    = sprintf( '<label class="vuloform-label%s" for="%s">%s%s</label>', $hide, esc_attr( $id ), esc_html( $field['label'] ), $star );
		$legend   = sprintf( '<legend class="vuloform-label%s">%s%s</legend>', $hide, esc_html( $field['label'] ), $star );
		$control  = '';
		$grouped  = false;

		switch ( $type ) {
			case 'textarea':
				$control = sprintf(
					'<textarea class="vuloform-input" id="%s" name="%s" rows="5" placeholder="%s"%s%s>%s</textarea>',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( $field['placeholder'] ),
					$field['maxlength'] > 0 ? ' maxlength="' . (int) $field['maxlength'] . '"' : '',
					$common,
					esc_textarea( (string) $value )
				);
				break;

			case 'select':
				$control = sprintf( '<select class="vuloform-input" id="%s" name="%s"%s>', esc_attr( $id ), esc_attr( $name ), $common );
				/* translators: Placeholder option of a dropdown field. */
				$control .= sprintf( '<option value="">%s</option>', esc_html( ! empty( $field['placeholder'] ) ? $field['placeholder'] : __( 'Select…', 'vuloform' ) ) );

				foreach ( $field['options'] as $option ) {
					$control .= sprintf( '<option value="%s"%s>%s</option>', esc_attr( $option['value'] ), selected( (string) $value, $option['value'], false ), esc_html( $option['label'] ) );
				}

				$control .= '</select>';
				break;

			case 'radio':
			case 'checkboxes':
				$grouped = true;
				$chosen  = is_array( $value ) ? $value : array( (string) $value );

				foreach ( $field['options'] as $index => $option ) {
					$control .= sprintf(
						'<label class="vuloform-choice"><input type="%s" name="%s" value="%s"%s%s> <span>%s</span></label>',
						'radio' === $type ? 'radio' : 'checkbox',
						esc_attr( 'radio' === $type ? $name : $name . '[]' ),
						esc_attr( $option['value'] ),
						in_array( $option['value'], $chosen, true ) ? ' checked' : '',
						// One "required" on a checkbox group would demand every box; the script and the server enforce "at least one".
						'radio' === $type && $required && 0 === $index ? ' required' : '',
						esc_html( $option['label'] )
					);
				}
				break;

			case 'consent':
				$text    = ! empty( $field['consent_text'] ) ? wp_kses_post( $field['consent_text'] ) : esc_html( $field['label'] );
				$control = sprintf(
					'<label class="vuloform-choice"><input type="checkbox" id="%s" name="%s" value="1"%s%s> <span>%s%s</span></label>',
					esc_attr( $id ),
					esc_attr( $name ),
					checked( '1', (string) $value, false ),
					$common,
					$text,
					$star
				);
				$label   = '';
				break;

			case 'name':
			case 'address':
				$grouped = true;
				$labels  = Registry::part_labels( $type );
				$tokens  = array(
					'first'   => 'given-name',
					'last'    => 'family-name',
					'line1'   => 'address-line1',
					'line2'   => 'address-line2',
					'city'    => 'address-level2',
					'state'   => 'address-level1',
					'zip'     => 'postal-code',
					'country' => 'country-name',
				);

				$control .= '<div class="vuloform-parts">';

				foreach ( $field['parts'] as $part ) {
					$control .= sprintf(
						'<div class="vuloform-part vuloform-part--%1$s"><label class="vuloform-sublabel" for="%2$s-%1$s">%3$s</label><input class="vuloform-input" type="text" id="%2$s-%1$s" name="%4$s[%1$s]" value="%5$s" autocomplete="%6$s"></div>',
						esc_attr( $part ),
						esc_attr( $id ),
						esc_html( $labels[ $part ] ),
						esc_attr( $name ),
						esc_attr( is_array( $value ) ? (string) ( $value[ $part ] ?? '' ) : '' ),
						esc_attr( $tokens[ $part ] )
					);
				}

				$control .= '</div>';
				break;

			case 'file':
				$accept = array();

				foreach ( $field['allowed_types'] as $extension ) {
					$accept[] = '.' . $extension;
				}

				$control = sprintf(
					'<input class="vuloform-input vuloform-input--file" type="file" id="%s" name="%s"%s accept="%s"%s>',
					esc_attr( $id ),
					esc_attr( 'vf_file_' . $field['key'] . '[]' ),
					$field['max_files'] > 1 ? ' multiple' : '',
					esc_attr( implode( ',', $accept ) ),
					$common
				);

				$field['description'] = trim(
					$field['description'] . ' ' . sprintf(
						/* translators: 1: comma-separated file extensions, 2: size in megabytes. */
						__( 'Allowed: %1$s. Up to %2$d MB.', 'vuloform' ),
						implode( ', ', $field['allowed_types'] ),
						(int) $field['max_size_mb']
					)
				);
				$describe = $id . '-desc ' . $id . '-error';
				break;

			case 'calculation':
				$control = sprintf( '<output class="vuloform-calc" id="%s" aria-live="polite">%s0</output>', esc_attr( $id ), esc_html( $field['prefix'] ) );
				break;

			case 'signature':
				// No-JS fallback; form.js replaces it with a drawable pad that writes back into this input.
				$control = sprintf(
					'<input class="vuloform-input vuloform-input--signature" type="file" id="%s" name="%s" accept="image/png"%s>',
					esc_attr( $id ),
					esc_attr( 'vf_file_' . $field['key'] . '[]' ),
					$common
				);

				$field['description'] = trim( $field['description'] . ' ' . __( 'Draw your signature, or upload a PNG image of it.', 'vuloform' ) );
				$describe             = $id . '-desc ' . $id . '-error';
				break;

			case 'repeater':
				return $open . self::repeater( $field, $uid, $id, $name, is_array( $value ) ? $value : array(), $error ) . '</div>';

			case 'phone':
				if ( isset( $field['show_country_code'] ) && ! $field['show_country_code'] ) {
					$control = sprintf(
						'<input class="vuloform-input" type="tel" id="%s" name="%s" value="%s" placeholder="%s" autocomplete="tel"%s>',
						esc_attr( $id ),
						esc_attr( $name ),
						esc_attr( is_string( $value ) ? $value : '' ),
						esc_attr( $field['placeholder'] ),
						$common
					);
					break;
				}

				$grouped       = true;
				$country_value = is_array( $value ) && isset( $value['country_code'] ) ? $value['country_code'] : '';
				$phone_value = is_array( $value ) && isset( $value['phone'] ) ? $value['phone'] : ( is_string( $value ) ? $value : '' );

				$control = sprintf( '<div class="vuloform-phone"><select class="vuloform-input vuloform-phone-code" id="%s-code" name="%s[country_code]" aria-label="%s">', esc_attr( $id ), esc_attr( $name ), esc_attr__( 'Country code', 'vuloform' ) );
				$control .= sprintf( '<option value="">%s</option>', esc_html__( 'Code', 'vuloform' ) );

				foreach ( CountryCodes::all() as $country ) {
					$control .= sprintf(
						'<option value="%1$s"%2$s>%1$s %3$s</option>',
						esc_attr( $country['dial_code'] ),
						selected( $country_value, $country['dial_code'], false ),
						esc_html( $country['name'] )
					);
				}

				$control .= '</select>';
				$control .= sprintf(
					'<input class="vuloform-input vuloform-phone-number" type="tel" id="%s" name="%s[phone]" value="%s" placeholder="%s" autocomplete="tel"%s>',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( $phone_value ),
					esc_attr( $field['placeholder'] ),
					$common
				);
				$control .= '</div>';
				break;

			default:
				$types = array(
					'email'    => 'email',
					'number'   => 'number',
					'url'      => 'url',
					'date'     => 'date',
					'time'     => 'time',
					'password' => 'password',
				);
				$extra = '';

				if ( 'number' === $type ) {
					foreach ( array( 'min', 'max', 'step' ) as $attribute ) {
						$extra .= ! empty( $field[ $attribute ] ) ? sprintf( ' %s="%s"', $attribute, esc_attr( $field[ $attribute ] ) ) : '';
					}
				}

				if ( in_array( $type, array( 'text', 'password' ), true ) && $field['maxlength'] > 0 ) {
					$extra .= ' maxlength="' . (int) $field['maxlength'] . '"';
				}

				$autocomplete = array(
					'email'    => 'email',
					'url'      => 'url',
					'password' => 'new-password',
				);

				$control = sprintf(
					'<input class="vuloform-input" type="%s" id="%s" name="%s" value="%s" placeholder="%s"%s%s%s>',
					esc_attr( $types[ $type ] ?? 'text' ),
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( is_string( $value ) ? $value : '' ),
					esc_attr( $field['placeholder'] ),
					isset( $autocomplete[ $type ] ) ? ' autocomplete="' . $autocomplete[ $type ] . '"' : '',
					$extra,
					$common
				);
		}

		$error_html = self::error_html( $id, $error );

		if ( $grouped ) {
			// A group of controls is announced as one question through fieldset and legend.
			return $open . sprintf( '<fieldset class="vuloform-fieldset" aria-describedby="%s">', esc_attr( $describe ) ) . $legend . $control . '</fieldset>' . self::description( $field, $id ) . $error_html . '</div>';
		}

		return $open . $label . $control . self::description( $field, $id ) . $error_html . '</div>';
	}

	/**
	 * Renders a repeater's rows, between `min_rows` and `max_rows`.
	 *
	 * @param array  $field       The repeater field definition.
	 * @param string $uid         Form instance id.
	 * @param string $id          This field's own element id.
	 * @param string $name        This field's own submitted name.
	 * @param array  $value       Rows to prefill, or empty for the default row count.
	 * @param string $error       Error to show (from a row's own validation).
	 * @return string
	 */
	private static function repeater( array $field, $uid, $id, $name, array $value, $error ) {
		$row_count = $value ? count( $value ) : max( 1, (int) $field['min_rows'] );
		$row_count = max( 1, min( (int) $field['max_rows'], $row_count ) );
		$html      = sprintf(
			'<div class="vuloform-repeater" data-min-rows="%d" data-max-rows="%d" data-row-count="%d">',
			(int) $field['min_rows'],
			(int) $field['max_rows'],
			$row_count
		);

		for ( $row = 0; $row < $row_count; $row++ ) {
			$html .= self::repeater_row( $field, $uid, $id, $name, $value[ $row ] ?? array(), $row );
		}

		$html .= sprintf(
			'<button type="button" class="vuloform-button vuloform-button--secondary vuloform-repeater-add"%s>%s</button>',
			$row_count >= (int) $field['max_rows'] ? ' hidden' : '',
			esc_html__( 'Add row', 'vuloform' )
		);

		return $html . '</div>' . self::description( $field, $id ) . self::error_html( $id, $error );
	}

	/**
	 * @param array  $field Repeater field definition.
	 * @param string $uid   Form instance id.
	 * @param string $id    The repeater's own element id.
	 * @param string $name  The repeater's own submitted name.
	 * @param array  $row   This row's values, by sub-field key.
	 * @param int    $index Row position (0-based).
	 * @return string
	 */
	private static function repeater_row( array $field, $uid, $id, $name, array $row, $index ) {
		$html = sprintf( '<div class="vuloform-repeater-row" data-row="%d">', $index );

		foreach ( $field['fields'] as $sub_field ) {
			// `__N__` so form.js's reindex regex can match the row number unambiguously.
			$sub_id    = $id . '__' . $index . '__' . $sub_field['id'];
			$sub_name  = $name . '[' . $index . '][' . $sub_field['key'] . ']';
			$sub_value = $row[ $sub_field['key'] ] ?? null;

			$html .= self::field( $sub_field, $uid, $sub_value, '', $sub_name, $sub_id );
		}

		$html .= sprintf(
			'<button type="button" class="vuloform-button vuloform-button--secondary vuloform-repeater-remove">%s</button>',
			esc_html__( 'Remove', 'vuloform' )
		);

		return $html . '</div>';
	}

	/**
	 * @param array  $field Field definition.
	 * @param string $id    Element id prefix.
	 * @return string
	 */
	private static function description( array $field, $id ) {
		return ! empty( $field['description'] ) ? sprintf( '<p class="vuloform-description" id="%s-desc">%s</p>', esc_attr( $id ), esc_html( $field['description'] ) ) : '';
	}

	/**
	 * @param string $id    Element id prefix.
	 * @param string $error Error to show, '' for none.
	 * @return string
	 */
	private static function error_html( $id, $error ) {
		return sprintf( '<p class="vuloform-error" id="%s-error"%s>%s</p>', esc_attr( $id ), ! empty( $error ) ? '' : ' hidden', esc_html( $error ) );
	}
}
