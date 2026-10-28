<?php
/**
 * Install class file.
 *
 * @package VuloMail
 */

namespace VuloMail;

defined( 'ABSPATH' ) || exit;

/**
 * VuloMail Install class.
 *
 * @class       Install class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Install {

	/**
	 * Version of the table layout below. Bump it with every schema change, so a site that already
	 * runs this plugin version still gets the new columns on its next load.
	 */
	const SCHEMA_VERSION = 3;

	/**
	 * Class constructor - runs the install immediately.
	 */
	public function __construct() {
		$this->install();
	}

	/**
	 * Runs the database install process.
	 *
	 * @return void
	 */
	public function install() {
		self::create_database_tables();
		self::migrate_connections();

		update_option( Utill::OTHER_SETTINGS['plugin_db_version'], VULOMAIL_PLUGIN_VERSION );
		update_option( Utill::OTHER_SETTINGS['db_schema_version'], self::SCHEMA_VERSION );
		do_action( 'vulomail_after_installed' );
	}

	/**
	 * Creates the delivery log table and its clicked-links table.
	 *
	 * @return void
	 */
	private static function create_database_tables() {
		global $wpdb;

		$collate = $wpdb->get_charset_collate();

		if ( ! function_exists( 'dbDelta' ) ) {
			require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		}

		// No "IF NOT EXISTS": dbDelta would read "IF" as the table name and never diff the real table.
		$sql_logs = "CREATE TABLE {$wpdb->prefix}" . Utill::TABLES['log'] . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			channel varchar(10) NOT NULL DEFAULT 'email',
			status varchar(20) NOT NULL DEFAULT 'sent',
			provider varchar(50) NOT NULL DEFAULT '',
			connection_id varchar(40) NOT NULL DEFAULT '',
			used_fallback tinyint(1) NOT NULL DEFAULT 0,
			recipients text NOT NULL,
			subject varchar(255) NOT NULL DEFAULT '',
			body longtext DEFAULT NULL,
			headers text DEFAULT NULL,
			attachments smallint(5) unsigned NOT NULL DEFAULT 0,
			source varchar(100) NOT NULL DEFAULT '',
			message_id varchar(255) NOT NULL DEFAULT '',
			error_code varchar(100) NOT NULL DEFAULT '',
			error_message text DEFAULT NULL,
			attempts text DEFAULT NULL,
			tracking_token varchar(32) NOT NULL DEFAULT '',
			track_opens tinyint(1) NOT NULL DEFAULT 0,
			track_clicks tinyint(1) NOT NULL DEFAULT 0,
			open_count int(10) unsigned NOT NULL DEFAULT 0,
			first_opened_at datetime DEFAULT NULL,
			last_opened_at datetime DEFAULT NULL,
			click_count int(10) unsigned NOT NULL DEFAULT 0,
			first_clicked_at datetime DEFAULT NULL,
			last_clicked_at datetime DEFAULT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY idx_channel_status (channel, status),
			KEY idx_created (created_at),
			KEY idx_tracking_token (tracking_token)
		) $collate;";

		// One row per tracked link that has been clicked at least once; `position` is the link's
		// place among the message's tracked links.
		$sql_links = "CREATE TABLE {$wpdb->prefix}" . Utill::TABLES['log_link'] . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			log_id bigint(20) unsigned NOT NULL,
			position smallint(5) unsigned NOT NULL,
			url text NOT NULL,
			click_count int(10) unsigned NOT NULL DEFAULT 0,
			first_clicked_at datetime NOT NULL,
			last_clicked_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY idx_log_position (log_id, position)
		) $collate;";

		dbDelta( $sql_logs );
		dbDelta( $sql_links );
	}

	/**
	 * Gives Gmail connections saved before Gmail had sign-in methods their method: they all use an
	 * app password. Without it they would show the newer default method.
	 *
	 * @return void
	 */
	private static function migrate_connections() {
		$connections = get_option( Utill::CONNECTIONS_KEY, array() );
		$changed     = false;

		foreach ( is_array( $connections ) ? $connections : array() as $id => $connection ) {
			if ( 'gmail' === ( $connection['provider'] ?? '' ) && ! isset( $connection['settings']['auth_mode'] ) ) {
				$connections[ $id ]['settings']['auth_mode'] = Email\Mailers\Gmail::MODE_APP_PASSWORD;
				$changed                                     = true;
			}
		}

		if ( $changed ) {
			update_option( Utill::CONNECTIONS_KEY, $connections, false );
		}
	}

	/**
	 * Uninstall routine (register_uninstall_hook). Keeps everything unless Settings → Data says
	 * "Delete everything", so an accidental delete never destroys saved connections.
	 *
	 * @return void
	 */
	public static function uninstall() {
		$settings = get_option( Utill::SETTINGS_KEY, array() );

		if ( ! is_array( $settings ) || ( $settings['keep_data_uninstall'] ?? 'keep_data' ) !== 'delete_everything' ) {
			return;
		}

		global $wpdb;

		foreach ( Utill::TABLES as $table ) {
			// Table identifiers can't be prepared placeholders; the name is a constant from this codebase.
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->query( "DROP TABLE IF EXISTS `{$wpdb->prefix}{$table}`" );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\_transient\_vulomail\_%' OR option_name LIKE '\_transient\_timeout\_vulomail\_%'" );

		delete_option( Utill::SETTINGS_KEY );
		delete_option( Utill::CONNECTIONS_KEY );
		delete_option( Security\Secrets::KEY_OPTION );

		foreach ( Utill::OTHER_SETTINGS as $option ) {
			delete_option( $option );
		}

		wp_clear_scheduled_hook( Logging\Logger::RETENTION_HOOK );
	}
}
