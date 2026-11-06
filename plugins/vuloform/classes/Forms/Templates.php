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
	 * Plugin name => the ids of the templates it offers (the "Needs %s" badge / plugin filter
	 * tabs on the templates picker) - built from each template's own `plugin` key. No template
	 * declares one yet, so this is empty until one does.
	 *
	 * @return array<string, array<int, string>>
	 */
	public static function plugins() {
		$plugins = array();

		foreach ( self::all() as $id => $template ) {
			if ( ! empty( $template['plugin'] ) ) {
				$plugins[ $template['plugin'] ][] = $id;
			}
		}

		return $plugins;
	}

	/**
	 * Ids of templates whose own `plugin` isn't active right now, so a form already made from one
	 * stays hidden instead of orphaned (FormRepository::hidden_template_clauses()). Empty for the
	 * same reason plugins() is - no template declares a `plugin` key yet.
	 *
	 * @return array<int, string>
	 */
	public static function unavailable() {
		return array();
	}

	/**
	 * Ids of forms a plugin depends on existing, so the list can't delete them (`protected_error()`
	 * in Rest\Forms.php). No template is flagged `protected` yet, so none are.
	 *
	 * @return array<int, int>
	 */
	public static function protected_form_ids() {
		return array();
	}

	/**
	 * @return array<string, array{title: string, desc: string, icon: string, category: string, schema: array}>
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
		// Used both as an RSVP option and as what its own conditional fields check for.
		$rsvp_yes = __( 'Yes, I will be there', 'vuloform' );

		$templates = array(
			'contact'           => array(
				'title'  => __( 'Contact form', 'vuloform' ),
				'category' => __( 'Business Operations', 'vuloform' ),
				'desc'   => __( 'Name, email and a message.', 'vuloform' ),
				'icon'   => 'mail',
				'fields' => array( $name, $email, self::field( 'text', __( 'Subject', 'vuloform' ) ), $message ),
			),
			'inquiry'           => array(
				'title'  => __( 'General inquiry', 'vuloform' ),
				'category' => __( 'Business Operations', 'vuloform' ),
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
			'lead'              => array(
				'title'  => __( 'Lead generation', 'vuloform' ),
				'category' => __( 'Business Operations', 'vuloform' ),
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
						array( 'conditions' => self::show_if( 'enquiring_as', __( 'A business', 'vuloform' ) ) )
					),
					self::field( 'textarea', __( 'What are you looking for?', 'vuloform' ) ),
					$consent,
				),
			),
			'newsletter'        => array(
				'title'  => __( 'Newsletter signup', 'vuloform' ),
				'category' => __( 'Sign-up', 'vuloform' ),
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
			'feedback'          => array(
				'title'  => __( 'Feedback form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
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
			'survey'            => array(
				'title'  => __( 'Survey', 'vuloform' ),
				'category' => __( 'Feedback & survey', 'vuloform' ),
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
			'event'             => array(
				'title'  => __( 'Event registration', 'vuloform' ),
				'category' => __( 'Event Planning', 'vuloform' ),
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
			'job'               => array(
				'title'  => __( 'Job application', 'vuloform' ),
				'category' => __( 'Business Operations', 'vuloform' ),
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
			'support'           => array(
				'title'  => __( 'Support request', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
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
			'quote'             => array(
				'title'  => __( 'Order or quote inquiry', 'vuloform' ),
				'category' => __( 'Business Operations', 'vuloform' ),
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
			'donation'          => array(
				'title'  => __( 'Donation form', 'vuloform' ),
				'category' => __( 'Payment', 'vuloform' ),
				'desc'   => __( 'A preset or custom amount, with donor details.', 'vuloform' ),
				'icon'   => 'dollar',
				'fields' => array(
					self::field(
						'radio',
						__( 'Donation amount', 'vuloform' ),
						array(
							'key'      => 'preset_amount',
							'required' => true,
							'options'  => self::options( array( '$10', '$25', '$50', '$100', __( 'Other amount', 'vuloform' ) ) ),
						)
					),
					self::field(
						'number',
						__( 'Enter your amount', 'vuloform' ),
						array(
							'key'        => 'custom_amount',
							'required'   => true,
							'min'        => '1',
							'conditions' => self::show_if( 'preset_amount', __( 'Other amount', 'vuloform' ) ),
						)
					),
					$name,
					$email,
					self::field( 'textarea', __( 'Message (optional)', 'vuloform' ) ),
					self::field(
						'consent',
						__( 'Consent', 'vuloform' ),
						array(
							'required'     => true,
							'consent_text' => __( 'I agree to my details being stored to process this donation.', 'vuloform' ),
						)
					),
				),
				'submit' => __( 'Donate', 'vuloform' ),
			),
			'complaint'         => array(
				'title'  => __( 'Customer complaint form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'   => __( 'Order reference, category and details of the issue.', 'vuloform' ),
				'icon'   => 'report',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field( 'text', __( 'Order or reference number', 'vuloform' ) ),
					self::field(
						'select',
						__( 'Complaint category', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Product quality', 'vuloform' ), __( 'Service', 'vuloform' ), __( 'Billing', 'vuloform' ), __( 'Delivery', 'vuloform' ), __( 'Other', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'Describe the issue', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'textarea', __( 'What resolution would you like?', 'vuloform' ) ),
				),
				'submit' => __( 'Submit complaint', 'vuloform' ),
			),
			'event_feedback'    => array(
				'title'  => __( 'Event feedback form', 'vuloform' ),
				'category' => __( 'Feedback & survey', 'vuloform' ),
				'desc'   => __( 'A rating and comments about an event just attended.', 'vuloform' ),
				'icon'   => 'review',
				'fields' => array(
					self::field( 'text', __( 'Which event did you attend?', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'radio',
						__( 'How would you rate the event?', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Excellent', 'vuloform' ), __( 'Good', 'vuloform' ), __( 'Average', 'vuloform' ), __( 'Poor', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'What did you like most?', 'vuloform' ) ),
					self::field( 'textarea', __( 'What could we improve?', 'vuloform' ) ),
					self::field( 'email', __( 'Email (optional)', 'vuloform' ), array( 'description' => __( 'Only if you would like a reply.', 'vuloform' ) ) ),
				),
				'submit' => __( 'Send feedback', 'vuloform' ),
			),
			'home_service'      => array(
				'title'  => __( 'Home service request form', 'vuloform' ),
				'category' => __( 'Business Operations', 'vuloform' ),
				'desc'   => __( 'Service address, type of service and a preferred time.', 'vuloform' ),
				'icon'   => 'home',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field( 'address', __( 'Service address', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'select',
						__( 'Type of service', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Cleaning', 'vuloform' ), __( 'Plumbing', 'vuloform' ), __( 'Electrical', 'vuloform' ), __( 'Repairs', 'vuloform' ), __( 'Other', 'vuloform' ) ) ),
						)
					),
					self::field(
                        'date',
                        __( 'Preferred date', 'vuloform' ),
                        array(
							'required' => true,
							'width'    => 50,
                        )
                    ),
					self::field( 'time', __( 'Preferred time', 'vuloform' ), array( 'width' => 50 ) ),
					self::field( 'textarea', __( 'Details', 'vuloform' ) ),
				),
				'submit' => __( 'Request service', 'vuloform' ),
			),
			'reservation'       => array(
				'title'  => __( 'Restaurant reservation form', 'vuloform' ),
				'category' => __( 'Event Planning', 'vuloform' ),
				'desc'   => __( 'Date, time and party size for a table booking.', 'vuloform' ),
				'icon'   => 'booking',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field(
                        'date',
                        __( 'Reservation date', 'vuloform' ),
                        array(
							'required' => true,
							'width'    => 50,
                        )
                    ),
					self::field(
                        'time',
                        __( 'Reservation time', 'vuloform' ),
                        array(
							'required' => true,
							'width'    => 50,
                        )
                    ),
					self::field(
						'number',
						__( 'Number of guests', 'vuloform' ),
						array(
							'key'      => 'guests',
							'required' => true,
							'default'  => '2',
							'min'      => '1',
							'max'      => '20',
						)
					),
					self::field( 'textarea', __( 'Special requests (optional)', 'vuloform' ) ),
				),
				'submit' => __( 'Reserve a table', 'vuloform' ),
			),
			'rsvp'              => array(
				'title'  => __( 'RSVP form', 'vuloform' ),
				'category' => __( 'Event Planning', 'vuloform' ),
				'desc'   => __( 'Attendance, guest count and dietary needs for an invitation.', 'vuloform' ),
				'icon'   => 'check',
				'fields' => array(
					$name,
					$email,
					self::field(
						'radio',
						__( 'Will you be attending?', 'vuloform' ),
						array(
							'key'      => 'attending',
							'required' => true,
							'options'  => self::options( array( $rsvp_yes, __( 'No, I cannot make it', 'vuloform' ), __( 'Maybe', 'vuloform' ) ) ),
						)
					),
					self::field(
						'number',
						__( 'Number of guests, including you', 'vuloform' ),
						array(
							'key'        => 'guest_count',
							'default'    => '1',
							'min'        => '1',
							'max'        => '10',
							'conditions' => self::show_if( 'attending', $rsvp_yes ),
						)
					),
					self::field(
						'textarea',
						__( 'Dietary restrictions (optional)', 'vuloform' ),
						array( 'conditions' => self::show_if( 'attending', $rsvp_yes ) )
					),
					self::field( 'textarea', __( 'Message (optional)', 'vuloform' ) ),
				),
				'submit' => __( 'Send RSVP', 'vuloform' ),
			),
			'registration'      => array(
				'title'  => __( 'Registration form', 'vuloform' ),
				'category' => __( 'Sign-up', 'vuloform' ),
				'desc'   => __( 'Sign up for an account, membership or program.', 'vuloform' ),
				'icon'   => 'user-circle',
				'fields' => array(
					$name,
					$email,
					self::field( 'text', __( 'Username', 'vuloform' ), array( 'required' => true ) ),
					self::field(
                        'password',
                        __( 'Password', 'vuloform' ),
                        array(
							'required'  => true,
							'minlength' => 8,
                        )
                    ),
					$consent,
				),
				'submit' => __( 'Register', 'vuloform' ),
			),
			'appointment'       => array(
				'title'  => __( 'Appointment booking form', 'vuloform' ),
				'category' => __( 'Event Planning', 'vuloform' ),
				'desc'   => __( 'Service, preferred date and time, and contact details.', 'vuloform' ),
				'icon'   => 'appointment',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field(
						'select',
						__( 'Service', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Consultation', 'vuloform' ), __( 'Follow-up', 'vuloform' ), __( 'Other', 'vuloform' ) ) ),
						)
					),
					self::field(
                        'date',
                        __( 'Preferred date', 'vuloform' ),
                        array(
							'required' => true,
							'width'    => 50,
                        )
                    ),
					self::field( 'time', __( 'Preferred time', 'vuloform' ), array( 'width' => 50 ) ),
					self::field( 'textarea', __( 'Notes (optional)', 'vuloform' ) ),
				),
				'submit' => __( 'Book appointment', 'vuloform' ),
			),
			'order'             => array(
				'title'  => __( 'Order form', 'vuloform' ),
				'category' => __( 'Business Operations', 'vuloform' ),
				'desc'   => __( 'Item, quantity and delivery details for a small business order.', 'vuloform' ),
				'icon'   => 'order',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field( 'text', __( 'Product or item', 'vuloform' ), array( 'required' => true ) ),
					self::field(
                        'number',
                        __( 'Quantity', 'vuloform' ),
                        array(
							'required' => true,
							'default'  => '1',
							'min'      => '1',
                        )
                    ),
					self::field( 'address', __( 'Delivery address', 'vuloform' ) ),
					self::field( 'textarea', __( 'Notes (optional)', 'vuloform' ) ),
				),
				'submit' => __( 'Place order', 'vuloform' ),
			),
			'volunteer'         => array(
				'title'  => __( 'Volunteer sign-up form', 'vuloform' ),
				'category' => __( 'Sign-up', 'vuloform' ),
				'desc'   => __( 'Availability and areas of interest for volunteering.', 'vuloform' ),
				'icon'   => 'global-community',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field(
						'checkboxes',
						__( 'When are you available?', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Weekdays', 'vuloform' ), __( 'Weekends', 'vuloform' ), __( 'Evenings', 'vuloform' ) ) ) )
					),
					self::field(
						'checkboxes',
						__( 'Areas you are interested in', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Events', 'vuloform' ), __( 'Admin support', 'vuloform' ), __( 'Fundraising', 'vuloform' ), __( 'On-site help', 'vuloform' ) ) ) )
					),
					self::field( 'textarea', __( 'Anything else you would like to share?', 'vuloform' ) ),
				),
				'submit' => __( 'Sign up to volunteer', 'vuloform' ),
			),
			'enrollment'        => array(
				'title'  => __( 'Course enrollment form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'   => __( 'Student details and the course they want to join.', 'vuloform' ),
				'icon'   => 'classroom-enrollment',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field( 'text', __( 'Course', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'date', __( 'Preferred start date', 'vuloform' ) ),
					self::field( 'textarea', __( 'Anything we should know?', 'vuloform' ) ),
				),
				'submit' => __( 'Enroll now', 'vuloform' ),
			),
			'real_estate'       => array(
				'title'  => __( 'Real estate inquiry form', 'vuloform' ),
				'category' => __( 'Business Operations', 'vuloform' ),
				'desc'   => __( 'Property interest and contact details for a viewing or more information.', 'vuloform' ),
				'icon'   => 'location',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field( 'text', __( 'Property of interest', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'select',
						__( 'Budget range', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Under $200,000', 'vuloform' ), __( '$200,000 - $500,000', 'vuloform' ), __( '$500,000 - $1,000,000', 'vuloform' ), __( 'Over $1,000,000', 'vuloform' ) ) ) )
					),
					self::field( 'textarea', __( 'Message', 'vuloform' ) ),
				),
				'submit' => __( 'Send inquiry', 'vuloform' ),
			),
			'medical_history'   => array(
				'title'  => __( 'Medical history form', 'vuloform' ),
				'category' => __( 'Healthcare', 'vuloform' ),
				'desc'   => __( 'Patient details and health background for a provider.', 'vuloform' ),
				'icon'   => 'file-submission',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field( 'date', __( 'Date of birth', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'textarea', __( 'Known allergies', 'vuloform' ) ),
					self::field( 'textarea', __( 'Current medications', 'vuloform' ) ),
					self::field(
						'consent',
						__( 'Consent', 'vuloform' ),
						array(
							'required'     => true,
							'consent_text' => __( 'I agree to this health information being stored and used to provide my care.', 'vuloform' ),
						)
					),
				),
				'submit' => __( 'Submit health history', 'vuloform' ),
			),
			'travel'            => array(
				'title'  => __( 'Travel booking form', 'vuloform' ),
				'category' => __( 'Event Planning', 'vuloform' ),
				'desc'   => __( 'Destination, dates and traveler details for a trip request.', 'vuloform' ),
				'icon'   => 'booking1',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field( 'text', __( 'Destination', 'vuloform' ), array( 'required' => true ) ),
					self::field(
                        'date',
                        __( 'Departure date', 'vuloform' ),
                        array(
							'required' => true,
							'width'    => 50,
                        )
                    ),
					self::field( 'date', __( 'Return date', 'vuloform' ), array( 'width' => 50 ) ),
					self::field(
                        'number',
                        __( 'Number of travelers', 'vuloform' ),
                        array(
							'default' => '1',
							'min'     => '1',
                        )
                    ),
					self::field( 'textarea', __( 'Message', 'vuloform' ) ),
				),
				'submit' => __( 'Request booking', 'vuloform' ),
			),
			'rma'               => array(
				'title'    => __( 'Return request (RMA) form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'   => __( 'Order number, item and reason for a return.', 'vuloform' ),
				'icon'   => 'return-and-warrenty',
				'fields' => array(
					$name,
					$email,
					self::field( 'text', __( 'Order number', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Item', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'select',
						__( 'Reason for return', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Defective', 'vuloform' ), __( 'Wrong item received', 'vuloform' ), __( 'No longer needed', 'vuloform' ), __( 'Other', 'vuloform' ) ) ),
						)
					),
					self::field(
						'select',
						__( 'Preferred resolution', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Refund', 'vuloform' ), __( 'Replacement', 'vuloform' ), __( 'Store credit', 'vuloform' ) ) ) )
					),
					self::field( 'textarea', __( 'Details', 'vuloform' ) ),
				),
				'submit' => __( 'Submit return request', 'vuloform' ),
			),
			'course_evaluation' => array(
				'title'  => __( 'Course evaluation form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'   => __( 'Rating and feedback on a course just completed.', 'vuloform' ),
				'icon'   => 'thumbs-ok',
				'fields' => array(
					self::field( 'text', __( 'Course name', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'radio',
						__( 'How would you rate the instructor?', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Excellent', 'vuloform' ), __( 'Good', 'vuloform' ), __( 'Average', 'vuloform' ), __( 'Poor', 'vuloform' ) ) ),
						)
					),
					self::field(
						'radio',
						__( 'How would you rate the course content?', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Excellent', 'vuloform' ), __( 'Good', 'vuloform' ), __( 'Average', 'vuloform' ), __( 'Poor', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'What did you like most?', 'vuloform' ) ),
					self::field( 'textarea', __( 'What could be improved?', 'vuloform' ) ),
					self::field( 'email', __( 'Email (optional)', 'vuloform' ) ),
				),
				'submit' => __( 'Submit evaluation', 'vuloform' ),
			),
			'conference'        => array(
				'title'  => __( 'Conference registration form', 'vuloform' ),
				'category' => __( 'Event Planning', 'vuloform' ),
				'desc'   => __( 'Attendee details and session choices for a conference.', 'vuloform' ),
				'icon'   => 'announcement',
				'fields' => array(
					$name,
					$email,
					$phone,
					self::field( 'text', __( 'Organization', 'vuloform' ) ),
					self::field(
						'checkboxes',
						__( 'Which sessions are you interested in?', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Keynote', 'vuloform' ), __( 'Workshops', 'vuloform' ), __( 'Networking', 'vuloform' ), __( 'Panel discussions', 'vuloform' ) ) ) )
					),
					self::field( 'textarea', __( 'Dietary requirements (optional)', 'vuloform' ) ),
				),
				'submit' => __( 'Register for the conference', 'vuloform' ),
			),
			'fitness'           => array(
				'title'    => __( 'Fitness class registration form', 'vuloform' ),
				'category' => __( 'Event Planning', 'vuloform' ),
				'desc'     => __( 'Class choice, preferred schedule and an emergency contact.', 'vuloform' ),
				'icon'     => 'active',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field(
						'select',
						__( 'Class', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Yoga', 'vuloform' ), __( 'Pilates', 'vuloform' ), __( 'Spin', 'vuloform' ), __( 'Strength training', 'vuloform' ), __( 'Other', 'vuloform' ) ) ),
						)
					),
					self::field(
						'select',
						__( 'Preferred schedule', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Morning', 'vuloform' ), __( 'Afternoon', 'vuloform' ), __( 'Evening', 'vuloform' ) ) ) )
					),
					self::field( 'text', __( 'Emergency contact name', 'vuloform' ) ),
					self::field( 'phone', __( 'Emergency contact phone', 'vuloform' ) ),
				),
				'submit' => __( 'Register for class', 'vuloform' ),
			),
			'bmi_calculator'    => array(
				'title'    => __( 'BMI calculator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'Weight and height, with the body mass index worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Weight (kg)', 'vuloform' ),
						array(
							'key'      => 'weight_kg',
							'required' => true,
							'min'      => '1',
							'width'    => 50,
						)
					),
					self::field(
						'number',
						__( 'Height (m)', 'vuloform' ),
						array(
							'key'      => 'height_m',
							'required' => true,
							'min'      => '0.5',
							'width'    => 50,
						)
					),
					self::field(
						'calculation',
						__( 'Your BMI', 'vuloform' ),
						array(
							'formula'  => '{weight_kg} / ({height_m} * {height_m})',
							'decimals' => 1,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'interest_calculator' => array(
				'title'    => __( 'Simple interest calculator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'Principal, rate and time, with the interest worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Principal amount', 'vuloform' ),
						array(
							'key'      => 'principal',
							'required' => true,
							'min'      => '0',
						)
					),
					self::field(
						'number',
						__( 'Annual interest rate (%)', 'vuloform' ),
						array(
							'key'      => 'rate',
							'required' => true,
							'min'      => '0',
							'width'    => 50,
						)
					),
					self::field(
						'number',
						__( 'Time (years)', 'vuloform' ),
						array(
							'key'      => 'years',
							'required' => true,
							'min'      => '0',
							'width'    => 50,
						)
					),
					self::field(
						'calculation',
						__( 'Interest', 'vuloform' ),
						array(
							'formula'  => '{principal} * {rate} * {years} / 100',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'grade_calculator'  => array(
				'title'    => __( 'Grade average calculator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'Three scores, with the average worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field( 'number', __( 'Score 1', 'vuloform' ), array( 'key' => 'score1', 'required' => true, 'min' => '0', 'max' => '100', 'width' => 33 ) ),
					self::field( 'number', __( 'Score 2', 'vuloform' ), array( 'key' => 'score2', 'required' => true, 'min' => '0', 'max' => '100', 'width' => 33 ) ),
					self::field( 'number', __( 'Score 3', 'vuloform' ), array( 'key' => 'score3', 'required' => true, 'min' => '0', 'max' => '100', 'width' => 33 ) ),
					self::field(
						'calculation',
						__( 'Average', 'vuloform' ),
						array(
							'formula'  => '({score1} + {score2} + {score3}) / 3',
							'decimals' => 1,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'photography_booking' => array(
				'title'    => __( 'Photography booking form', 'vuloform' ),
				'category' => __( 'Entertainment', 'vuloform' ),
				'desc'     => __( 'Session type, date and location for a photography booking.', 'vuloform' ),
				'icon'     => 'calendar',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field(
						'select',
						__( 'Session type', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Wedding', 'vuloform' ), __( 'Portrait', 'vuloform' ), __( 'Event', 'vuloform' ), __( 'Product', 'vuloform' ), __( 'Other', 'vuloform' ) ) ),
						)
					),
					self::field(
						'date',
						__( 'Preferred date', 'vuloform' ),
						array( 'required' => true, 'width' => 50 )
					),
					self::field( 'text', __( 'Location', 'vuloform' ), array( 'width' => 50 ) ),
					self::field( 'textarea', __( 'Tell us about the shoot', 'vuloform' ) ),
				),
				'submit' => __( 'Request booking', 'vuloform' ),
			),
			'talent_audition'   => array(
				'title'    => __( 'Talent show audition signup', 'vuloform' ),
				'category' => __( 'Entertainment', 'vuloform' ),
				'desc'     => __( 'Act type, performance details and a video or image upload.', 'vuloform' ),
				'icon'     => 'star',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field(
						'select',
						__( 'Act type', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Singing', 'vuloform' ), __( 'Dancing', 'vuloform' ), __( 'Comedy', 'vuloform' ), __( 'Magic', 'vuloform' ), __( 'Other', 'vuloform' ) ) ),
						)
					),
					self::field( 'text', __( 'Title of your performance', 'vuloform' ) ),
					self::field(
						'number',
						__( 'Performance length (minutes)', 'vuloform' ),
						array( 'required' => true, 'min' => '1', 'max' => '15' )
					),
					self::field( 'textarea', __( 'Special requirements (props, music, equipment)', 'vuloform' ) ),
				),
				'submit' => __( 'Sign up to audition', 'vuloform' ),
			),
			'appointment_reminder' => array(
				'title'    => __( 'Appointment confirmation form', 'vuloform' ),
				'category' => __( 'Healthcare', 'vuloform' ),
				'desc'     => __( 'Lets a patient confirm, reschedule or cancel an upcoming appointment.', 'vuloform' ),
				'icon'     => 'appointment',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'date', __( 'Appointment date', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'radio',
						__( 'Will you be attending?', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Yes, confirmed', 'vuloform' ), __( 'I need to reschedule', 'vuloform' ), __( 'I need to cancel', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'Notes (optional)', 'vuloform' ) ),
				),
				'submit' => __( 'Submit response', 'vuloform' ),
			),
			'fundraiser_pledge'    => array(
				'title'    => __( 'Fundraiser pledge form', 'vuloform' ),
				'category' => __( 'Nonprofit', 'vuloform' ),
				'desc'     => __( 'A one-time or recurring pledge amount, with donor details.', 'vuloform' ),
				'icon'     => 'dollar',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field(
						'number',
						__( 'Pledge amount', 'vuloform' ),
						array( 'key' => 'pledge_amount', 'required' => true, 'min' => '1' )
					),
					self::field(
						'radio',
						__( 'Pledge frequency', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'One-time', 'vuloform' ), __( 'Monthly', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'Message (optional)', 'vuloform' ) ),
					$consent,
				),
				'submit' => __( 'Make my pledge', 'vuloform' ),
			),
			'membership_application' => array(
				'title'    => __( 'Membership application form', 'vuloform' ),
				'category' => __( 'Nonprofit', 'vuloform' ),
				'desc'     => __( 'Contact details, membership type and how they heard about you.', 'vuloform' ),
				'icon'     => 'user-circle',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'address', __( 'Mailing address', 'vuloform' ) ),
					self::field(
						'select',
						__( 'Membership type', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Individual', 'vuloform' ), __( 'Family', 'vuloform' ), __( 'Student', 'vuloform' ), __( 'Lifetime', 'vuloform' ) ) ),
						)
					),
					self::field( 'text', __( 'How did you hear about us?', 'vuloform' ) ),
					$consent,
				),
				'submit' => __( 'Apply for membership', 'vuloform' ),
			),
			'webinar_registration' => array(
				'title'    => __( 'Webinar registration form', 'vuloform' ),
				'category' => __( 'Marketing', 'vuloform' ),
				'desc'     => __( 'Attendee details and the session they want to join.', 'vuloform' ),
				'icon'     => 'notification',
				'fields'   => array(
					$name,
					$email,
					self::field( 'text', __( 'Company (optional)', 'vuloform' ) ),
					self::field(
						'select',
						__( 'Which session would you like to join?', 'vuloform' ),
						array( 'required' => true, 'options' => self::options( array( __( 'Morning session', 'vuloform' ), __( 'Afternoon session', 'vuloform' ) ) ) )
					),
					self::field(
						'consent',
						__( 'Consent', 'vuloform' ),
						array(
							'required'     => true,
							'consent_text' => __( 'Send me the webinar link and occasional updates by email.', 'vuloform' ),
						)
					),
				),
				'submit' => __( 'Reserve my seat', 'vuloform' ),
			),
			'coupon_signup'        => array(
				'title'    => __( 'Coupon signup form', 'vuloform' ),
				'category' => __( 'Marketing', 'vuloform' ),
				'desc'     => __( 'An email address in exchange for a discount code.', 'vuloform' ),
				'icon'     => 'dollar',
				'fields'   => array(
					$email,
					self::field(
						'consent',
						__( 'Consent', 'vuloform' ),
						array(
							'required'     => true,
							'consent_text' => __( 'Email me the discount code and future offers. I can unsubscribe at any time.', 'vuloform' ),
						)
					),
				),
				'submit' => __( 'Get my discount', 'vuloform' ),
			),
			'address_change'       => array(
				'title'    => __( 'Change of address form', 'vuloform' ),
				'category' => __( 'Personal', 'vuloform' ),
				'desc'     => __( 'Old and new address, for updating someone\'s records.', 'vuloform' ),
				'icon'     => 'location',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'address', __( 'Previous address', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'address', __( 'New address', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'date', __( 'Effective date', 'vuloform' ) ),
				),
				'submit' => __( 'Submit change', 'vuloform' ),
			),
			'tip_calculator'       => array(
				'title'    => __( 'Tip calculator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'Bill amount, tip percentage and number of people, split automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Bill amount', 'vuloform' ),
						array( 'key' => 'bill', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Tip percentage', 'vuloform' ),
						array( 'key' => 'tip_percent', 'required' => true, 'default' => '15', 'min' => '0', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Number of people', 'vuloform' ),
						array( 'key' => 'people', 'required' => true, 'default' => '1', 'min' => '1' )
					),
					self::field(
						'calculation',
						__( 'Tip amount', 'vuloform' ),
						array(
							'formula'  => '{bill} * {tip_percent} / 100',
							'decimals' => 2,
						)
					),
					self::field(
						'calculation',
						__( 'Total per person', 'vuloform' ),
						array(
							'formula'  => '({bill} + {bill} * {tip_percent} / 100) / {people}',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'discount_calculator'  => array(
				'title'    => __( 'Discount calculator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'Original price and discount percentage, with the final price worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Original price', 'vuloform' ),
						array( 'key' => 'price', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Discount (%)', 'vuloform' ),
						array( 'key' => 'discount_percent', 'required' => true, 'min' => '0', 'max' => '100', 'width' => 50 )
					),
					self::field(
						'calculation',
						__( 'You save', 'vuloform' ),
						array(
							'formula'  => '{price} * {discount_percent} / 100',
							'decimals' => 2,
						)
					),
					self::field(
						'calculation',
						__( 'Final price', 'vuloform' ),
						array(
							'formula'  => '{price} - ( {price} * {discount_percent} / 100 )',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'shipping_calculator'  => array(
				'title'    => __( 'Shipping cost calculator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'Package weight and a per-kg rate, with the shipping cost worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Package weight (kg)', 'vuloform' ),
						array( 'key' => 'weight', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Rate per kg', 'vuloform' ),
						array( 'key' => 'rate', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Base handling fee', 'vuloform' ),
						array( 'key' => 'base_fee', 'default' => '0', 'min' => '0' )
					),
					self::field(
						'calculation',
						__( 'Estimated shipping cost', 'vuloform' ),
						array(
							'formula'  => '{weight} * {rate} + {base_fee}',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'loan_payment_estimator' => array(
				'title'    => __( 'Loan payment estimator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'Loan amount and number of months, with an even monthly payment worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Loan amount', 'vuloform' ),
						array( 'key' => 'loan_amount', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Number of months', 'vuloform' ),
						array( 'key' => 'months', 'required' => true, 'min' => '1', 'width' => 50 )
					),
					self::field(
						'calculation',
						__( 'Estimated monthly payment', 'vuloform' ),
						array(
							'formula'  => '{loan_amount} / {months}',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'student_budget_calculator' => array(
				'title'    => __( 'Student budget calculator', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( 'Monthly income and expenses, with the amount left over worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Monthly income', 'vuloform' ),
						array( 'key' => 'income', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Monthly expenses', 'vuloform' ),
						array( 'key' => 'expenses', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'calculation',
						__( 'Left over', 'vuloform' ),
						array(
							'formula'  => '{income} - {expenses}',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'final_grade_calculator' => array(
				'title'    => __( 'Final grade calculator', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( 'Coursework and exam scores weighted by percentage, with the final grade worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Coursework score', 'vuloform' ),
						array( 'key' => 'coursework_score', 'required' => true, 'min' => '0', 'max' => '100', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Coursework weight (%)', 'vuloform' ),
						array( 'key' => 'coursework_weight', 'required' => true, 'default' => '40', 'min' => '0', 'max' => '100', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Exam score', 'vuloform' ),
						array( 'key' => 'exam_score', 'required' => true, 'min' => '0', 'max' => '100', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Exam weight (%)', 'vuloform' ),
						array( 'key' => 'exam_weight', 'required' => true, 'default' => '60', 'min' => '0', 'max' => '100', 'width' => 50 )
					),
					self::field(
						'calculation',
						__( 'Final grade', 'vuloform' ),
						array(
							'formula'  => '( {coursework_score} * {coursework_weight} + {exam_score} * {exam_weight} ) / 100',
							'decimals' => 1,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'square_footage_calculator' => array(
				'title'    => __( 'Square footage calculator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'Length and width, with the area worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Length (ft)', 'vuloform' ),
						array( 'key' => 'length_ft', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Width (ft)', 'vuloform' ),
						array( 'key' => 'width_ft', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'calculation',
						__( 'Area (sq ft)', 'vuloform' ),
						array(
							'formula'  => '{length_ft} * {width_ft}',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'length_converter' => array(
				'title'    => __( 'Length unit converter', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'A length in meters, converted to feet automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Length (meters)', 'vuloform' ),
						array( 'key' => 'meters', 'required' => true, 'min' => '0' )
					),
					self::field(
						'calculation',
						__( 'Length (feet)', 'vuloform' ),
						array(
							'formula'  => '{meters} * 3.28084',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'percentage_calculator' => array(
				'title'    => __( 'Percentage calculator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'A part and a whole, with the percentage worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Part', 'vuloform' ),
						array( 'key' => 'part', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Whole', 'vuloform' ),
						array( 'key' => 'whole', 'required' => true, 'min' => '1', 'width' => 50 )
					),
					self::field(
						'calculation',
						__( 'Percentage', 'vuloform' ),
						array(
							'formula'  => '{part} / {whole} * 100',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'fuel_cost_calculator' => array(
				'title'    => __( 'Fuel cost calculator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'Trip distance, fuel economy and fuel price, with the trip cost worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Trip distance (miles)', 'vuloform' ),
						array( 'key' => 'distance', 'required' => true, 'min' => '0' )
					),
					self::field(
						'number',
						__( 'Fuel economy (miles per gallon)', 'vuloform' ),
						array( 'key' => 'mpg', 'required' => true, 'min' => '1', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Fuel price per gallon', 'vuloform' ),
						array( 'key' => 'fuel_price', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'calculation',
						__( 'Estimated fuel cost', 'vuloform' ),
						array(
							'formula'  => '{distance} / {mpg} * {fuel_price}',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'baking_converter'     => array(
				'title'    => __( 'Baking measurement converter', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'A quantity in cups, converted to grams automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Cups', 'vuloform' ),
						array( 'key' => 'cups', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Grams per cup for this ingredient', 'vuloform' ),
						array( 'key' => 'grams_per_cup', 'required' => true, 'default' => '120', 'min' => '0', 'width' => 50 )
					),
					self::field(
						'calculation',
						__( 'Grams', 'vuloform' ),
						array(
							'formula'  => '{cups} * {grams_per_cup}',
							'decimals' => 0,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'water_intake_calculator' => array(
				'title'    => __( 'Water intake calculator', 'vuloform' ),
				'category' => __( 'Healthcare', 'vuloform' ),
				'desc'     => __( 'Body weight, with a suggested daily water intake worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Weight (kg)', 'vuloform' ),
						array( 'key' => 'weight_kg', 'required' => true, 'min' => '1' )
					),
					self::field(
						'calculation',
						__( 'Suggested daily water intake (liters)', 'vuloform' ),
						array(
							'formula'  => '{weight_kg} * 0.033',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'volume_calculator'    => array(
				'title'    => __( 'Volume calculator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'Length, width and height, with the volume worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field( 'number', __( 'Length', 'vuloform' ), array( 'key' => 'length', 'required' => true, 'min' => '0', 'width' => 33 ) ),
					self::field( 'number', __( 'Width', 'vuloform' ), array( 'key' => 'width', 'required' => true, 'min' => '0', 'width' => 33 ) ),
					self::field( 'number', __( 'Height', 'vuloform' ), array( 'key' => 'height', 'required' => true, 'min' => '0', 'width' => 33 ) ),
					self::field(
						'calculation',
						__( 'Volume', 'vuloform' ),
						array(
							'formula'  => '{length} * {width} * {height}',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'days_to_years_calculator' => array(
				'title'    => __( 'Days to years calculator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'A number of days, converted to years automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Number of days', 'vuloform' ),
						array( 'key' => 'days', 'required' => true, 'min' => '0' )
					),
					self::field(
						'calculation',
						__( 'Years', 'vuloform' ),
						array(
							'formula'  => '{days} / 365',
							'decimals' => 2,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'horsepower_calculator' => array(
				'title'    => __( 'Engine horsepower calculator', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'Torque and engine speed, with horsepower worked out automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Torque (lb-ft)', 'vuloform' ),
						array( 'key' => 'torque', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'number',
						__( 'Engine speed (RPM)', 'vuloform' ),
						array( 'key' => 'rpm', 'required' => true, 'min' => '0', 'width' => 50 )
					),
					self::field(
						'calculation',
						__( 'Horsepower', 'vuloform' ),
						array(
							'formula'  => '{torque} * {rpm} / 5252',
							'decimals' => 1,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'storage_converter'    => array(
				'title'    => __( 'Digital storage unit converter', 'vuloform' ),
				'category' => __( 'Calculator', 'vuloform' ),
				'desc'     => __( 'A size in gigabytes, converted to megabytes automatically.', 'vuloform' ),
				'icon'     => 'commission',
				'fields'   => array(
					self::field(
						'number',
						__( 'Size (GB)', 'vuloform' ),
						array( 'key' => 'gb', 'required' => true, 'min' => '0' )
					),
					self::field(
						'calculation',
						__( 'Size (MB)', 'vuloform' ),
						array(
							'formula'  => '{gb} * 1024',
							'decimals' => 0,
						)
					),
				),
				'submit' => __( 'Calculate', 'vuloform' ),
			),
			'trivia_quiz'      => array(
				'title'    => __( 'Trivia quiz', 'vuloform' ),
				'category' => __( 'Quizzes', 'vuloform' ),
				'desc'     => __( 'A few multiple-choice questions and a place to collect the player\'s name.', 'vuloform' ),
				'icon'     => 'help',
				'fields'   => array(
					$name,
					$email,
					self::field( 'page_break', __( 'Page break', 'vuloform' ) ),
					self::field(
						'radio',
						__( 'Question 1', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Option A', 'vuloform' ), __( 'Option B', 'vuloform' ), __( 'Option C', 'vuloform' ), __( 'Option D', 'vuloform' ) ) ),
						)
					),
					self::field(
						'radio',
						__( 'Question 2', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Option A', 'vuloform' ), __( 'Option B', 'vuloform' ), __( 'Option C', 'vuloform' ), __( 'Option D', 'vuloform' ) ) ),
						)
					),
					self::field(
						'radio',
						__( 'Question 3', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Option A', 'vuloform' ), __( 'Option B', 'vuloform' ), __( 'Option C', 'vuloform' ), __( 'Option D', 'vuloform' ) ) ),
						)
					),
				),
				'submit' => __( 'Submit answers', 'vuloform' ),
			),
			'personality_quiz' => array(
				'title'    => __( 'Personality quiz', 'vuloform' ),
				'category' => __( 'Quizzes', 'vuloform' ),
				'desc'     => __( 'A light, fun quiz built from a few multiple-choice questions.', 'vuloform' ),
				'icon'     => 'star',
				'fields'   => array(
					$name,
					$email,
					self::field(
						'radio',
						__( 'How do you usually spend a free weekend?', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Outdoors', 'vuloform' ), __( 'At home relaxing', 'vuloform' ), __( 'Out with friends', 'vuloform' ), __( 'Working on a project', 'vuloform' ) ) ),
						)
					),
					self::field(
						'radio',
						__( 'Pick a color', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Blue', 'vuloform' ), __( 'Red', 'vuloform' ), __( 'Green', 'vuloform' ), __( 'Yellow', 'vuloform' ) ) ),
						)
					),
					self::field(
						'radio',
						__( 'Which best describes you?', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Planner', 'vuloform' ), __( 'Spontaneous', 'vuloform' ), __( 'Thinker', 'vuloform' ), __( 'Doer', 'vuloform' ) ) ),
						)
					),
				),
				'submit' => __( 'See my result', 'vuloform' ),
			),
			'accident_report'    => array(
				'title'    => __( 'Accident report form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Date, location and a description of what happened, with photo upload.', 'vuloform' ),
				'icon'     => 'report',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'date', __( 'Date of incident', 'vuloform' ), array( 'required' => true, 'width' => 50 ) ),
					self::field( 'time', __( 'Time of incident', 'vuloform' ), array( 'width' => 50 ) ),
					self::field( 'text', __( 'Location', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'textarea', __( 'What happened?', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'textarea', __( 'Was anyone injured?', 'vuloform' ) ),
					self::field(
						'file',
						__( 'Photos (optional)', 'vuloform' ),
						array(
							'allowed_types' => array( 'jpg', 'jpeg', 'png' ),
							'max_files'     => 5,
							'max_size_mb'   => 5,
						)
					),
				),
				'submit' => __( 'Submit report', 'vuloform' ),
			),
			'maintenance_request' => array(
				'title'    => __( 'Maintenance request form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Location, issue type and urgency for a maintenance request.', 'vuloform' ),
				'icon'     => 'tools',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'text', __( 'Unit or location', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'select',
						__( 'Issue type', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Plumbing', 'vuloform' ), __( 'Electrical', 'vuloform' ), __( 'HVAC', 'vuloform' ), __( 'Appliance', 'vuloform' ), __( 'Other', 'vuloform' ) ) ),
						)
					),
					self::field(
						'select',
						__( 'Urgency', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Low', 'vuloform' ), __( 'Normal', 'vuloform' ), __( 'Urgent', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'Describe the issue', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'file',
						__( 'Photo (optional)', 'vuloform' ),
						array(
							'allowed_types' => array( 'jpg', 'jpeg', 'png' ),
							'max_size_mb'   => 5,
						)
					),
				),
				'submit' => __( 'Submit request', 'vuloform' ),
			),
			'bug_tracker'        => array(
				'title'    => __( 'Bug tracker form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Severity, steps to reproduce and the environment it happened in.', 'vuloform' ),
				'icon'     => 'report',
				'fields'   => array(
					$name,
					$email,
					self::field( 'text', __( 'Bug title', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'select',
						__( 'Severity', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Low', 'vuloform' ), __( 'Medium', 'vuloform' ), __( 'High', 'vuloform' ), __( 'Critical', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'Steps to reproduce', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'textarea', __( 'Expected result', 'vuloform' ) ),
					self::field( 'textarea', __( 'Actual result', 'vuloform' ) ),
					self::field( 'text', __( 'Browser or device', 'vuloform' ) ),
					self::field(
						'file',
						__( 'Screenshot (optional)', 'vuloform' ),
						array(
							'allowed_types' => array( 'jpg', 'jpeg', 'png' ),
							'max_size_mb'   => 5,
						)
					),
				),
				'submit' => __( 'Submit bug', 'vuloform' ),
			),
			'cancellation_survey' => array(
				'title'    => __( 'Cancellation survey form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'A reason for leaving and a chance to share feedback.', 'vuloform' ),
				'icon'     => 'review',
				'fields'   => array(
					self::field(
						'select',
						__( 'Why are you cancelling?', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Too expensive', 'vuloform' ), __( 'Not using it enough', 'vuloform' ), __( 'Missing features', 'vuloform' ), __( 'Found an alternative', 'vuloform' ), __( 'Other', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'What could we have done better?', 'vuloform' ) ),
					self::field(
						'radio',
						__( 'Would you consider coming back in the future?', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Yes', 'vuloform' ), __( 'Maybe', 'vuloform' ), __( 'No', 'vuloform' ) ) ) )
					),
					self::field( 'email', __( 'Email (optional)', 'vuloform' ) ),
				),
				'submit' => __( 'Submit', 'vuloform' ),
			),
			'work_order'         => array(
				'title'    => __( 'Work order request form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Work type, location and priority for a job request.', 'vuloform' ),
				'icon'     => 'tools',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'address', __( 'Job site address', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Type of work', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'select',
						__( 'Priority', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Low', 'vuloform' ), __( 'Normal', 'vuloform' ), __( 'Urgent', 'vuloform' ) ) ) )
					),
					self::field( 'textarea', __( 'Details', 'vuloform' ), array( 'required' => true ) ),
				),
				'submit' => __( 'Submit work order', 'vuloform' ),
			),
			'it_service_request' => array(
				'title'    => __( 'IT service request form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Device, issue category and urgency for an IT support ticket.', 'vuloform' ),
				'icon'     => 'tools',
				'fields'   => array(
					$name,
					$email,
					self::field( 'text', __( 'Device or system', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'select',
						__( 'Issue category', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Hardware', 'vuloform' ), __( 'Software', 'vuloform' ), __( 'Network', 'vuloform' ), __( 'Account access', 'vuloform' ), __( 'Other', 'vuloform' ) ) ),
						)
					),
					self::field(
						'select',
						__( 'Urgency', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Low', 'vuloform' ), __( 'Normal', 'vuloform' ), __( 'Urgent', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'Describe the issue', 'vuloform' ), array( 'required' => true ) ),
				),
				'submit' => __( 'Submit request', 'vuloform' ),
			),
			'gdpr_erasure'       => array(
				'title'    => __( 'GDPR right to erasure request form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Lets someone ask you to delete the personal data you hold on them.', 'vuloform' ),
				'icon'     => 'lock',
				'fields'   => array(
					$name,
					$email,
					self::field( 'text', __( 'Account or customer reference (if known)', 'vuloform' ) ),
					self::field( 'textarea', __( 'Which data would you like deleted?', 'vuloform' ) ),
					self::field(
						'consent',
						__( 'Confirmation', 'vuloform' ),
						array(
							'required'     => true,
							'consent_text' => __( 'I confirm I am the person this data belongs to, or am authorized to act on their behalf.', 'vuloform' ),
						)
					),
				),
				'submit' => __( 'Submit request', 'vuloform' ),
			),
			'call_back_request'  => array(
				'title'    => __( 'Request a call back form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Phone number and preferred time for the team to call back.', 'vuloform' ),
				'icon'     => 'mail',
				'fields'   => array(
					$name,
					$phone,
					self::field(
						'select',
						__( 'Best time to call', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Morning', 'vuloform' ), __( 'Afternoon', 'vuloform' ), __( 'Evening', 'vuloform' ) ) ) )
					),
					self::field( 'textarea', __( 'What is this about?', 'vuloform' ) ),
				),
				'submit' => __( 'Request a call back', 'vuloform' ),
			),
			'account_opening'    => array(
				'title'    => __( 'Account opening form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Contact details, address and account type for a new account.', 'vuloform' ),
				'icon'     => 'user-circle',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'address', __( 'Address', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'select',
						__( 'Account type', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Personal', 'vuloform' ), __( 'Business', 'vuloform' ) ) ),
						)
					),
					$consent,
				),
				'submit' => __( 'Open account', 'vuloform' ),
			),
			'pest_control'       => array(
				'title'    => __( 'Pest control service request form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Pest type, property address and a preferred appointment time.', 'vuloform' ),
				'icon'     => 'home',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'address', __( 'Property address', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'select',
						__( 'Pest type', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Ants', 'vuloform' ), __( 'Rodents', 'vuloform' ), __( 'Termites', 'vuloform' ), __( 'Bed bugs', 'vuloform' ), __( 'Other', 'vuloform' ) ) ),
						)
					),
					self::field( 'date', __( 'Preferred date', 'vuloform' ), array( 'width' => 50 ) ),
					self::field( 'time', __( 'Preferred time', 'vuloform' ), array( 'width' => 50 ) ),
					self::field( 'textarea', __( 'Details', 'vuloform' ) ),
				),
				'submit' => __( 'Request service', 'vuloform' ),
			),
			'automobile_info'    => array(
				'title'    => __( 'Automobile information form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Owner and vehicle details, for service records or a trade-in.', 'vuloform' ),
				'icon'     => 'document',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'text', __( 'Make', 'vuloform' ), array( 'required' => true, 'width' => 50 ) ),
					self::field( 'text', __( 'Model', 'vuloform' ), array( 'required' => true, 'width' => 50 ) ),
					self::field( 'number', __( 'Year', 'vuloform' ), array( 'required' => true, 'width' => 50 ) ),
					self::field( 'text', __( 'VIN', 'vuloform' ), array( 'width' => 50 ) ),
					self::field( 'number', __( 'Current mileage', 'vuloform' ) ),
					self::field( 'textarea', __( 'Notes', 'vuloform' ) ),
				),
				'submit' => __( 'Submit', 'vuloform' ),
			),
			'multi_page_contact' => array(
				'title'    => __( 'Multi-page contact form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Contact details on one page, the message on the next.', 'vuloform' ),
				'icon'     => 'mail',
				'fields'   => array(
					self::field( 'heading', __( 'Your details', 'vuloform' ) ),
					$name,
					$email,
					$phone,
					self::field( 'page_break', __( 'Page break', 'vuloform' ) ),
					self::field( 'heading', __( 'Your message', 'vuloform' ) ),
					self::field( 'text', __( 'Subject', 'vuloform' ) ),
					$message,
				),
				'submit' => __( 'Send message', 'vuloform' ),
			),
			'online_proposal'    => array(
				'title'    => __( 'Online proposal request form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Project scope, budget and timeline for a business proposal.', 'vuloform' ),
				'icon'     => 'document',
				'fields'   => array(
					$name,
					$email,
					self::field( 'text', __( 'Company', 'vuloform' ) ),
					self::field( 'textarea', __( 'Project scope', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'select',
						__( 'Budget range', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Under $5,000', 'vuloform' ), __( '$5,000 - $20,000', 'vuloform' ), __( '$20,000 - $50,000', 'vuloform' ), __( 'Over $50,000', 'vuloform' ) ) ) )
					),
					self::field( 'date', __( 'Target start date', 'vuloform' ) ),
				),
				'submit' => __( 'Request proposal', 'vuloform' ),
			),
			'department_contact' => array(
				'title'    => __( 'Select a recipient contact form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Lets the visitor route their message to the right department.', 'vuloform' ),
				'icon'     => 'mail',
				'fields'   => array(
					$name,
					$email,
					self::field(
						'select',
						__( 'Who would you like to contact?', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Sales', 'vuloform' ), __( 'Support', 'vuloform' ), __( 'Billing', 'vuloform' ), __( 'Human resources', 'vuloform' ) ) ),
						)
					),
					$message,
				),
				'submit' => __( 'Send message', 'vuloform' ),
			),
			'salon_booking'      => array(
				'title'    => __( 'Salon appointment booking form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Service, preferred stylist and appointment time for a salon visit.', 'vuloform' ),
				'icon'     => 'appointment',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field(
						'select',
						__( 'Service', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Haircut', 'vuloform' ), __( 'Color', 'vuloform' ), __( 'Styling', 'vuloform' ), __( 'Treatment', 'vuloform' ) ) ),
						)
					),
					self::field( 'text', __( 'Preferred stylist (optional)', 'vuloform' ) ),
					self::field( 'date', __( 'Preferred date', 'vuloform' ), array( 'required' => true, 'width' => 50 ) ),
					self::field( 'time', __( 'Preferred time', 'vuloform' ), array( 'required' => true, 'width' => 50 ) ),
				),
				'submit' => __( 'Book appointment', 'vuloform' ),
			),
			'customer_info'      => array(
				'title'    => __( 'Customer information form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Contact details and address, for keeping a customer record up to date.', 'vuloform' ),
				'icon'     => 'profile',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'address', __( 'Address', 'vuloform' ) ),
					self::field( 'date', __( 'Date of birth (optional)', 'vuloform' ) ),
					self::field( 'textarea', __( 'Notes', 'vuloform' ) ),
				),
				'submit' => __( 'Save details', 'vuloform' ),
			),
			'product_review'     => array(
				'title'    => __( 'Product review form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'A star rating and a written review for a specific product.', 'vuloform' ),
				'icon'     => 'review',
				'fields'   => array(
					$name,
					self::field( 'text', __( 'Product name', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'radio',
						__( 'Rating', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( '1', '2', '3', '4', '5' ) ),
						)
					),
					self::field( 'text', __( 'Review title', 'vuloform' ) ),
					self::field( 'textarea', __( 'Your review', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'email', __( 'Email (optional)', 'vuloform' ) ),
				),
				'submit' => __( 'Submit review', 'vuloform' ),
			),
			'design_brief'       => array(
				'title'    => __( 'Design brief questionnaire', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Style preferences, references and project details for a design project.', 'vuloform' ),
				'icon'     => 'document',
				'fields'   => array(
					$name,
					$email,
					self::field( 'text', __( 'Project name', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'checkboxes',
						__( 'Style preferences', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Modern', 'vuloform' ), __( 'Minimal', 'vuloform' ), __( 'Classic', 'vuloform' ), __( 'Bold', 'vuloform' ), __( 'Playful', 'vuloform' ) ) ) )
					),
					self::field( 'text', __( 'Reference links (optional)', 'vuloform' ) ),
					self::field( 'textarea', __( 'Describe what you are looking for', 'vuloform' ), array( 'required' => true ) ),
				),
				'submit' => __( 'Submit brief', 'vuloform' ),
			),
			'prescription_refill' => array(
				'title'    => __( 'Prescription refill request form', 'vuloform' ),
				'category' => __( 'Healthcare', 'vuloform' ),
				'desc'     => __( 'Patient and medication details for a refill request.', 'vuloform' ),
				'icon'     => 'file-submission',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'date', __( 'Date of birth', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Medication name', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Pharmacy', 'vuloform' ) ),
					self::field( 'textarea', __( 'Notes for the provider', 'vuloform' ) ),
				),
				'submit' => __( 'Request refill', 'vuloform' ),
			),
			'gift_certificate'   => array(
				'title'    => __( 'Gift certificate order form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Recipient details and amount for a gift certificate order.', 'vuloform' ),
				'icon'     => 'dollar',
				'fields'   => array(
					self::field( 'text', __( 'Your name', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'email', __( 'Your email', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( "Recipient's name", 'vuloform' ), array( 'required' => true ) ),
					self::field( 'email', __( "Recipient's email", 'vuloform' ) ),
					self::field(
						'radio',
						__( 'Amount', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( '$25', '$50', '$100', __( 'Other', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'Personal message (optional)', 'vuloform' ) ),
				),
				'submit' => __( 'Order gift certificate', 'vuloform' ),
			),
			'cs_evaluation'      => array(
				'title'    => __( 'Customer service evaluation form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Rates a recent support interaction and asks what could be improved.', 'vuloform' ),
				'icon'     => 'review',
				'fields'   => array(
					self::field( 'text', __( 'Ticket or reference number (optional)', 'vuloform' ) ),
					self::field(
						'radio',
						__( 'How satisfied were you with the support you received?', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( __( 'Very satisfied', 'vuloform' ), __( 'Satisfied', 'vuloform' ), __( 'Neutral', 'vuloform' ), __( 'Dissatisfied', 'vuloform' ), __( 'Very dissatisfied', 'vuloform' ) ) ),
						)
					),
					self::field(
						'radio',
						__( 'Was your issue resolved?', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Yes', 'vuloform' ), __( 'Partially', 'vuloform' ), __( 'No', 'vuloform' ) ) ) )
					),
					self::field( 'textarea', __( 'What could we do better?', 'vuloform' ) ),
					self::field( 'email', __( 'Email (optional)', 'vuloform' ) ),
				),
				'submit' => __( 'Submit evaluation', 'vuloform' ),
			),
			'bank_reference'     => array(
				'title'    => __( 'Bank reference request form', 'vuloform' ),
				'category' => __( 'Customer Service', 'vuloform' ),
				'desc'     => __( 'Requests a reference letter confirming an account holder\'s standing.', 'vuloform' ),
				'icon'     => 'document',
				'fields'   => array(
					$name,
					$email,
					self::field( 'text', __( 'Account or customer reference', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Who is this reference for?', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'textarea', __( 'What should the reference confirm?', 'vuloform' ), array( 'required' => true ) ),
					$consent,
				),
				'submit' => __( 'Request reference', 'vuloform' ),
			),
			'parental_consent'   => array(
				'title'    => __( 'Parental consent form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( 'A parent or guardian\'s permission for a child to take part in an activity.', 'vuloform' ),
				'icon'     => 'lock',
				'fields'   => array(
					self::field( 'text', __( "Child's full name", 'vuloform' ), array( 'required' => true ) ),
					self::field( 'date', __( "Child's date of birth", 'vuloform' ) ),
					self::field( 'text', __( "Parent or guardian's name", 'vuloform' ), array( 'required' => true ) ),
					$email,
					$phone,
					self::field( 'textarea', __( 'Activity this consent covers', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'textarea', __( 'Medical conditions or allergies we should know about', 'vuloform' ) ),
					self::field(
						'consent',
						__( 'Consent', 'vuloform' ),
						array(
							'required'     => true,
							'consent_text' => __( 'I give permission for my child to take part in this activity.', 'vuloform' ),
						)
					),
				),
				'submit' => __( 'Submit consent', 'vuloform' ),
			),
			'college_application' => array(
				'title'    => __( 'College application form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( 'Applicant details, program choice and supporting documents.', 'vuloform' ),
				'icon'     => 'document',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'address', __( 'Mailing address', 'vuloform' ) ),
					self::field( 'text', __( 'Program applying for', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Previous school', 'vuloform' ) ),
					self::field(
						'file',
						__( 'Transcript', 'vuloform' ),
						array(
							'required'      => true,
							'allowed_types' => array( 'pdf', 'doc', 'docx' ),
							'max_size_mb'   => 5,
						)
					),
					self::field( 'textarea', __( 'Personal statement', 'vuloform' ) ),
				),
				'submit' => __( 'Submit application', 'vuloform' ),
			),
			'school_id_registration' => array(
				'title'    => __( 'School ID registration form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( 'Student details and a photo for a school ID card.', 'vuloform' ),
				'icon'     => 'user-circle',
				'fields'   => array(
					self::field( 'text', __( "Student's full name", 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Grade or class', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Student ID number (if known)', 'vuloform' ) ),
					$email,
					self::field(
						'file',
						__( 'Photo', 'vuloform' ),
						array(
							'required'      => true,
							'allowed_types' => array( 'jpg', 'jpeg', 'png' ),
							'max_size_mb'   => 3,
						)
					),
				),
				'submit' => __( 'Submit', 'vuloform' ),
			),
			'scholarship_application' => array(
				'title'    => __( 'Scholarship application form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( 'Applicant background, achievements and an essay for a scholarship.', 'vuloform' ),
				'icon'     => 'document',
				'fields'   => array(
					$name,
					$email,
					$phone,
					self::field( 'text', __( 'School or institution', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'number', __( 'GPA', 'vuloform' ), array( 'min' => '0', 'max' => '4' ) ),
					self::field( 'textarea', __( 'Extracurricular activities and achievements', 'vuloform' ) ),
					self::field( 'textarea', __( 'Why do you deserve this scholarship?', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'file',
						__( 'Supporting documents (optional)', 'vuloform' ),
						array(
							'allowed_types' => array( 'pdf', 'doc', 'docx' ),
							'max_size_mb'   => 5,
						)
					),
				),
				'submit' => __( 'Submit application', 'vuloform' ),
			),
			'alumni_award_nomination' => array(
				'title'    => __( 'Alumni award nomination form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( 'Nominate a graduate for a school or alumni association award.', 'vuloform' ),
				'icon'     => 'star',
				'fields'   => array(
					self::field( 'text', __( "Nominee's full name", 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Graduating class or year', 'vuloform' ) ),
					self::field( 'textarea', __( 'Why are they a good fit for this award?', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Your name', 'vuloform' ), array( 'required' => true ) ),
					$email,
				),
				'submit' => __( 'Submit nomination', 'vuloform' ),
			),
			'school_uniform_order' => array(
				'title'    => __( 'School uniform order form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( "Item, size and quantity for a student's uniform order.", 'vuloform' ),
				'icon'     => 'cart',
				'fields'   => array(
					self::field( 'text', __( "Student's name", 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Grade or class', 'vuloform' ) ),
					$email,
					self::field(
						'checkboxes',
						__( 'Items needed', 'vuloform' ),
						array( 'options' => self::options( array( __( 'Shirt', 'vuloform' ), __( 'Trousers/skirt', 'vuloform' ), __( 'Jumper', 'vuloform' ), __( 'PE kit', 'vuloform' ) ) ) )
					),
					self::field(
						'select',
						__( 'Size', 'vuloform' ),
						array( 'options' => self::options( array( 'XS', 'S', 'M', 'L', 'XL' ) ) )
					),
					self::field( 'number', __( 'Quantity', 'vuloform' ), array( 'default' => '1', 'min' => '1' ) ),
				),
				'submit' => __( 'Place order', 'vuloform' ),
			),
			'book_review'        => array(
				'title'    => __( 'Book review form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( 'A rating and a short review of a book just read.', 'vuloform' ),
				'icon'     => 'review',
				'fields'   => array(
					$name,
					self::field( 'text', __( 'Book title', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Author', 'vuloform' ) ),
					self::field(
						'radio',
						__( 'Rating', 'vuloform' ),
						array( 'required' => true, 'options' => self::options( array( '1', '2', '3', '4', '5' ) ) )
					),
					self::field( 'textarea', __( 'What did you think of it?', 'vuloform' ), array( 'required' => true ) ),
				),
				'submit' => __( 'Submit review', 'vuloform' ),
			),
			'general_consent'    => array(
				'title'    => __( 'General consent form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( 'A general permission and release form for an activity or program.', 'vuloform' ),
				'icon'     => 'lock',
				'fields'   => array(
					$name,
					$email,
					self::field( 'textarea', __( 'What is this consent for?', 'vuloform' ), array( 'required' => true ) ),
					self::field(
						'consent',
						__( 'Consent', 'vuloform' ),
						array(
							'required'     => true,
							'consent_text' => __( 'I have read and agree to the terms described above.', 'vuloform' ),
						)
					),
				),
				'submit' => __( 'Submit', 'vuloform' ),
			),
			'parent_teacher_conference' => array(
				'title'    => __( 'Parent-teacher conference request form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( "A parent's preferred times to meet with their child's teacher.", 'vuloform' ),
				'icon'     => 'appointment',
				'fields'   => array(
					self::field( 'text', __( "Parent's name", 'vuloform' ), array( 'required' => true ) ),
					$email,
					$phone,
					self::field( 'text', __( "Child's name", 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Teacher', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'date', __( 'Preferred date', 'vuloform' ), array( 'width' => 50 ) ),
					self::field( 'time', __( 'Preferred time', 'vuloform' ), array( 'width' => 50 ) ),
					self::field( 'textarea', __( 'What would you like to discuss?', 'vuloform' ) ),
				),
				'submit' => __( 'Request conference', 'vuloform' ),
			),
			'grade_submission'   => array(
				'title'    => __( 'Grade submission form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( 'Lets a teacher record a grade for one student and assignment.', 'vuloform' ),
				'icon'     => 'document',
				'fields'   => array(
					self::field( 'text', __( "Student's name", 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Class', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'text', __( 'Assignment', 'vuloform' ), array( 'required' => true ) ),
					self::field( 'number', __( 'Score', 'vuloform' ), array( 'required' => true, 'min' => '0', 'width' => 50 ) ),
					self::field( 'number', __( 'Out of', 'vuloform' ), array( 'required' => true, 'default' => '100', 'min' => '1', 'width' => 50 ) ),
					self::field( 'textarea', __( 'Comments', 'vuloform' ) ),
				),
				'submit' => __( 'Submit grade', 'vuloform' ),
			),
			'alumni_donation'    => array(
				'title'    => __( 'Alumni donation form', 'vuloform' ),
				'category' => __( 'Education', 'vuloform' ),
				'desc'     => __( 'Lets a graduate give back to their school or alumni fund.', 'vuloform' ),
				'icon'     => 'dollar',
				'fields'   => array(
					$name,
					$email,
					self::field( 'text', __( 'Graduating class or year', 'vuloform' ) ),
					self::field(
						'radio',
						__( 'Donation amount', 'vuloform' ),
						array(
							'required' => true,
							'options'  => self::options( array( '$25', '$50', '$100', '$250', __( 'Other amount', 'vuloform' ) ) ),
						)
					),
					self::field( 'textarea', __( 'Message (optional)', 'vuloform' ) ),
				),
				'submit' => __( 'Donate', 'vuloform' ),
			),
		);

		$out = array();

		foreach ( $templates as $id => $template ) {
			$settings = Schema::default_settings();

			if ( isset( $template['submit'] ) ) {
				$settings['submit_label'] = $template['submit'];
			}

			// Every template tells the site admin about a submission out of the box.
			$settings['notifications'][] = self::admin_notification( 'email' );

			$out[ $id ] = array(
				'title'    => $template['title'],
				'desc'     => $template['desc'],
				'icon'     => $template['icon'],
				'category' => $template['category'] ?? __( 'Other', 'vuloform' ),
				'schema'   => Schema::sanitize(
					array(
						'fields'   => $template['fields'],
						'settings' => $settings,
					)
				),
			);
		}

		/**
		 * Filters the starter templates.
		 *
		 * @param array $out Template id => title, desc, icon, schema.
		 */
		return (array) apply_filters( 'vuloform_templates', $out );
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
	private static function field( $type, $label, array $extra = array() ) {
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
	private static function options( array $labels ) {
		$options = array();

		foreach ( $labels as $label ) {
			$options[] = array(
				'label' => $label,
				'value' => $label,
			);
		}

		return $options;
	}

	/**
	 * A field's `conditions` setting for "show this field only when another field's answer is X".
	 *
	 * @param string $field Key of the field to check.
	 * @param string $value The answer that shows this field.
	 * @return array
	 */
	private static function show_if( $field, $value ) {
		return array(
			'enabled' => true,
			'action'  => 'show',
			'match'   => 'all',
			'rules'   => array(
				array(
					'field'    => $field,
					'operator' => 'is',
					'value'    => $value,
				),
			),
		);
	}
}