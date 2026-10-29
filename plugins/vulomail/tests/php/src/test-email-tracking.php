<?php
/**
 * Email open and click tracking tests.
 *
 * @package VuloMail
 */

namespace VuloMail\Tests;

use Brain\Monkey\Functions;
use VuloMail\Connections\ConnectionRepository;
use VuloMail\Email\Dispatcher;
use VuloMail\Email\Message;
use VuloMail\Email\Tracking;
use VuloMail\Email\WpMailInterceptor;
use VuloMail\Logging\Logger;
use VuloMail\Security\Secrets;
use VuloMail\Settings\Settings;
use VuloMail\Utill;

/**
 * Tests Email\Tracking and how the dispatcher, interceptor and logger apply it.
 */
class TestEmailTracking extends TestCase {

	/**
	 * In-memory delivery log.
	 *
	 * @var FakeLogs
	 */
	private $logs;

	/**
	 * Plugin settings.
	 *
	 * @var Settings
	 */
	private $settings;

	/**
	 * Tracking under test.
	 *
	 * @var Tracking
	 */
	private $tracking;

	/**
	 * An HTML email with every kind of link the rewriter must tell apart.
	 */
	const HTML = '<html><body><p>Hi</p>'
		. '<a href="https://shop.example.com/product?id=7&amp;utm_source=mail#reviews" class="btn">Shop</a>'
		. '<a href="mailto:help@example.com">Mail us</a>'
		. '<a href="tel:+14155550123">Call</a>'
		. '<a href="https://shop.example.com/unsubscribe?u=1">Unsubscribe</a>'
		. '<a href="https://shop.example.com/my-account/lost-password/?key=abc&login=jane">Reset</a>'
		. '<a href="#top">Top</a>'
		. '<a data-vulomail-notrack href="https://example.org/private">Private</a>'
		. '<a href=\'https://example.org/second\'>Second</a>'
		. '</body></html>';

	/**
	 * Sets up the WordPress functions the tracking code calls.
	 *
	 * @return void
	 */
	protected function setUp(): void {
		parent::setUp();

		Functions\when( 'esc_attr' )->alias(
			static function ( $text ) {
				return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
			}
		);
	}

	/**
	 * Builds a dispatcher whose connections succeed or fail as scripted.
	 *
	 * @param string[] $outcomes 'ok' / 'fail' for the primary and, optionally, the backup.
	 * @param array    $settings Extra settings.
	 * @return Dispatcher
	 */
	private function dispatcher( array $outcomes, array $settings = array() ) {
		$registry    = new ScriptedRegistry( new FakeHttp() );
		$connections = new ConnectionRepository( new Secrets(), $registry );
		$ids         = array();

		foreach ( $outcomes as $outcome ) {
			$ids[] = $connections->save(
				array(
					'channel'  => 'email',
					'provider' => 'scripted',
					'label'    => 'Conn ' . $outcome,
					'settings' => array( 'outcome' => $outcome ),
				)
			)['id'];
		}

		$this->options['vulomail_settings'] = array_merge(
			array(
				'email_primary' => $ids[0] ?? '',
				'email_backup'  => $ids[1] ?? '',
			),
			$settings
		);

		$this->settings = new Settings();
		$this->logs     = new FakeLogs();
		$this->tracking = new Tracking( $this->settings, $this->logs );

		ScriptedMailer::$sent = array();

		return new Dispatcher( $this->settings, $connections, $registry, new Logger( $this->logs, $this->settings ), $this->tracking );
	}

	/**
	 * Builds an outgoing message.
	 *
	 * @param string $body         Body.
	 * @param string $content_type Content type.
	 * @return Message
	 */
	private function message( $body = self::HTML, $content_type = 'text/html' ) {
		$message               = new Message();
		$message->to           = array(
			array(
				'email' => 'jane@example.com',
				'name'  => '',
			),
		);
		$message->from_email   = 'shop@example.com';
		$message->subject      = 'Your order';
		$message->body         = $body;
		$message->content_type = $content_type;

		return $message;
	}

	/**
	 * The `href` values of a body, entities decoded.
	 *
	 * @param string $body HTML.
	 * @return string[]
	 */
	private static function hrefs( $body ) {
		preg_match_all( '~href=(["\'])(.*?)\1~', $body, $matches );

		return array_map(
			static function ( $href ) {
				return html_entity_decode( $href, ENT_QUOTES, 'UTF-8' );
			},
			$matches[2]
		);
	}

