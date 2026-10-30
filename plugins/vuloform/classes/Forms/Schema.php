<?php
/**
 * Schema class file.
 *
 * @package VuloForm
 */

namespace VuloForm\Forms;

use VuloForm\Fields\Registry;

defined( 'ABSPATH' ) || exit;

/**
 * The stored shape of a form, and the only code allowed to produce it.
 *
 * Whatever the builder sends is rebuilt here field by field: unknown keys are dropped, every value
 * is typed and sanitized, ids and keys are made unique. The renderer and the submission processor
 * read only what this class wrote, so neither has to trust the browser.
 */
class Schema {

	/**
	 * Most fields a form may hold.
	 */
	const MAX_FIELDS = 300;

	const WIDTHS = array( 100, 66, 50, 33 );

	/**
	 * File extensions a file field may accept, with the MIME types each must match.
	 * Nothing executable or scriptable is listed, so none can be allowed by a form.
	 *
	 * @var array<string, string[]>
	 */
	const FILE_TYPES = array(
		'jpg'  => array( 'image/jpeg' ),
		'jpeg' => array( 'image/jpeg' ),
		'png'  => array( 'image/png' ),
		'gif'  => array( 'image/gif' ),
		'webp' => array( 'image/webp' ),
		'pdf'  => array( 'application/pdf' ),
		'doc'  => array( 'application/msword' ),
		'docx' => array( 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ),
		'xls'  => array( 'application/vnd.ms-excel' ),
		'xlsx' => array( 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ),
		'ppt'  => array( 'application/vnd.ms-powerpoint' ),
		'pptx' => array( 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ),
		'txt'  => array( 'text/plain' ),
		'csv'  => array( 'text/csv', 'text/plain' ),
		'zip'  => array( 'application/zip' ),
		'mp3'  => array( 'audio/mpeg' ),
		'mp4'  => array( 'video/mp4' ),
	);

	/**
	 * A blank form.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'version'  => VULOFORM_SCHEMA_VERSION,
			'fields'   => array(),
			'settings' => self::default_settings(),
		);
	}

	/**
	 * @return array Form-level settings with their defaults.
	 */
	public static function default_settings() {
		return array(
			// Id of the template the form was started from; picks the builder's field library.
			'template'          => '',
			'submit_label'      => __( 'Submit', 'vuloform' ),
			'next_label'        => __( 'Next', 'vuloform' ),
			'previous_label'    => __( 'Back', 'vuloform' ),
			'progress'          => 'steps',
			'store_submissions' => true,
			'confirmation'      => array(
				'type'         => 'message',
				'message'      => __( 'Thank you. Your message has been sent.', 'vuloform' ),
				'redirect_url' => '',
				// Other confirmations for particular answers; the first whose conditions match is
				// used instead of the one above.
				'rules'        => array(),
			),
			'messages'          => array(
				'required' => __( 'This field is required.', 'vuloform' ),
				'invalid'  => __( 'Please check this field.', 'vuloform' ),
				'error'    => __( 'Please correct the highlighted fields and try again.', 'vuloform' ),
			),
			'style'             => array(
				'label_position' => 'top',
				'spacing'        => 'normal',
				'accent_color'   => '',
				'text_color'     => '',
				'font_size'      => '',
				'radius'         => '',
				'button_align'   => 'left',
				'css_class'      => '',
			),
			'spam'              => array(
				// Google reCAPTCHA; only does anything once its keys are saved under Settings. The
				// other spam checks are site-wide settings (see Utill::SETTINGS_DEFAULTS).
				'recaptcha' => false,
			),
			'notifications'     => array(),
			'webhooks'          => array(),
			// Per-form settings of extensions (VuloForm Pro modules), keyed by extension id.
			'extensions'        => array(),
		);
	}

