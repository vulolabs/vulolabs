<?php
/**
 * GoogleOAuth class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Connections;

use VuloMail\Email\Mailers\Gmail;
use VuloMail\Security\HttpClient;
use VuloMail\Security\Redactor;
use VuloMail\Security\Secrets;
use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * "Sign in with Google" for the Gmail connection. Two modes share one flow (authorization code with
 * PKCE, single-use state): `oneclick` goes through VuloLabs' Google connect service
 * (VULOMAIL_GOOGLE_CONNECT_URL, client credentials never reach the site); `own` is the site owner's
 * Google Cloud OAuth client talking to Google directly. Only `gmail.send` + `openid email` is requested.
 * Refresh token stored encrypted on the connection; access tokens cached encrypted until just before expiry.
 */
class GoogleOAuth {

	const MODE_ONE_CLICK = 'oneclick';
	const MODE_OWN       = 'own';

	const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
	const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

	/**
	 * The scope sending depends on; Google lets the user untick it on the consent screen.
	 */
	const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

	/**
	 * Permissions asked for: sending, plus the account's address to show which one is connected.
	 */
	const SCOPES = 'openid email ' . self::SEND_SCOPE;

	/**
	 * Transient prefix of a pending sign-in, keyed by its state.
	 */
	const STATE_PREFIX = 'vulomail_google_state_';

	/**
	 * Transient prefix of a cached access token.
	 */
	const TOKEN_PREFIX = 'vulomail_google_token_';

	/**
	 * Saved connections.
	 *
	 * @var ConnectionRepository
	 */
	private $connections;

	/**
	 * HTTP client.
	 *
	 * @var HttpClient
	 */
	private $http;

	/**
	 * Constructor.
	 *
	 * @param ConnectionRepository $connections Saved connections.
	 * @param HttpClient|null      $http        HTTP client.
	 */
	public function __construct( ConnectionRepository $connections, $http = null ) {
		$this->connections = $connections;
		$this->http        = $http instanceof HttpClient ? $http : new HttpClient();
	}

	/**
	 * Whether one-click sign-in is offered: connect service configured, over HTTPS.
	 *
	 * @return bool
	 */
	public static function one_click_available() {
		return '' !== self::connect_url();
	}

	/**
	 * Base URL of VuloLabs' Google connect service, or '' when it isn't configured.
	 *
	 * @return string
	 */
	private static function connect_url() {
		/**
		 * Filters the base URL of VuloLabs' Google connect service; '' switches one-click sign-in off.
		 *
		 * @param string $url Base URL, from VULOMAIL_GOOGLE_CONNECT_URL.
		 */
		$url = trim( (string) apply_filters( 'vulomail_google_connect_url', defined( 'VULOMAIL_GOOGLE_CONNECT_URL' ) ? (string) VULOMAIL_GOOGLE_CONNECT_URL : '' ) );

		return 'https' === wp_parse_url( $url, PHP_URL_SCHEME ) ? untrailingslashit( $url ) : '';
	}

	/**
	 * Where Google (or the connect service) sends the browser back; in own mode it must be listed under "Authorized redirect URIs" in the Google Cloud client.
	 *
	 * @return string
	 */
	public static function redirect_uri() {
		return rest_url( 'vulomail/v1/google/callback' );
	}

	/**
	 * The connection's sign-in mode, falling back to own mode when one-click isn't available.
	 *
	 * @param array $config Connection settings.
	 * @return string
	 */
	public static function mode( array $config ) {
		$mode = (string) ( $config['auth_mode'] ?? '' );

		return self::MODE_ONE_CLICK === $mode && self::one_click_available() ? self::MODE_ONE_CLICK : self::MODE_OWN;
	}

	/**
	 * Starts a sign-in for a saved connection.
	 *
	 * @param string $connection_id Connection id.
	 * @return string|\WP_Error The address to send the browser to.
	 */
	public function authorize_url( $connection_id ) {
		$connection = $this->connections->get( $connection_id );

		if ( ! $connection || 'gmail' !== $connection['provider'] ) {
			return new \WP_Error( 'vulomail_connection_not_found', __( 'That connection no longer exists.', 'vulomail' ), array( 'status' => 404 ) );
		}

		$config = $this->connections->config( $connection );

		if ( Gmail::MODE_APP_PASSWORD === ( $config['auth_mode'] ?? Gmail::MODE_APP_PASSWORD ) ) {
			return new \WP_Error( 'vulomail_google_app_password', __( 'This connection uses an app password. Choose a "Sign in with Google" method, save, then sign in.', 'vulomail' ), array( 'status' => 400 ) );
		}

		$mode = self::mode( $config );

		if ( self::MODE_OWN === $mode && ( '' === trim( (string) ( $config['client_id'] ?? '' ) ) || '' === trim( (string) ( $config['client_secret'] ?? '' ) ) ) ) {
			return new \WP_Error( 'vulomail_google_client_missing', __( 'Enter your Google Client ID and Client Secret, save, then sign in.', 'vulomail' ), array( 'status' => 400 ) );
		}

		$state    = Utill::random_token();
		$verifier = Utill::base64url_encode( random_bytes( 32 ) );

		set_transient(
			self::STATE_PREFIX . $state,
			array(
				'connection' => $connection['id'],
				'mode'       => $mode,
				'verifier'   => $verifier,
			),
			15 * MINUTE_IN_SECONDS
		);

		$params = array(
			'redirect_uri'          => self::redirect_uri(),
			'response_type'         => 'code',
			'scope'                 => self::SCOPES,
			'state'                 => $state,
			'code_challenge'        => Utill::base64url_encode( hash( 'sha256', $verifier, true ) ),
			'code_challenge_method' => 'S256',
			// A refresh token is only issued with offline access, and only reliably on a fresh consent.
			'access_type'           => 'offline',
			'prompt'                => 'consent select_account',
		);

		if ( self::MODE_OWN === $mode ) {
			$params['client_id'] = trim( (string) $config['client_id'] );
			$url                 = self::GOOGLE_AUTH_URL;
		} else {
			$params['site'] = home_url( '/' );
			$url            = self::connect_url() . '/authorize';
		}

		return $url . '?' . http_build_query( $params, '', '&', PHP_QUERY_RFC3986 );
	}

