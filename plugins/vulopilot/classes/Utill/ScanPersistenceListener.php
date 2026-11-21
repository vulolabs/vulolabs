<?php
namespace VuloPilot\Utill;

use VuloPilot\Utill as CoreUtill;
use VuloPilot\Dashboard\ActivityLogRepository;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot ScanPersistenceListener class.
 *
 * @class       ScanPersistenceListener class
 * @version     1.0.0
 * @author      VuloLabs
 */
class ScanPersistenceListener {

	/**
	 * Scanner ids that never dedupe on rescan.
	 *
	 * @var string[]
	 */
	private const NEVER_DEDUPE_ON_RESCAN = array();

	/**
	 * Maps a "Notify me about" checklist type to the real finding categories that back it.
	 *
	 * @var array
	 */
	private const CRITICAL_ALERT_CATEGORIES = array(
		'security'     => array( 'security', 'ssl' ),
		'availability' => array( 'availability' ),
		'performance'  => array( 'performance' ),
		'seo'          => array( 'seo', 'geo' ),
	);

	/**
	 * Real scanner categories `maybe_log_security_scan_activity()` scopes to.
	 *
	 * @var string[]
	 */
	private const SECURITY_SCOPED_CATEGORIES = array( 'security', 'ssl' );

	/**
	 * @var ScanRepository
	 */
	private ScanRepository $scans;

	/**
	 * @var FindingRepository
	 */
	private FindingRepository $findings;

	/**
	 * @var ActivityLogRepository
	 */
	private ActivityLogRepository $activity_logs;

	/** ScanPersistenceListener constructor. */
	public function __construct() {
		$this->scans         = new ScanRepository();
		$this->findings      = new FindingRepository();
		$this->activity_logs = new ActivityLogRepository();

		add_action( 'vulopilot_scan_completed', array( $this, 'handle_scan_completed' ) );
		add_action( 'vulopilot_send_critical_alert_email', array( $this, 'send_critical_alert_email' ), 10, 4 );
	}

