<?php
/**
 * SMS trigger tests: which alert an event sends, to whom, and with what text.
 *
 * @package VuloMail
 */

namespace VuloMail\Tests;

use Brain\Monkey\Functions;
use VuloMail\Settings\Settings;
use VuloMail\Sms\Dispatcher;
use VuloMail\Sms\Triggers;

/**
 * Tests which SMS alert an event sends, to whom, and with what text.
 */
class TestSmsTriggers extends TestCase {

	/**
	 * Records every send() call instead of dispatching.
	 *
	 * @var Dispatcher
	 */
	private $dispatcher;

	/**
	 * Builds a Triggers instance with the given alerts enabled.
	 *
	 * @param array $enabled   Trigger ids to enable.
	 * @param array $templates Trigger id => template override.
	 * @return Triggers
	 */
	private function triggers( array $enabled, array $templates = array() ) {
		$saved = array();

		foreach ( $enabled as $id ) {
			$saved[ $id ] = array(
				'enabled'  => true,
				'template' => $templates[ $id ] ?? '',
			);
		}

		$this->options['vulomail_settings'] = array(
			'sms_admin_phone' => '+14155550199',
			'sms_triggers'    => $saved,
		);

		$this->dispatcher = new class() extends Dispatcher {
			/**
			 * Every call made to send(), as [to, body, source].
			 *
			 * @var array
			 */
			public $sent = array();

			/**
			 * Constructor; skips the parent's, which needs real collaborators.
			 */
			public function __construct() {}

			/**
			 * Always ready in tests.
			 *
			 * @return bool
			 */
			public function is_ready() {
				return true;
			}

			/**
			 * Records the call instead of dispatching.
			 *
			 * @param string $to     Recipient number.
			 * @param string $body   Message text.
			 * @param string $source Sender slug.
			 * @return void
			 */
			public function send( $to, $body, $source = '' ) {
				$this->sent[] = array( $to, $body, $source );
			}
		};

		return new Triggers( new Settings(), $this->dispatcher );
	}

	/**
	 * Builds a minimal order double.
	 *
	 * @param string $phone Billing phone number.
	 * @return object
	 */
	private function order( $phone = '+14155550123' ) {
		return new class( $phone ) {
			/**
			 * Billing phone number.
			 *
			 * @var string
			 */
			private $phone;

			/**
			 * Constructor.
			 *
			 * @param string $phone Billing phone number.
			 */
			public function __construct( $phone ) {
				$this->phone = $phone;
			}

			/**
			 * Get the billing phone number.
			 *
			 * @return string
			 */
			public function get_billing_phone() {
				return $this->phone;
			}

			/**
			 * Get the order number.
			 *
			 * @return string
			 */
			public function get_order_number() {
				return '1042';
			}

			/**
			 * Get the formatted order total.
			 *
			 * @return string
			 */
			public function get_formatted_order_total() {
				return '<span>$59.00</span>';
			}

			/**
			 * Get the billing first name.
			 *
			 * @return string
			 */
			public function get_billing_first_name() {
				return 'Jane';
			}
		};
	}

