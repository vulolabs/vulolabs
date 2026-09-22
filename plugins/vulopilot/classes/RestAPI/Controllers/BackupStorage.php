<?php
/**
 * BackupStorage controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\RestAPI\Controllers;

use VuloPilot\Services\BackupGoogleDriveConnection;
use VuloPilot\Services\BackupS3Connection;
use VuloPilot\Services\CloudStorage\GoogleDriveClient;

defined( 'ABSPATH' ) || exit;

/**
 * Backs Settings → Backups' own real cloud-storage section
 * (`BackupStoragePanel.tsx`) — Amazon S3 credentials and the Google Drive
 * OAuth connection Services\BackupStorageManager actually uploads real
 * completed backups to. Which destination is *active* is a separate, plain
 * `backup_storage_destination` flat setting (Backups.ts, InputRenderer,
 * `Controllers\Settings`) — this controller only ever handles the
 * credentials/connection each destination needs once selected, same "the
 * simple non-secret bit rides the flat settings option; the credentials
 * get their own encrypted, never-round-tripped storage" split
 * VuloCloudAiConnectionPanel.tsx/Controllers\VuloCloudAiConnection already established.
 *
 * @class       BackupStorage controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class BackupStorage extends \WP_REST_Controller {

    /**
     * @var string
     */
    protected $rest_base = 'backup-storage';

    /**
     * @inheritDoc
     */
    public function register_routes() {
        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base,
            array(
                array(
                    'methods'             => \WP_REST_Server::READABLE,
                    'callback'            => array( $this, 'get_status' ),
                    'permission_callback' => array( $this, 'permissions_check' ),
                ),
            )
        );

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/s3',
            array(
                array(
                    'methods'             => \WP_REST_Server::CREATABLE,
                    'callback'            => array( $this, 'save_s3' ),
                    'permission_callback' => array( $this, 'permissions_check' ),
                ),
            )
        );

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/s3/test',
            array(
                array(
                    'methods'             => \WP_REST_Server::CREATABLE,
                    'callback'            => array( $this, 'test_s3' ),
                    'permission_callback' => array( $this, 'permissions_check' ),
                ),
            )
        );

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/s3/disconnect',
            array(
                array(
                    'methods'             => \WP_REST_Server::CREATABLE,
                    'callback'            => array( $this, 'disconnect_s3' ),
                    'permission_callback' => array( $this, 'permissions_check' ),
                ),
            )
        );

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/google-drive/client',
            array(
                array(
                    'methods'             => \WP_REST_Server::CREATABLE,
                    'callback'            => array( $this, 'save_google_drive_client' ),
                    'permission_callback' => array( $this, 'permissions_check' ),
                ),
            )
        );

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/google-drive/test',
            array(
                array(
                    'methods'             => \WP_REST_Server::CREATABLE,
                    'callback'            => array( $this, 'test_google_drive' ),
                    'permission_callback' => array( $this, 'permissions_check' ),
                ),
            )
        );

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/google-drive/disconnect',
            array(
                array(
                    'methods'             => \WP_REST_Server::CREATABLE,
                    'callback'            => array( $this, 'disconnect_google_drive' ),
                    'permission_callback' => array( $this, 'permissions_check' ),
                ),
            )
        );
    }

    /**
     * @param \WP_REST_Request $request Full request object.
     * @return bool
     */
    public function permissions_check( $request ) {
        return current_user_can( 'manage_options' );
    }

    /**
     * @inheritDoc
     */
    public function get_status( $request ) {
        return rest_ensure_response(
            array(
                's3'           => ( new BackupS3Connection() )->get_status(),
                'google_drive' => ( new BackupGoogleDriveConnection() )->get_status(),
            )
        );
    }

    /**
     * Saves real Amazon S3 credentials — never returns the Secret Access
     * Key (or even the full Access Key ID) back to the client, same
     * posture `Controllers\VuloCloudAiConnection` already establishes for API keys.
     *
     * @param \WP_REST_Request $request Full request object.
     * @return \WP_REST_Response|\WP_Error
     */
    public function save_s3( $request ) {
        $access_key = sanitize_text_field( (string) $request->get_param( 'access_key' ) );
        $secret_key = (string) $request->get_param( 'secret_key' );
        $bucket     = sanitize_text_field( (string) $request->get_param( 'bucket' ) );
        $region     = sanitize_text_field( (string) $request->get_param( 'region' ) );

        if ( '' === $access_key || '' === $secret_key || '' === $bucket ) {
            return new \WP_Error( 'vulopilot_s3_missing_fields', __( 'Access Key ID, Secret Access Key, and Bucket are all required.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        ( new BackupS3Connection() )->save_credentials( $access_key, $secret_key, $bucket, $region ?: 'us-east-1' );

        return rest_ensure_response( ( new BackupS3Connection() )->get_status() );
    }

    /**
     * Real `HeadBucket` round-trip against the currently-saved credentials.
     *
     * @param \WP_REST_Request $request Full request object.
     * @return \WP_REST_Response
     */
    public function test_s3( $request ) {
        $result = ( new BackupS3Connection() )->test_connection();

        return rest_ensure_response(
            is_wp_error( $result )
                ? array( 'success' => false, 'message' => $result->get_error_message() )
                : array( 'success' => true, 'message' => __( 'Connected — this bucket is reachable with these credentials.', 'vulopilot' ) )
        );
    }

    /**
     * @param \WP_REST_Request $request Full request object.
     * @return \WP_REST_Response
     */
    public function disconnect_s3( $request ) {
        ( new BackupS3Connection() )->disconnect();

        return rest_ensure_response( ( new BackupS3Connection() )->get_status() );
    }

    /**
     * Saves the site owner's own Google Cloud OAuth Client ID/Secret — see
     * BackupGoogleDriveConnection's own docblock for why this is a
     * bring-your-own Client rather than VuloLabs' shared one. Returns the
     * real authorize URL so the frontend can immediately offer "Connect".
     *
     * @param \WP_REST_Request $request Full request object.
     * @return \WP_REST_Response|\WP_Error
     */
    public function save_google_drive_client( $request ) {
        $client_id     = sanitize_text_field( (string) $request->get_param( 'client_id' ) );
        $client_secret = (string) $request->get_param( 'client_secret' );

        if ( '' === $client_id || '' === $client_secret ) {
            return new \WP_Error( 'vulopilot_backup_gdrive_missing_fields', __( 'Client ID and Client Secret are both required.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        ( new BackupGoogleDriveConnection() )->save_client_credentials( $client_id, $client_secret );

        return rest_ensure_response( ( new BackupGoogleDriveConnection() )->get_status() );
    }

    /**
     * Real `about?fields=user` round-trip proving the current access token
     * (refreshed first if needed) actually works.
     *
     * @param \WP_REST_Request $request Full request object.
     * @return \WP_REST_Response
     */
    public function test_google_drive( $request ) {
        $connection = new BackupGoogleDriveConnection();
        $token      = $connection->get_valid_access_token();

        if ( ! $token ) {
            return rest_ensure_response(
                array( 'success' => false, 'message' => __( 'Not connected to Google Drive yet.', 'vulopilot' ) )
            );
        }

        $result = ( new GoogleDriveClient() )->test_connection( $token );

        return rest_ensure_response(
            is_wp_error( $result )
                ? array( 'success' => false, 'message' => $result->get_error_message() )
                : array( 'success' => true, 'message' => __( 'Connected — Google Drive is reachable with this account.', 'vulopilot' ) )
        );
    }

    /**
     * @param \WP_REST_Request $request Full request object.
     * @return \WP_REST_Response
     */
    public function disconnect_google_drive( $request ) {
        ( new BackupGoogleDriveConnection() )->disconnect();

        return rest_ensure_response( ( new BackupGoogleDriveConnection() )->get_status() );
    }
}
