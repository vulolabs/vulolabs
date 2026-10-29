<?php
/**
 * Gmail connection tests: its sign-in methods and "Sign in with Google".
 *
 * @package VuloMail
 */

namespace VuloMail\Tests;

use Brain\Monkey\Functions;
use VuloMail\Connections\ConnectionRepository;
use VuloMail\Connections\GoogleOAuth;
use VuloMail\Connections\ProviderRegistry;
use VuloMail\Email\Mailers\Gmail;
use VuloMail\Email\Message;
use VuloMail\Security\Secrets;
use VuloMail\Utill;

/**
 * Tests Connections\GoogleOAuth and the Gmail adapter's sign-in methods.
 */
class TestGoogleOAuth extends TestCase {

	/**
	 * Recorded HTTP traffic.
	 *
	 * @var FakeHttp
	 */
	private $http;

	/**
	 * Saved connections.
	 *
	 * @var ConnectionRepository
	 */
	private $connections;

	/**
	 * Sets up transients and the WordPress functions the sign-in calls.
	 *
	 * @return void
	 */
	protected function setUp(): void {
		parent::setUp();

		Functions\when( 'rest_url' )->alias(
			static function ( $path ) {
				return 'https://shop.example.com/wp-json/' . $path;
			}
		);
		Functions\when( 'untrailingslashit' )->alias(
			static function ( $text ) {
				return rtrim( (string) $text, '/\\' );
			}
		);

		$this->http        = new FakeHttp();
		$this->connections = new ConnectionRepository( new Secrets(), new ProviderRegistry( $this->http ) );
	}

	/**
	 * Saves a Gmail API connection.
	 *
	 * @param array $settings Connection settings.
	 * @return string Connection id.
	 */
	private function connection( array $settings ) {
		return $this->connections->save(
			array(
				'channel'  => 'email',
				'provider' => 'gmail',
				'settings' => $settings,
			)
		)['id'];
	}

	/**
	 * A connection using the site owner's own Google app.
	 *
	 * @return string Connection id.
	 */
	private function own_app_connection() {
		return $this->connection(
			array(
				'auth_mode'     => 'own',
				'client_id'     => 'client-123.apps.googleusercontent.com',
				'client_secret' => 'GOCSPX-secret',
			)
		);
	}

