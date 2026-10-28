<?php
/**
 * Email Dispatcher class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email;

use VuloMail\Connections\ConnectionRepository;
use VuloMail\Connections\ProviderRegistry;
use VuloMail\Delivery\Result;
use VuloMail\Logging\Logger;
use VuloMail\Settings\Settings;
use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Sends a Message through the primary email connection, then the backup if the primary fails.
 */
class Dispatcher {

	/**
	 * Plugin settings.
	 *
	 * @var Settings
	 */
	private $settings;

	/**
	 * Saved connections.
	 *
	 * @var ConnectionRepository
	 */
	private $connections;

	/**
	 * Provider adapters.
	 *
	 * @var ProviderRegistry
	 */
	private $providers;

	/**
	 * Delivery log.
	 *
	 * @var Logger
	 */
	private $logger;

	/**
	 * Open and click tracking.
	 *
	 * @var Tracking
	 */
	private $tracking;

	/**
	 * Constructor.
	 *
	 * @param Settings             $settings    Plugin settings.
	 * @param ConnectionRepository $connections Saved connections.
	 * @param ProviderRegistry     $providers   Provider adapters.
	 * @param Logger               $logger      Delivery log.
	 * @param Tracking|null        $tracking    Open and click tracking.
	 */
	public function __construct( Settings $settings, ConnectionRepository $connections, ProviderRegistry $providers, Logger $logger, $tracking = null ) {
		$this->settings    = $settings;
		$this->connections = $connections;
		$this->providers   = $providers;
		$this->logger      = $logger;
		$this->tracking    = $tracking instanceof Tracking ? $tracking : new Tracking( $settings );
	}

	/**
	 * Usable connections in the order they are tried: primary, then backup.
	 *
	 * @return array<int, array>
	 */
	public function chain() {
		$chain = array();

		foreach ( array_unique( array( (string) $this->settings->get( 'email_primary' ), (string) $this->settings->get( 'email_backup' ) ) ) as $id ) {
			$connection = '' !== $id ? $this->connections->get( $id ) : null;

			if ( $connection && Utill::CHANNEL_EMAIL === $connection['channel'] && $this->connections->is_usable( $connection ) ) {
				$chain[] = $connection;
			}
		}

		return $chain;
	}

	/**
	 * Whether VuloMail will take over outgoing email.
	 *
	 * @return bool
	 */
	public function is_ready() {
		return (bool) $this->settings->get( 'email_enabled' ) && (bool) $this->chain();
	}

	/**
	 * Sends a message through the chain.
	 *
	 * @param Message $message     Message to send.
	 * @param bool    $log_failure Whether to log a failure. The wp_mail() interceptor passes false when
	 *                             a failed message will be handed back to WordPress's own mailer and
	 *                             logs the combined outcome itself. A success is always logged here.
	 * @return Result Final outcome, with ->attempts filled in.
	 */
	public function send( Message $message, $log_failure = true ) {
		$attempts = array();
		$final    = Result::fail( 'not_configured', __( 'No email connection is configured.', 'vulomail' ) );
		$chain    = $this->chain();
		// Tracked once per message, so a failover delivers the same copy under the same token.
		$outgoing = $chain ? $this->tracking->prepare( $message ) : $message;

		foreach ( $chain as $index => $connection ) {
			$final      = $this->send_via( $connection, $outgoing );
			$attempts[] = $final->to_array();

			if ( $final->success ) {
				$final->attempts = $attempts;
				$final->log_id   = $this->logger->email( $message, $final, $index > 0 );

				/**
				 * Fires after an email is accepted by a provider.
				 *
				 * @param Message $message The message.
				 * @param Result  $final   Outcome.
				 */
				do_action( 'vulomail_email_sent', $message, $final );

				return $final;
			}
		}

		$final->attempts = $attempts;

		if ( $log_failure ) {
			$final->log_id = $this->logger->email( $message, $final );

			/**
			 * Fires when every configured email connection failed.
			 *
			 * @param Message $message The message.
			 * @param Result  $final   Outcome of the last attempt; ->attempts lists them all.
			 */
			do_action( 'vulomail_email_failed', $message, $final );
		}

		return $final;
	}

	/**
	 * Sends through one connection, no failover, no logging. Used by send() and "send test email".
	 *
	 * @param array   $connection Stored connection record.
	 * @param Message $message    Message to send.
	 * @return Result
	 */
	public function send_via( array $connection, Message $message ) {
		$mailer = $this->providers->make( Utill::CHANNEL_EMAIL, $connection['provider'], $this->connections->config( $connection ) );

		if ( ! $mailer ) {
			$result = Result::fail( 'unknown_provider', __( 'This connection uses a provider that is no longer available.', 'vulomail' ) );
		} elseif ( ! $message->to ) {
			$result = Result::fail( 'no_recipients', __( 'The message has no valid recipient.', 'vulomail' ) );
		} else {
			try {
				$result = $mailer->send( $message );
			} catch ( \Throwable $e ) {
				// Adapters must return failures, not throw; don't let one take down the request.
				$result = Result::fail( 'adapter_exception', __( 'The email provider adapter failed unexpectedly.', 'vulomail' ) );
			}
		}

		$result->provider      = $connection['provider'];
		$result->connection_id = $connection['id'];

		return $result;
	}
}
