<?php
/**
 * Triggers class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Sms;

use VuloMail\Settings\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Optional SMS notifications for common site events. Every trigger is off until switched on.
 */
class Triggers {

	/**
	 * Plugin settings.
	 *
	 * @var Settings
	 */
	private $settings;

	/**
	 * SMS dispatcher.
	 *
	 * @var Dispatcher
	 */
	private $dispatcher;

	/**
	 * Order statuses that have their own customer alert. A status without one, or whose alert is
	 * off, is covered by the general "order status update" alert, so a customer never gets two texts
	 * for one change.
	 *
	 * @var array<string, string> Status => trigger id.
	 */
	const CUSTOMER_STATUS_TRIGGERS = array(
		'processing' => 'wc_customer_processing',
		'completed'  => 'wc_customer_completed',
		'refunded'   => 'wc_customer_refunded',
		'cancelled'  => 'wc_customer_cancelled',
	);

	/**
	 * Order statuses the store owner can be alerted about.
	 *
	 * @var array<string, string> Status => trigger id.
	 */
	const ADMIN_STATUS_TRIGGERS = array(
		'failed'    => 'wc_order_failed',
		'cancelled' => 'wc_order_cancelled',
	);

	/**
	 * Transient that spaces out "email failed" alerts.
	 */
	const EMAIL_FAILED_THROTTLE = 'vulomail_email_failed_alert';

	/**
	 * Constructor.
	 *
	 * @param Settings   $settings   Plugin settings.
	 * @param Dispatcher $dispatcher SMS dispatcher.
	 */
	public function __construct( Settings $settings, Dispatcher $dispatcher ) {
		$this->settings   = $settings;
		$this->dispatcher = $dispatcher;

		add_action( 'user_register', array( $this, 'on_user_register' ) );
		add_action( 'wp_login', array( $this, 'on_login' ), 20, 2 );
		add_action( 'comment_post', array( $this, 'on_comment' ), 20, 2 );
		add_action( 'vulomail_email_failed', array( $this, 'on_email_failed' ), 20, 2 );
		add_action( 'woocommerce_new_order', array( $this, 'on_new_order' ), 20, 2 );
		add_action( 'woocommerce_order_status_changed', array( $this, 'on_order_status_changed' ), 20, 4 );
		add_action( 'woocommerce_order_refunded', array( $this, 'on_order_refunded' ), 20 );
		add_action( 'woocommerce_new_customer_note', array( $this, 'on_customer_note' ), 20 );
		add_action( 'woocommerce_low_stock', array( $this, 'on_low_stock' ), 20 );
		add_action( 'woocommerce_no_stock', array( $this, 'on_no_stock' ), 20 );
		add_action( 'woocommerce_product_on_backorder', array( $this, 'on_backorder' ), 20 );
	}