	/**
	 * @param ScanResult $scan_result The completed scan.
	 * @return void
	 */
	public function handle_scan_completed( ScanResult $scan_result ): void {
		$scan_id = $this->scans->insert(
			array(
				'scanner_id'      => $scan_result->get_scanner_id(),
				'status'          => $scan_result->get_status(),
				'duration_ms'     => (int) $scan_result->get_duration_ms(),
				'summary'         => wp_json_encode( $scan_result->get_summary() ),
				'scanned_objects' => wp_json_encode( $scan_result->get_scanned_post_ids() ),
				'error_message'   => $scan_result->get_error_message(),
				'started_at'      => current_time( 'mysql', true ),
				'finished_at'     => current_time( 'mysql', true ),
			)
		);

		// Real auto-resolve step (see this method's own end, after the loop, for why).
		$previously_open_ids = ! in_array( $scan_result->get_scanner_id(), self::NEVER_DEDUPE_ON_RESCAN, true )
			? array_flip( $this->findings->get_open_finding_ids_for_scanner( $scan_result->get_scanner_id() ) )
			: array();

		foreach ( $scan_result->get_findings() as $finding ) {
			$duplicate = ! in_array( $scan_result->get_scanner_id(), self::NEVER_DEDUPE_ON_RESCAN, true )
				? $this->findings->find_open_duplicate(
					$scan_result->get_scanner_id(),
					$finding->get_object_type(),
					$finding->get_object_ref(),
					$finding->get_title(),
					$finding->get_dedupe_key()
				)
				: null;

			if ( null !== $duplicate ) {
				$update = array(
					'scan_id'      => $scan_id,
					'severity'     => $finding->get_severity(),
					'category'     => $finding->get_category(),
					'title'        => $finding->get_title(),
					'description'  => $finding->get_description(),
					'meta'         => wp_json_encode( $finding->get_meta() ),
					'last_seen_at' => current_time( 'mysql', true ),
				);

				if ( 'open' !== $duplicate['status'] ) {
					$update['status']      = 'open';
					$update['resolved_at'] = null;
				}

				$this->findings->update( (int) $duplicate['id'], $update );
				unset( $previously_open_ids[ (int) $duplicate['id'] ] );
				continue;
			}

			$new_finding_id = $this->findings->insert(
				array(
					'scan_id'     => $scan_id,
					'scanner_id'  => $scan_result->get_scanner_id(),
					'severity'    => $finding->get_severity(),
					'category'    => $finding->get_category(),
					'title'       => $finding->get_title(),
					'description' => $finding->get_description(),
					'object_type' => $finding->get_object_type(),
					'object_ref'  => $finding->get_object_ref(),
					'dedupe_key'  => $finding->get_dedupe_key(),
					'meta'        => wp_json_encode( $finding->get_meta() ),
				)
			);

			/**
			 * @param int         $finding_id  The just-inserted `vulopilot_findings` row id.
			 * @param string      $severity    Severity::* constant.
			 * @param string      $category    Real finding category.
			 * @param string|null $object_type From the triggering Finding, if any.
			 * @param string|null $object_ref  From the triggering Finding, if any.
			 */
			do_action(
				'vulopilot_finding_created',
				$new_finding_id,
				$finding->get_severity(),
				$finding->get_category(),
				$finding->get_object_type(),
				$finding->get_object_ref()
			);
		}

		// Auto-resolve every finding this scanner previously had open that this run didn't reproduce.
		if ( ScanResult::STATUS_COMPLETED === $scan_result->get_status() ) {
			foreach ( array_keys( $previously_open_ids ) as $stale_id ) {
				$this->findings->update(
					$stale_id,
					array(
						'status'      => 'resolved',
						'resolved_at' => current_time( 'mysql', true ),
					)
				);
			}
		}

		$this->activity_logs->log(
			'scan.completed',
			self::describe_scan( $scan_result->get_scanner_id(), count( $scan_result->get_findings() ), ScanResult::STATUS_FAILED === $scan_result->get_status() ),
			ScanResult::STATUS_FAILED === $scan_result->get_status() ? Severity::HIGH : Severity::INFO,
			'system',
			'scan',
			(string) $scan_id
		);

		$this->maybe_log_security_scan_activity( $scan_result, $scan_id );
		$this->maybe_notify_critical_findings( $scan_result );

		/**
		 * @param ScanResult $scan_result The completed scan.
		 * @param int        $scan_id     The just-inserted `vulopilot_scans` row id.
		 */
		do_action( 'vulopilot_scan_persisted', $scan_result, $scan_id );
	}

	/**
	 * @param ScanResult $scan_result The completed scan.
	 * @param int        $scan_id     The just-inserted `vulopilot_scans` row id.
	 * @return void
	 */
	private function maybe_log_security_scan_activity( ScanResult $scan_result, int $scan_id ): void {
		$scanner = VuloPilot()->scanner_registry->get_scanner( $scan_result->get_scanner_id() );

		if ( ! $scanner || ! in_array( $scanner->get_category(), self::SECURITY_SCOPED_CATEGORIES, true ) ) {
			return;
		}

		$this->activity_logs->log(
			'scan.completed.security',
			self::describe_scan( $scan_result->get_scanner_id(), count( $scan_result->get_findings() ), ScanResult::STATUS_FAILED === $scan_result->get_status() ),
			ScanResult::STATUS_FAILED === $scan_result->get_status() ? Severity::HIGH : Severity::INFO,
			'system',
			'scan',
			(string) $scan_id
		);
	}

	/**
	 * Human-readable activity line for one scan, e.g. "About page analysis: 2 issues found".
	 *
	 * Uses the scanner's label rather than its id; falls back to the id when the scanner is no longer registered.
	 *
	 * @param string $scanner_id Scanner id.
	 * @param int    $count      Number of findings the scan raised.
	 * @param bool   $failed     Whether the scan failed.
	 * @return string
	 */
	public static function describe_scan( string $scanner_id, int $count, bool $failed = false ): string {
		$scanner = VuloPilot()->scanner_registry->get_scanner( $scanner_id );
		$label   = $scanner ? $scanner->get_label() : $scanner_id;

		if ( $failed ) {
			/* translators: %s: scan name. */
			return sprintf( __( '%s: scan failed', 'vulopilot' ), $label );
		}

		if ( 0 === $count ) {
			/* translators: %s: scan name. */
			return sprintf( __( '%s: no issues found', 'vulopilot' ), $label );
		}

		/* translators: 1: scan name, 2: number of issues found. */
		return sprintf( _n( '%1$s: %2$d issue found', '%1$s: %2$d issues found', $count, 'vulopilot' ), $label, $count );
	}

