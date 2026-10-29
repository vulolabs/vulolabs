<?php
/**
 * Diagnostics class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Diagnostics;

use VuloMail\Email\MessageFactory;
use VuloMail\Email\WpMailInterceptor;
use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Read-only health checks for the Tools → Diagnostics screen. Every non-"good" result says what to do (`fix`) and, where a screen can solve it, links there (`action`).
 */
class Diagnostics {

	/**
	 * Other plugins that also take over wp_mail(). Two active at once compete for the same message.
	 *
	 * @var array<string, string> Plugin file => name.
	 */
	const MAIL_PLUGINS = array(
		'wp-mail-smtp/wp_mail_smtp.php'                   => 'WP Mail SMTP',
		'wp-mail-smtp-pro/wp_mail_smtp.php'               => 'WP Mail SMTP Pro',
		'post-smtp/postman-smtp.php'                      => 'Post SMTP',
		'fluent-smtp/fluent-smtp.php'                     => 'FluentSMTP',
		'easy-wp-smtp/easy-wp-smtp.php'                   => 'Easy WP SMTP',
		'smtp-mailer/main.php'                            => 'SMTP Mailer',
		'wp-smtp/wp-smtp.php'                             => 'WP SMTP',
		'mailgun/mailgun.php'                             => 'Mailgun',
		'sendgrid-email-delivery-simplified/wpsendgrid.php' => 'SendGrid',
		'mailin/sendinblue.php'                           => 'Brevo',
		'postmark-approved-wordpress-plugin/postmark.php' => 'Postmark',
		'site-mailer/site-mailer.php'                     => 'Site Mailer',
		'gmail-smtp/main.php'                             => 'Gmail SMTP',
	);

	/**
	 * How many of the newest log entries the "recent delivery" check looks at.
	 */
	const RECENT_SAMPLE = 10;

	/**
	 * Runs every check.
	 *
	 * @return array<int, array{id: string, label: string, status: string, message: string, fix: string, action: array|null}> status is good|warning|error|info.
	 */
	public function run() {
		$checks = array();

		foreach ( array( 'email_routing', 'wp_mail', 'recent_email', 'sender', 'sender_dns', 'other_mail_plugins', 'sms_routing', 'connections', 'environment', 'log_table', 'cron' ) as $check ) {
			try {
				$checks[] = $this->{'check_' . $check}();
			} catch ( \Throwable $e ) {
				// One check that can't run must not take the rest of the screen down with it.
				$checks[] = self::result(
					$check,
					__( 'Diagnostics', 'vulomail' ),
					'info',
					/* translators: %s: check id. */
					sprintf( __( 'The "%s" check could not run on this server.', 'vulomail' ), $check ),
					__( 'This does not affect delivery. If it keeps happening, check the PHP error log for the cause.', 'vulomail' )
				);
			}
		}

		/**
		 * Filters the diagnostics results. Integrations can append their own checks.
		 *
		 * @param array $checks Check results: id, label, status (good|warning|error|info), message,
		 *                      and optionally fix (what to do) and action (label plus tab or url).
		 */
		$checks = (array) apply_filters( 'vulomail_diagnostics', array_values( array_filter( $checks ) ) );

		return array_values(
			array_filter(
				$checks,
				static function ( $check ) {
					return is_array( $check ) && isset( $check['id'], $check['label'], $check['status'], $check['message'] );
				}
			)
		);
	}

	/**
	 * Builds one check's result row.
	 *
	 * @param string     $id      Check id.
	 * @param string     $label   Check name.
	 * @param string     $status  good|warning|error|info.
	 * @param string     $message What was found.
	 * @param string     $fix     What to do about it.
	 * @param array|null $action  Where to do it, from to_tab() or to_url().
	 * @return array
	 */
	private static function result( $id, $label, $status, $message, $fix = '', $action = null ) {
		return array(
			'id'      => $id,
			'label'   => $label,
			'status'  => $status,
			'message' => $message,
			'fix'     => $fix,
			'action'  => $action,
		);
	}

	/**
	 * Builds an action that opens a VuloMail admin tab.
	 *
	 * @param string $label Button text.
	 * @param string $tab   VuloMail admin tab, optionally with `&subtab=`.
	 * @return array
	 */
	private static function to_tab( $label, $tab ) {
		return array(
			'label' => $label,
			'tab'   => $tab,
		);
	}

