<?php
/**
 * BackupCredentialStore class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

defined( 'ABSPATH' ) || exit;

/**
 * Where Backups' remote-storage credentials (Amazon S3 keys, Google Drive
 * OAuth client/tokens) live — one non-autoloaded option holding each
 * provider's Services\CredentialEncryption-encrypted blob, keyed by provider.
 *
 * An option rather than a database table: there are at most two rows, they're
 * read whole and written whole, and nothing ever queries across them. Same
 * reasoning `vulopilot_google_connection` (GoogleServicesConnection) already
 * uses — and, like it, deliberately NOT part of `Utill::VULOPILOT_SETTINGS_KEY`'s
 * flat option, which round-trips to the browser on every `GET /settings`; a
 * secret access key / refresh token must never reach the client.
 *
 * @class       BackupCredentialStore class
 * @version     1.0.0
 * @author      VuloLabs
 */
class BackupCredentialStore {

    private const OPTION_KEY = 'vulopilot_backup_storage_credentials';

    /**
     * @param string $provider 's3' or 'google_drive'.
     * @return string|null The encrypted blob, or null if never saved.
     */
    public function get( string $provider ): ?string {
        $all = get_option( self::OPTION_KEY, array() );

        return is_array( $all ) && ! empty( $all[ $provider ] ) ? (string) $all[ $provider ] : null;
    }

    /**
     * @param string $provider  's3' or 'google_drive'.
     * @param string $encrypted CredentialEncryption::encrypt() output.
     * @return void
     */
    public function save( string $provider, string $encrypted ): void {
        $all = get_option( self::OPTION_KEY, array() );
        $all = is_array( $all ) ? $all : array();

        $all[ $provider ] = $encrypted;

        update_option( self::OPTION_KEY, $all, false );
    }

    /**
     * @param string $provider 's3' or 'google_drive'.
     * @return void
     */
    public function delete( string $provider ): void {
        $all = get_option( self::OPTION_KEY, array() );

        if ( is_array( $all ) && isset( $all[ $provider ] ) ) {
            unset( $all[ $provider ] );
            update_option( self::OPTION_KEY, $all, false );
        }
    }
}