	/**
	 * Tracking is off by default and the email goes out untouched.
	 *
	 * @return void
	 */
	public function test_tracking_is_off_by_default() {
		$this->dispatcher( array( 'ok' ) )->send( $this->message() );

		$this->assertSame( self::HTML, ScriptedMailer::$sent[0]['message']->body );
		$this->assertSame( '', $this->logs->rows[0]['tracking_token'] );
		$this->assertSame( 0, $this->logs->rows[0]['track_opens'] );
		$this->assertSame( 0, $this->logs->rows[0]['track_clicks'] );
	}

	/**
	 * Open tracking adds one pixel just before `</body>` and logs the token.
	 *
	 * @return void
	 */
	public function test_open_tracking_adds_a_pixel_before_the_closing_body_tag() {
		$this->dispatcher( array( 'ok' ), array( 'track_opens' => true ) )->send( $this->message() );

		$sent  = ScriptedMailer::$sent[0]['message']->body;
		$token = $this->logs->rows[0]['tracking_token'];

		$this->assertMatchesRegularExpression( Utill::TOKEN_PATTERN, $token );
		$this->assertSame( 1, $this->logs->rows[0]['track_opens'] );
		$this->assertSame( 1, substr_count( $sent, 'vulomail_open=' ) );
		$this->assertStringContainsString( 'vulomail_open=' . $token . '" width="1" height="1"', $sent );
		$this->assertStringEndsWith( ' /></body></html>', $sent );
		$this->assertSame( self::HTML, preg_replace( '~<img src="[^"]*vulomail_open=[^>]*/>~', '', $sent ), 'Nothing else in the body changes.' );
	}

	/**
	 * A body with no `</body>` gets the pixel at the end.
	 *
	 * @return void
	 */
	public function test_a_fragment_gets_the_pixel_appended() {
		$this->dispatcher( array( 'ok' ), array( 'track_opens' => true ) )->send( $this->message( '<p>Order shipped</p>' ) );

		$this->assertStringStartsWith( '<p>Order shipped</p><img ', ScriptedMailer::$sent[0]['message']->body );
	}

	/**
	 * Plain-text email is never changed.
	 *
	 * @return void
	 */
	public function test_plain_text_email_is_never_tracked() {
		$body = "Visit https://shop.example.com/product\n";

		$this->dispatcher(
			array( 'ok' ),
			array(
				'track_opens'  => true,
				'track_clicks' => true,
			)
		)->send( $this->message( $body, 'text/plain' ) );

		$this->assertSame( $body, ScriptedMailer::$sent[0]['message']->body );
		$this->assertSame( '', $this->logs->rows[0]['tracking_token'] );
	}

	/**
	 * Tracking needs the log: with logging off nothing is tracked.
	 *
	 * @return void
	 */
	public function test_tracking_is_off_while_logging_is_off() {
		$this->dispatcher(
			array( 'ok' ),
			array(
				'log_enabled'  => false,
				'track_opens'  => true,
				'track_clicks' => true,
			)
		)->send( $this->message() );

		$this->assertSame( self::HTML, ScriptedMailer::$sent[0]['message']->body );
		$this->assertSame( array(), $this->logs->rows );
	}

	/**
	 * Click tracking rewrites ordinary web links only, and keeps everything else in the tag.
	 *
	 * @return void
	 */
	public function test_click_tracking_rewrites_only_eligible_links() {
		$this->dispatcher( array( 'ok' ), array( 'track_clicks' => true ) )->send( $this->message() );

		$sent  = ScriptedMailer::$sent[0]['message']->body;
		$hrefs = self::hrefs( $sent );

		$this->assertStringStartsWith( 'https://shop.example.com/?vulomail_click=', $hrefs[0] );
		$this->assertSame(
			array(
				'mailto:help@example.com',
				'tel:+14155550123',
				'https://shop.example.com/unsubscribe?u=1',
				'https://shop.example.com/my-account/lost-password/?key=abc&login=jane',
				'#top',
				'https://example.org/private',
			),
			array_slice( $hrefs, 1, 6 )
		);
		$this->assertStringStartsWith( 'https://shop.example.com/?vulomail_click=', $hrefs[7] );
		$this->assertStringContainsString( '" class="btn">Shop</a>', $sent );
		$this->assertStringContainsString( "<a href='https://shop.example.com/?vulomail_click=", $sent, 'The original quote style is kept.' );
		$this->assertStringNotContainsString( 'vulomail_open=', $sent, 'Only clicks were switched on.' );
		$this->assertSame( array( '1', '2' ), array( self::query_args( $hrefs[0] )['n'], self::query_args( $hrefs[7] )['n'] ) );
	}

