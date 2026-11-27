<?php
/**
 * Processor class file.
 *
 * @package VuloForm
 */

namespace VuloForm\Submissions;

use VuloForm\Fields\Registry;
use VuloForm\Forms\Calculator;
use VuloForm\Forms\Conditions;
use VuloForm\Forms\Schema;
use VuloForm\Security\Spam;
use VuloForm\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Takes a posted form from request to stored submission. Nothing the browser says about the form
 * is trusted - required, visibility and calculations are all worked out here from the stored schema.
 */
class Processor {

	/**
	 * @var SubmissionRepository
	 */
	private $submissions;

	/**
	 * @param SubmissionRepository $submissions Submission storage.
	 */
	public function __construct( SubmissionRepository $submissions ) {
		$this->submissions = $submissions;
	}

	/**
	 * Handles one submission.
	 *
	 * @param array $form  Form (id, title, status, schema).
	 * @param array $post  Request fields: `vf` (field key => value), `vf_token`, the honeypot, `vf_page`.
	 * @param array $files `$_FILES`-shaped uploads, keyed `vf_file_{field key}`.
	 * @return array{success: bool, message: string, errors: array<string, string>, redirect: string, submission_id: int}
	 */
	public function handle( array $form, array $post, array $files = array(), $user_id = 0 ) {
		$settings = $form['schema']['settings'];

		if ( 'published' !== $form['status'] ) {
			return self::failure( __( 'This form is not accepting submissions.', 'vuloform' ) );
		}

		if ( Schema::missing_modules( $form['schema'] ) ) {
			// The form depends on an extension that is not running, for example one that takes its
			// payment. Accepting the submission anyway would do the wrong thing silently.
			return self::failure( __( 'This form is temporarily unavailable. Please try again later.', 'vuloform' ) );
		}

		/**
		 * Lets an extension refuse a submission before anything is checked or stored, for example
		 * because something the form depends on is not configured. Return a message for the visitor
		 * to refuse, '' to carry on.
		 *
		 * @param string $message Refusal message, '' to accept.
		 * @param array  $form    Form.
		 */
		$refusal = (string) apply_filters( 'vuloform_refuse_submission', '', $form );

		if ( ! empty( $refusal ) ) {
			return self::failure( $refusal );
		}

		$spam = Spam::check( $form, $post );

		if ( 'reject' === $spam['verdict'] ) {
			return self::failure( $spam['message'] );
		}

		$uploads = array();
		$values  = self::clean_values( $form['schema']['fields'], isset( $post['vf'] ) && is_array( $post['vf'] ) ? $post['vf'] : array() );
		$errors  = self::validate_values( $form, $values, $files, $uploads );

		if ( $errors ) {
			$result           = self::failure( $settings['messages']['error'] );
			$result['errors'] = $errors;

			return $result;
		}

		self::apply_calculations( $form['schema']['fields'], $values );

		$stored = self::store_uploads( $uploads, $values );

		if ( ! $stored ) {
			return self::failure( __( 'Your file could not be saved. Please try again later.', 'vuloform' ) );
		}

		/**
		 * Filters the values about to be stored.
		 *
		 * @param array $values Field key => value.
		 * @param array $form   Form.
		 */
		$values = (array) apply_filters( 'vuloform_submission_values', $values, $form );
		$status = 'spam' === $spam['verdict'] ? 'spam' : 'unread';
		$id     = 0;

		if ( ! empty( $settings['store_submissions'] ) || 'spam' === $status ) {
			$id = $this->submissions->insert( $form['id'], $values, self::meta( $post ), $status );

			if ( ! $id ) {
				return self::failure( __( 'Your message could not be saved. Please try again later.', 'vuloform' ) );
			}
		}
		
		if ( 'spam' !== $status ) {
			/**
			 * Fires after a submission is accepted. Notifications and webhooks run from here.
			 *
			 * @param int   $id     Submission id (0 when the form does not store submissions).
			 * @param array $values Field key => value.
			 * @param array $form   Form.
			 */
			do_action( 'vuloform_submission_created', $id, $values, $form, $user_id );
		}

		$confirmation = self::confirmation_for( $settings['confirmation'], $values );
		$result       = array(
			'success'       => true,
			// The message is HTML the site owner wrote; what the visitor typed goes into it escaped.
			'message'       => Formatter::fill( $confirmation['message'], $form, $values, true ),
			'errors'        => array(),
			'redirect'      => 'redirect' === $confirmation['type'] ? $confirmation['redirect_url'] : '',
			'submission_id' => $id,
		);

		if ( 'spam' === $status ) {
			return $result;
		}

		/**
		 * Filters what an accepted submission answers with. An extension can change the message or
		 * send the visitor somewhere else, for example to a payment page.
		 *
		 * @param array $result `success`, `message`, `errors`, `redirect`, `submission_id`.
		 * @param array $values Field key => value.
		 * @param array $form   Form.
		 */
		$filtered = apply_filters( 'vuloform_submission_result', $result, $values, $form );

		return is_array( $filtered ) ? array_merge( $result, array_intersect_key( $filtered, $result ) ) : $result;
	}

