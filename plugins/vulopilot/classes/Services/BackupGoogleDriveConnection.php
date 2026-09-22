<?php
/**
 * BackupGoogleDriveConnection class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Services\CloudStorage\GoogleDriveClient;

defined( 'ABSPATH' ) || exit;

/**
 * Real, direct-to-Google OAuth 2.0 connection for Backups' own Google Drive
 * storage destination — deliberately NOT the shared "Connect Google
 * Services" flow GoogleServicesConnection.php owns (Search Console/
 * Analytics/AdSense): that connection's real scopes are fixed to exactly
 * `webmasters.readonly`/`analytics.readonly`/`adsense.readonly` (both on
 * VuloLabs' own embedded shared Client and, per GOOGLE_CONNECT_BROKER.md,
 * on VuloCloud's broker, which rejects anything else), and its embedded
 * shared Client is one multi-tenant credential used across every VuloPilot
 * site — silently widening it with `drive.file` (a scope that grants file
 * *creation* access, not just read) isn't a call this feature should make
 * unilaterally. Instead this is a bring-your-own-OAuth-Client connection,
 * the same trust model AI Providers' own bring-your-own-API-key already
 * established: the site owner registers their own (free) Google Cloud
 * OAuth Client, pastes its Client ID/Secret here, and only that site's own
 * Drive files (via the least-privileged `drive.file` scope — files this
 * app itself creates, not full Drive access) are ever touched.
 *
 * Storage: Services\BackupCredentialStore under provider
 * `'google_drive'`, the whole connection state (client id/secret, access/
 * refresh tokens, the cached destination-folder id) as a single
 * Services\CredentialEncryption-encrypted JSON blob — see
 * Services\BackupCredentialStore's own docblock for why this
 * store, not the flat settings option, holds it.
 *
 * @class       BackupGoogleDriveConnection class
 * @version     1.0.0
 * @author      VuloLabs
 */
class BackupGoogleDriveConnection {

    private const PROVIDER = 'google_drive';

    private const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    /**
     * Least-privilege on purpose — grants access only to files/folders
     * this app itself creates via the Drive API, never the user's whole
     * Drive (`drive`/`drive.readonly` would be far broader than Backups
     * needs).
     */
    private const SCOPE = 'https://www.googleapis.com/auth/drive.file';

    /**
     * Google access tokens are typically valid ~3600s — refreshed a
     * minute early, same margin GoogleServicesConnection::EXPIRY_SAFETY_MARGIN
     * uses.
     */
    private const EXPIRY_SAFETY_MARGIN = 60;

    /**
     * @return array<string, mixed>
     */
    private function get_data(): array {
        $stored = ( new BackupCredentialStore() )->get( self::PROVIDER );

        $defaults = array(
            'client_id'         => '',
            'client_secret'     => '',
            'access_token'      => '',
            'refresh_token'     => '',
            'token_expires_at'  => 0,
            'connected_at'      => '',
            'folder_id'         => '',
        );

        if ( null === $stored ) {
            return $defaults;
        }

        $decrypted = CredentialEncryption::decrypt( $stored );
        $decoded   = null !== $decrypted ? json_decode( $decrypted, true ) : null;

        return wp_parse_args( is_array( $decoded ) ? $decoded : array(), $defaults );
    }

    /**
     * @param array<string, mixed> $partial Fields to merge into the stored connection.
     * @return void
     */
    private function save_data( array $partial ): void {
        $data = array_merge( $this->get_data(), $partial );

        $encrypted = CredentialEncryption::encrypt( (string) wp_json_encode( $data ) );

        ( new BackupCredentialStore() )->save( self::PROVIDER, $encrypted );
    }

    /**
     * Must be registered as an "Authorized redirect URI" on the site
     * owner's own Google Cloud OAuth Client — `admin-post.php` (not a REST
     * route), same reasoning `GoogleServicesConnection::get_redirect_uri()`'s
     * own docblock gives: Google's top-level browser redirect back here
     * carries no `X-WP-Nonce` header.
     *
     * @return string
     */
    public function get_redirect_uri(): string {
        return admin_url( 'admin-post.php?action=vulopilot_backup_gdrive_oauth_callback' );
    }

    /**
     * @param string $client_id     Real Google Cloud OAuth Client ID, from the site owner's own Google Cloud Console project.
     * @param string $client_secret Real Client Secret for that same Client.
     * @return void
     */
    public function save_client_credentials( string $client_id, string $client_secret ): void {
        $this->save_data(
            array(
                'client_id'     => $client_id,
                'client_secret' => $client_secret,
            )
        );
    }