	/**
	 * Finishes a sign-in: checks the state, exchanges the code and stores the refresh token on the connection.
	 *
	 * @param string $state State from the callback.
	 * @param string $code  Authorization code.
	 * @param string $error Error code from the callback, if consent was refused.
	 * @return array{success: bool, message: string}
	 */
	public function complete( $state, $code, $error = '' ) {
		$state   = preg_match( Utill::TOKEN_PATTERN, (string) $state ) ? (string) $state : '';
		$pending = '' !== $state ? get_transient( self::STATE_PREFIX . $state ) : false;

		// Single use, whatever the outcome.
		if ( '' !== $state ) {
			delete_transient( self::STATE_PREFIX . $state );
		}

		if ( ! is_array( $pending ) ) {
			return self::outcome( false, __( 'That sign-in link has expired. Open the Gmail connection and click "Sign in with Google" again.', 'vulomail' ) );
		}

		if ( '' !== (string) $error || '' === (string) $code ) {
			return self::outcome(
				false,
				'access_denied' === $error
					? __( 'Google sign-in was cancelled, so the Gmail connection was not changed.', 'vulomail' )
					: __( 'Google did not complete the sign-in. Please try again.', 'vulomail' )
			);
		}

		$connection = $this->connections->get( (string) $pending['connection'] );

		if ( ! $connection ) {
			return self::outcome( false, __( 'That connection no longer exists.', 'vulomail' ) );
		}

		$config              = $this->connections->config( $connection );
		$config['auth_mode'] = $pending['mode'];

		$token = self::request_token(
			$config,
			array(
				'grant_type'    => 'authorization_code',
				'code'          => (string) $code,
				'code_verifier' => (string) $pending['verifier'],
				'redirect_uri'  => self::redirect_uri(),
			),
			$this->http
		);

		if ( is_wp_error( $token ) ) {
			return self::outcome( false, $token->get_error_message() );
		}

		if ( isset( $token['scope'] ) && false === strpos( (string) $token['scope'], self::SEND_SCOPE ) ) {
			return self::outcome( false, __( 'VuloMail needs permission to send email for you. Sign in again and leave "Send email on your behalf" ticked.', 'vulomail' ) );
		}

		if ( empty( $token['refresh_token'] ) ) {
			return self::outcome( false, __( 'Google did not grant lasting access. Remove VuloMail under "Third-party apps" in your Google account, then sign in again.', 'vulomail' ) );
		}

		$email = sanitize_email( (string) ( $token['email'] ?? '' ) );

		$saved = $this->connections->save(
			array(
				'id'       => $connection['id'],
				'settings' => array(
					'refresh_token' => (string) $token['refresh_token'],
					'account_email' => $email,
				),
			)
		);

		if ( is_wp_error( $saved ) ) {
			return self::outcome( false, $saved->get_error_message() );
		}

		self::cache_token( (string) $token['refresh_token'], $token );

		return self::outcome(
			true,
			'' !== $email
				/* translators: %s: Gmail address. */
				? sprintf( __( 'Connected to Google as %s.', 'vulomail' ), $email )
				: __( 'Connected to Google.', 'vulomail' )
		);
	}

	/**
	 * A current access token for a connection, refreshed when the cached one is about to expire.
	 *
	 * @param array      $config Decrypted connection settings.
	 * @param HttpClient $http   HTTP client.
	 * @return string|\WP_Error
	 */
	public static function access_token( array $config, HttpClient $http ) {
		$refresh = trim( (string) ( $config['refresh_token'] ?? '' ) );

		if ( '' === $refresh ) {
			return new \WP_Error( 'vulomail_google_not_connected', __( 'This Gmail connection is not signed in. Open it and click "Sign in with Google".', 'vulomail' ) );
		}

		$cached = get_transient( self::cache_key( $refresh ) );

		if ( is_string( $cached ) && '' !== $cached ) {
			$token = ( new Secrets() )->decrypt( $cached );

			if ( '' !== $token ) {
				return $token;
			}
		}

		$token = self::request_token(
			$config,
			array(
				'grant_type'    => 'refresh_token',
				'refresh_token' => $refresh,
			),
			$http
		);

		if ( is_wp_error( $token ) ) {
			return $token;
		}

		self::cache_token( $refresh, $token );

		return (string) $token['access_token'];
	}

