<?php
/**
 * Tracking class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Email;

use VuloMail\Logging\LogRepository;
use VuloMail\Settings\Settings;
use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Optional open and click tracking for HTML email.
 *
 * Opens are counted by a 1×1 image, clicks by sending each eligible link through this site first.
 * Both are recorded on the message's own log row, so they follow the log's retention, deletion and
 * uninstall rules. No IP address, user agent or third-party service is involved.
 *
 * Every click URL carries the original address and an HMAC of it, so the redirect only ever goes
 * where the email itself pointed (no open redirect) and still works after the log row is pruned.
 */
class Tracking {

	/**
	 * Query variable of the open pixel.
	 */
	const OPEN_VAR = 'vulomail_open';

	/**
	 * Query variable of a tracked link.
	 */
	const CLICK_VAR = 'vulomail_click';

	/**
	 * A transparent 1×1 GIF.
	 */
	const PIXEL = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

	/**
	 * Links never rewritten: unsubscribe, password reset, sign-in, account confirmation and
	 * one-time-code links. They are often single-use or checked against the exact URL, and a
	 * redirect through this site must never sit in front of a credential.
	 */
	const SENSITIVE_PATTERN = '~unsubscribe|opt-?out|resetpass|password|action=rp|[?&](?:key|token|nonce|_wpnonce|code|otp|auth|hash|signature|sig)=|verif|confirm|activat|magic|login|logout|sign-?in~i';

	/**
	 * Plugin settings.
	 *
	 * @var Settings
	 */
	private $settings;

	/**
	 * Log storage, where opens and clicks are recorded.
	 *
	 * @var LogRepository|null
	 */
	private $logs;

	/**
	 * This site's tracking address up to its query string, worked out once.
	 *
	 * @var string|null
	 */
	private $endpoint_base = null;

	/**
	 * Constructor.
	 *
	 * @param Settings           $settings Plugin settings.
	 * @param LogRepository|null $logs     Log storage; only the tracking endpoint needs it.
	 */
	public function __construct( Settings $settings, $logs = null ) {
		$this->settings = $settings;
		$this->logs     = $logs instanceof LogRepository ? $logs : null;
	}

	/**
	 * Answers pixel and link requests. Called from `init`, before the theme or a template loads.
	 *
	 * @return void
	 */
	public function register_endpoint() {
		add_action( 'init', array( $this, 'handle_request' ), 1 );
	}

	/**
	 * Decides whether a message is tracked, and how. Tracking needs the log (it is stored there) and
	 * an HTML body; plain-text email is never touched.
	 *
	 * @param Message $message The message.
	 * @return array{opens: bool, clicks: bool}
	 */
	private function modes( Message $message ) {
		$modes = array(
			'opens'  => false,
			'clicks' => false,
		);

		if ( $this->settings->get( 'log_enabled' ) && $message->is_html() ) {
			$modes['opens']  = (bool) $this->settings->get( 'track_opens' );
			$modes['clicks'] = (bool) $this->settings->get( 'track_clicks' );
		}

		/**
		 * Filters open and click tracking for one email. Only switches tracking off reliably: an
		 * untracked plain-text body has nothing to rewrite.
		 *
		 * @param array{opens: bool, clicks: bool} $modes   Whether to track opens and clicks.
		 * @param Message                          $message The message.
		 */
		$filtered = apply_filters( 'vulomail_email_tracking', $modes, $message );

		return array(
			'opens'  => $modes['opens'] && ! empty( $filtered['opens'] ),
			'clicks' => $modes['clicks'] && ! empty( $filtered['clicks'] ),
		);
	}

	/**
	 * Assigns the message its tracking (once) and returns the copy to hand to a mailer. The message
	 * itself keeps its original body, which is what the log stores and a resend sends again under
	 * a fresh token.
	 *
	 * Never throws: if tracking can't be applied, the message goes out untracked.
	 *
	 * @param Message $message The message; its ->tracking is filled in.
	 * @return Message The message to deliver: a tracked copy, or the message itself.
	 */
	public function prepare( Message $message ) {
		try {
			if ( null === $message->tracking ) {
				$modes = $this->modes( $message );

				if ( $modes['opens'] || $modes['clicks'] ) {
					$message->tracking = array_merge( array( 'token' => Utill::random_token() ), $modes );
				}
			}

			if ( ! $message->tracking ) {
				return $message;
			}

			$outgoing       = clone $message;
			$outgoing->body = $this->rewrite( $message->body, $message->tracking );

			return $outgoing;
		} catch ( \Throwable $e ) {
			$message->tracking = null;

			return $message;
		}
	}