	/**
	 * Rebuilds a schema from untrusted input.
	 *
	 * @param mixed $input Decoded schema from the builder, a template or an import.
	 * @return array A valid schema.
	 */
	public static function sanitize( $input ) {
		$input  = is_array( $input ) ? $input : array();
		$fields = array();
		$ids    = array();
		$keys   = array();

		foreach ( array_slice( isset( $input['fields'] ) && is_array( $input['fields'] ) ? $input['fields'] : array(), 0, self::MAX_FIELDS ) as $raw ) {
			$field = self::sanitize_field( $raw, $ids, $keys );

			if ( $field ) {
				$fields[] = $field;
			}
		}

		// A rule may only refer to a field that exists and collects a value.
		$known = array();

		foreach ( $fields as $field ) {
			// A field of an inactive extension counts too, so rules that depend on it are kept for
			// when the extension is back.
			if ( Registry::is_input( $field['type'] ) || ! Registry::get( $field['type'] ) ) {
				$known[ $field['key'] ] = true;
			}
		}

		foreach ( $fields as $index => $field ) {
			$rules = array();

			foreach ( $field['conditions']['rules'] as $rule ) {
				if ( isset( $known[ $rule['field'] ] ) && $rule['field'] !== $field['key'] ) {
					$rules[] = $rule;
				}
			}

			$fields[ $index ]['conditions']['rules'] = $rules;
		}

		$settings = self::sanitize_settings( $input['settings'] ?? array(), $known );
		$raw      = isset( $input['settings']['extensions'] ) && is_array( $input['settings']['extensions'] ) ? $input['settings']['extensions'] : array();

		/**
		 * Filters the per-form settings of extensions, keyed by extension id. They are kept as plain
		 * cleaned data even when the extension is inactive; an active extension validates its own
		 * entry here.
		 *
		 * @param array $extensions Cleaned settings, extension id => array.
		 * @param array $fields     The form's sanitized fields.
		 */
		$settings['extensions'] = (array) apply_filters( 'vuloform_form_extensions', array_filter( self::deep_clean( $raw ), 'is_array' ), $fields );

		return array(
			'version'  => VULOFORM_SCHEMA_VERSION,
			'fields'   => $fields,
			'settings' => $settings,
		);
	}

	/**
	 * Brings a stored schema up to the current version. There is only one version so far; this is
	 * where a later release converts older forms instead of breaking them.
	 *
	 * @param mixed $schema Stored schema.
	 * @return array
	 */
	public static function upgrade( $schema ) {
		$schema = is_array( $schema ) ? $schema : array();

		$schema['settings'] = self::merge_defaults( self::default_settings(), isset( $schema['settings'] ) && is_array( $schema['settings'] ) ? $schema['settings'] : array() );
		$schema['fields']   = isset( $schema['fields'] ) && is_array( $schema['fields'] ) ? array_values( $schema['fields'] ) : array();
		$schema['version']  = VULOFORM_SCHEMA_VERSION;

		return $schema;
	}

	/**
	 * What stops a form from being published, each with where to go to fix it. The builder uses
	 * `field` (a field id) and `group` (a group of the form's settings) to take the site owner there.
	 *
	 * @param array $schema A sanitized schema.
	 * @return array<int, array{message: string, field: string, group: string}>
	 */
	public static function issues( array $schema ) {
		$issues = array();
		$inputs = 0;
		$add    = static function ( $message, $field = '', $group = '' ) use ( &$issues ) {
			$issues[] = array(
				'message' => $message,
				'field'   => $field,
				'group'   => $group,
			);
		};

		foreach ( $schema['fields'] as $field ) {
			$inputs += Registry::is_input( $field['type'] ) ? 1 : 0;

			if ( Registry::supports( $field['type'], 'options' ) && ! $field['options'] ) {
				/* translators: %s: field label. */
				$add( sprintf( __( '"%s" has no choices for visitors to pick from. Select the field and add at least one under Choices.', 'vuloform' ), $field['label'] ), $field['id'] );
			}

			if ( 'calculation' !== $field['type'] ) {
				continue;
			}

			if ( '' === trim( $field['formula'] ) ) {
				/* translators: %s: field label. */
				$add( sprintf( __( '"%s" has nothing to calculate yet. Select the field and build its calculation under "What to calculate", for example {quantity} * {price}.', 'vuloform' ), $field['label'] ), $field['id'] );
			} elseif ( null === Calculator::evaluate( $field['formula'], array() ) ) {
				/* translators: %s: field label. */
				$add( sprintf( __( 'The calculation in "%s" cannot be worked out. Select the field: what is wrong is shown under the calculation.', 'vuloform' ), $field['label'] ), $field['id'] );
			}
		}

		if ( 0 === $inputs ) {
			$add( __( 'The form has no field for visitors to fill in. Add one from the list on the left of the Fields tab.', 'vuloform' ) );
		}

		$last = end( $schema['fields'] );

		if ( $last && 'page_break' === $last['type'] ) {
			$add( __( 'A page break is the last field, so the step after it would be empty. Add a field after it or remove it.', 'vuloform' ), $last['id'] );
		}

		foreach ( $schema['settings']['webhooks'] as $webhook ) {
			if ( $webhook['enabled'] && '' === $webhook['url'] ) {
				/* translators: %s: webhook name. */
				$add( sprintf( __( 'The webhook "%s" has no address. Enter one that starts with https://, or switch the webhook off.', 'vuloform' ), $webhook['name'] ), '', 'webhooks' );
			}
		}

		foreach ( $schema['settings']['notifications'] as $notification ) {
			if ( $notification['enabled'] && '' === $notification['to'] ) {
				/* translators: %s: notification name. */
				$add( sprintf( __( 'The notification "%s" has nobody to send to. Fill in "To", or switch the notification off.', 'vuloform' ), $notification['name'] ), '', 'notifications' );
			}
		}

		return $issues;
	}

