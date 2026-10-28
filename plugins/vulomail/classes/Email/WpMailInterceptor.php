<?php
/**
 * WpMailInterceptor class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email;

use VuloMail\Delivery\Result;
use VuloMail\Logging\Logger;
use VuloMail\Settings\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Routes wp_mail() through VuloMail.
 *
 * With no usable connection, or routing switched off, `pre_wp_mail` is left untouched and WordPress
 * sends as it normally would; those sends are only observed, for the log.
 */
class WpMailInterceptor {

	/**
	 * Provider id logged for mail sent by WordPress's own mailer rather than a VuloMail connection.
	 */
	const DEFAULT_PROVIDER = 'default';

	/**
	 * Plugin settings.
	 *
	 * @var Settings
	 */
	private $settings;

	/**
	 * Email dispatcher.
	 *
	 * @var Dispatcher
	 */
	private $dispatcher;

	/**
	 * Delivery log.
	 *
	 * @var Logger
	 */
	private $logger;

	/**
	 * Builds Message objects from wp_mail() arguments.
	 *
	 * @var MessageFactory
	 */
	private $factory;

	/**
	 * Open and click tracking.
	 *
	 * @var Tracking
	 */
	private $tracking;

	/**
	 * True while this class fires core's success/failure hooks itself, so its observers skip them.
	 *
	 * @var bool
	 */
	private $announcing = false;

	/**
	 * A message whose connections all failed and was handed back to WordPress's own mailer.
	 *
	 * @var array{message: Message, result: Result}|null
	 */
	private $handed_back = null;

	/**
	 * Source label for the next message, set by the public API.
	 *
	 * @var string
	 */
	private $next_source = '';

	/**
	 * Outcome of the most recent wp_mail() call, for the public API to report.
	 *
	 * @var Result|null
	 */
	private $last_result = null;

	/**
	 * Constructor.
	 *
	 * @param Settings      $settings   Plugin settings.
	 * @param Dispatcher    $dispatcher Email dispatcher.
	 * @param Logger        $logger     Delivery log.
	 * @param Tracking|null $tracking   Open and click tracking.
	 */
	public function __construct( Settings $settings, Dispatcher $dispatcher, Logger $logger, $tracking = null ) {
		$this->settings   = $settings;
		$this->dispatcher = $dispatcher;
		$this->logger     = $logger;
		$this->factory    = new MessageFactory( $settings );
		$this->tracking   = $tracking instanceof Tracking ? $tracking : new Tracking( $settings );

		// Late, so a plugin that deliberately short-circuits wp_mail() itself is respected.
		add_filter( 'pre_wp_mail', array( $this, 'maybe_send' ), 999, 2 );
		// Configured sender also applies when WordPress's own mailer ends up sending.
		add_filter( 'wp_mail_from', array( $this, 'filter_from_email' ), 999 );
		add_filter( 'wp_mail_from_name', array( $this, 'filter_from_name' ), 999 );
		add_action( 'wp_mail_succeeded', array( $this, 'observe_success' ), 999 );
		add_action( 'wp_mail_failed', array( $this, 'observe_failure' ), 999 );
		// A message handed back to WordPress keeps the tracking its first attempt was given.
		add_action( 'phpmailer_init', array( $this, 'track_handed_back' ), 999 );
	}

	/**
	 * Labels the next wp_mail() call in the log.
	 *
	 * @param string $source Slug of the sender.
	 * @return void
	 */
	public function set_next_source( $source ) {
		$this->next_source = sanitize_key( (string) $source );
	}

	/**
	 * Get the outcome of the most recent wp_mail() call.
	 *
	 * @return Result|null Outcome of the most recent wp_mail() call.
	 */
	public function last_result() {
		return $this->last_result;
	}

	/**
	 * `wp_mail_from` callback.
	 *
	 * @param string $from_email Sender address.
	 * @return string
	 */
	public function filter_from_email( $from_email ) {
		return $this->settings->get( 'email_enabled' ) ? $this->factory->resolve_from_email( (string) $from_email ) : $from_email;
	}

	/**
	 * `wp_mail_from_name` callback.
	 *
	 * @param string $from_name Sender name.
	 * @return string
	 */
	public function filter_from_name( $from_name ) {
		return $this->settings->get( 'email_enabled' ) ? $this->factory->resolve_from_name( (string) $from_name ) : $from_name;
	}

	/**
	 * `pre_wp_mail` callback.
	 *
	 * @param null|bool $short_circuit Null unless another plugin already handled the message.
	 * @param array     $atts          wp_mail() arguments.
	 * @return null|bool Null to let WordPress send; true/false once VuloMail has handled it.
	 */
	public function maybe_send( $short_circuit, $atts ) {
		$this->handed_back = null;
		$this->last_result = null;

		if ( null !== $short_circuit || ! is_array( $atts ) || ! $this->dispatcher->is_ready() ) {
			return $short_circuit;
		}

		/**
		 * Filters whether VuloMail delivers this message. Return false to leave it to WordPress.
		 *
		 * @param bool  $handle Default true.
		 * @param array $atts   wp_mail() arguments.
		 */
		if ( ! apply_filters( 'vulomail_should_handle_email', true, $atts ) ) {
			return null;
		}

		$message = $this->build_message( $atts );

		// No valid recipient: core reports that error in its own, expected way.
		if ( ! $message->to ) {
			return null;
		}

		$fallback = (bool) $this->settings->get( 'fallback_to_default' );
		$result   = $this->dispatcher->send( $message, ! $fallback );

		$this->last_result = $result;

		if ( $result->success ) {
			$this->announce( 'wp_mail_succeeded', $atts );

			return true;
		}

		if ( $fallback ) {
			// WordPress's own mailer gets the message; observe_*() logs the combined outcome.
			$this->handed_back = array(
				'message' => $message,
				'result'  => $result,
			);

			return null;
		}

		$this->announce( 'wp_mail_failed', new \WP_Error( 'wp_mail_failed', $result->error_message, $atts ) );

		return false;
	}