	/**
	 * An unsigned ID token carrying an email claim.
	 *
	 * @param string $email Email.
	 * @return string
	 */
	private static function id_token( $email ) {
		$part = static function ( array $data ) {
			return Utill::base64url_encode( json_encode( $data ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode
		};

		return $part( array( 'alg' => 'RS256' ) ) . '.' . $part( array( 'email' => $email ) ) . '.sig';
	}

	/**
	 * A new Gmail connection isn't usable until it is signed in.
	 *
	 * @return void
	 */
	public function test_a_connection_is_incomplete_until_signed_in() {
		$id = $this->own_app_connection();

		$this->assertSame( array( 'Google sign-in' ), $this->connections->missing_fields( $this->connections->get( $id ) ) );
		$this->assertFalse( $this->connections->is_usable( $this->connections->get( $id ) ) );
	}

	/**
	 * Own-app sign-in goes straight to Google with PKCE, offline access and only the send scope.
	 *
	 * @return void
	 */
	public function test_own_app_sign_in_goes_to_google_with_pkce() {
		$google = new GoogleOAuth( $this->connections, $this->http );
		$url    = $google->authorize_url( $this->own_app_connection() );
		$args   = self::query_args( $url );

		$this->assertStringStartsWith( 'https://accounts.google.com/o/oauth2/v2/auth?', $url );
		$this->assertSame( 'client-123.apps.googleusercontent.com', $args['client_id'] );
		$this->assertSame( 'https://shop.example.com/wp-json/vulomail/v1/google/callback', $args['redirect_uri'] );
		$this->assertSame( 'openid email https://www.googleapis.com/auth/gmail.send', $args['scope'] );
		$this->assertSame( 'offline', $args['access_type'] );
		$this->assertSame( 'S256', $args['code_challenge_method'] );
		$this->assertMatchesRegularExpression( Utill::TOKEN_PATTERN, $args['state'] );
		$this->assertArrayNotHasKey( 'client_secret', $args, 'The secret never goes through the browser.' );

		$pending = $this->transients[ GoogleOAuth::STATE_PREFIX . $args['state'] ];
		$this->assertSame( Utill::base64url_encode( hash( 'sha256', $pending['verifier'], true ) ), $args['code_challenge'] );
	}

	/**
	 * Own-app sign-in needs the client credentials first.
	 *
	 * @return void
	 */
	public function test_own_app_sign_in_needs_client_credentials() {
		$google = new GoogleOAuth( $this->connections, $this->http );
		$error  = $google->authorize_url( $this->connection( array( 'auth_mode' => 'own' ) ) );

		$this->assertInstanceOf( \WP_Error::class, $error );
		$this->assertSame( 'vulomail_google_client_missing', $error->get_error_code() );
	}

	/**
	 * One-click sign-in goes through the connect service and never needs client credentials.
	 *
	 * @return void
	 */
	public function test_one_click_sign_in_uses_the_connect_service() {
		Functions\when( 'apply_filters' )->alias(
			static function ( $hook, $value ) {
				return 'vulomail_google_connect_url' === $hook ? 'https://connect.example.com/google/' : $value;
			}
		);

		$this->assertSame( 'oneclick', Gmail::definition()['fields'][0]['default'] );

		$google = new GoogleOAuth( $this->connections, $this->http );
		$url    = $google->authorize_url( $this->connection( array( 'auth_mode' => 'oneclick' ) ) );
		$args   = self::query_args( $url );

		$this->assertStringStartsWith( 'https://connect.example.com/google/authorize?', $url );
		$this->assertArrayNotHasKey( 'client_id', $args );
		$this->assertSame( 'https://shop.example.com/', $args['site'] );

		$this->http->queue(
			200,
			array(
				'access_token'  => 'ya29.access',
				'expires_in'    => 3599,
				'refresh_token' => '1//refresh',
				'email'         => 'shop@gmail.com',
			)
		);

		$this->assertTrue( $google->complete( $args['state'], 'relay-code' )['success'] );
		$this->assertSame( 'https://connect.example.com/google/token', $this->http->requests[0]['url'] );
		$this->assertArrayNotHasKey( 'client_secret', $this->http->requests[0]['body'] );
	}

	/**
	 * Without the connect service, one-click is not offered and a stored one-click mode falls back.
	 *
	 * @return void
	 */
	public function test_one_click_is_not_offered_without_the_connect_service() {
		$this->assertFalse( GoogleOAuth::one_click_available() );
		$this->assertSame( array( 'own', 'app_password' ), array_column( Gmail::definition()['fields'][0]['options'], 'value' ) );
		$this->assertSame( 'app_password', Gmail::definition()['fields'][0]['default'], 'The quicker setup is the default.' );
		$this->assertSame( 'own', GoogleOAuth::mode( array( 'auth_mode' => 'oneclick' ) ) );
	}

	/**
	 * An app-password Gmail connection asks for its address and app password, never a Google
	 * sign-in, and can't start one.
	 *
	 * @return void
	 */
	public function test_an_app_password_connection_needs_no_google_sign_in() {
		$id = $this->connection( array( 'auth_mode' => 'app_password' ) );

		$this->assertSame( array( 'Gmail address', 'App password' ), $this->connections->missing_fields( $this->connections->get( $id ) ) );

		$this->connections->save(
			array(
				'id'       => $id,
				'settings' => array(
					'username' => 'shop@gmail.com',
					'password' => 'abcd efgh ijkl mnop',
				),
			)
		);

		$this->assertTrue( $this->connections->is_usable( $this->connections->get( $id ) ) );
		$this->assertSame( 'vulomail_google_app_password', ( new GoogleOAuth( $this->connections, $this->http ) )->authorize_url( $id )->get_error_code() );
	}

	/**
	 * Completing a sign-in exchanges the code and stores the refresh token encrypted.
	 *
	 * @return void
	 */
	public function test_completing_a_sign_in_stores_the_refresh_token_encrypted() {
		$google = new GoogleOAuth( $this->connections, $this->http );
		$id     = $this->own_app_connection();
		$state  = self::query_args( $google->authorize_url( $id ) )['state'];

		$this->http->queue(
			200,
			array(
				'access_token'  => 'ya29.access',
				'expires_in'    => 3599,
				'refresh_token' => '1//refresh',
				'scope'         => 'openid https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
				'id_token'      => self::id_token( 'shop@gmail.com' ),
			)
		);

		$outcome = $google->complete( $state, '4/auth-code' );
		$stored  = $this->connections->get( $id );
		$request = $this->http->requests[0];

		$this->assertTrue( $outcome['success'] );
		$this->assertSame( 'Connected to Google as shop@gmail.com.', $outcome['message'] );
		$this->assertSame( 'https://oauth2.googleapis.com/token', $request['url'] );
		$this->assertSame( 'authorization_code', $request['body']['grant_type'] );
		$this->assertSame( 'GOCSPX-secret', $request['body']['client_secret'] );
		$this->assertNotEmpty( $request['body']['code_verifier'] );
		$this->assertStringStartsWith( 'vm1:', $stored['settings']['refresh_token'] );
		$this->assertSame( 'shop@gmail.com', $stored['settings']['account_email'] );
		$this->assertSame( 'client-123.apps.googleusercontent.com', $stored['settings']['client_id'], 'The rest of the connection is kept.' );
		$this->assertTrue( $this->connections->is_usable( $stored ) );
		$this->assertSame( array(), preg_grep( '/^' . GoogleOAuth::STATE_PREFIX . '/', array_keys( $this->transients ) ), 'The state is single use.' );
	}

	/**
	 * A state can't be replayed, and an unknown one is refused without calling Google.
	 *
	 * @return void
	 */
	public function test_a_state_is_single_use() {
		$google = new GoogleOAuth( $this->connections, $this->http );
		$state  = self::query_args( $google->authorize_url( $this->own_app_connection() ) )['state'];

		$this->assertFalse( $google->complete( $state, 'code', 'access_denied' )['success'] );
		$this->assertFalse( $google->complete( $state, 'code' )['success'], 'Already used.' );
		$this->assertFalse( $google->complete( str_repeat( 'a', 32 ), 'code' )['success'] );
		$this->assertSame( array(), $this->http->requests );
	}

	/**
	 * A sign-in that left out the send permission is refused.
	 *
	 * @return void
	 */
	public function test_a_sign_in_without_the_send_permission_is_refused() {
		$google = new GoogleOAuth( $this->connections, $this->http );
		$id     = $this->own_app_connection();
		$state  = self::query_args( $google->authorize_url( $id ) )['state'];

		$this->http->queue(
			200,
			array(
				'access_token'  => 'ya29.access',
				'refresh_token' => '1//refresh',
				'scope'         => 'openid https://www.googleapis.com/auth/userinfo.email',
			)
		);

		$this->assertFalse( $google->complete( $state, 'code' )['success'] );
		$this->assertSame( '', $this->connections->get( $id )['settings']['refresh_token'] );
	}

	/**
	 * Access tokens are refreshed once and then reused from the encrypted cache.
	 *
	 * @return void
	 */
	public function test_access_tokens_are_refreshed_once_and_cached() {
		$config = array(
			'auth_mode'     => 'own',
			'client_id'     => 'client-123',
			'client_secret' => 'GOCSPX-secret',
			'refresh_token' => '1//refresh',
		);

		$this->http->queue(
			200,
			array(
				'access_token' => 'ya29.fresh',
				'expires_in'   => 3599,
			)
		);

		$this->assertSame( 'ya29.fresh', GoogleOAuth::access_token( $config, $this->http ) );
		$this->assertSame( 'ya29.fresh', GoogleOAuth::access_token( $config, $this->http ) );
		$this->assertCount( 1, $this->http->requests );
		$this->assertSame( 'refresh_token', $this->http->requests[0]['body']['grant_type'] );
		$this->assertStringNotContainsString( 'ya29.fresh', implode( ' ', array_map( 'strval', $this->transients ) ), 'Cached encrypted.' );
	}

	/**
	 * A revoked sign-in tells the site owner to sign in again.
	 *
	 * @return void
	 */
	public function test_a_revoked_sign_in_asks_to_sign_in_again() {
		$this->http->queue(
			400,
			array(
				'error'             => 'invalid_grant',
				'error_description' => 'Token has been expired or revoked.',
			)
		);

		$error = GoogleOAuth::access_token(
			array(
				'auth_mode'     => 'own',
				'client_id'     => 'client-123',
				'client_secret' => 'GOCSPX-secret',
				'refresh_token' => '1//refresh',
			),
			$this->http
		);

		$this->assertSame( 'vulomail_google_invalid_grant', $error->get_error_code() );
		$this->assertStringContainsString( 'Sign in with Google', $error->get_error_message() );
	}

	/**
	 * The adapter fails cleanly, without calling Gmail, when the connection isn't signed in.
	 *
	 * @return void
	 */
	public function test_sending_without_a_sign_in_fails_cleanly() {
		$result = ( new Gmail( array( 'auth_mode' => 'own' ), $this->http ) )->send( new Message() );

		$this->assertFalse( $result->success );
		$this->assertSame( 'vulomail_google_not_connected', $result->error_code );
		$this->assertSame( array(), $this->http->requests );
	}
}