	/**
	 * First pass: clean every value, so conditions can be evaluated against the whole form.
	 *
	 * @param array $fields Form fields.
	 * @param array $raw    The posted `vf` array.
	 * @return array Field key => cleaned value.
	 */
	private static function clean_values( array $fields, array $raw ) {
		$values = array();

		foreach ( $fields as $field ) {
			if ( Registry::is_input( $field['type'] ) && ! in_array( $field['type'], array( 'file', 'signature', 'calculation' ), true ) ) {
				$values[ $field['key'] ] = self::clean( $field, $raw[ $field['key'] ] ?? '' );
			}
		}

		return $values;
	}

	/**
	 * Second pass: validate what is visible, drop what is not. Updates `$values` and `$uploads` (a
	 * field key => `[ field, normalised file ]` map) in place.
	 *
	 * @param array $form    Form.
	 * @param array $values  Cleaned values, updated in place.
	 * @param array $files   `$_FILES`-shaped uploads, keyed `vf_file_{field key}`.
	 * @param array $uploads Populated with one entry per field awaiting `store_uploads()`.
	 * @return array<string, string> Validation errors, by field id.
	 */
	private static function validate_values( array $form, array &$values, array $files, array &$uploads ) {
		$settings = $form['schema']['settings'];
		$errors   = array();

		foreach ( $form['schema']['fields'] as $field ) {
			if ( ! Registry::is_input( $field['type'] ) ) {
				continue;
			}

			$key = $field['key'];

			if ( ! Conditions::is_visible( $field, $values ) ) {
				unset( $values[ $key ] );
				continue;
			}

			$required = Conditions::is_required( $field, $values );

			if ( 'calculation' === $field['type'] ) {
				continue;
			}

			if ( 'file' === $field['type'] || 'signature' === $field['type'] ) {
				$sent = Uploads::normalise( $files[ 'vf_file_' . $key ] ?? null );

				if ( ! $sent ) {
					$error = $required ? $settings['messages']['required'] : '';
				} else {
					$error           = Uploads::validate( $field, $sent );
					$uploads[ $key ] = array( $field, $sent );
				}
			} else {
				$error = self::validate( $field, $values[ $key ], $required, $settings['messages'] );
			}

			/**
			 * Filters one field's validation error. Return a message to reject the value, '' to accept it.
			 *
			 * @param string $error  Current error, '' when valid.
			 * @param array  $field  Field definition.
			 * @param mixed  $value  Cleaned value (null for a file field).
			 * @param array  $values Every cleaned value, by field key.
			 * @param array  $form   Form.
			 */
			$error = (string) apply_filters( 'vuloform_validate_field', $error, $field, $values[ $key ] ?? null, $values, $form );

			if ( ! empty( $error ) ) {
				$errors[ $field['id'] ] = $error;
			}
		}

		return $errors;
	}

	/**
	 * Calculations run last, on validated values only. Updates `$values` in place.
	 *
	 * @param array $fields Form fields.
	 * @param array $values Cleaned, validated values, updated in place.
	 * @return void
	 */
	private static function apply_calculations( array $fields, array &$values ) {
		foreach ( $fields as $field ) {
			if ( 'calculation' === $field['type'] && Conditions::is_visible( $field, $values ) ) {
				$total                   = Calculator::evaluate( $field['formula'], $values );
				$values[ $field['key'] ] = null === $total ? '' : number_format( $total, (int) $field['decimals'], '.', '' );
			}
		}
	}

	/**
	 * Stores every validated upload, replacing its `$values` entry with the stored file's data.
	 * Rolls back anything already stored this request when one upload fails to write.
	 *
	 * @param array $uploads Field key => `[ field, normalised file ]`, from `validate_values()`.
	 * @param array $values  Cleaned, validated values, updated in place.
	 * @return bool Whether every upload was stored.
	 */
	private static function store_uploads( array $uploads, array &$values ) {
		foreach ( $uploads as $key => $upload ) {
			$values[ $key ] = Uploads::store( $upload[0], $upload[1] );

			if ( ! $values[ $key ] ) {
				// Nothing was stored for a file that passed validation: the server could not write it.
				foreach ( $values as $stored ) {
					if ( is_array( $stored ) && isset( $stored[0]['path'] ) ) {
						Uploads::delete_for_submission( array( 'data' => array( $stored ) ) );
					}
				}

				return false;
			}
		}

		return true;
	}

