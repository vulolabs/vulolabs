<?php
/**
 * Logger class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Logging;

use VuloMail\Delivery\Result;
use VuloMail\Email\Message;
use VuloMail\Security\Redactor;
use VuloMail\Settings\Settings;
use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Writes one delivery log row per message, applying the site's privacy settings, and prunes old rows.
 */
class Logger {

	/**
	 * Daily cron hook that applies the retention period.
	 */
	const RETENTION_HOOK = 'vulomail_prune_logs';

	/**
	 * Log storage.
	 *
	 * @var LogRepository
	 */
	private $logs;

	/**
	 * Plugin settings.
	 *
	 * @var Settings
	 */
	private $settings;

	/**
	 * Constructor.
	 *
	 * @param LogRepository $logs     Log storage.
	 * @param Settings      $settings Plugin settings.
	 */
	public function __construct( LogRepository $logs, Settings $settings ) {
		$this->logs     = $logs;
		$this->settings = $settings;
	}

	/**
	 * Schedules and handles the daily retention run.
	 *
	 * @return void
	 */
	public function register_retention() {
		add_action( self::RETENTION_HOOK, array( $this, 'prune' ) );

		if ( ! wp_next_scheduled( self::RETENTION_HOOK ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::RETENTION_HOOK );
		}
	}

	/**
	 * Deletes rows older than the retention period. 0 days means keep forever.
	 *
	 * @return void
	 */
	public function prune() {
		$days = (int) $this->settings->get( 'log_retention_days' );

		if ( $days > 0 ) {
			$this->logs->delete_before( gmdate( 'Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS ) );
		}
	}

	/**
	 * Logs an email.
	 *
	 * @param Message $message       The message.
	 * @param Result  $result        Final outcome (its ->attempts lists every provider tried).
	 * @param bool    $used_fallback Whether a connection other than the primary delivered it.
	 * @return int Log row id, 0 when logging is off.
	 */
	public function email( Message $message, Result $result, $used_fallback = false ) {
		$headers = array_filter(
			array(
				'From'         => Message::format(
					array(
						'email' => $message->from_email,
						'name'  => $message->from_name,
					)
				),
				'Reply-To'     => Message::format_list( $message->reply_to ),
				'Content-Type' => $message->content_type,
			)
		);

		// Tracking is only kept for a message that went out: a failed one has no opens to count.
		$tracking = $result->success && is_array( $message->tracking ) ? $message->tracking : null;

		return $this->write(
			Utill::CHANNEL_EMAIL,
			$message->all_recipients(),
			$message->subject,
			$message->body,
			$result,
			$used_fallback,
			array(
				'headers'        => wp_json_encode( $headers ),
				'attachments'    => count( $message->attachments ),
				'source'         => $message->source,
				'tracking_token' => $tracking ? (string) $tracking['token'] : '',
				'track_opens'    => $tracking && ! empty( $tracking['opens'] ) ? 1 : 0,
				'track_clicks'   => $tracking && ! empty( $tracking['clicks'] ) ? 1 : 0,
			)
		);
	}

	/**
	 * Logs an SMS.
	 *
	 * @param string $to            Recipient number.
	 * @param string $body          Message text.
	 * @param Result $result        Final outcome.
	 * @param bool   $used_fallback Whether the backup gateway delivered it.
	 * @param string $source        Slug of the sender.
	 * @return int Log row id, 0 when logging is off.
	 */
	public function sms( $to, $body, Result $result, $used_fallback = false, $source = '' ) {
		return $this->write( Utill::CHANNEL_SMS, array( $to ), '', $body, $result, $used_fallback, array( 'source' => $source ) );
	}

	/**
	 * Writes a log row for a delivery attempt.
	 *
	 * @param string   $channel       Channel.
	 * @param string[] $recipients    Recipient addresses or numbers.
	 * @param string   $subject       Subject (email only).
	 * @param string   $body          Message body.
	 * @param Result   $result        Final outcome.
	 * @param bool     $used_fallback Whether a backup delivered it.
	 * @param array    $extra         Extra columns.
	 * @return int
	 */
	private function write( $channel, array $recipients, $subject, $body, Result $result, $used_fallback, array $extra ) {
		if ( ! $this->settings->get( 'log_enabled' ) ) {
			return 0;
		}

		if ( $this->settings->get( 'mask_recipients' ) ) {
			$recipients = array_map(
				array( Redactor::class, Utill::CHANNEL_SMS === $channel ? 'mask_phone' : 'mask_email' ),
				$recipients
			);
		}

		$row = array_merge(
			array(
				'channel'       => $channel,
				'status'        => $result->success ? 'sent' : 'failed',
				'provider'      => $result->provider,
				'connection_id' => $result->connection_id,
				'used_fallback' => $used_fallback ? 1 : 0,
				'recipients'    => implode( ', ', $recipients ),
				'subject'       => mb_substr( wp_strip_all_tags( $subject ), 0, 255 ),
				// Message content is personal data and may carry reset links or codes, so it is only
				// stored when the site owner has opted in.
				'body'          => $this->settings->get( 'log_content' ) ? $body : null,
				'message_id'    => $result->message_id,
				'error_code'    => $result->error_code,
				'error_message' => $result->success ? null : $result->error_message,
				'attempts'      => wp_json_encode( $result->attempts ),
				'created_at'    => gmdate( 'Y-m-d H:i:s' ),
			),
			$extra
		);

		$row['source'] = mb_substr( (string) ( $row['source'] ?? '' ), 0, 100 );

		/**
		 * Filters a log row before it is stored. Return false to skip logging this message.
		 *
		 * @param array|false $row     Column => value.
		 * @param string      $channel 'email' or 'sms'.
		 */
		$row = apply_filters( 'vulomail_log_data', $row, $channel );

		return is_array( $row ) ? $this->logs->insert( $row ) : 0;
	}
}