	/**
	 * Problems that stop a form from being published, in the site's language.
	 *
	 * @param array $schema A sanitized schema.
	 * @return string[]
	 */
	public static function problems( array $schema ) {
		$problems = array_column( self::issues( $schema ), 'message' );

		foreach ( self::missing_modules( $schema ) as $id ) {
			/* translators: %s: extension id, e.g. "payments". */
			$problems[] = sprintf( __( 'This form relies on "%s", which is not active on this site. Activate it, or switch that feature off for this form.', 'vuloform' ), $id );
		}

		/**
		 * Filters what stops a form from being published.
		 *
		 * @param string[] $problems Problems, in the site's language.
		 * @param array    $schema   Sanitized schema.
		 */
		return array_values( array_filter( (array) apply_filters( 'vuloform_form_problems', $problems, $schema ), 'is_string' ) );
	}

	/**
	 * @param mixed    $raw  One field from the input.
	 * @param string[] $ids  Ids already used (updated).
	 * @param string[] $keys Keys already used (updated).
	 * @return array|null
	 */
	private static function sanitize_field( $raw, array &$ids, array &$keys ) {
		$raw  = is_array( $raw ) ? $raw : array();
		$type = sanitize_key( (string) ( $raw['type'] ?? '' ) );

		$known = (bool) Registry::get( $type );

		if ( '' === $type ) {
			return null;
		}

		// Stable id: kept when valid and unused, otherwise generated. Duplicating a field in the
		// builder therefore can never produce two fields with one id.
		$id = preg_replace( '/[^a-z0-9_]/', '', strtolower( (string) ( $raw['id'] ?? '' ) ) );

		if ( '' === $id || isset( $ids[ $id ] ) ) {
			$id = 'f_' . strtolower( wp_generate_password( 8, false ) );
		}

		$ids[ $id ] = true;

		$label = sanitize_text_field( (string) ( $raw['label'] ?? '' ) );

		// The key names the value in submissions, emails and webhooks.
		$key = sanitize_key( str_replace( array( ' ', '-' ), '_', (string) ( $raw['key'] ?? '' ) ) );
		$key = '' !== $key ? $key : sanitize_key( str_replace( array( ' ', '-' ), '_', $label ) );
		$key = '' !== $key ? substr( $key, 0, 40 ) : $type;
		$try = $key;
		$n   = 2;

		while ( isset( $keys[ $try ] ) ) {
			$try = $key . '_' . $n;
			++$n;
		}

		$keys[ $try ] = true;

		$width = (int) ( $raw['width'] ?? 100 );

		$field = array(
			'id'          => $id,
			'key'         => $try,
			'type'        => $type,
			'label'       => $label,
			'description' => sanitize_textarea_field( (string) ( $raw['description'] ?? '' ) ),
			'placeholder' => sanitize_text_field( (string) ( $raw['placeholder'] ?? '' ) ),
			'required'    => ! empty( $raw['required'] ) && Registry::supports( $type, 'required' ),
			'default'     => sanitize_text_field( (string) ( $raw['default'] ?? '' ) ),
			'width'       => in_array( $width, self::WIDTHS, true ) ? $width : 100,
			'css_class'   => self::css_classes( $raw['css_class'] ?? '' ),
			'hide_label'  => ! empty( $raw['hide_label'] ),
			'options'     => array(),
			'conditions'  => self::sanitize_conditions( $raw['conditions'] ?? array() ),
		);

		if ( Registry::supports( $type, 'options' ) ) {
			foreach ( array_slice( isset( $raw['options'] ) && is_array( $raw['options'] ) ? $raw['options'] : array(), 0, 200 ) as $option ) {
				$option_label = sanitize_text_field( (string) ( is_array( $option ) ? ( $option['label'] ?? '' ) : $option ) );
				$option_value = sanitize_text_field( (string) ( is_array( $option ) ? ( $option['value'] ?? '' ) : $option ) );

				if ( '' !== $option_label || '' !== $option_value ) {
					$field['options'][] = array(
						'label' => '' !== $option_label ? $option_label : $option_value,
						'value' => '' !== $option_value ? $option_value : $option_label,
					);
				}
			}
		}

		if ( Registry::supports( $type, 'range' ) ) {
			$field['min']  = self::number_or_empty( $raw['min'] ?? '' );
			$field['max']  = self::number_or_empty( $raw['max'] ?? '' );
			$field['step'] = self::number_or_empty( $raw['step'] ?? '' );
		}

		if ( Registry::supports( $type, 'length' ) ) {
			$field['minlength'] = max( 0, (int) ( $raw['minlength'] ?? 0 ) );
			$field['maxlength'] = max( 0, (int) ( $raw['maxlength'] ?? 0 ) );
		}

		switch ( $type ) {
			case 'heading':
				$level          = (int) ( $raw['level'] ?? 3 );
				$field['level'] = $level >= 2 && $level <= 6 ? $level : 3;
				break;

			case 'html':
				// The same tags a post may contain: no scripts, no event handlers.
				$field['content'] = wp_kses_post( (string) ( $raw['content'] ?? '' ) );
				break;

			case 'consent':
				$field['consent_text'] = wp_kses(
					(string) ( $raw['consent_text'] ?? '' ),
					array(
						'a'      => array(
							'href'   => true,
							'target' => true,
							'rel'    => true,
						),
						'strong' => array(),
						'em'     => array(),
					)
				);
				break;

			case 'file':
				$allowed = array();

				foreach ( isset( $raw['allowed_types'] ) && is_array( $raw['allowed_types'] ) ? $raw['allowed_types'] : array() as $extension ) {
					$extension = strtolower( sanitize_key( (string) $extension ) );

					if ( isset( self::FILE_TYPES[ $extension ] ) ) {
						$allowed[] = $extension;
					}
				}

				$field['allowed_types'] = $allowed ? array_values( array_unique( $allowed ) ) : array( 'jpg', 'jpeg', 'png', 'pdf' );
				$field['max_size_mb']   = max( 1, min( 100, (int) ( $raw['max_size_mb'] ?? 5 ) ) );
				$field['max_files']     = max( 1, min( 10, (int) ( $raw['max_files'] ?? 1 ) ) );
				break;

			case 'calculation':
				$field['formula']  = preg_replace( '/[^0-9a-z_{}+\-*\/(). ]/i', '', (string) ( $raw['formula'] ?? '' ) );
				$field['decimals'] = max( 0, min( 4, (int) ( $raw['decimals'] ?? 2 ) ) );
				$field['prefix']   = sanitize_text_field( (string) ( $raw['prefix'] ?? '' ) );
				break;

			case 'name':
			case 'address':
				$parts = array();

				foreach ( Registry::PARTS[ $type ] as $part ) {
					// Every part is shown unless it was explicitly switched off.
					if ( ! isset( $raw['parts'] ) || ! is_array( $raw['parts'] ) || in_array( $part, $raw['parts'], true ) ) {
						$parts[] = $part;
					}
				}

				$field['parts'] = $parts ? $parts : Registry::PARTS[ $type ];
				break;
		}

		if ( ! $known ) {
			// A type added by an extension that is not active right now. Its own settings are kept
			// (cleaned, not interpreted) so the field comes back intact when the extension does;
			// until then it is neither shown to visitors nor accepted in a submission.
			return array_merge( $field, self::deep_clean( $raw ), array_intersect_key( $field, array_flip( array( 'id', 'key', 'type', 'conditions' ) ) ) );
		}

		/**
		 * Filters a sanitized field, so an extension can keep the settings of its own field types.
		 *
		 * @param array $field Sanitized field.
		 * @param array $raw   The field as it was submitted.
		 */
		return (array) apply_filters( 'vuloform_sanitize_field', $field, $raw );
	}