	/**
	 * Adds the open pixel and rewrites eligible links. Deterministic for a given body and token,
	 * so the same message always gets the same tracked copy.
	 *
	 * @param string                                          $body     HTML body.
	 * @param array{token: string, opens: bool, clicks: bool} $tracking Tracking of the message.
	 * @return string
	 */
	public function rewrite( $body, array $tracking ) {
		$body  = (string) $body;
		$token = (string) $tracking['token'];

		if ( ! preg_match( Utill::TOKEN_PATTERN, $token ) ) {
			return $body;
		}

		if ( ! empty( $tracking['clicks'] ) ) {
			$position  = 0;
			$rewritten = preg_replace_callback(
				'~<a\b[^>]*>~i',
				function ( $tag ) use ( $token, &$position ) {
					return $this->rewrite_link( $tag[0], $token, $position );
				},
				$body
			);

			// A body that defeats the pattern (backtrack limit) is sent with its links as they were.
			$body = null === $rewritten ? $body : $rewritten;
		}

		if ( ! empty( $tracking['opens'] ) ) {
			$pixel = sprintf(
				'<img src="%s" width="1" height="1" alt="" border="0" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;" />',
				esc_attr( $this->endpoint_url( array( self::OPEN_VAR => $token ) ) )
			);
			$close = strripos( $body, '</body>' );

			$body = false === $close ? $body . $pixel : substr_replace( $body, $pixel, $close, 0 );
		}

		return $body;
	}

	/**
	 * Rewrites one `<a>` opening tag when its link is eligible.
	 *
	 * @param string $tag      The opening tag.
	 * @param string $token    Message token.
	 * @param int    $position Running count of tracked links, advanced for each rewrite.
	 * @return string
	 */
	private function rewrite_link( $tag, $token, &$position ) {
		if ( false !== stripos( $tag, 'data-vulomail-notrack' )
			|| ! preg_match( '~(\shref\s*=\s*)(["\'])(.*?)\2~is', $tag, $href, PREG_OFFSET_CAPTURE ) ) {
			return $tag;
		}

		$url = html_entity_decode( trim( $href[3][0] ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );

		if ( ! $this->is_trackable( $url ) ) {
			return $tag;
		}

		++$position;

		$tracked = $this->click_url( $token, $position, $url );

		return substr_replace( $tag, $href[1][0] . $href[2][0] . esc_attr( $tracked ) . $href[2][0], $href[0][1], strlen( $href[0][0] ) );
	}

	/**
	 * Whether a link may be sent through the click redirect.
	 *
	 * @param string $url Link address, entities decoded.
	 * @return bool
	 */
	public function is_trackable( $url ) {
		$scheme   = strtolower( (string) wp_parse_url( $url, PHP_URL_SCHEME ) );
		$eligible = in_array( $scheme, array( 'http', 'https' ), true )
			&& '' !== (string) wp_parse_url( $url, PHP_URL_HOST )
			&& ! preg_match( '/[\s<>]/', $url )
			// Template placeholders another tool will still fill in.
			&& ! preg_match( '/\{\{|\{%|%%|\*\|/', $url )
			&& false === strpos( $url, self::OPEN_VAR . '=' )
			&& false === strpos( $url, self::CLICK_VAR . '=' )
			&& ! preg_match( self::SENSITIVE_PATTERN, $url );

		/**
		 * Filters whether one link in a tracked email goes through the click redirect.
		 *
		 * @param bool   $eligible Whether it is tracked.
		 * @param string $url      The link.
		 */
		return $eligible && (bool) apply_filters( 'vulomail_track_link', true, $url );
	}

	/**
	 * Tracked address of one link.
	 *
	 * @param string $token    Message token.
	 * @param int    $position Link position, from 1.
	 * @param string $url      Original link.
	 * @return string
	 */
	private function click_url( $token, $position, $url ) {
		return $this->endpoint_url(
			array(
				self::CLICK_VAR => $token,
				'n'             => (int) $position,
				'u'             => Utill::base64url_encode( $url ),
				's'             => $this->sign( $token, $position, $url ),
			)
		);
	}

	/**
	 * Records an open of a tracked message.
	 *
	 * @param string $token Message token.
	 * @return bool Whether it was recorded.
	 */
	public function record_open( $token ) {
		$row = $this->find( $token );

		if ( ! $row || ! (int) $row['track_opens'] ) {
			return false;
		}

		return $this->logs->record_open( (int) $row['id'], gmdate( 'Y-m-d H:i:s' ) );
	}

	/**
	 * Verifies a tracked link, records the click and returns where to send the reader.
	 *
	 * @param string $token     Message token.
	 * @param int    $position  Link position.
	 * @param string $encoded   URL-safe base64 of the original link.
	 * @param string $signature HMAC of the token, position and link.
	 * @param bool   $record    Whether to count the click.
	 * @return string The original link, or '' when the request isn't a genuine tracked link.
	 */
	public function resolve_click( $token, $position, $encoded, $signature, $record = true ) {
		$token    = (string) $token;
		$position = (int) $position;
		$url      = Utill::base64url_decode( $encoded );

		if ( ! preg_match( Utill::TOKEN_PATTERN, $token ) || $position < 1 || $position > 65535 || ! is_string( $url )
			|| ! hash_equals( $this->sign( $token, $position, $url ), (string) $signature )
			|| ! in_array( strtolower( (string) wp_parse_url( $url, PHP_URL_SCHEME ) ), array( 'http', 'https' ), true ) ) {
			return '';
		}

		$row = $record ? $this->find( $token ) : null;

		if ( $row && (int) $row['track_clicks'] ) {
			$this->logs->record_click( (int) $row['id'], $position, self::display_url( $url ), gmdate( 'Y-m-d H:i:s' ) );
		}

		return $url;
	}

	/**
	 * `init` callback: serves the pixel or the redirect, then ends the request. Recording never
	 * stands in the way of the response.
	 *
	 * @return void
	 */
	public function handle_request() {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- public links from an email; the token and signature are the authorization.
		$open  = isset( $_GET[ self::OPEN_VAR ] ) ? sanitize_key( wp_unslash( $_GET[ self::OPEN_VAR ] ) ) : '';
		$click = isset( $_GET[ self::CLICK_VAR ] ) ? sanitize_key( wp_unslash( $_GET[ self::CLICK_VAR ] ) ) : '';

		if ( '' === $open && '' === $click ) {
			return;
		}

		// Security scanners and link previews often probe with HEAD first; only a real fetch counts.
		$record = isset( $_SERVER['REQUEST_METHOD'] ) && 'GET' === strtoupper( sanitize_key( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) );

		if ( '' !== $open ) {
			if ( $record ) {
				try {
					$this->record_open( $open );
				} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch -- the image is served whatever happens.
				}
			}

			$this->serve_pixel();
		}

		$url = '';

		try {
			$url = $this->resolve_click(
				$click,
				isset( $_GET['n'] ) ? absint( $_GET['n'] ) : 0,
				isset( $_GET['u'] ) ? preg_replace( '/[^A-Za-z0-9\-_]/', '', wp_unslash( $_GET['u'] ) ) : '', // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- reduced to the base64url alphabet.
				isset( $_GET['s'] ) ? sanitize_key( wp_unslash( $_GET['s'] ) ) : '',
				$record
			);
		} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch -- falls through to the home page.
		}
		// phpcs:enable