	/**
	 * Builds an action that opens an arbitrary admin URL.
	 *
	 * @param string $label Button text.
	 * @param string $url   Admin URL.
	 * @return array
	 */
	private static function to_url( $label, $url ) {
		return array(
			'label' => $label,
			'url'   => $url,
		);
	}

	/**
	 * Builds the "Add a connection" action shared by several checks.
	 *
	 * @return array
	 */
	private static function add_connection() {
		return self::to_tab( __( 'Add a connection', 'vulomail' ), 'settings&subtab=connections' );
	}

	/**
	 * Checks whether email routing is configured and working.
	 *
	 * @return array
	 */
	private function check_email_routing() {
		$label = __( 'Email routing', 'vulomail' );
		$chain = VuloMail()->email->chain();

		if ( ! VuloMail()->settings->get( 'email_enabled' ) ) {
			return self::result(
				'email_routing',
				$label,
				'info',
				__( 'Email routing is switched off. WordPress sends email with its default mailer.', 'vulomail' ),
				__( 'To deliver email through your own provider, switch on "Send email through VuloMail" under Settings → Email.', 'vulomail' ),
				self::to_tab( __( 'Open email settings', 'vulomail' ), 'settings&subtab=email' )
			);
		}

		if ( ! $chain ) {
			return self::result(
				'email_routing',
				$label,
				'warning',
				__( 'No working email connection is set as primary. WordPress sends email with its default mailer, which many hosts restrict.', 'vulomail' ),
				__( 'Add a connection for your email provider (or any SMTP account), complete its fields, and choose it as the primary email connection.', 'vulomail' ),
				self::add_connection()
			);
		}

		$names = implode( ' → ', array_column( $chain, 'label' ) );

		if ( 1 === count( $chain ) ) {
			return self::result(
				'email_routing',
				$label,
				'good',
				/* translators: %s: connection name. */
				sprintf( __( 'Email is sent through %s.', 'vulomail' ), $names ),
				__( 'Optional: add a second connection and set it as backup, so email keeps going out if the primary one fails.', 'vulomail' )
			);
		}

		/* translators: %s: connection names in failover order. */
		return self::result( 'email_routing', $label, 'good', sprintf( __( 'Email is sent through %s.', 'vulomail' ), $names ) );
	}

	/**
	 * Checks whether a sender address is configured.
	 *
	 * @return array
	 */
	private function check_sender() {
		$label = __( 'Sender address', 'vulomail' );
		$from  = (string) VuloMail()->settings->get( 'from_email' );

		if ( '' === $from ) {
			return self::result(
				'sender',
				$label,
				'warning',
				/* translators: %s: email address. */
				sprintf( __( 'No sender address is set, so email is sent from %s. Most providers only accept a sender you have verified with them.', 'vulomail' ), MessageFactory::default_from_email() ),
				__( 'Enter a sender email under Settings → Email. Use an address on your own domain that your email provider has verified.', 'vulomail' ),
				self::to_tab( __( 'Set the sender', 'vulomail' ), 'settings&subtab=email' )
			);
		}

		/* translators: %s: email address. */
		return self::result( 'sender', $label, 'good', sprintf( __( 'Email is sent from %s.', 'vulomail' ), $from ) );
	}