	/**
	 * Every available trigger with its default template and placeholders.
	 *
	 * @return array<string, array{label: string, desc: string, recipient: string, template: string, placeholders: string[], available: bool, requires: string}>
	 */
	public static function definitions() {
		$order   = array( 'site_name', 'order_number', 'order_total', 'customer_name' );
		$product = array( 'site_name', 'product_name', 'product_sku', 'stock_quantity' );

		$site = array(
			'user_registered' => array(
				'label'        => __( 'New user registered', 'vulomail' ),
				'desc'         => __( 'Text the site admin when someone creates an account.', 'vulomail' ),
				'template'     => __( 'New user {username} registered on {site_name}.', 'vulomail' ),
				'placeholders' => array( 'site_name', 'username', 'user_email' ),
			),
			'admin_login'     => array(
				'label'        => __( 'Administrator logged in', 'vulomail' ),
				'desc'         => __( 'Text the site admin whenever an administrator account logs in, so an unexpected login is noticed straight away.', 'vulomail' ),
				'template'     => __( 'Administrator {username} logged in to {site_name} from {user_ip}.', 'vulomail' ),
				'placeholders' => array( 'site_name', 'username', 'user_ip' ),
			),
			'new_comment'     => array(
				'label'        => __( 'New comment', 'vulomail' ),
				'desc'         => __( 'Text the site admin when a visitor comments on a post. Comments marked as spam are ignored.', 'vulomail' ),
				'template'     => __( 'New comment by {comment_author} on "{post_title}" at {site_name}.', 'vulomail' ),
				'placeholders' => array( 'site_name', 'comment_author', 'post_title' ),
			),
			'email_failed'    => array(
				'label'        => __( 'An email failed to send', 'vulomail' ),
				'desc'         => __( 'Text the site admin when an email could not be delivered by any connection. At most one text every 15 minutes, however many emails fail.', 'vulomail' ),
				'template'     => __( 'An email from {site_name} failed to send: "{subject}". {error}', 'vulomail' ),
				'placeholders' => array( 'site_name', 'subject', 'error' ),
			),
		);

		$store = array(
			'wc_new_order'       => array(
				'label'        => __( 'New order', 'vulomail' ),
				'desc'         => __( 'Text the site admin when a new order is placed.', 'vulomail' ),
				'template'     => __( 'New order #{order_number} for {order_total} on {site_name}.', 'vulomail' ),
				'placeholders' => $order,
			),
			'wc_order_failed'    => array(
				'label'        => __( 'Order payment failed', 'vulomail' ),
				'desc'         => __( 'Text the site admin when an order moves to "Failed", usually a declined payment.', 'vulomail' ),
				'template'     => __( 'Payment failed for order #{order_number} ({order_total}) on {site_name}.', 'vulomail' ),
				'placeholders' => $order,
			),
			'wc_order_cancelled' => array(
				'label'        => __( 'Order cancelled', 'vulomail' ),
				'desc'         => __( 'Text the site admin when an order is cancelled.', 'vulomail' ),
				'template'     => __( 'Order #{order_number} ({order_total}) on {site_name} was cancelled.', 'vulomail' ),
				'placeholders' => $order,
			),
			'wc_order_refunded'  => array(
				'label'        => __( 'Order refunded', 'vulomail' ),
				'desc'         => __( 'Text the site admin when a full or partial refund is issued.', 'vulomail' ),
				'template'     => __( 'A refund was issued on order #{order_number} at {site_name}.', 'vulomail' ),
				'placeholders' => $order,
			),
			'wc_low_stock'       => array(
				'label'        => __( 'Product low in stock', 'vulomail' ),
				'desc'         => __( 'Text the site admin when a product reaches its low stock threshold.', 'vulomail' ),
				'template'     => __( '{product_name} is low in stock on {site_name}: {stock_quantity} left.', 'vulomail' ),
				'placeholders' => $product,
			),
			'wc_out_of_stock'    => array(
				'label'        => __( 'Product out of stock', 'vulomail' ),
				'desc'         => __( 'Text the site admin when a product sells out.', 'vulomail' ),
				'template'     => __( '{product_name} is out of stock on {site_name}.', 'vulomail' ),
				'placeholders' => $product,
			),
			'wc_backorder'       => array(
				'label'        => __( 'Product backordered', 'vulomail' ),
				'desc'         => __( 'Text the site admin when a customer orders a product that is on backorder.', 'vulomail' ),
				'template'     => __( '{product_name} was backordered in order #{order_number} on {site_name}.', 'vulomail' ),
				'placeholders' => array( 'site_name', 'product_name', 'product_sku', 'order_number', 'quantity' ),
			),
			'wc_new_review'      => array(
				'label'        => __( 'New product review', 'vulomail' ),
				'desc'         => __( 'Text the site admin when a customer reviews a product.', 'vulomail' ),
				'template'     => __( '{comment_author} left a {rating}-star review on {product_name} at {site_name}.', 'vulomail' ),
				'placeholders' => array( 'site_name', 'comment_author', 'product_name', 'rating' ),
			),
		);

		$status   = array_merge( $order, array( 'order_status' ) );
		$customer = array(
			'wc_customer_processing'  => array(
				'label'        => __( 'Order confirmed (processing)', 'vulomail' ),
				'desc'         => __( 'Text the customer when payment is received and the order is being prepared.', 'vulomail' ),
				'template'     => __( 'Hi {customer_name}, thanks for your order #{order_number} at {site_name}. We are getting it ready.', 'vulomail' ),
				'placeholders' => $status,
			),
			'wc_customer_completed'   => array(
				'label'        => __( 'Order completed', 'vulomail' ),
				'desc'         => __( 'Text the customer when their order is marked complete.', 'vulomail' ),
				'template'     => __( 'Hi {customer_name}, your order #{order_number} from {site_name} is complete. Thank you!', 'vulomail' ),
				'placeholders' => $status,
			),
			'wc_customer_refunded'    => array(
				'label'        => __( 'Order refunded', 'vulomail' ),
				'desc'         => __( 'Text the customer when their order is fully refunded.', 'vulomail' ),
				'template'     => __( 'Hi {customer_name}, your order #{order_number} at {site_name} has been refunded.', 'vulomail' ),
				'placeholders' => $status,
			),
			'wc_customer_cancelled'   => array(
				'label'        => __( 'Order cancelled', 'vulomail' ),
				'desc'         => __( 'Text the customer when their order is cancelled.', 'vulomail' ),
				'template'     => __( 'Hi {customer_name}, your order #{order_number} at {site_name} has been cancelled.', 'vulomail' ),
				'placeholders' => $status,
			),
			'wc_order_status_changed' => array(
				'label'        => __( 'Any other order status change', 'vulomail' ),
				'desc'         => __( 'Text the customer on every status change that has no alert of its own switched on above, including custom statuses.', 'vulomail' ),
				'template'     => __( 'Hi {customer_name}, your order #{order_number} at {site_name} is now {order_status}.', 'vulomail' ),
				'placeholders' => $status,
			),
			'wc_customer_note'        => array(
				'label'        => __( 'Note added to an order', 'vulomail' ),
				'desc'         => __( 'Text the customer when you add a "note to customer" on their order, for example a tracking number.', 'vulomail' ),
				'template'     => __( 'Update on your order #{order_number} at {site_name}: {note}', 'vulomail' ),
				'placeholders' => array_merge( $order, array( 'note' ) ),
			),
		);

		$has_woocommerce = class_exists( 'WooCommerce' );
		$triggers        = array();

		foreach ( $site as $id => $trigger ) {
			$triggers[ $id ] = array_merge(
				$trigger,
				array(
					'recipient' => 'admin',
					'available' => true,
					'requires'  => '',
				)
			);
		}

		foreach ( array(
			'admin'    => $store,
			'customer' => $customer,
		) as $recipient => $group ) {
			foreach ( $group as $id => $trigger ) {
				$triggers[ $id ] = array_merge(
					$trigger,
					array(
						'recipient' => $recipient,
						'available' => $has_woocommerce,
						'requires'  => 'woocommerce',
					)
				);
			}
		}

		/**
		 * Filters the SMS trigger definitions shown on the SMS Alerts screen. A custom trigger is fired by
		 * calling `VuloMail()->sms_triggers->fire( $id, $recipient, $values )`.
		 *
		 * @param array $triggers Trigger id => definition.
		 */
		return (array) apply_filters( 'vulomail_sms_triggers', $triggers );
	}