	/**
	 * Stubs wp_strip_all_tags() on top of the base test setup.
	 *
	 * @return void
	 */
	protected function setUp(): void {
		parent::setUp();

		Functions\when( 'wp_strip_all_tags' )->alias(
			static function ( $text ) {
				return trim( strip_tags( (string) $text ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.strip_tags_strip_tags
			}
		);
	}

	/**
	 * Every trigger has a template and a recipient.
	 *
	 * @return void
	 */
	public function test_every_trigger_has_a_template_and_a_recipient() {
		foreach ( Triggers::definitions() as $id => $trigger ) {
			$this->assertNotSame( '', $trigger['template'], $id );
			$this->assertContains( $trigger['recipient'], array( 'admin', 'customer' ), $id );
			$this->assertContains( 'site_name', $trigger['placeholders'], $id );
		}
	}

	/**
	 * A status with its own alert sends only that alert.
	 *
	 * @return void
	 */
	public function test_a_status_with_its_own_alert_sends_only_that_alert() {
		$triggers = $this->triggers( array( 'wc_customer_completed', 'wc_order_status_changed' ) );

		$triggers->on_order_status_changed( 7, 'processing', 'completed', $this->order() );

		$this->assertCount( 1, $this->dispatcher->sent );
		$this->assertSame( '+14155550123', $this->dispatcher->sent[0][0] );
		$this->assertSame( 'vulomail-alert-wc_customer_completed', $this->dispatcher->sent[0][2] );
		$this->assertStringContainsString( 'order #1042', $this->dispatcher->sent[0][1] );
	}

	/**
	 * A status whose own alert is off falls back to the general alert.
	 *
	 * @return void
	 */
	public function test_a_status_whose_own_alert_is_off_falls_back_to_the_general_alert() {
		$triggers = $this->triggers( array( 'wc_order_status_changed' ) );

		$triggers->on_order_status_changed( 7, 'processing', 'completed', $this->order() );

		$this->assertSame( 'vulomail-alert-wc_order_status_changed', $this->dispatcher->sent[0][2] );
		$this->assertSame( 'Hi Jane, your order #1042 at Example Shop is now completed.', $this->dispatcher->sent[0][1] );
	}

	/**
	 * A failed order alerts the admin even without a customer phone.
	 *
	 * @return void
	 */
	public function test_a_failed_order_alerts_the_admin_even_without_a_customer_phone() {
		$triggers = $this->triggers( array( 'wc_order_failed', 'wc_order_status_changed' ) );

		$triggers->on_order_status_changed( 7, 'pending', 'failed', $this->order( '' ) );

		$this->assertCount( 1, $this->dispatcher->sent );
		$this->assertSame( '+14155550199', $this->dispatcher->sent[0][0] );
		$this->assertSame( 'Payment failed for order #1042 ($59.00) on Example Shop.', $this->dispatcher->sent[0][1] );
	}

	/**
	 * Nothing is sent for an alert that is switched off.
	 *
	 * @return void
	 */
	public function test_nothing_is_sent_for_an_alert_that_is_switched_off() {
		$triggers = $this->triggers( array() );

		$triggers->on_order_status_changed( 7, 'pending', 'failed', $this->order() );
		$triggers->on_new_order( 7, $this->order() );

		$this->assertSame( array(), $this->dispatcher->sent );
	}

	/**
	 * Administrator logins alert and other logins do not.
	 *
	 * @return void
	 */
	public function test_administrator_logins_alert_and_other_logins_do_not() {
		Functions\when( 'sanitize_text_field' )->returnArg();
		Functions\when( 'wp_unslash' )->returnArg();
		Functions\when( 'user_can' )->alias(
			static function ( $user ) {
				return ! empty( $user->is_admin );
			}
		);

		$_SERVER['REMOTE_ADDR'] = '203.0.113.9';
		$triggers               = $this->triggers( array( 'admin_login' ) );

		$triggers->on_login( 'shopper', (object) array( 'is_admin' => false ) );
		$triggers->on_login( 'boss', (object) array( 'is_admin' => true ) );

		unset( $_SERVER['REMOTE_ADDR'] );

		$this->assertCount( 1, $this->dispatcher->sent );
		$this->assertSame( 'Administrator boss logged in to Example Shop from 203.0.113.9.', $this->dispatcher->sent[0][1] );
	}

	/**
	 * Spam comments are ignored and reviews use the review alert.
	 *
	 * @return void
	 */
	public function test_spam_comments_are_ignored_and_reviews_use_the_review_alert() {
		Functions\when( 'get_the_title' )->justReturn( 'Blue Mug' );
		Functions\when( 'get_comment_meta' )->justReturn( '4' );
		Functions\when( 'get_comment' )->alias(
			static function ( $id ) {
				return (object) array(
					'comment_post_ID' => 5,
					'comment_author'  => 'Sam',
					'comment_type'    => 2 === $id ? 'review' : 'comment',
				);
			}
		);

		$triggers = $this->triggers( array( 'new_comment', 'wc_new_review' ) );

		$triggers->on_comment( 1, 'spam' );
		$triggers->on_comment( 1, 0 );
		$triggers->on_comment( 2, 1 );

		$this->assertCount( 2, $this->dispatcher->sent );
		$this->assertSame( 'New comment by Sam on "Blue Mug" at Example Shop.', $this->dispatcher->sent[0][1] );
		$this->assertSame( 'Sam left a 4-star review on Blue Mug at Example Shop.', $this->dispatcher->sent[1][1] );
	}

	/**
	 * Email failure alerts are spaced out and skip test emails.
	 *
	 * @return void
	 */
	public function test_email_failure_alerts_are_spaced_out_and_skip_test_emails() {
		$triggers = $this->triggers( array( 'email_failed' ) );
		$result   = (object) array( 'error_message' => 'SMTP Error: Could not authenticate.' );

		$triggers->on_email_failed(
			(object) array(
				'subject' => 'Test',
				'source'  => 'vulomail-test',
			),
			$result
		);
		$this->assertSame( array(), $this->dispatcher->sent );

		$email = (object) array(
			'subject' => 'Your order',
			'source'  => 'woocommerce',
		);

		$triggers->on_email_failed( $email, $result );
		$triggers->on_email_failed( $email, $result );

		$this->assertCount( 1, $this->dispatcher->sent );
		$this->assertSame( 'An email from Example Shop failed to send: "Your order". SMTP Error: Could not authenticate.', $this->dispatcher->sent[0][1] );
	}

	/**
	 * A customer note is sent to the billing phone as plain text.
	 *
	 * @return void
	 */
	public function test_a_customer_note_is_sent_to_the_billing_phone_as_plain_text() {
		$order = $this->order();

		Functions\when( 'wc_get_order' )->justReturn( $order );

		$triggers = $this->triggers( array( 'wc_customer_note' ) );

		$triggers->on_customer_note(
			array(
				'order_id'      => 7,
				'customer_note' => '<b>Tracking:</b> ZX123',
			)
		);

		$this->assertSame( '+14155550123', $this->dispatcher->sent[0][0] );
		$this->assertSame( 'Update on your order #1042 at Example Shop: Tracking: ZX123', $this->dispatcher->sent[0][1] );
	}

	/**
	 * Stock alerts use the product details.
	 *
	 * @return void
	 */
	public function test_stock_alerts_use_the_product_details() {
		$product = new class() {
			/**
			 * Get the product name.
			 *
			 * @return string
			 */
			public function get_name() {
				return 'Blue Mug';
			}

			/**
			 * Get the product SKU.
			 *
			 * @return string
			 */
			public function get_sku() {
				return 'MUG-1';
			}

			/**
			 * Get the stock quantity.
			 *
			 * @return int
			 */
			public function get_stock_quantity() {
				return 2;
			}
		};

		$triggers = $this->triggers( array( 'wc_low_stock', 'wc_out_of_stock' ) );

		$triggers->on_low_stock( $product );
		$triggers->on_no_stock( $product );

		$this->assertSame( 'Blue Mug is low in stock on Example Shop: 2 left.', $this->dispatcher->sent[0][1] );
		$this->assertSame( 'Blue Mug is out of stock on Example Shop.', $this->dispatcher->sent[1][1] );
	}
}