	/**
	 * Emails the site's notification address when this scan raised any critical-severity finding.
	 *
	 * @param ScanResult $scan_result The completed scan.
	 * @return void
	 */
	private function maybe_notify_critical_findings( ScanResult $scan_result ): void {
		$settings = wp_parse_args( get_option( CoreUtill::VULOPILOT_SETTINGS_KEY, array() ), CoreUtill::VULOPILOT_SETTINGS_DEFAULTS );

		if ( empty( $settings['notify_on_critical_findings'] ) ) {
			return;
		}

		$enabled_types = (array) ( $settings['critical_alert_types'] ?? array() );

		$critical_findings = array_values(
			array_filter(
				$scan_result->get_findings(),
				fn( Finding $finding ) =>
					Severity::CRITICAL === $finding->get_severity()
					&& $this->is_critical_alert_type_enabled( $finding->get_category(), $enabled_types )
			)
		);

		if ( empty( $critical_findings ) ) {
			return;
		}

		$message = implode(
			"\n",
			array_map(
				static fn( Finding $finding ): string => '- ' . $finding->get_title(),
				$critical_findings
			)
		);

		$channels = (array) ( $settings['alert_channels'] ?? array() );

		if ( in_array( 'dashboard', $channels, true ) ) {
			$this->activity_logs->log(
				'critical_alert',
				sprintf(
					/* translators: %d is the number of critical findings. */
					__( 'VuloPilot found %d critical issue(s).', 'vulopilot' ),
					count( $critical_findings )
				),
				'critical',
				'system'
			);
		}

		if ( ! in_array( 'email', $channels, true ) ) {
			return;
		}

		$recipient = $settings['notification_email'] ? $settings['notification_email'] : get_option( 'admin_email' );
		$headers   = array();

		if ( ! empty( $settings['email_from_address'] ) && is_email( $settings['email_from_address'] ) ) {
			$from_name = $settings['email_from_name'] ? $settings['email_from_name'] : get_bloginfo( 'name' );
			$headers[] = sprintf( 'From: %s <%s>', $from_name, $settings['email_from_address'] );
		}

		// Scheduled instead of sent inline.
		wp_schedule_single_event(
			time(),
			'vulopilot_send_critical_alert_email',
			array(
				$recipient,
				sprintf(
					/* translators: 1: site name, 2: number of critical findings. */
					__( '[%1$s] VuloPilot found %2$d critical issue(s)', 'vulopilot' ),
					get_bloginfo( 'name' ),
					count( $critical_findings )
				),
				$message,
				$headers,
			)
		);
	}

	/**
	 * Cron callback for `vulopilot_send_critical_alert_email`.
	 *
	 * @param string   $recipient
	 * @param string   $subject
	 * @param string   $message
	 * @param string[] $headers
	 * @return void
	 */
	public function send_critical_alert_email( string $recipient, string $subject, string $message, array $headers ): void {
		wp_mail( $recipient, $subject, $message, $headers );
	}

	/**
	 * Whether $category is allowed to alert, per the "Notify me about" checklist.
	 *
	 * @param string   $category      The finding's own real category.
	 * @param string[] $enabled_types Enabled 'critical_alert_types' values.
	 * @return bool
	 */
	private function is_critical_alert_type_enabled( string $category, array $enabled_types ): bool {
		foreach ( self::CRITICAL_ALERT_CATEGORIES as $type => $categories ) {
			if ( in_array( $category, $categories, true ) ) {
				return in_array( $type, $enabled_types, true );
			}
		}

		return in_array( 'other', $enabled_types, true );
	}
}