	/**
	 * Extensions a form cannot work without that are not running. An extension marks its per-form
	 * settings with `needs_module` when the form must not accept submissions without it.
	 *
	 * @param array $schema Form schema.
	 * @return string[] Extension ids.
	 */
	public static function missing_modules( array $schema ) {
		$missing = array();

		foreach ( (array) ( $schema['settings']['extensions'] ?? array() ) as $id => $extension ) {
			if ( ! empty( $extension['enabled'] ) && ! empty( $extension['needs_module'] ) && ! ( isset( VuloForm()->modules ) && VuloForm()->modules->is_active( (string) $id ) ) ) {
				$missing[] = (string) $id;
			}
		}

		return $missing;
	}

	/**
	 * Cleans a value whose structure is not known: plain data only, bounded in depth and size.
	 *
	 * @param mixed $value Raw value.
	 * @param int   $depth Current nesting depth.
	 * @return mixed
	 */
	public static function deep_clean( $value, $depth = 0 ) {
		if ( is_array( $value ) ) {
			$clean = array();

			if ( $depth >= 6 ) {
				return $clean;
			}

			foreach ( array_slice( $value, 0, 200, true ) as $key => $item ) {
				$key           = is_int( $key ) ? $key : preg_replace( '/[^A-Za-z0-9_]/', '', (string) $key );
				$clean[ $key ] = self::deep_clean( $item, $depth + 1 );
			}

			return $clean;
		}

		if ( is_bool( $value ) || is_int( $value ) || is_float( $value ) ) {
			return $value;
		}

		return is_string( $value ) ? wp_kses_post( $value ) : '';
	}