		nocache_headers();
		header( 'X-Robots-Tag: noindex, nofollow' );
		header( 'Referrer-Policy: no-referrer' );

		// The destination is the email's own, verified link, usually on another site.
		wp_redirect( '' !== $url ? $url : home_url( '/' ), 302, 'VuloMail' ); // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect
		exit;
	}

	/**
	 * Sends the pixel and ends the request.
	 *
	 * @return void
	 */
	private function serve_pixel() {
		$gif = base64_decode( self::PIXEL ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- a constant image.

		nocache_headers();
		header( 'Content-Type: image/gif' );
		header( 'Content-Length: ' . strlen( $gif ) );
		header( 'X-Robots-Tag: noindex, nofollow' );
		echo $gif; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- binary image.
		exit;
	}

	/**
	 * The log row a token belongs to. Only a delivered email is ever logged with tracking, so its
	 * `track_*` flags say all there is to know.
	 *
	 * @param string $token Message token.
	 * @return array|null
	 */
	private function find( $token ) {
		return $this->logs && preg_match( Utill::TOKEN_PATTERN, (string) $token ) ? $this->logs->find_by_token( $token ) : null;
	}

	/**
	 * A tracking address on this site.
	 *
	 * @param array $args Query arguments, all URL-safe.
	 * @return string
	 */
	private function endpoint_url( array $args ) {
		if ( null === $this->endpoint_base ) {
			$home                = home_url( '/' );
			$this->endpoint_base = $home . ( false === strpos( $home, '?' ) ? '?' : '&' );
		}

		return $this->endpoint_base . http_build_query( $args, '', '&' );
	}

	/**
	 * HMAC binding a link to its message and position.
	 *
	 * @param string $token    Message token.
	 * @param int    $position Link position.
	 * @param string $url      Original link.
	 * @return string
	 */
	private function sign( $token, $position, $url ) {
		return substr( hash_hmac( 'sha256', $token . '|' . (int) $position . '|' . $url, wp_salt( 'auth' ) . 'vulomail-click' ), 0, 32 );
	}

	/**
	 * How a clicked link is kept in the log: without its query string and fragment, which can carry
	 * the recipient's details or campaign identifiers.
	 *
	 * @param string $url Original link.
	 * @return string
	 */
	private static function display_url( $url ) {
		$parts = wp_parse_url( $url );

		if ( ! is_array( $parts ) || empty( $parts['host'] ) ) {
			return '';
		}

		$display = strtolower( $parts['scheme'] ?? 'https' ) . '://' . strtolower( $parts['host'] )
			. ( isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '' )
			. ( $parts['path'] ?? '/' );

		return mb_substr( $display, 0, 2000 );
	}
}