	/**
	 * A tracked link leads back to the exact original address, query string and fragment included.
	 *
	 * @return void
	 */
	public function test_a_click_resolves_to_the_original_link_and_is_counted() {
		$this->dispatcher(
			array( 'ok' ),
			array(
				'track_opens'  => true,
				'track_clicks' => true,
			)
		)->send( $this->message() );

		$args = self::query_args( self::hrefs( ScriptedMailer::$sent[0]['message']->body )[0] );
		$url  = $this->tracking->resolve_click( $args['vulomail_click'], $args['n'], $args['u'], $args['s'] );

		$this->assertSame( 'https://shop.example.com/product?id=7&utm_source=mail#reviews', $url );
		$this->tracking->resolve_click( $args['vulomail_click'], $args['n'], $args['u'], $args['s'] );

		$this->assertSame( 2, $this->logs->rows[0]['click_count'] );
		$this->assertSame(
			array(
				'url'         => 'https://shop.example.com/product',
				'click_count' => 2,
			),
			$this->logs->rows[0]['links'][1],
			'The link is logged without its query string.'
		);
	}

	/**
	 * A tampered or forged link never redirects anywhere, and isn't counted.
	 *
	 * @return void
	 */
	public function test_a_tampered_link_is_rejected() {
		$this->dispatcher( array( 'ok' ), array( 'track_clicks' => true ) )->send( $this->message() );

		$args  = self::query_args( self::hrefs( ScriptedMailer::$sent[0]['message']->body )[0] );
		$evil  = Utill::base64url_encode( 'https://evil.example.net/' );
		$token = $args['vulomail_click'];

		$this->assertSame( '', $this->tracking->resolve_click( $token, $args['n'], $evil, $args['s'] ), 'Another destination.' );
		$this->assertSame( '', $this->tracking->resolve_click( $token, 2, $args['u'], $args['s'] ), 'Another position.' );
		$this->assertSame( '', $this->tracking->resolve_click( str_repeat( 'a', 32 ), $args['n'], $args['u'], $args['s'] ), 'Another token.' );
		$this->assertSame( '', $this->tracking->resolve_click( $token, $args['n'], $args['u'], '' ), 'No signature.' );
		$this->assertSame( '', $this->tracking->resolve_click( 'not-a-token', $args['n'], $args['u'], $args['s'] ) );
		$this->assertSame( 0, $this->logs->rows[0]['click_count'] );
	}

	/**
	 * A link still redirects once its log entry has been deleted; it just isn't counted.
	 *
	 * @return void
	 */
	public function test_a_link_still_works_after_its_log_entry_is_gone() {
		$this->dispatcher( array( 'ok' ), array( 'track_clicks' => true ) )->send( $this->message() );

		$args             = self::query_args( self::hrefs( ScriptedMailer::$sent[0]['message']->body )[0] );
		$this->logs->rows = array();

		$this->assertSame(
			'https://shop.example.com/product?id=7&utm_source=mail#reviews',
			$this->tracking->resolve_click( $args['vulomail_click'], $args['n'], $args['u'], $args['s'] )
		);
	}

	/**
	 * Opens are counted against the right row, only while open tracking applied to it.
	 *
	 * @return void
	 */
	public function test_opens_are_recorded_only_for_messages_tracked_for_opens() {
		$this->dispatcher( array( 'ok' ), array( 'track_opens' => true ) )->send( $this->message() );

		$token = $this->logs->rows[0]['tracking_token'];

		$this->assertTrue( $this->tracking->record_open( $token ) );
		$this->assertTrue( $this->tracking->record_open( $token ) );
		$this->assertFalse( $this->tracking->record_open( str_repeat( 'b', 32 ) ) );
		$this->assertSame( 2, $this->logs->rows[0]['open_count'] );

		$this->dispatcher( array( 'ok' ), array( 'track_clicks' => true ) )->send( $this->message() );

		$this->assertFalse( $this->tracking->record_open( $this->logs->rows[0]['tracking_token'] ), 'This message was only tracked for clicks.' );
	}

	/**
	 * Failover sends the same tracked copy under one token, and logs that token once.
	 *
	 * @return void
	 */
	public function test_failover_reuses_the_same_tracking() {
		$this->dispatcher(
			array( 'fail', 'ok' ),
			array(
				'track_opens'  => true,
				'track_clicks' => true,
			)
		)->send( $this->message() );

		$this->assertCount( 2, ScriptedMailer::$sent );
		$this->assertSame( ScriptedMailer::$sent[0]['message']->body, ScriptedMailer::$sent[1]['message']->body );
		$this->assertCount( 1, $this->logs->rows );
		$this->assertStringContainsString( 'vulomail_open=' . $this->logs->rows[0]['tracking_token'], ScriptedMailer::$sent[1]['message']->body );
	}