	/**
	 * @param mixed $raw Conditions from the input.
	 * @return array{enabled: bool, action: string, match: string, rules: array}
	 */
	private static function sanitize_conditions( $raw ) {
		$raw   = is_array( $raw ) ? $raw : array();
		$rules = array();

		foreach ( array_slice( isset( $raw['rules'] ) && is_array( $raw['rules'] ) ? $raw['rules'] : array(), 0, 20 ) as $rule ) {
			$rule     = is_array( $rule ) ? $rule : array();
			$operator = (string) ( $rule['operator'] ?? 'is' );
			$target   = sanitize_key( (string) ( $rule['field'] ?? '' ) );

			if ( '' !== $target ) {
				$rules[] = array(
					'field'    => $target,
					'operator' => in_array( $operator, Conditions::OPERATORS, true ) ? $operator : 'is',
					'value'    => sanitize_text_field( (string) ( $rule['value'] ?? '' ) ),
				);
			}
		}

		$action = (string) ( $raw['action'] ?? 'show' );

		return array(
			'enabled' => ! empty( $raw['enabled'] ),
			'action'  => in_array( $action, array( 'show', 'hide', 'require' ), true ) ? $action : 'show',
			'match'   => 'any' === ( $raw['match'] ?? 'all' ) ? 'any' : 'all',
			'rules'   => $rules,
		);
	}

	/**
	 * Conditions on something other than a field: when a notification or webhook is sent, or when
	 * an alternative confirmation is used. Rules about fields the form no longer has are dropped.
	 *
	 * @param mixed $raw   Conditions from the input.
	 * @param array $known Field key => true, for every input field.
	 * @return array{enabled: bool, match: string, rules: array}
	 */
	private static function sanitize_when( $raw, array $known ) {
		$clean = self::sanitize_conditions( $raw );
		$rules = array();

		foreach ( $clean['rules'] as $rule ) {
			if ( isset( $known[ $rule['field'] ] ) ) {
				$rules[] = $rule;
			}
		}

		return array(
			'enabled' => $clean['enabled'],
			'match'   => $clean['match'],
			'rules'   => $rules,
		);
	}

