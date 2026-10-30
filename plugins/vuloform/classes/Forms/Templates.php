<?php
/**
 * Templates class file.
 *
 * @package VuloForm
 */

namespace VuloForm\Forms;

defined( 'ABSPATH' ) || exit;

/**
 * Starter forms. Each one is an ordinary schema: creating a form from a template copies it, and the
 * result is edited like any other form.
 */
class Templates {

	/**
	 * @return array<string, array{title: string, desc: string, icon: string, schema: array}>
	 */
	public static function all() {
		$name    = self::field( 'name', __( 'Name', 'vuloform' ), array( 'required' => true ) );
		$email   = self::field( 'email', __( 'Email', 'vuloform' ), array( 'required' => true ) );
		$phone   = self::field( 'phone', __( 'Phone', 'vuloform' ) );
		$message = self::field( 'textarea', __( 'Message', 'vuloform' ), array( 'required' => true ) );
		$consent = self::field(
			'consent',
			__( 'Consent', 'vuloform' ),
			array(
				'required'     => true,
				'consent_text' => __( 'I agree to my details being stored so you can reply to me.', 'vuloform' ),
			)
		);

		$templates = array(
			'contact'    => array(
				'title'  => __( 'Contact form', 'vuloform' ),
				'desc'   => __( 'Name, email and a message.', 'vuloform' ),
				'icon'   => 'mail',
				'fields' => array( $name, $email, self::field( 'text', __( 'Subject', 'vuloform' ) ), $message ),
			),
			'inquiry'    => array(
				'title'  => __( 'General inquiry', 'vuloform' ),
				'desc'   => __( 'Lets the visitor say what the question is about.', 'vuloform' ),
				'icon'   => 'help',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field(
						'select',
						__( 'What is your question about?', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Sales', 'vuloform' ), __( 'Support', 'vuloform' ), __( 'Billing', 'vuloform' ), __( 'Something else', 'vuloform' ) ) ),
						)
					),
					$message,
				),
			),
			'lead'       => array(
				'title'  => __( 'Lead generation', 'vuloform' ),
				'desc'   => __( 'Collects a business contact, with a company field for businesses.', 'vuloform' ),
				'icon'   => 'profile',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field(
						'radio',
						__( 'I am enquiring as', 'vuloform' ),
						array(
							'key'      => 'enquiring_as',
							'required' => true,
							'options'  => self::options( array( __( 'An individual', 'vuloform' ), __( 'A business', 'vuloform' ) ) ),
						)
					),
					self::field(
						'text',
						__( 'Company', 'vuloform' ),
						array(
							'conditions' => array(
								'enabled' => true,
								'action'  => 'show',
								'match'   => 'all',
								'rules'   => array(
									array(
										'field'    => 'enquiring_as',
										'operator' => 'is',
										'value'    => __( 'A business', 'vuloform' ),
									),
								),
							),
						)
					),
					self::field( 'textarea', __( 'What are you looking for?', 'vuloform' ) ),
					$consent,
				),
			),
			'newsletter' => array(
				'title'  => __( 'Newsletter signup', 'vuloform' ),
				'desc'   => __( 'An email address and consent.', 'vuloform' ),
				'icon'   => 'notification',
				'fields' => array(
					$email,
					self::field(
						'consent',
						__( 'Consent', 'vuloform' ),
						array(
							'required'     => true,
							'consent_text' => __( 'Yes, send me the newsletter. I can unsubscribe at any time.', 'vuloform' ),
						)
					),
				),
				'submit' => __( 'Subscribe', 'vuloform' ),
			),
			'feedback'   => array(
				'title'  => __( 'Feedback form', 'vuloform' ),
				'desc'   => __( 'A rating and a comment.', 'vuloform' ),
				'icon'   => 'star',
				'fields' => array(
					self::field(
						'radio',
						__( 'How would you rate your experience?', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Excellent', 'vuloform' ), __( 'Good', 'vuloform' ), __( 'Average', 'vuloform' ), __( 'Poor', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'What could we do better?', 'vuloform' ) ),
					self::field( 'email', __( 'Email (optional)', 'vuloform' ), array( 'description' => __( 'Only if you would like a reply.', 'vuloform' ) ) ),
				),
				'submit' => __( 'Send feedback', 'vuloform' ),
			),
			'survey'     => array(
				'title'  => __( 'Survey', 'vuloform' ),
				'desc'   => __( 'A two-step survey with multiple-choice questions.', 'vuloform' ),
				'icon'   => 'bar-chart',
				'fields' => array(
					self::field( 'heading', __( 'About you', 'vuloform' ) ),
					self::field(
						'select',
						__( 'How did you hear about us?', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Search engine', 'vuloform' ), __( 'Social media', 'vuloform' ), __( 'A friend', 'vuloform' ), __( 'Other', 'vuloform' ) ) ) )
					),
					self::field(
						'checkboxes',
						__( 'Which of our services have you used?', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Service A', 'vuloform' ), __( 'Service B', 'vuloform' ), __( 'Service C', 'vuloform' ) ) ) )
					),
					self::field( 'page_break', __( 'Page break', 'vuloform' ) ),
					self::field( 'heading', __( 'Your opinion', 'vuloform' ) ),
					self::field(
						'radio',
						__( 'How likely are you to recommend us?', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Very likely', 'vuloform' ), __( 'Likely', 'vuloform' ), __( 'Unlikely', 'vuloform' ), __( 'Very unlikely', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'Anything else you would like to tell us?', 'vuloform' ) ),
				),
			),
			'event'      => array(
				'title'  => __( 'Event registration', 'vuloform' ),
				'desc'   => __( 'Attendee details, number of tickets and dietary needs.', 'vuloform' ),
				'icon'   => 'calendar',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field(
						'number',
						__( 'Number of attendees', 'vuloform' ),
						array(
							'required' => true,
							'default'  => '1',
							'min'      => '1',
							'max'      => '10',
						)
					),
					self::field(
						'checkboxes',
						__( 'Dietary requirements', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Vegetarian', 'vuloform' ), __( 'Vegan', 'vuloform' ), __( 'Gluten free', 'vuloform' ) ) ) )
					),
					self::field( 'textarea', __( 'Anything we should know?', 'vuloform' ) ),
				),
				'submit' => __( 'Register', 'vuloform' ),
			),
			'registration' => array(
				'title'  => __( 'Registration form', 'vuloform' ),
				'desc'   => __( 'Account details for a new member, with consent.', 'vuloform' ),
				'icon'   => 'person',
				'fields' => array(
					self::field( 'text', __( 'First name', 'vuloform' ), array( 'required' => true, 'width' => 50 ) ),
					self::field( 'text', __( 'Last name', 'vuloform' ), array( 'required' => true, 'width' => 50 ) ),
					$email,
					$phone,
					self::field( 'date', __( 'Date of birth', 'vuloform' ) ),
					self::field(
						'radio',
						__( 'Gender', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Female', 'vuloform' ), __( 'Male', 'vuloform' ), __( 'Other', 'vuloform' ), __( 'Prefer not to say', 'vuloform' ) ) ) )
					),
					self::field( 'address', __( 'Address', 'vuloform' ) ),
					self::field(
						'consent',
						__( 'Terms', 'vuloform' ),
						array(
							'required'     => true,
							'consent_text' => __( 'I agree to the terms and conditions.', 'vuloform' ),
						)
					),
				),
				'submit' => __( 'Register', 'vuloform' ),
			),
			'job'        => array(
				'title'  => __( 'Job application', 'vuloform' ),
				'desc'   => __( 'Applicant details with a CV upload.', 'vuloform' ),
				'icon'   => 'document',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field( 'text', __( 'Position you are applying for', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'file',
						__( 'Your CV', 'vuloform' ),
						array(
							'required'      => true,
							'allowed_types' => array( 'pdf', 'doc', 'docx' ),
							'max_size_mb'   => 5,
						)
					),
					self::field( 'textarea', __( 'Cover letter', 'vuloform' ) ),
					self::field(
						'consent',
						__( 'Consent', 'vuloform' ),
						array(
							'required'     => true,
							'consent_text' => __( 'I agree to my application being stored and reviewed.', 'vuloform' ),
						)
					),
				),
				'submit' => __( 'Apply', 'vuloform' ),
			),
			'support'    => array(
				'title'  => __( 'Support request', 'vuloform' ),
				'desc'   => __( 'Priority, a description and an optional screenshot.', 'vuloform' ),
				'icon'   => 'tools',
				'fields' => array(
					$name,
					$email,
					self::field(
						'select',
						__( 'Priority', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Low', 'vuloform' ), __( 'Normal', 'vuloform' ), __( 'Urgent', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'Describe the problem', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'file',
						__( 'Screenshot (optional)', 'vuloform' ),
						array(
							'allowed_types' => array( 'jpg', 'jpeg', 'png' ),
							'max_size_mb'   => 5,
						)
					),
				),
			),
			'quote'      => array(
				'title'  => __( 'Order or quote inquiry', 'vuloform' ),
				'desc'   => __( 'Quantity and unit price with a calculated estimate.', 'vuloform' ),
				'icon'   => 'cart',
				'fields' => array(
					$name,
					$email,
					self::field( 'text', __( 'Product or service', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'number',
						__( 'Quantity', 'vuloform' ),
						array(
							'key'      => 'quantity',
							'required' => true,
							'default'  => '1',
							'min'      => '1',
							'width'    => 50,
						)
					),
					self::field(
						'number',
						__( 'Budget per item', 'vuloform' ),
						array(
							'key'   => 'budget',
							'min'   => '0',
							'width' => 50,
						)
					),
					self::field(
						'calculation',
						__( 'Estimated total', 'vuloform' ),
						array(
							'formula'  => '{quantity} * {budget}',
							'decimals' => 2,
						)
					),
					self::field( 'textarea', __( 'Details', 'vuloform' ) ),
				),
				'submit' => __( 'Request a quote', 'vuloform' ),
			),
		);

		$out = array();

		foreach ( $templates as $id => $template ) {
			$out[ $id ] = self::entry( $id, $template );
		}

		/**
		 * Filters the starter templates.
		 *
		 * A plugin's template adds `plugin` (the plugin's name, shown as a tag). Build its entry with
		 * Templates::entry(). It is only offered while the plugin is active, and forms made from it
		 * are hidden while it isn't.
		 *
		 * @param array $out Template id => title, desc, icon, plugin, schema.
		 */
		$out = (array) apply_filters( 'vuloform_templates', $out );

		self::remember_plugin_templates( $out );

		return $out;
	}

	/**
	 * A template as the picker and the REST API use it, from its plain definition.
	 *
	 * @param string $id       Template id.
	 * @param array  $template title, desc, icon, fields, and optionally submit and plugin.
	 * @return array{title: string, desc: string, icon: string, plugin: string, schema: array}
	 */
	public static function entry( $id, array $template ) {
		$settings             = Schema::default_settings();
		$settings['template'] = $id;

		if ( isset( $template['submit'] ) ) {
			$settings['submit_label'] = $template['submit'];
		}

		// Every template tells the site admin about a submission out of the box.
		$settings['notifications'][] = self::admin_notification( 'email' );

		return array(
			'title'  => $template['title'],
			'desc'   => $template['desc'],
			'icon'   => $template['icon'],
			'plugin' => (string) ( $template['plugin'] ?? '' ),
			// One form per site: the picker opens the existing one instead of making another.
			'single' => ! empty( $template['single'] ),
			'schema' => Schema::sanitize(
				array(
					'fields'   => $template['fields'],
					'settings' => $settings,
				)
			),
		);
	}

	/**
	 * Option remembering which templates belong to a plugin (id => plugin name), so their forms can
	 * be told apart from the rest once the plugin is switched off.
	 */
	const PLUGIN_TEMPLATES_OPTION = 'vuloform_plugin_templates';

	/**
	 * @param array $templates Current templates.
	 * @return void
	 */
	private static function remember_plugin_templates( array $templates ) {
		$known = (array) get_option( self::PLUGIN_TEMPLATES_OPTION, array() );
		$next  = $known;

		foreach ( $templates as $id => $template ) {
			if ( ! empty( $template['plugin'] ) ) {
				$next[ $id ] = (string) $template['plugin'];
			}
		}

		if ( $next !== $known ) {
			update_option( self::PLUGIN_TEMPLATES_OPTION, $next, false );
		}
	}

	/**
	 * Plugins that offer templates right now, with the ids of their templates.
	 *
	 * @return array<string, string[]> Plugin name => template ids.
	 */
	public static function plugins() {
		$out = array();

		foreach ( self::all() as $id => $template ) {
			if ( ! empty( $template['plugin'] ) ) {
				$out[ $template['plugin'] ][] = $id;
			}
		}

		return $out;
	}

	/**
	 * Fields a template needs to keep, by template id then field key. A locked field is always
	 * required (`required`) and/or can't be removed from the form (`delete` => false). A plugin adds
	 * its own with the `vuloform_template_locked_fields` filter; the builder enforces them.
	 *
	 * @return array<string, array<string, array{required?: bool, delete?: bool}>>
	 */
	public static function locked_fields() {
		/**
		 * Filters the fields a template locks.
		 *
		 * @param array $locked Template id => field key => array( 'required' => bool, 'delete' => bool ).
		 */
		return (array) apply_filters( 'vuloform_template_locked_fields', array() );
	}

	/**
	 * Forms that can't be deleted, because something depends on them (a plugin's registration form,
	 * for example). A plugin adds its form's id with the `vuloform_protected_forms` filter.
	 *
	 * @return int[]
	 */
	public static function protected_form_ids() {
		return array_values( array_unique( array_filter( array_map( 'absint', (array) apply_filters( 'vuloform_protected_forms', array() ) ) ) ) );
	}

	/**
	 * Ids of plugin templates that are not offered right now, because their plugin is off.
	 *
	 * @return string[]
	 */
	public static function unavailable() {
		$known = array_keys( (array) get_option( self::PLUGIN_TEMPLATES_OPTION, array() ) );

		return $known ? array_values( array_diff( $known, array_keys( self::all() ) ) ) : array();
	}

	/**
	 * The builder's field library for each template that has its own, keyed by template id. A form
	 * started from any other template (or none) gets the standard library.
	 *
	 * Each group is `id`, `label` and `items`. An item is a field type id, or an array describing a
	 * ready-made field: `id`, `type`, `label`, `icon`, and optionally `key`, `placeholder` and
	 * `unique` (it can be added only once).
	 *
	 * @return array<string, array<int, array{id: string, label: string, items: array}>>
	 */
	public static function palettes() {
		$palettes = array(
		);

		/**
		 * Filters the template field libraries.
		 *
		 * @param array $palettes Template id => groups.
		 */
		return (array) apply_filters( 'vuloform_template_palettes', $palettes );
	}

	/**
	 * The notification every new form starts with: an email to the site's admin address for each
	 * submission. A form that tells nobody is almost never what was meant.
	 *
	 * @param string $reply_to Key of the form's email field, so a reply goes to the visitor; '' for none.
	 * @return array
	 */
	public static function admin_notification( $reply_to = '' ) {
		return array(
			'id'       => 'admin',
			'name'     => __( 'Admin notification', 'vuloform' ),
			'enabled'  => true,
			'channel'  => 'email',
			'to'       => get_option( 'admin_email' ),
			'subject'  => __( 'New submission: {form_title}', 'vuloform' ),
			'message'  => '{all_fields}',
			'reply_to' => $reply_to,
		);
	}

	/**
	 * @param string $type  Field type.
	 * @param string $label Label.
	 * @param array  $extra Other field settings.
	 * @return array
	 */
	public static function field( $type, $label, array $extra = array() ) {
		return array_merge(
			array(
				'type'  => $type,
				'label' => $label,
			),
			$extra
		);
	}

	/**
	 * @param string[] $labels Option labels; each is also its value.
	 * @return array
	 */
	public static function options( array $labels ) {
		$options = array();

		foreach ( $labels as $label ) {
			$options[] = array(
				'label' => $label,
				'value' => $label,
			);
		}

		return $options;
	}
}