	/**
	 * Sends a trigger's message if the trigger is enabled.
	 *
	 * @param string $id     Trigger id.
	 * @param string $to     Recipient number; '' sends to the admin phone from settings.
	 * @param array  $values Placeholder => value.
	 * @return void
	 */
	public function fire( $id, $to, array $values ) {
		$definitions = self::definitions();
		$saved       = (array) $this->settings->get( 'sms_triggers' );

		if ( ! isset( $definitions[ $id ] ) || empty( $saved[ $id ]['enabled'] ) || ! $this->dispatcher->is_ready() ) {
			return;
		}

		$to = '' !== (string) $to ? (string) $to : (string) $this->settings->get( 'sms_admin_phone' );

		if ( '' === $to ) {
			return;
		}

		$template = '' !== trim( (string) ( $saved[ $id ]['template'] ?? '' ) ) ? $saved[ $id ]['template'] : $definitions[ $id ]['template'];
		$values   = array_merge( array( 'site_name' => wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ) ), $values );
		$replace  = array();

		foreach ( $values as $key => $value ) {
			$replace[ '{' . $key . '}' ] = is_scalar( $value ) ? (string) $value : '';
		}

		$this->dispatcher->send( $to, strtr( $template, $replace ), 'vulomail-alert-' . $id );
	}

	/**
	 * Whether a given trigger is switched on.
	 *
	 * @param string $id Trigger id.
	 * @return bool Whether the trigger is switched on.
	 */
	private function is_enabled( $id ) {
		$saved = (array) $this->settings->get( 'sms_triggers' );

		return ! empty( $saved[ $id ]['enabled'] );
	}

	/**
	 * `user_register` callback: alerts the admin about a new user.
	 *
	 * @param int $user_id New user id.
	 * @return void
	 */
	public function on_user_register( $user_id ) {
		$user = get_userdata( $user_id );

		if ( $user ) {
			$this->fire(
				'user_registered',
				'',
				array(
					'username'   => $user->user_login,
					'user_email' => $user->user_email,
				)
			);
		}
	}

	/**
	 * `wp_login` callback: alerts on administrator logins only.
	 *
	 * @param string        $user_login Username.
	 * @param \WP_User|null $user       User.
	 * @return void
	 */
	public function on_login( $user_login, $user = null ) {
		if ( ! $this->is_enabled( 'admin_login' ) || ! $user || ! user_can( $user, 'manage_options' ) ) {
			return;
		}

		$ip = sanitize_text_field( self::server_var( 'REMOTE_ADDR' ) );

		$this->fire(
			'admin_login',
			'',
			array(
				'username' => (string) $user_login,
				'user_ip'  => '' !== $ip ? $ip : __( 'an unknown address', 'vulomail' ),
			)
		);
	}

	/**
	 * `comment_post` callback: a new comment, or a new product review.
	 *
	 * @param int        $comment_id Comment id.
	 * @param int|string $approved   1, 0, 'spam' or 'trash'.
	 * @return void
	 */
	public function on_comment( $comment_id, $approved = 1 ) {
		if ( in_array( $approved, array( 'spam', 'trash' ), true ) ) {
			return;
		}

		$comment = get_comment( $comment_id );

		if ( ! $comment ) {
			return;
		}

		$title = wp_specialchars_decode( (string) get_the_title( (int) $comment->comment_post_ID ), ENT_QUOTES );

		if ( 'review' === $comment->comment_type ) {
			$this->fire(
				'wc_new_review',
				'',
				array(
					'comment_author' => (string) $comment->comment_author,
					'product_name'   => $title,
					'rating'         => (string) (int) get_comment_meta( $comment_id, 'rating', true ),
				)
			);

			return;
		}

		// Pingbacks, trackbacks and other plugins' internal notes are not visitor comments.
		if ( in_array( (string) $comment->comment_type, array( '', 'comment' ), true ) ) {
			$this->fire(
				'new_comment',
				'',
				array(
					'comment_author' => (string) $comment->comment_author,
					'post_title'     => $title,
				)
			);
		}
	}

	/**
	 * `vulomail_email_failed` callback. Spaced out, because a broken connection fails every email
	 * and each text costs money.
	 *
	 * @param \VuloMail\Email\Message   $message The email.
	 * @param \VuloMail\Delivery\Result $result  Its outcome.
	 * @return void
	 */
	public function on_email_failed( $message, $result ) {
		// A test sent from the Tools screen already shows its result there.
		if ( ! $this->is_enabled( 'email_failed' ) || ! $this->dispatcher->is_ready() || 'vulomail-test' === ( $message->source ?? '' ) || get_transient( self::EMAIL_FAILED_THROTTLE ) ) {
			return;
		}

		set_transient( self::EMAIL_FAILED_THROTTLE, 1, 15 * MINUTE_IN_SECONDS );

		$this->fire(
			'email_failed',
			'',
			array(
				'subject' => (string) ( $message->subject ?? '' ),
				'error'   => (string) ( $result->error_message ?? '' ),
			)
		);
	}

	/**
	 * `woocommerce_new_order` callback: alerts the admin of a new order.
	 *
	 * @param int            $order_id Order id.
	 * @param \WC_Order|null $order    Order.
	 * @return void
	 */
	public function on_new_order( $order_id, $order = null ) {
		$order = self::order( $order_id, $order );

		if ( $order ) {
			$this->fire( 'wc_new_order', '', self::order_values( $order ) );
		}
	}

	/**
	 * `woocommerce_order_status_changed` callback: alerts the admin and/or the customer.
	 *
	 * @param int            $order_id Order id.
	 * @param string         $from     Old status.
	 * @param string         $to       New status.
	 * @param \WC_Order|null $order    Order.
	 * @return void
	 */
	public function on_order_status_changed( $order_id, $from, $to, $order = null ) {
		$order = self::order( $order_id, $order );

		if ( ! $order ) {
			return;
		}

		$values                 = self::order_values( $order );
		$values['order_status'] = function_exists( 'wc_get_order_status_name' ) ? wc_get_order_status_name( $to ) : $to;

		if ( isset( self::ADMIN_STATUS_TRIGGERS[ $to ] ) ) {
			$this->fire( self::ADMIN_STATUS_TRIGGERS[ $to ], '', $values );
		}

		$phone = (string) $order->get_billing_phone();

		if ( '' === $phone ) {
			return;
		}

		$own = self::CUSTOMER_STATUS_TRIGGERS[ $to ] ?? '';

		$this->fire( '' !== $own && $this->is_enabled( $own ) ? $own : 'wc_order_status_changed', $phone, $values );
	}

	/**
	 * `woocommerce_order_refunded` callback: fires for full and partial refunds.
	 *
	 * @param int $order_id Order id.
	 * @return void
	 */
	public function on_order_refunded( $order_id ) {
		$order = self::order( $order_id );

		if ( $order ) {
			$this->fire( 'wc_order_refunded', '', self::order_values( $order ) );
		}
	}

	/**
	 * `woocommerce_new_customer_note` callback.
	 *
	 * @param array $args order_id and customer_note.
	 * @return void
	 */
	public function on_customer_note( $args ) {
		$order = is_array( $args ) ? self::order( $args['order_id'] ?? 0 ) : null;
		$note  = is_array( $args ) ? trim( wp_strip_all_tags( (string) ( $args['customer_note'] ?? '' ) ) ) : '';

		if ( ! $order || '' === $note || '' === (string) $order->get_billing_phone() ) {
			return;
		}

		$this->fire( 'wc_customer_note', (string) $order->get_billing_phone(), array_merge( self::order_values( $order ), array( 'note' => $note ) ) );
	}

	/**
	 * `woocommerce_low_stock` callback.
	 *
	 * @param \WC_Product $product Product.
	 * @return void
	 */
	public function on_low_stock( $product ) {
		if ( is_object( $product ) ) {
			$this->fire( 'wc_low_stock', '', self::product_values( $product ) );
		}
	}

	/**
	 * `woocommerce_no_stock` callback.
	 *
	 * @param \WC_Product $product Product.
	 * @return void
	 */
	public function on_no_stock( $product ) {
		if ( is_object( $product ) ) {
			$this->fire( 'wc_out_of_stock', '', self::product_values( $product ) );
		}
	}

	/**
	 * `woocommerce_product_on_backorder` callback.
	 *
	 * @param array $args product, order_id and quantity.
	 * @return void
	 */
	public function on_backorder( $args ) {
		if ( ! is_array( $args ) || empty( $args['product'] ) || ! is_object( $args['product'] ) ) {
			return;
		}

		$order = self::order( $args['order_id'] ?? 0 );

		$this->fire(
			'wc_backorder',
			'',
			array_merge(
				self::product_values( $args['product'] ),
				array(
					'order_number' => $order ? (string) $order->get_order_number() : (string) ( $args['order_id'] ?? '' ),
					'quantity'     => (string) ( $args['quantity'] ?? '' ),
				)
			)
		);
	}

	/**
	 * One entry of `$_SERVER`.
	 *
	 * @param string $key Entry name.
	 * @return string
	 */
	private static function server_var( $key ) {
		return isset( $_SERVER[ $key ] ) ? (string) wp_unslash( $_SERVER[ $key ] ) : '';
	}

	/**
	 * Resolves an order object, reusing one already passed by the hook.
	 *
	 * @param int            $order_id Order id.
	 * @param \WC_Order|null $order    Order, when the hook already passed it.
	 * @return \WC_Order|null
	 */
	private static function order( $order_id, $order = null ) {
		if ( is_object( $order ) ) {
			return $order;
		}

		$order = function_exists( 'wc_get_order' ) ? wc_get_order( $order_id ) : null;

		return is_object( $order ) ? $order : null;
	}

	/**
	 * Template values for a product-related trigger.
	 *
	 * @param \WC_Product $product Product.
	 * @return array<string, string>
	 */
	private static function product_values( $product ) {
		return array(
			'product_name'   => wp_specialchars_decode( (string) $product->get_name(), ENT_QUOTES ),
			'product_sku'    => (string) $product->get_sku(),
			'stock_quantity' => (string) (int) $product->get_stock_quantity(),
		);
	}

	/**
	 * Template values for an order-related trigger.
	 *
	 * @param \WC_Order $order Order.
	 * @return array<string, string>
	 */
	private static function order_values( $order ) {
		return array(
			'order_number'  => (string) $order->get_order_number(),
			'order_total'   => html_entity_decode( wp_strip_all_tags( (string) $order->get_formatted_order_total() ), ENT_QUOTES, 'UTF-8' ),
			'customer_name' => trim( (string) $order->get_billing_first_name() ),
		);
	}
}