	/**
	 * @param mixed $raw   Settings from the input.
	 * @param array $known Field key => true, for every input field.
	 * @return array
	 */
	private static function sanitize_settings( $raw, array $known ) {
		$raw      = self::merge_defaults( self::default_settings(), is_array( $raw ) ? $raw : array() );
		$defaults = self::default_settings();
		$style    = $raw['style'];

		$settings = array(
			'template'          => sanitize_key( (string) $raw['template'] ),
			'submit_label'      => self::text_or( $raw['submit_label'], $defaults['submit_label'] ),
			'next_label'        => self::text_or( $raw['next_label'], $defaults['next_label'] ),
			'previous_label'    => self::text_or( $raw['previous_label'], $defaults['previous_label'] ),
			'progress'          => in_array( $raw['progress'], array( 'steps', 'bar', 'none' ), true ) ? $raw['progress'] : 'steps',
			'store_submissions' => ! empty( $raw['store_submissions'] ),
			'confirmation'      => array(
				'type'         => 'redirect' === $raw['confirmation']['type'] ? 'redirect' : 'message',
				'message'      => wp_kses_post( (string) $raw['confirmation']['message'] ),
				'redirect_url' => esc_url_raw( (string) $raw['confirmation']['redirect_url'], array( 'http', 'https' ) ),
				'rules'        => array(),
			),
			'messages'          => array(
				'required' => self::text_or( $raw['messages']['required'], $defaults['messages']['required'] ),
				'invalid'  => self::text_or( $raw['messages']['invalid'], $defaults['messages']['invalid'] ),
				'error'    => self::text_or( $raw['messages']['error'], $defaults['messages']['error'] ),
			),
			'style'             => array(
				'label_position' => in_array( $style['label_position'], array( 'top', 'left', 'hidden' ), true ) ? $style['label_position'] : 'top',
				'spacing'        => in_array( $style['spacing'], array( 'compact', 'normal', 'relaxed' ), true ) ? $style['spacing'] : 'normal',
				'accent_color'   => (string) sanitize_hex_color( (string) $style['accent_color'] ),
				'text_color'     => (string) sanitize_hex_color( (string) $style['text_color'] ),
				'font_size'      => '' === (string) $style['font_size'] ? '' : (string) max( 12, min( 24, (int) $style['font_size'] ) ),
				'radius'         => '' === (string) $style['radius'] ? '' : (string) max( 0, min( 30, (int) $style['radius'] ) ),
				'button_align'   => in_array( $style['button_align'], array( 'left', 'center', 'right', 'full' ), true ) ? $style['button_align'] : 'left',
				'css_class'      => self::css_classes( $style['css_class'] ),
			),
			'spam'              => array(
				'recaptcha' => ! empty( $raw['spam']['recaptcha'] ),
			),
			'notifications'     => array(),
			'webhooks'          => array(),
		);

		foreach ( array_slice( is_array( $raw['notifications'] ) ? $raw['notifications'] : array(), 0, 10 ) as $item ) {
			$item    = is_array( $item ) ? $item : array();
			$channel = in_array( $item['channel'] ?? 'email', array( 'email', 'sms', 'both' ), true ) ? $item['channel'] : 'email';

			$settings['notifications'][] = array(
				'id'       => self::item_id( $item['id'] ?? '' ),
				'name'     => sanitize_text_field( (string) ( $item['name'] ?? '' ) ),
				'enabled'  => ! empty( $item['enabled'] ),
				'channel'  => $channel,
				// Addresses or numbers, or `{field_key}` placeholders that resolve to one.
				'to'       => sanitize_text_field( (string) ( $item['to'] ?? '' ) ),
				'subject'  => sanitize_text_field( (string) ( $item['subject'] ?? '' ) ),
				'message'  => sanitize_textarea_field( (string) ( $item['message'] ?? '' ) ),
				'reply_to' => isset( $known[ sanitize_key( (string) ( $item['reply_to'] ?? '' ) ) ] ) ? sanitize_key( (string) $item['reply_to'] ) : '',
				// Used when the channel is `both`: `to` and `message` are then the email's, and
				// these are the text message's.
				'sms_to'      => sanitize_text_field( (string) ( $item['sms_to'] ?? '' ) ),
				'sms_message' => sanitize_textarea_field( (string) ( $item['sms_message'] ?? '' ) ),
				// Sent only for submissions these rules match; always, when there are none.
				'conditions'  => self::sanitize_when( $item['conditions'] ?? array(), $known ),
			);
		}

		$alternatives = isset( $raw['confirmation']['rules'] ) && is_array( $raw['confirmation']['rules'] ) ? $raw['confirmation']['rules'] : array();

		foreach ( array_slice( $alternatives, 0, 10 ) as $item ) {
			$item = is_array( $item ) ? $item : array();

			$settings['confirmation']['rules'][] = array(
				'id'           => self::item_id( $item['id'] ?? '' ),
				'type'         => 'redirect' === ( $item['type'] ?? 'message' ) ? 'redirect' : 'message',
				'message'      => wp_kses_post( (string) ( $item['message'] ?? '' ) ),
				'redirect_url' => esc_url_raw( (string) ( $item['redirect_url'] ?? '' ), array( 'http', 'https' ) ),
				'conditions'   => array_merge( self::sanitize_when( $item['conditions'] ?? array(), $known ), array( 'enabled' => true ) ),
			);
		}

		foreach ( array_slice( is_array( $raw['webhooks'] ) ? $raw['webhooks'] : array(), 0, 5 ) as $item ) {
			$item   = is_array( $item ) ? $item : array();
			$fields = array();

			foreach ( isset( $item['fields'] ) && is_array( $item['fields'] ) ? $item['fields'] : array() as $key ) {
				if ( isset( $known[ sanitize_key( (string) $key ) ] ) ) {
					$fields[] = sanitize_key( (string) $key );
				}
			}

			$settings['webhooks'][] = array(
				'id'      => self::item_id( $item['id'] ?? '' ),
				'name'    => sanitize_text_field( (string) ( $item['name'] ?? '' ) ),
				'enabled' => ! empty( $item['enabled'] ),
				// Only https is kept; the destination is checked again when the webhook is sent.
				'url'     => esc_url_raw( (string) ( $item['url'] ?? '' ), array( 'https' ) ),
				'secret'  => preg_replace( '/[\r\n]+/', '', sanitize_text_field( (string) ( $item['secret'] ?? '' ) ) ),
				// Empty means every field.
				'fields'  => array_values( array_unique( $fields ) ),
				// Sent only for submissions these rules match; always, when there are none.
				'conditions' => self::sanitize_when( $item['conditions'] ?? array(), $known ),
			);
		}

		return $settings;
	}