    /**
     * @return bool
     */
    public function has_client_credentials(): bool {
        $data = $this->get_data();
        return '' !== $data['client_id'] && '' !== $data['client_secret'];
    }

    /**
     * @return string
     */
    private static function encode_state(): string {
        return base64_encode( wp_create_nonce( 'vulopilot_backup_gdrive_oauth' ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- URL-safe transport encoding for an opaque `state` value (a real WP nonce), not obfuscation.
    }

    /**
     * @param string $state The `state` query param Google's redirect carried back.
     * @return bool
     */
    public function verify_state( string $state ): bool {
        $nonce = base64_decode( $state, true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- reversing encode_state() above, not obfuscation.

        return is_string( $nonce ) && false !== wp_verify_nonce( $nonce, 'vulopilot_backup_gdrive_oauth' );
    }

    /**
     * Real Google OAuth 2.0 authorization URL — `access_type=offline` +
     * `prompt=consent` so Google actually issues a `refresh_token` (same
     * reasoning `GoogleServicesConnection::get_authorization_url()`'s own
     * docblock gives).
     *
     * @return string|null Null if no Client ID/Secret has been saved yet.
     */
    public function get_authorization_url(): ?string {
        $data = $this->get_data();

        if ( '' === $data['client_id'] ) {
            return null;
        }

        $params = array(
            'client_id'     => $data['client_id'],
            'redirect_uri'  => $this->get_redirect_uri(),
            'response_type' => 'code',
            'scope'         => self::SCOPE,
            'access_type'   => 'offline',
            'prompt'        => 'consent',
            'state'         => self::encode_state(),
        );

        return self::AUTHORIZE_URL . '?' . http_build_query( $params );
    }

    /**
     * Real `POST https://oauth2.googleapis.com/token` authorization_code
     * exchange.
     *
     * @param string $code The `code` query param Google's redirect carried back.
     * @return true|\WP_Error
     */
    public function exchange_code_for_tokens( string $code ) {
        $data = $this->get_data();

        if ( '' === $data['client_id'] || '' === $data['client_secret'] ) {
            return new \WP_Error( 'vulopilot_backup_gdrive_no_credentials', __( 'No Google OAuth Client ID/Secret saved yet.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        $response = wp_remote_post(
            self::TOKEN_URL,
            array(
                'timeout' => 15,
                'body'    => array(
                    'code'          => $code,
                    'client_id'     => $data['client_id'],
                    'client_secret' => $data['client_secret'],
                    'redirect_uri'  => $this->get_redirect_uri(),
                    'grant_type'    => 'authorization_code',
                ),
            )
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $body = json_decode( (string) wp_remote_retrieve_body( $response ), true );

        if ( 200 !== (int) wp_remote_retrieve_response_code( $response ) || empty( $body['access_token'] ) ) {
            return new \WP_Error(
                'vulopilot_backup_gdrive_token_exchange_failed',
                $body['error_description'] ?? $body['error'] ?? __( 'Google did not return an access token.', 'vulopilot' ),
                array( 'status' => 502 )
            );
        }

        $update = array(
            'access_token'     => $body['access_token'],
            'token_expires_at' => time() + (int) ( $body['expires_in'] ?? 3600 ),
            'connected_at'     => current_time( 'mysql' ),
        );

        // Google only returns a refresh_token on first consent (see
        // get_authorization_url()'s own prompt=consent) — preserved on
        // re-authorization rather than overwritten with nothing.
        if ( ! empty( $body['refresh_token'] ) ) {
            $update['refresh_token'] = $body['refresh_token'];
        }

        $this->save_data( $update );

        return true;
    }

    /**
     * @return bool
     */
    private function refresh_access_token(): bool {
        $data = $this->get_data();

        if ( '' === $data['refresh_token'] || '' === $data['client_id'] || '' === $data['client_secret'] ) {
            return false;
        }

        $response = wp_remote_post(
            self::TOKEN_URL,
            array(
                'timeout' => 15,
                'body'    => array(
                    'client_id'     => $data['client_id'],
                    'client_secret' => $data['client_secret'],
                    'refresh_token' => $data['refresh_token'],
                    'grant_type'    => 'refresh_token',
                ),
            )
        );

        if ( is_wp_error( $response ) ) {
            return false;
        }

        $body = json_decode( (string) wp_remote_retrieve_body( $response ), true );

        if ( 200 !== (int) wp_remote_retrieve_response_code( $response ) || empty( $body['access_token'] ) ) {
            return false;
        }

        $this->save_data(
            array(
                'access_token'     => $body['access_token'],
                'token_expires_at' => time() + (int) ( $body['expires_in'] ?? 3600 ),
            )
        );

        return true;
    }

    /**
     * @return string|null Real, currently-valid access token, refreshing first if needed. Null if not connected or refresh failed.
     */
    public function get_valid_access_token(): ?string {
        $data = $this->get_data();

        if ( '' === $data['access_token'] ) {
            return null;
        }

        if ( (int) $data['token_expires_at'] <= ( time() + self::EXPIRY_SAFETY_MARGIN ) ) {
            if ( ! $this->refresh_access_token() ) {
                return null;
            }

            $data = $this->get_data();
        }

        return $data['access_token'];
    }

    /**
     * @return bool Whether a real refresh token is on file — the durable "has completed the OAuth handshake at least once" signal, same as GoogleServicesConnection::is_connected().
     */
    public function is_connected(): bool {
        return '' !== $this->get_data()['refresh_token'];
    }

    /**
     * Clears tokens but keeps the saved Client ID/Secret and cached folder
     * id — reconnecting shouldn't require re-registering the OAuth client,
     * same posture `GoogleServicesConnection::disconnect()`'s own docblock
     * documents.
     *
     * @return void
     */
    public function disconnect(): void {
        $this->save_data(
            array(
                'access_token'     => '',
                'refresh_token'    => '',
                'token_expires_at' => 0,
                'connected_at'     => '',
            )
        );
    }

    /**
     * Real cached "VuloPilot Backups" Drive folder id, creating it on
     * first use (GoogleDriveClient::ensure_backup_folder()) and caching
     * the result so every later upload skips the lookup.
     *
     * @return string|\WP_Error
     */
    public function get_or_create_folder_id() {
        $data = $this->get_data();

        if ( '' !== $data['folder_id'] ) {
            return $data['folder_id'];
        }

        $token = $this->get_valid_access_token();

        if ( ! $token ) {
            return new \WP_Error( 'vulopilot_backup_gdrive_not_connected', __( 'Not connected to Google Drive.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        $folder_id = ( new GoogleDriveClient() )->ensure_backup_folder( $token );

        if ( is_wp_error( $folder_id ) ) {
            return $folder_id;
        }

        $this->save_data( array( 'folder_id' => $folder_id ) );

        return $folder_id;
    }

    /**
     * High-level real upload — resolves a valid token, ensures the
     * destination folder, then uploads. What
     * Services\BackupStorageManager actually calls; it never touches
     * GoogleDriveClient directly.
     *
     * @param string $local_file_path Real absolute path to the local backup archive.
     * @param string $filename        Real filename to store on Drive.
     * @return string|\WP_Error Real Drive file id.
     */
    public function upload_backup_file( string $local_file_path, string $filename ) {
        $token = $this->get_valid_access_token();

        if ( ! $token ) {
            return new \WP_Error( 'vulopilot_backup_gdrive_not_connected', __( 'Not connected to Google Drive.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        $folder_id = $this->get_or_create_folder_id();

        if ( is_wp_error( $folder_id ) ) {
            return $folder_id;
        }

        if ( ! file_exists( $local_file_path ) ) {
            return new \WP_Error( 'vulopilot_backup_gdrive_file_missing', __( 'This backup’s local file could not be found.', 'vulopilot' ), array( 'status' => 404 ) );
        }

        // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_get_contents -- reading VuloPilot's own controlled, just-finished backup archive, not arbitrary user input; same risk profile BackupManager::restore() already accepts for its own full-file reads.
        $bytes = (string) file_get_contents( $local_file_path );

        return ( new GoogleDriveClient() )->upload_file( $token, $folder_id, $filename, $bytes );
    }

    /**
     * Real `files.delete` — `BackupStorageManager::delete_remote_copy()`'s
     * own Google Drive branch, run when a backup that was uploaded here
     * gets deleted or retention-purged locally, so its remote copy doesn't
     * outlive it.
     *
     * @param string $file_id Real Drive file id (`upload_backup_file()`'s own stored `remote_path`).
     * @return true|\WP_Error
     */
    public function delete_backup_file( string $file_id ) {
        $token = $this->get_valid_access_token();

        if ( ! $token ) {
            return new \WP_Error( 'vulopilot_backup_gdrive_not_connected', __( 'Not connected to Google Drive.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        return ( new GoogleDriveClient() )->delete_file( $token, $file_id );
    }

    /**
     * @return array<string, mixed>
     */
    public function get_status(): array {
        $data = $this->get_data();

        return array(
            'client_configured' => $this->has_client_credentials(),
            'connected'         => $this->is_connected(),
            'connected_at'      => $data['connected_at'],
            'redirect_uri'      => $this->get_redirect_uri(),
            'authorize_url'     => $this->get_authorization_url(),
        );
    }
}