	/**
	 * Picks the confirmation for a submission: the first alternative whose conditions its answers
	 * meet, otherwise the form's usual one.
	 *
	 * @param array $confirmation The form's confirmation settings, with its `rules`.
	 * @param array $values       Field key => value.
	 * @return array{type: string, message: string, redirect_url: string}
	 */
	public static function confirmation_for( array $confirmation, array $values ) {
		foreach ( isset( $confirmation['rules'] ) && is_array( $confirmation['rules'] ) ? $confirmation['rules'] : array() as $rule ) {
			// An alternative with no rules left (its field was deleted) must not replace the usual one.
			if ( ! empty( $rule['conditions']['rules'] ) && Conditions::applies( $rule['conditions'], $values ) ) {
				return $rule;
			}
		}

		return $confirmation;
	}

	/**
	 * Reduces a posted value to the type its field stores.
	 *
	 * @param array $field Field definition.
	 * @param mixed $value Raw posted value.
	 * @return string|string[]
	 */
	public static function clean( array $field, $value ) {
		$value = is_array( $value ) || is_string( $value ) ? $value : '';

		switch ( $field['type'] ) {
			case 'checkboxes':
				return array_values( array_filter( array_map( 'sanitize_text_field', is_array( $value ) ? array_filter( $value, 'is_scalar' ) : array() ), 'strlen' ) );

			case 'name':
			case 'address':
				$parts = array();

				foreach ( $field['parts'] as $part ) {
					$parts[ $part ] = is_array( $value ) && isset( $value[ $part ] ) && is_scalar( $value[ $part ] ) ? sanitize_text_field( (string) $value[ $part ] ) : '';
				}

				return $parts;

			case 'phone':
				if ( empty( $field['show_country_code'] ) ) {
					return sanitize_text_field( $value );
				}

				$value = is_array( $value ) ? $value : array();

				return array(
					'country_code' => sanitize_text_field( $value['country_code'] ?? '' ),
					'phone'        => sanitize_text_field( $value['phone'] ?? '' ),
				);

			case 'textarea':
				return is_string( $value ) ? sanitize_textarea_field( $value ) : '';

			case 'email':
				return is_string( $value ) ? sanitize_email( $value ) : '';

			case 'url':
				return is_string( $value ) ? esc_url_raw( trim( $value ), array( 'http', 'https' ) ) : '';

			case 'consent':
				return is_string( $value ) && ! empty( $value ) ? '1' : '';

			case 'repeater':
				$rows  = array();
				$limit = max( 1, (int) ( $field['max_rows'] ?? 10 ) );

				foreach ( array_slice( is_array( $value ) ? $value : array(), 0, $limit ) as $row ) {
					if ( ! is_array( $row ) ) {
						continue;
					}

					$clean_row = array();

					foreach ( $field['fields'] as $sub_field ) {
						$clean_row[ $sub_field['key'] ] = self::clean( $sub_field, $row[ $sub_field['key'] ] ?? '' );
					}

					$rows[] = $clean_row;
				}

				return $rows;

			default:
				return is_string( $value ) ? sanitize_text_field( $value ) : '';
		}
	}