	/**
	 * Looks up the sender domain's SPF and DMARC records.
	 *
	 * @return array|null
	 */
	private function check_sender_dns() {
		$label = __( 'Sender domain DNS', 'vulomail' );
		$from  = (string) VuloMail()->settings->get( 'from_email' );
		$from  = '' !== $from ? $from : MessageFactory::default_from_email();
		$host  = substr( (string) strrchr( $from, '@' ), 1 );

		// Dev hosts have no public DNS, and PHP's resolver call has no timeout to cut a lookup short.
		if ( '' === $host || ! function_exists( 'dns_get_record' ) || false === strpos( $host, '.' ) || preg_match( '/\.(test|local|localhost|example|invalid|internal|lan)$/i', $host ) ) {
			return null;
		}

		// Cached so reopening the screen doesn't repeat lookups; failures cache shorter so a retry isn't stuck waiting.
		$cache_key = 'vulomail_dns_' . md5( $host );
		$cached    = get_transient( $cache_key );

		if ( is_array( $cached ) && array_key_exists( 'spf', $cached ) ) {
			$spf   = $cached['spf'];
			$dmarc = $cached['dmarc'];
		} else {
			$spf    = self::has_txt_record( $host, 'v=spf1' );
			$dmarc  = null === $spf ? null : self::has_txt_record( '_dmarc.' . $host, 'v=DMARC1' );
			$failed = null === $spf || null === $dmarc;

			set_transient(
				$cache_key,
				array(
					'spf'   => $spf,
					'dmarc' => $dmarc,
				),
				( $failed ? 2 : 10 ) * MINUTE_IN_SECONDS
			);
		}

		if ( null === $spf || null === $dmarc ) {
			return self::result(
				'sender_dns',
				$label,
				'info',
				/* translators: %s: domain name. */
				sprintf( __( 'The DNS records for %s could not be looked up from this server, so SPF and DMARC were not checked.', 'vulomail' ), $host ),
				__( 'This is a limit of the server, not a delivery problem. Check the domain with any online SPF/DMARC lookup tool instead.', 'vulomail' )
			);
		}

		if ( $spf && $dmarc ) {
			/* translators: %s: domain name. */
			return self::result( 'sender_dns', $label, 'good', sprintf( __( '%s publishes SPF and DMARC records. DKIM is set up with your email provider and can\'t be checked from here.', 'vulomail' ), $host ) );
		}

		$steps = array();

		if ( ! $spf ) {
			/* translators: %s: domain name. */
			$steps[] = sprintf( __( 'SPF: add a TXT record on %s that starts with "v=spf1" and includes your email provider (the provider\'s setup guide gives the exact value).', 'vulomail' ), $host );
		}

		if ( ! $dmarc ) {
			/* translators: %s: DNS host name. */
			$steps[] = sprintf( __( 'DMARC: add a TXT record on %s, for example "v=DMARC1; p=none;".', 'vulomail' ), '_dmarc.' . $host );
		}

		$steps[] = __( 'Records are added where the domain\'s DNS is managed (your registrar or host). Changes can take a few hours to show here.', 'vulomail' );

		return self::result(
			'sender_dns',
			$label,
			'warning',
			/* translators: 1: domain name, 2: missing record types. */
			sprintf( __( '%1$s has no %2$s record. Mailbox providers such as Gmail and Yahoo may reject or junk email from it.', 'vulomail' ), $host, implode( ' / ', array_filter( array( $spf ? '' : 'SPF', $dmarc ? '' : 'DMARC' ) ) ) ),
			implode( ' ', $steps )
		);
	}