	/**
	 * `phpmailer_init` callback: when WordPress's own mailer takes over a message VuloMail's
	 * connections failed to deliver, applies that message's tracking to the body core sends.
	 * Mail VuloMail isn't routing is left as WordPress builds it.
	 *
	 * @param object $phpmailer Core's PHPMailer instance.
	 * @return void
	 */
	public function track_handed_back( $phpmailer ) {
		if ( ! $this->handed_back || empty( $this->handed_back['message']->tracking ) || ! is_object( $phpmailer )
			|| 'text/html' !== strtolower( (string) ( $phpmailer->ContentType ?? '' ) ) ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- PHPMailer property.
			return;
		}

		try {
			$phpmailer->Body = $this->tracking->rewrite( (string) $phpmailer->Body, $this->handed_back['message']->tracking ); // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- PHPMailer property.
		} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch -- the message goes out untracked.
		}
	}

	/**
	 * `wp_mail_succeeded` observer: logs mail sent by WordPress's own mailer.
	 *
	 * @param array $atts Mail data.
	 * @return void
	 */
	public function observe_success( $atts ) {
		if ( $this->announcing || ! is_array( $atts ) ) {
			return;
		}

		$this->log_default_send( $atts, Result::ok() );
	}

	/**
	 * `wp_mail_failed` observer: logs a failure in WordPress's own mailer.
	 *
	 * @param \WP_Error $error Error; its data holds the mail arguments.
	 * @return void
	 */
	public function observe_failure( $error ) {
		if ( $this->announcing || ! is_wp_error( $error ) ) {
			return;
		}

		$atts = $error->get_error_data();

		$this->log_default_send(
			is_array( $atts ) ? $atts : array(),
			Result::fail( 'wp_mail_failed', wp_strip_all_tags( $error->get_error_message() ) )
		);
	}

	/**
	 * Logs mail sent or failed through WordPress's own mailer.
	 *
	 * @param array  $atts    Mail data.
	 * @param Result $outcome Outcome of WordPress's own mailer.
	 * @return void
	 */
	private function log_default_send( array $atts, Result $outcome ) {
		$outcome->provider = self::DEFAULT_PROVIDER;

		if ( $this->handed_back ) {
			$message           = $this->handed_back['message'];
			$outcome->attempts = array_merge( $this->handed_back['result']->attempts, array( $outcome->to_array() ) );
			$this->handed_back = null;

			$outcome->log_id   = $this->logger->email( $message, $outcome, true );
			$this->last_result = $outcome;

			if ( ! $outcome->success ) {
				/** This action is documented in classes/Email/Dispatcher.php */
				do_action( 'vulomail_email_failed', $message, $outcome );
			}

			return;
		}

		$message           = $this->build_message( $atts );
		$outcome->attempts = array( $outcome->to_array() );
		$outcome->log_id   = $this->logger->email( $message, $outcome );
		$this->last_result = $outcome;
	}

	/**
	 * Builds a Message from wp_mail() arguments, filtered and labeled with its source.
	 *
	 * @param array $atts wp_mail() arguments.
	 * @return Message
	 */
	private function build_message( array $atts ) {
		$message         = $this->factory->from_wp_mail( $atts );
		$message->source = '' !== $this->next_source ? $this->next_source : self::detect_source();

		$this->next_source = '';

		/**
		 * Filters an email before VuloMail sends or logs it.
		 *
		 * @param Message $message The resolved message.
		 * @param array   $atts    Original wp_mail() arguments.
		 */
		$filtered = apply_filters( 'vulomail_email_message', $message, $atts );

		return $filtered instanceof Message ? $filtered : $message;
	}

	/**
	 * Fires one of core's own mail hooks without this class's observers logging it again.
	 *
	 * @param string $hook    Hook name.
	 * @param mixed  $payload Hook argument.
	 * @return void
	 */
	private function announce( $hook, $payload ) {
		$this->announcing = true;

		try {
			do_action( $hook, $payload ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.DynamicHooknameFound -- core's wp_mail_succeeded/wp_mail_failed, fired for parity with wp_mail().
		} finally {
			$this->announcing = false;
		}
	}

	/**
	 * Finds the plugin or theme that called wp_mail(), from the call stack.
	 *
	 * @return string Folder slug, or 'core' when no plugin or theme is on the stack.
	 */
	private static function detect_source() {
		$own     = wp_normalize_path( dirname( __DIR__, 2 ) );
		$plugins = wp_normalize_path( WP_PLUGIN_DIR );
		$themes  = wp_normalize_path( get_theme_root() );

		// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_debug_backtrace -- used to attribute the sender, not for debugging output.
		foreach ( debug_backtrace( DEBUG_BACKTRACE_IGNORE_ARGS, 25 ) as $frame ) {
			$file = isset( $frame['file'] ) ? wp_normalize_path( $frame['file'] ) : '';

			if ( '' === $file || 0 === strpos( $file, $own . '/' ) ) {
				continue;
			}

			foreach ( array( $plugins, $themes ) as $root ) {
				if ( 0 === strpos( $file, $root . '/' ) ) {
					return sanitize_key( strtok( substr( $file, strlen( $root ) + 1 ), '/' ) );
				}
			}
		}

		return 'core';
	}
}