	/**
	 * Fills in missing keys from the defaults, at any depth. Lists are taken whole.
	 *
	 * @param array $defaults Defaults.
	 * @param array $values   Values.
	 * @return array
	 */
	private static function merge_defaults( array $defaults, array $values ) {
		foreach ( $defaults as $key => $default ) {
			if ( ! array_key_exists( $key, $values ) ) {
				$values[ $key ] = $default;
			} elseif ( is_array( $default ) && $default && array_keys( $default ) !== range( 0, count( $default ) - 1 ) ) {
				$values[ $key ] = self::merge_defaults( $default, is_array( $values[ $key ] ) ? $values[ $key ] : array() );
			}
		}

		return $values;
	}

	/**
	 * @param mixed $value Raw class attribute.
	 * @return string Space-separated valid class names.
	 */
	private static function css_classes( $value ) {
		return implode( ' ', array_filter( array_map( 'sanitize_html_class', preg_split( '/\s+/', (string) $value ) ) ) );
	}

	/**
	 * @param mixed $value Raw number.
	 * @return string A numeric string, or ''.
	 */
	private static function number_or_empty( $value ) {
		return is_numeric( $value ) ? (string) ( 0 + $value ) : '';
	}

	/**
	 * @param mixed  $value    Raw text.
	 * @param string $fallback Used when the text is empty.
	 * @return string
	 */
	private static function text_or( $value, $fallback ) {
		$value = sanitize_text_field( (string) $value );

		return '' !== $value ? $value : $fallback;
	}

	/**
	 * @param mixed $value Raw id of a notification or webhook.
	 * @return string
	 */
	private static function item_id( $value ) {
		$id = preg_replace( '/[^a-z0-9_]/', '', strtolower( (string) $value ) );

		return '' !== $id ? $id : 'i_' . strtolower( wp_generate_password( 8, false ) );
	}
}