	/**
	 * Whether a TXT record with a given prefix exists for a host.
	 *
	 * @param string $host   Host to query.
	 * @param string $prefix Record prefix to look for.
	 * @return bool|null Null when the lookup itself failed.
	 */
	private static function has_txt_record( $host, $prefix ) {
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- dns_get_record() raises a warning on any resolver hiccup.
		$records = @dns_get_record( $host, DNS_TXT );

		if ( false === $records ) {
			return null;
		}

		foreach ( $records as $record ) {
			if ( 0 === stripos( (string) ( $record['txt'] ?? '' ), $prefix ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Works out what happens to a wp_mail() call: VuloMail sends it, another plugin takes it, or it falls through to PHP's mail().
	 *
	 * @return array
	 */
	private function check_wp_mail() {
		$label = __( 'wp_mail() delivery', 'vulomail' );

		try {
			$file = wp_normalize_path( (string) ( new \ReflectionFunction( 'wp_mail' ) )->getFileName() );
		} catch ( \ReflectionException $e ) {
			$file = '';
		}

		if ( '' !== $file && false === strpos( $file, '/' . WPINC . '/pluggable.php' ) ) {
			return self::result(
				'wp_mail',
				$label,
				'error',
				/* translators: %s: plugin name or file path. */
				sprintf( __( '%s replaces WordPress\'s wp_mail() function with its own, so email does not pass through VuloMail at all.', 'vulomail' ), self::origin_name( $file ) ),
				__( 'Deactivate that plugin, or switch off its email sending feature, then reload this page.', 'vulomail' ),
				self::to_url( __( 'Open Plugins', 'vulomail' ), admin_url( 'plugins.php' ) )
			);
		}

		$enabled = (bool) VuloMail()->settings->get( 'email_enabled' );
		$chain   = VuloMail()->email->chain();
		$earlier = self::foreign_callbacks( 'pre_wp_mail' );

		if ( $enabled && $chain ) {
			if ( $earlier ) {
				return self::result(
					'wp_mail',
					$label,
					'info',
					/* translators: 1: connection name, 2: plugin names. */
					sprintf( __( 'wp_mail() is handled by VuloMail and sent through %1$s. %2$s also hooks in ahead of VuloMail (the pre_wp_mail filter) and can send or stop a message first.', 'vulomail' ), $chain[0]['label'], implode( ', ', $earlier ) ),
					__( 'Nothing to do if that plugin only watches email. If messages are missing from the VuloMail log, switch off that plugin\'s own email sending.', 'vulomail' )
				);
			}

			return self::result(
				'wp_mail',
				$label,
				'good',
				/* translators: 1: connection name, 2: provider name. */
				sprintf( __( 'wp_mail() is handled by VuloMail: email is sent through %1$s (%2$s).', 'vulomail' ), $chain[0]['label'], self::provider_name( $chain[0]['provider'] ) )
			);
		}

		// From here on VuloMail is not delivering: the message goes to WordPress's built-in mailer.
		$why = $enabled
			? __( 'No working email connection is set as primary, so VuloMail is not delivering email.', 'vulomail' )
			: __( 'Email routing is switched off, so VuloMail is not delivering email.', 'vulomail' );
		$fix = $enabled
			? __( 'Add an email connection (SMTP or a provider API) and set it as primary. VuloMail then sends email itself and no longer depends on the server\'s own mail setup.', 'vulomail' )
			: __( 'Switch on "Send email through VuloMail" under Settings → Email, and make sure an email connection is set as primary.', 'vulomail' );
		$go  = $enabled ? self::add_connection() : self::to_tab( __( 'Open email settings', 'vulomail' ), 'settings&subtab=email' );

		if ( $earlier ) {
			return self::result(
				'wp_mail',
				$label,
				'info',
				/* translators: %s: plugin names. */
				$why . ' ' . sprintf( __( '%s hooks into wp_mail() (the pre_wp_mail filter) and may be sending email itself.', 'vulomail' ), implode( ', ', $earlier ) ),
				__( 'Send a test email with "Live routing" to see whether email goes out. Keep only one plugin in charge of delivery.', 'vulomail' ) . ' ' . $fix,
				$go
			);
		}

		$reconfigured = self::foreign_callbacks( 'phpmailer_init' );

		if ( $reconfigured ) {
			return self::result(
				'wp_mail',
				$label,
				'info',
				/* translators: %s: plugin names. */
				$why . ' ' . sprintf( __( 'wp_mail() uses WordPress\'s built-in mailer, which %s reconfigures (the phpmailer_init hook). VuloMail can\'t tell where that sends email.', 'vulomail' ), implode( ', ', $reconfigured ) ),
				__( 'Send a test email with "Live routing" to see whether email goes out.', 'vulomail' ) . ' ' . $fix,
				$go
			);
		}

		$mail = self::describe_php_mail( self::php_mail_environment() );

		if ( 'disabled' === $mail['state'] ) {
			return self::result( 'wp_mail', $label, 'error', $why . ' ' . __( 'wp_mail() falls back to PHP\'s mail(), which is disabled on this server — nothing from this site is being sent.', 'vulomail' ), $fix, $go );
		}

		if ( 'no_transport' === $mail['state'] ) {
			return self::result(
				'wp_mail',
				$label,
				'error',
				/* translators: %s: path of the missing mail program. */
				$why . ' ' . sprintf( __( 'wp_mail() falls back to PHP\'s mail(), but this server has no mail program to hand messages to (%s was not found) — nothing from this site is being sent.', 'vulomail' ), $mail['detail'] ),
				$fix,
				$go
			);
		}

		return self::result(
			'wp_mail',
			$label,
			'warning',
			/* translators: %s: how PHP mail() hands messages on, e.g. a sendmail path. */
			$why . ' ' . sprintf( __( 'wp_mail() falls back to PHP\'s mail() (%s), which is not authenticated — email sent this way is often rejected or marked spam, and many hosts limit or block it.', 'vulomail' ), $mail['detail'] ),
			$fix,
			$go
		);
	}

	/**
	 * Reads how PHP's own mail() is set up on this server.
	 *
	 * @return array{function: bool, windows: bool, sendmail_path: string, binary_found: bool|null, smtp: string}
	 */
	private static function php_mail_environment() {
		$disabled = array_map( 'trim', explode( ',', (string) ini_get( 'disable_functions' ) ) );
		$path     = trim( (string) ini_get( 'sendmail_path' ) );
		$binary   = (string) strtok( $path, ' ' );
		$found    = null;

		// open_basedir blocks PHP from checking the binary; that says nothing about whether it exists.
		if ( '' !== $binary && '' === (string) ini_get( 'open_basedir' ) ) {
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- a path PHP may not stat must not raise a warning.
			$found = (bool) @is_executable( $binary );
		}

		return array(
			'function'      => function_exists( 'mail' ) && ! in_array( 'mail', $disabled, true ),
			'windows'       => 'WIN' === strtoupper( substr( PHP_OS, 0, 3 ) ),
			'sendmail_path' => $path,
			'binary_found'  => $found,
			'smtp'          => ini_get( 'SMTP' ) . ':' . ini_get( 'smtp_port' ),
		);
	}

	/**
	 * Decides whether PHP's mail() can hand a message to anything.
	 *
	 * @param array $env From php_mail_environment().
	 * @return array{state: string, detail: string} state is disabled|no_transport|available.
	 */
	public static function describe_php_mail( array $env ) {
		if ( empty( $env['function'] ) ) {
			return array(
				'state'  => 'disabled',
				'detail' => '',
			);
		}

		// On Windows PHP relays to an SMTP server instead of running a mail program.
		if ( ! empty( $env['windows'] ) ) {
			return array(
				'state'  => 'available',
				'detail' => (string) $env['smtp'],
			);
		}

		$path   = (string) $env['sendmail_path'];
		$binary = (string) strtok( $path, ' ' );

		if ( '' === $path || false === $env['binary_found'] ) {
			return array(
				'state'  => 'no_transport',
				'detail' => '' !== $binary ? $binary : 'sendmail',
			);
		}

		return array(
			'state'  => 'available',
			'detail' => $binary,
		);
	}

	/**
	 * Lists who else is hooked to a mail hook, leaving out VuloMail's own callbacks.
	 *
	 * @param string $hook Hook name.
	 * @return string[] Plugin names (or file paths), without duplicates.
	 */
	private static function foreign_callbacks( $hook ) {
		global $wp_filter;

		if ( empty( $wp_filter[ $hook ] ) || empty( $wp_filter[ $hook ]->callbacks ) ) {
			return array();
		}

		$own   = wp_normalize_path( dirname( __DIR__, 2 ) ) . '/';
		$names = array();

		foreach ( $wp_filter[ $hook ]->callbacks as $callbacks ) {
			foreach ( $callbacks as $callback ) {
				$file = self::callback_file( $callback['function'] );

				if ( '' !== $file && 0 !== strpos( $file, $own ) ) {
					$names[] = self::origin_name( $file );
				}
			}
		}

		return array_values( array_unique( $names ) );
	}

	/**
	 * Finds the file that defines a hook callback.
	 *
	 * @param mixed $callback A hook callback.
	 * @return string File that defines it, '' when unknown.
	 */
	private static function callback_file( $callback ) {
		try {
			if ( is_string( $callback ) && false !== strpos( $callback, '::' ) ) {
				$callback = explode( '::', $callback, 2 );
			}

			if ( is_array( $callback ) ) {
				$reflection = new \ReflectionMethod( $callback[0], $callback[1] );
			} elseif ( is_object( $callback ) && ! $callback instanceof \Closure ) {
				$reflection = new \ReflectionMethod( $callback, '__invoke' );
			} else {
				$reflection = new \ReflectionFunction( $callback );
			}

			return wp_normalize_path( (string) $reflection->getFileName() );
		} catch ( \Throwable $e ) {
			return '';
		}
	}

	/**
	 * Turns a file path into something a site owner recognises: a plugin's name, or its path inside WordPress.
	 *
	 * @param string $file Normalised file path.
	 * @return string
	 */
	private static function origin_name( $file ) {
		$plugins = wp_normalize_path( WP_PLUGIN_DIR ) . '/';

		if ( 0 === strpos( $file, $plugins ) ) {
			$folder = (string) strtok( substr( $file, strlen( $plugins ) ), '/' );

			if ( ! function_exists( 'get_plugins' ) ) {
				require_once ABSPATH . 'wp-admin/includes/plugin.php';
			}

			foreach ( get_plugins() as $path => $plugin ) {
				if ( strtok( $path, '/' ) === $folder && ! empty( $plugin['Name'] ) ) {
					return $plugin['Name'];
				}
			}

			return $folder;
		}

		return str_replace( wp_normalize_path( ABSPATH ), '', $file );
	}

	/**
	 * Human-readable label for a provider id.
	 *
	 * @param string $provider Provider id from a log row or a connection.
	 * @return string
	 */
	private static function provider_name( $provider ) {
		if ( WpMailInterceptor::DEFAULT_PROVIDER === $provider ) {
			return __( 'WordPress\'s built-in mailer', 'vulomail' );
		}

		$definition = VuloMail()->providers->definition( Utill::CHANNEL_EMAIL, $provider );

		return $definition && ! empty( $definition['label'] ) ? $definition['label'] : $provider;
	}

	/**
	 * Uses the delivery log as evidence of whether email is really going out.
	 *
	 * @return array
	 */
	private function check_recent_email() {
		$label = __( 'Recent email delivery', 'vulomail' );
		$test  = __( 'Use "Send a test email" on this page and check that it reaches the inbox.', 'vulomail' );

		if ( ! VuloMail()->settings->get( 'log_enabled' ) ) {
			return self::result(
				'recent_email',
				$label,
				'info',
				__( 'The delivery log is switched off, so there is no record of whether recent email went out.', 'vulomail' ),
				__( 'Switch on the delivery log under Settings → Logging & Privacy to have this checked from now on.', 'vulomail' ) . ' ' . $test,
				self::to_tab( __( 'Open logging settings', 'vulomail' ), 'settings&subtab=logging' )
			);
		}

		$rows = VuloMail()->logs->recent( Utill::CHANNEL_EMAIL, self::RECENT_SAMPLE );

		if ( ! $rows ) {
			return self::result( 'recent_email', $label, 'info', __( 'No email has been logged yet, so nothing confirms that email is going out.', 'vulomail' ), $test );
		}

		$summary = self::summarise_recent( $rows );
		$latest  = $rows[0];
		$ago     = human_time_diff( (int) strtotime( $latest['created_at'] . ' UTC' ), time() );
		$via     = self::provider_name( (string) $latest['provider'] );
		$logs    = self::to_tab( __( 'View logs', 'vulomail' ), 'logs' );
		$repair  = __( 'Open Logs to see the full error for each attempt. The usual causes are a wrong password or API key, a sender address the provider has not verified, or a host that blocks the SMTP port. Correct the connection, then send a test email.', 'vulomail' );

		if ( $summary['streak'] > 0 ) {
			$error = '' !== (string) $latest['error_message'] ? (string) $latest['error_message'] : __( 'No error message was recorded.', 'vulomail' );

			if ( $summary['streak'] === $summary['total'] && $summary['total'] >= 3 ) {
				return self::result(
					'recent_email',
					$label,
					'error',
					/* translators: 1: number of emails, 2: time span such as "5 mins", 3: error message. */
					sprintf( __( 'The last %1$d emails all failed — nothing is going out. Latest error, %2$s ago: %3$s', 'vulomail' ), $summary['total'], $ago, $error ),
					$repair,
					$logs
				);
			}

			return self::result(
				'recent_email',
				$label,
				'warning',
				/* translators: 1: time span such as "5 mins", 2: error message, 3: failed count, 4: number of emails checked. */
				sprintf( __( 'The most recent email failed %1$s ago: %2$s (%3$d of the last %4$d failed).', 'vulomail' ), $ago, $error, $summary['failed'], $summary['total'] ),
				$repair,
				$logs
			);
		}

		if ( $summary['failed'] > 0 ) {
			return self::result(
				'recent_email',
				$label,
				$summary['failed'] * 2 >= $summary['total'] ? 'warning' : 'good',
				/* translators: 1: provider name, 2: time span such as "5 mins", 3: failed count, 4: number of emails checked. */
				sprintf( __( 'The last email was accepted by %1$s %2$s ago, but %3$d of the last %4$d failed.', 'vulomail' ), $via, $ago, $summary['failed'], $summary['total'] ),
				__( 'Open Logs and filter by "Failed" to see which messages did not go out and why.', 'vulomail' ),
				$logs
			);
		}

		if ( 1 === $summary['total'] ) {
			/* translators: 1: provider name, 2: time span such as "5 mins". */
			return self::result( 'recent_email', $label, 'good', sprintf( __( 'The last email was accepted by %1$s %2$s ago. It is the only one logged so far.', 'vulomail' ), $via, $ago ) );
		}

		/* translators: 1: provider name, 2: time span such as "5 mins", 3: number of emails checked. */
		return self::result( 'recent_email', $label, 'good', sprintf( __( 'The last email was accepted by %1$s %2$s ago, and none of the last %3$d failed.', 'vulomail' ), $via, $ago, $summary['total'] ) );
	}

	/**
	 * Summarizes recent log rows into totals and a failure streak.
	 *
	 * @param array $rows Log rows, newest first; each needs a `status`.
	 * @return array{total: int, failed: int, streak: int} streak counts the failures at the newest end.
	 */
	public static function summarise_recent( array $rows ) {
		$failed = 0;
		$streak = 0;
		$broken = false;

		foreach ( $rows as $row ) {
			if ( 'failed' === ( $row['status'] ?? '' ) ) {
				++$failed;
				$streak += $broken ? 0 : 1;
			} else {
				$broken = true;
			}
		}

		return array(
			'total'  => count( $rows ),
			'failed' => $failed,
			'streak' => $streak,
		);
	}

	/**
	 * Checks for other plugins that also take over wp_mail().
	 *
	 * @return array
	 */
	private function check_other_mail_plugins() {
		$label = __( 'Other email plugins', 'vulomail' );

		if ( ! function_exists( 'is_plugin_active' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		$active = array();

		foreach ( self::MAIL_PLUGINS as $file => $name ) {
			if ( is_plugin_active( $file ) ) {
				$active[] = $name;
			}
		}

		if ( $active ) {
			return self::result(
				'other_mail_plugins',
				$label,
				'warning',
				/* translators: %s: plugin names. */
				sprintf( __( 'Also active: %s. Two email delivery plugins compete for the same messages, so some may be sent by the other plugin or sent twice.', 'vulomail' ), implode( ', ', $active ) ),
				__( 'Keep one plugin in charge of email. Deactivate the other one under Plugins, or switch off "Send email through VuloMail" if you prefer to keep it.', 'vulomail' ),
				self::to_url( __( 'Open Plugins', 'vulomail' ), admin_url( 'plugins.php' ) )
			);
		}

		return self::result( 'other_mail_plugins', $label, 'good', __( 'No other email delivery plugin detected.', 'vulomail' ) );
	}

	/**
	 * Checks whether SMS routing is configured and working.
	 *
	 * @return array
	 */
	private function check_sms_routing() {
		$label = __( 'SMS routing', 'vulomail' );
		$chain = VuloMail()->sms->chain();

		if ( ! VuloMail()->settings->get( 'sms_enabled' ) ) {
			return self::result(
				'sms_routing',
				$label,
				'info',
				__( 'SMS sending is switched off, so no text messages are sent.', 'vulomail' ),
				__( 'Only needed if you want text messages: switch on "Send SMS through VuloMail" under Settings → SMS.', 'vulomail' ),
				self::to_tab( __( 'Open SMS settings', 'vulomail' ), 'settings&subtab=sms' )
			);
		}

		if ( ! $chain ) {
			return self::result(
				'sms_routing',
				$label,
				'info',
				__( 'No working SMS connection is set as primary, so no text messages are sent.', 'vulomail' ),
				__( 'Only needed if you want text messages: add a connection for your SMS gateway and choose it as the primary SMS connection.', 'vulomail' ),
				self::add_connection()
			);
		}

		/* translators: %s: connection names in failover order. */
		return self::result( 'sms_routing', $label, 'good', sprintf( __( 'SMS is sent through %s.', 'vulomail' ), implode( ' → ', array_column( $chain, 'label' ) ) ) );
	}

	/**
	 * Checks for enabled connections with missing or undecryptable required fields.
	 *
	 * @return array|null
	 */
	private function check_connections() {
		$broken = array();

		foreach ( VuloMail()->connections->all() as $connection ) {
			if ( ! empty( $connection['enabled'] ) && VuloMail()->connections->missing_fields( $connection ) ) {
				$broken[] = $connection['label'];
			}
		}

		if ( ! $broken ) {
			return null;
		}

		return self::result(
			'connections',
			__( 'Connections', 'vulomail' ),
			'error',
			/* translators: %s: connection names. */
			sprintf( __( 'Incomplete: %s. A required field is empty, or its saved credential can no longer be read (this happens when the site\'s security salts change) — nothing is sent through it until fixed.', 'vulomail' ), implode( ', ', $broken ) ),
			__( 'Edit each connection listed, fill in the empty fields and re-enter its password or API key, then save and send a test.', 'vulomail' ),
			self::to_tab( __( 'Open connections', 'vulomail' ), 'settings&subtab=connections' )
		);
	}

	/**
	 * Checks that the PHP environment has what VuloMail needs.
	 *
	 * @return array
	 */
	private function check_environment() {
		$label = __( 'Server', 'vulomail' );

		if ( ! extension_loaded( 'openssl' ) ) {
			return self::result(
				'environment',
				$label,
				'error',
				__( 'The PHP OpenSSL extension is missing. Encrypted SMTP and provider API requests need it, and saved credentials can\'t be encrypted without it.', 'vulomail' ),
				__( 'Ask your host to enable the PHP "openssl" extension. It is a standard extension that hosts can switch on from their control panel.', 'vulomail' )
			);
		}

		return self::result(
			'environment',
			$label,
			'good',
			/* translators: 1: PHP version, 2: WordPress version. */
			sprintf( __( 'PHP %1$s, WordPress %2$s, OpenSSL available.', 'vulomail' ), PHP_VERSION, get_bloginfo( 'version' ) )
		);
	}

	/**
	 * Checks that the delivery log table exists.
	 *
	 * @return array
	 */
	private function check_log_table() {
		global $wpdb;

		$label = __( 'Delivery log', 'vulomail' );
		$table = $wpdb->prefix . Utill::TABLES['log'];

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange -- read-only existence check.
		$found = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) );

		if ( $found !== $table ) {
			return self::result(
				'log_table',
				$label,
				'error',
				__( 'The log table is missing from the database, so nothing can be logged. Messages are still sent.', 'vulomail' ),
				__( 'Deactivate VuloMail and activate it again under Plugins to create the table. Your connections and settings are kept.', 'vulomail' ),
				self::to_url( __( 'Open Plugins', 'vulomail' ), admin_url( 'plugins.php' ) )
			);
		}

		if ( ! VuloMail()->settings->get( 'log_enabled' ) ) {
			return self::result(
				'log_table',
				$label,
				'info',
				__( 'Logging is switched off. Messages are still sent, but failures leave no record.', 'vulomail' ),
				__( 'Switch on "Keep a log of sent and failed messages" under Settings → Logging & Privacy to be able to trace a missing message.', 'vulomail' ),
				self::to_tab( __( 'Open logging settings', 'vulomail' ), 'settings&subtab=logging' )
			);
		}

		$days = (int) VuloMail()->settings->get( 'log_retention_days' );

		return self::result(
			'log_table',
			$label,
			'good',
			$days > 0
				/* translators: %d: number of days. */
				? sprintf( _n( 'Logging is on. Entries are deleted after %d day.', 'Logging is on. Entries are deleted after %d days.', $days, 'vulomail' ), $days )
				: __( 'Logging is on. Entries are kept until you delete them.', 'vulomail' )
		);
	}

	/**
	 * Checks whether a scheduled cron trigger is likely to run.
	 *
	 * @return array|null
	 */
	private function check_cron() {
		if ( ! defined( 'DISABLE_WP_CRON' ) || ! DISABLE_WP_CRON ) {
			return null;
		}

		return self::result(
			'cron',
			__( 'Scheduled tasks', 'vulomail' ),
			'info',
			__( 'WP-Cron is disabled in wp-config.php (DISABLE_WP_CRON). Old log entries are only cleaned up if something else runs wp-cron.php.', 'vulomail' ),
			__( 'Nothing to do if your host already runs wp-cron.php on a schedule, which is the usual reason for this setting. If it does not, ask the host to add a cron job for it.', 'vulomail' )
		);
	}
}