	/**
	 * Validates one cleaned value.
	 *
	 * @param array $field    Field definition.
	 * @param mixed $value    Cleaned value.
	 * @param bool  $required Whether the field is required for this submission.
	 * @param array $messages The form's `required` and `invalid` messages.
	 * @return string Error message, or ''.
	 */
	public static function validate( array $field, $value, $required, array $messages ) {
		if ( 'repeater' === $field['type'] ) {
			return self::validate_repeater( $field, $value, $required, $messages );
		}

		$flat  = Conditions::flatten( $value );
		$empty = ! $flat;

		if ( 'name' === $field['type'] ) {
			$empty = '' === ( $value['first'] ?? ( $value['last'] ?? '' ) );
		} elseif ( 'address' === $field['type'] ) {
			$empty = '' === ( $value['line1'] ?? implode( '', $flat ) );
		} elseif ( 'phone' === $field['type'] && is_array( $value ) ) {
			$empty = empty( $value['phone'] );
		}

		if ( $empty ) {
			return $required ? $messages['required'] : '';
		}

		$text = is_array( $value ) ? ( empty( $value['phone'] ) ? '' : $value['phone'] ) : ( is_string( $value ) ? $value : '' );

		switch ( $field['type'] ) {
			case 'email':
				return is_email( $text ) ? '' : __( 'Enter a valid email address.', 'vuloform' );

			case 'url':
				return wp_http_validate_url( $text ) || filter_var( $text, FILTER_VALIDATE_URL ) ? '' : __( 'Enter a valid web address, starting with https://.', 'vuloform' );

			case 'phone':
				$digits = strlen( preg_replace( '/\D/', '', $text ) );

				return preg_match( '/^[0-9+().\-\s]+$/', $text ) && $digits >= 5 && $digits <= 15 ? '' : __( 'Enter a valid phone number.', 'vuloform' );

			case 'number':
				if ( ! is_numeric( $text ) ) {
					return __( 'Enter a number.', 'vuloform' );
				}

				if ( ! empty( $field['min'] ) && (float) $text < (float) $field['min'] ) {
					/* translators: %s: smallest allowed number. */
					return sprintf( __( 'Enter a number of %s or more.', 'vuloform' ), $field['min'] );
				}

				if ( ! empty( $field['max'] ) && (float) $text > (float) $field['max'] ) {
					/* translators: %s: largest allowed number. */
					return sprintf( __( 'Enter a number of %s or less.', 'vuloform' ), $field['max'] );
				}

				return '';

			case 'date':
				$date = \DateTime::createFromFormat( 'Y-m-d', $text );

				return $date && $date->format( 'Y-m-d' ) === $text ? '' : __( 'Enter a valid date.', 'vuloform' );

			case 'time':
				return preg_match( '/^([01]\d|2[0-3]):[0-5]\d$/', $text ) ? '' : __( 'Enter a valid time.', 'vuloform' );

			case 'select':
			case 'radio':
			case 'checkboxes':
				// Only values the form offers are accepted, however the request was built.
				$allowed = array_column( $field['options'], 'value' );

				return array_diff( $flat, $allowed ) ? $messages['invalid'] : '';

			case 'text':
			case 'textarea':
			case 'password':
				$length = mb_strlen( $text );

				if ( $field['minlength'] > 0 && $length < $field['minlength'] ) {
					/* translators: %d: number of characters. */
					return sprintf( _n( 'Enter at least %d character.', 'Enter at least %d characters.', $field['minlength'], 'vuloform' ), $field['minlength'] );
				}

				if ( $field['maxlength'] > 0 && $length > $field['maxlength'] ) {
					/* translators: %d: number of characters. */
					return sprintf( _n( 'Enter no more than %d character.', 'Enter no more than %d characters.', $field['maxlength'], 'vuloform' ), $field['maxlength'] );
				}

				return '';
		}

		return '';
	}

	/**
	 * Validates a repeater's rows: each row's own sub-fields, against their own `required`, plus the
	 * repeater's row-count bounds.
	 *
	 * @param array $field    The repeater field definition.
	 * @param mixed $value    Cleaned rows, as returned by `clean()`.
	 * @param bool  $required Whether the repeater itself (at least one row) is required.
	 * @param array $messages The form's `required` and `invalid` messages.
	 * @return string Error message, or ''.
	 */
	private static function validate_repeater( array $field, $value, $required, array $messages ) {
		$rows = is_array( $value ) ? $value : array();

		if ( ! $rows ) {
			return $required || (int) $field['min_rows'] > 0 ? $messages['required'] : '';
		}

		if ( count( $rows ) < (int) $field['min_rows'] ) {
			/* translators: %d: smallest allowed number of rows. */
			return sprintf( _n( 'Add at least %d row.', 'Add at least %d rows.', (int) $field['min_rows'], 'vuloform' ), (int) $field['min_rows'] );
		}

		foreach ( $rows as $index => $row ) {
			foreach ( $field['fields'] as $sub_field ) {
				$sub_value = is_array( $row ) ? ( $row[ $sub_field['key'] ] ?? '' ) : '';
				$sub_error = self::validate( $sub_field, $sub_value, $sub_field['required'], $messages );

				if ( ! empty( $sub_error ) ) {
					/* translators: 1: row number, 2: error message. */
					return sprintf( __( 'Row %1$d: %2$s', 'vuloform' ), $index + 1, $sub_error );
				}
			}
		}

		return '';
	}

	/**
	 * What VuloForm records about a submission besides its values.
	 *
	 * @param array $post Request fields.
	 * @return array
	 */
	private static function meta( array $post ) {
		$meta = array(
			// The page the form was on, as reported by the form itself.
			'page_url' => esc_url_raw( (string) ( $post['vf_page'] ?? '' ), array( 'http', 'https' ) ),
			'events'   => array(),
		);

		// The address is personal data, so it is only kept when the site owner has opted in.
		if ( ! empty( Utill::settings()['store_ip'] ) ) {
			$meta['ip'] = Spam::ip();
		}

		return $meta;
	}

	/**
	 * @param string $message Message for the visitor.
	 * @return array
	 */
	private static function failure( $message ) {
		return array(
			'success'       => false,
			'message'       => $message,
			'errors'        => array(),
			'redirect'      => '',
			'submission_id' => 0,
		);
	}
}