	/**
	 * The log keeps the original body, so a resend is tracked afresh.
	 *
	 * @return void
	 */
	public function test_the_log_keeps_the_original_body_and_each_send_gets_a_new_token() {
		$dispatcher = $this->dispatcher(
			array( 'ok' ),
			array(
				'log_content' => true,
				'track_opens' => true,
			)
		);

		$dispatcher->send( $this->message() );
		$dispatcher->send( $this->message( $this->logs->rows[0]['body'] ) );

		$this->assertSame( self::HTML, $this->logs->rows[0]['body'] );
		$this->assertSame( self::HTML, $this->logs->rows[1]['body'] );
		$this->assertNotSame( $this->logs->rows[0]['tracking_token'], $this->logs->rows[1]['tracking_token'] );
	}

	/**
	 * A message that failed everywhere keeps no tracking.
	 *
	 * @return void
	 */
	public function test_a_failed_message_is_not_tracked() {
		$this->dispatcher( array( 'fail' ), array( 'track_opens' => true ) )->send( $this->message() );

		$this->assertSame( 'failed', $this->logs->rows[0]['status'] );
		$this->assertSame( '', $this->logs->rows[0]['tracking_token'] );
	}

	/**
	 * The tracking filter can exempt a message.
	 *
	 * @return void
	 */
	public function test_the_tracking_filter_can_exempt_a_message() {
		$dispatcher = $this->dispatcher(
			array( 'ok' ),
			array(
				'track_opens'  => true,
				'track_clicks' => true,
			)
		);

		Functions\when( 'apply_filters' )->alias(
			static function ( $hook, $value ) {
				return 'vulomail_email_tracking' === $hook ? array() : $value;
			}
		);

		$dispatcher->send( $this->message() );

		$this->assertSame( self::HTML, ScriptedMailer::$sent[0]['message']->body );
	}

	/**
	 * A message handed back to WordPress's own mailer goes out with its tracking; mail VuloMail
	 * isn't routing is left as WordPress built it.
	 *
	 * @return void
	 */
	public function test_a_message_handed_back_to_wordpress_keeps_its_tracking() {
		$dispatcher  = $this->dispatcher( array( 'fail' ), array( 'track_opens' => true ) );
		$interceptor = new WpMailInterceptor( $this->settings, $dispatcher, new Logger( $this->logs, $this->settings ), $this->tracking );
		$atts        = array(
			'to'      => 'jane@example.com',
			'subject' => 'Your order',
			'message' => self::HTML,
			'headers' => 'Content-Type: text/html; charset=UTF-8',
		);

		$untouched              = new \stdClass();
		$untouched->ContentType = 'text/html'; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
		$untouched->Body        = self::HTML; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
		$interceptor->track_handed_back( $untouched );

		$this->assertNull( $interceptor->maybe_send( null, $atts ) );

		$phpmailer              = new \stdClass();
		$phpmailer->ContentType = 'text/html'; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
		$phpmailer->Body        = self::HTML; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
		$interceptor->track_handed_back( $phpmailer );
		$interceptor->observe_success( $atts );

		$this->assertSame( self::HTML, $untouched->Body ); // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
		$this->assertStringContainsString( 'vulomail_open=' . $this->logs->rows[0]['tracking_token'], $phpmailer->Body ); // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
		$this->assertSame( 'default', $this->logs->rows[0]['provider'] );
	}

	/**
	 * The link filter can keep a link out of tracking.
	 *
	 * @return void
	 */
	public function test_the_link_filter_can_exclude_a_link() {
		$tracking = new Tracking( new Settings() );

		$this->assertTrue( $tracking->is_trackable( 'https://shop.example.com/sale' ) );
		$this->assertFalse( $tracking->is_trackable( 'javascript:alert(1)' ) );
		$this->assertFalse( $tracking->is_trackable( '//shop.example.com/sale' ) );
		$this->assertFalse( $tracking->is_trackable( 'https://shop.example.com/?p={{order_id}}' ) );
		$this->assertFalse( $tracking->is_trackable( 'https://shop.example.com/wp-login.php?action=rp&key=x' ) );

		Functions\when( 'apply_filters' )->alias(
			static function ( $hook, $value ) {
				return 'vulomail_track_link' === $hook ? false : $value;
			}
		);

		$this->assertFalse( $tracking->is_trackable( 'https://shop.example.com/sale' ) );
	}
}