	/**
	 * Drops a connection's cached access token, after the Gmail API refused it.
	 *
	 * @param array $config Decrypted connection settings.
	 * @return void
	 */
	public static function forget_token( array $config ) {
		$refresh = trim( (string) ( $config['refresh_token'] ?? '' ) );

		if ( '' !== $refresh ) {
			delete_transient( self::cache_key( $refresh ) );
		}
	}

	/**
	 * Calls the token endpoint of the connection's mode.
	 *
	 * @param array      $config Decrypted connection settings.
	 * @param array      $fields Grant fields.
	 * @param HttpClient $http   HTTP client.
	 * @return array|\WP_Error Token response, with `email` taken from the ID token when there is one.
	 */
	private static function request_token( array $config, array $fields, HttpClient $http ) {
		$secrets = array( (string) ( $config['client_secret'] ?? '' ), (string) ( $config['refresh_token'] ?? '' ), (string) ( $fields['code'] ?? '' ) );

		if ( self::MODE_OWN === self::mode( $config ) ) {
			$url                     = self::GOOGLE_TOKEN_URL;
			$fields['client_id']     = trim( (string) ( $config['client_id'] ?? '' ) );
			$fields['client_secret'] = trim( (string) ( $config['client_secret'] ?? '' ) );
		} else {
			$url            = self::connect_url() . '/token';
			$fields['site'] = home_url( '/' );
		}

		$response = $http->post( $url, array( 'Accept' => 'application/json' ), $fields );

		if ( is_wp_error( $response ) ) {
			return new \WP_Error( 'vulomail_google_network', Redactor::scrub( $response->get_error_message(), $secrets ) );
		}

		$json = $response['json'];

		if ( 200 !== $response['code'] || empty( $json['access_token'] ) ) {
			$code = sanitize_key( (string) ( $json['error'] ?? 'http_' . $response['code'] ) );

			if ( 'invalid_grant' === $code && 'refresh_token' === $fields['grant_type'] ) {
				$message = __( 'Google no longer accepts this connection\'s sign-in: access was removed, the password changed, or it expired. Open the Gmail connection and click "Sign in with Google" again.', 'vulomail' );
			} elseif ( 'invalid_client' === $code || 'unauthorized_client' === $code ) {
				$message = __( 'Google did not accept the Client ID or Client Secret. Check them in the Gmail connection.', 'vulomail' );
			} else {
				$message = sprintf(
					/* translators: %s: error text from Google. */
					__( 'Google refused the sign-in: %s', 'vulomail' ),
					(string) ( $json['error_description'] ?? ( $json['error'] ?? $response['code'] ) )
				);
			}

			return new \WP_Error( 'vulomail_google_' . $code, Redactor::scrub( $message, $secrets ) );
		}

		if ( empty( $json['email'] ) && ! empty( $json['id_token'] ) ) {
			$json['email'] = self::email_from_id_token( (string) $json['id_token'] );
		}

		return $json;
	}

	/**
	 * The `email` claim of an ID token, trusted because it came straight from the token endpoint over TLS.
	 *
	 * @param string $id_token JWT.
	 * @return string
	 */
	public static function email_from_id_token( $id_token ) {
		$parts = explode( '.', $id_token );

		if ( 3 !== count( $parts ) ) {
			return '';
		}

		$claims = json_decode( (string) Utill::base64url_decode( $parts[1] ), true );

		return is_array( $claims ) && ! empty( $claims['email'] ) && is_email( $claims['email'] ) ? (string) $claims['email'] : '';
	}

	/**
	 * Caches an access token, encrypted, until shortly before it expires.
	 *
	 * @param string $refresh Refresh token it belongs to.
	 * @param array  $token   Token response.
	 * @return void
	 */
	private static function cache_token( $refresh, array $token ) {
		$lifetime = (int) ( $token['expires_in'] ?? 3600 ) - 5 * MINUTE_IN_SECONDS;

		if ( $lifetime > 0 && ! empty( $token['access_token'] ) ) {
			set_transient( self::cache_key( $refresh ), ( new Secrets() )->encrypt( (string) $token['access_token'] ), $lifetime );
		}
	}

	/**
	 * Cache key for a refresh token's access token.
	 *
	 * @param string $refresh Refresh token.
	 * @return string
	 */
	private static function cache_key( $refresh ) {
		return self::TOKEN_PREFIX . substr( hash( 'sha256', $refresh ), 0, 32 );
	}

	/**
	 * Builds a sign-in outcome.
	 *
	 * @param bool   $success Whether it worked.
	 * @param string $message What to tell the site owner.
	 * @return array{success: bool, message: string}
	 */
	private static function outcome( $success, $message ) {
		return array(
			'success' => $success,
			'message' => $message,
		);
	}
}
