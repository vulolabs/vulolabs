<?php
/**
 * BackupS3Connection class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

use VuloPilot\Services\CloudStorage\S3Client;

defined( 'ABSPATH' ) || exit;

/**
 * Real Amazon S3 credential storage for Backups' own remote storage
 * destination — Access Key ID/Secret Access Key/bucket/region, saved as one
 * encrypted JSON blob (Services\CredentialEncryption) held by
 * Services\BackupCredentialStore under provider `'s3'`.
 * Never a client secret round-tripped to the browser.
 *
 * @class       BackupS3Connection class
 * @version     1.0.0
 * @author      VuloLabs
 */
class BackupS3Connection {

    private const PROVIDER = 's3';

    /**
     * @return array{access_key: string, secret_key: string, bucket: string, region: string}|null Null if never configured, or the stored blob can no longer be decrypted (a rotated wp_salt(), same failure mode CredentialEncryption's own docblock already describes for AI service keys).
     */
    public function get_credentials(): ?array {
        $stored = ( new BackupCredentialStore() )->get( self::PROVIDER );

        if ( null === $stored ) {
            return null;
        }

        $decrypted = CredentialEncryption::decrypt( $stored );

        if ( null === $decrypted ) {
            return null;
        }

        $data = json_decode( $decrypted, true );

        if ( ! is_array( $data ) || empty( $data['access_key'] ) || empty( $data['secret_key'] ) || empty( $data['bucket'] ) ) {
            return null;
        }

        return array(
            'access_key' => (string) $data['access_key'],
            'secret_key' => (string) $data['secret_key'],
            'bucket'     => (string) $data['bucket'],
            'region'     => (string) ( $data['region'] ?? 'us-east-1' ),
        );
    }

    /**
     * @param string $access_key Real AWS Access Key ID.
     * @param string $secret_key Real AWS Secret Access Key.
     * @param string $bucket     Real S3 bucket name.
     * @param string $region     Real AWS region.
     * @return void
     */
    public function save_credentials( string $access_key, string $secret_key, string $bucket, string $region ): void {
        $encrypted = CredentialEncryption::encrypt(
            (string) wp_json_encode(
                array(
                    'access_key' => $access_key,
                    'secret_key' => $secret_key,
                    'bucket'     => $bucket,
                    'region'     => $region ?: 'us-east-1',
                )
            )
        );

        ( new BackupCredentialStore() )->save( self::PROVIDER, $encrypted );
    }

    /**
     * @return bool
     */
    public function is_configured(): bool {
        return null !== $this->get_credentials();
    }

    /**
     * @return S3Client|null Null if not configured/undecryptable.
     */
    public function build_client(): ?S3Client {
        $credentials = $this->get_credentials();

        if ( ! $credentials ) {
            return null;
        }

        return new S3Client(
            $credentials['access_key'],
            $credentials['secret_key'],
            $credentials['region'],
            $credentials['bucket']
        );
    }

    /**
     * BackupStorage's own "Disconnect" button — unlike
     * `BackupGoogleDriveConnection::disconnect()` (which clears only the
     * OAuth tokens and keeps the app-level Client ID/Secret so reconnecting
     * doesn't require re-registering it), S3 has no such "app vs instance"
     * split: Access Key/Secret/Bucket/Region are one single credential set,
     * so disconnecting removes the whole saved row. Reconnecting means
     * entering all 4 fields again, same as configuring it the first time.
     *
     * @return void
     */
    public function disconnect(): void {
        ( new BackupCredentialStore() )->delete( self::PROVIDER );
    }

    /**
     * Real `HeadBucket` round-trip — BackupStorage's own "Test connection"
     * button.
     *
     * @return true|\WP_Error
     */
    public function test_connection() {
        $client = $this->build_client();

        if ( ! $client ) {
            return new \WP_Error( 'vulopilot_s3_not_configured', __( 'Amazon S3 isn’t configured yet.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        return $client->head_bucket();
    }

    /**
     * Real `DeleteObject` — `BackupStorageManager::delete_remote_copy()`'s
     * own S3 branch, run when a backup that was uploaded here gets deleted
     * or retention-purged locally, so its remote copy doesn't outlive it.
     *
     * @param string $object_key Real S3 object key (`upload_to_s3()`'s own stored `remote_path`).
     * @return true|\WP_Error
     */
    public function delete_object( string $object_key ) {
        $client = $this->build_client();

        if ( ! $client ) {
            return new \WP_Error( 'vulopilot_s3_not_configured', __( 'Amazon S3 isn’t configured yet.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        return $client->delete_object( $object_key );
    }

    /**
     * Never includes the real secret key, and only the last 4 characters
     * of the Access Key ID — same "prove it's saved without exposing the
     * value" posture `AiProviders::prepare_config_for_response()`'s own
     * `has_credential`/`credential_ok` booleans already establish, just
     * with a short visual hint (AWS Access Key IDs aren't secret the way a
     * Secret Access Key is, so a partial reveal is standard practice, same
     * as the last-4-digits convention payment forms use).
     *
     * @return array<string, mixed>
     */
    public function get_status(): array {
        $credentials = $this->get_credentials();

        if ( ! $credentials ) {
            return array(
                'configured'         => false,
                'bucket'             => '',
                'region'             => '',
                'access_key_masked'  => '',
            );
        }

        return array(
            'configured'        => true,
            'bucket'            => $credentials['bucket'],
            'region'            => $credentials['region'],
            'access_key_masked' => '••••' . substr( $credentials['access_key'], -4 ),
        );
    }
}
