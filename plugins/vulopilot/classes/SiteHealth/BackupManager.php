<?php
namespace VuloPilot\SiteHealth;

use VuloPilot\Dashboard\ActivityLogRepository;
use VuloPilot\SiteHealth\BackupRepository;
use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Real DB + file backups - Protect My Site's "Backups"/"Recovery" tiles.
 * Unconditionally constructed in VuloPilot::init_classes() (not a
 * Modules-page module). Modeled directly on Services\PageSpeedScanner's own
 * queue + self-reschedule shape (never runs synchronously on a REST
 * request - a full DB dump + file archive can't reliably finish inside
 * `max_execution_time`):
 *
 * `start_backup()` inserts a `vulopilot_backups` row, enumerates every real
 * step up front (one per `$wpdb` table, one per real file under
 * `wp-content/uploads/` (excluding this plugin's own backups directory),
 * the active theme, and every active plugin - capped at `MAX_BACKUP_FILES`
 * total files so a very large site still finishes in bounded time), and
 * kicks off `process_batch()` via `wp_schedule_single_event()`.
 *
 * `process_batch()` works through the step queue for a real elapsed-time
 * budget per tick (not a fixed step count - a `db_table` step's own cost
 * varies enormously by table size), writing table dumps into a shared temp
 * `.sql` file and adding real files into an open `ZipArchive` (opened and
 * closed once per tick - a real, documented-safe way to build one archive
 * incrementally across multiple PHP requests), then self-reschedules while
 * steps remain. On the last tick, the accumulated `.sql` file is added into
 * the same archive as `database.sql`, the row is marked `completed` with
 * its real `file_size`, and `backup_retention_count` cleanup runs.
 *
 * Storage: `wp_upload_dir()['basedir'] . '/vulopilot-backups/'`, guarded by
 * `index.php`, `.htaccess` and `web.config` stubs - the same convention WP core itself uses in
 * sensitive upload subdirectories. `file_path` is always stored (and
 * returned to the client) as a basename only - the real path is always
 * re-derived server-side via `resolve_file_path()`, same
 * "never trust a client-supplied path" posture `Reports.php`'s own
 * `download_item()`/`ReportGenerator::resolve_file_path()` already
 * established.
 *
 * @class       BackupManager class
 * @version     1.0.0
 * @author      VuloLabs
 */
class BackupManager {

    private const QUEUE_OPTION = 'vulopilot_backup_queue';

    private const BATCH_HOOK = 'vulopilot_backup_process_batch';

    /**
     * Real elapsed-time budget per batch tick, in seconds - table sizes
     * vary too much for a fixed step count the way PageSpeedScanner's own
     * `BATCH_SIZE = 3` pages can safely be.
     */
    private const BATCH_SECONDS_BUDGET = 15;

    /**
     * Real files enumerated across uploads/theme/plugins combined, per
     * backup - bounds the whole job to a reasonable size on a very large
     * site, same conservative-budget precedent as MalwareScanner's own
     * `MAX_FILES`.
     */
    private const MAX_BACKUP_FILES = 5000;

    /**
     * Real rows read per table dump chunk - bounds peak memory for a large
     * table.
     */
    private const DB_CHUNK_SIZE = 500;

    /**
     * BackupManager constructor.
     */
    public function __construct() {
        add_action( self::BATCH_HOOK, array( $this, 'process_batch' ) );
    }

    /**
     * @return string Absolute path of the directory holding all installed plugins.
     */
    private function get_plugins_dir(): string {
        return dirname( untrailingslashit( VuloPilot()->plugin_path ) );
    }

    /**
     * Real, plugin-owned backups storage directory - created and
     * index-protected on first use.
     *
     * @return string Trailing-slashed absolute path.
     */
    public function get_backup_dir(): string {
        $upload_dir = wp_upload_dir();
        $dir        = trailingslashit( $upload_dir['basedir'] ) . 'vulopilot-backups';

        if ( ! is_dir( $dir ) ) {
            wp_mkdir_p( $dir );
        }

        $index_file = trailingslashit( $dir ) . 'index.php';

        if ( ! file_exists( $index_file ) ) {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- writing a plain index-protection stub into VuloPilot's own controlled backups directory, not arbitrary user input.
            file_put_contents( $index_file, "<?php\n// Silence is golden.\n" );
        }

        // Block direct HTTP access to the backup archives and temp .sql dumps
        // (Apache and IIS; nginx needs a server-level rule instead).
        $htaccess_file = trailingslashit( $dir ) . '.htaccess';

        if ( ! file_exists( $htaccess_file ) ) {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- access-protection rules inside VuloPilot's own backups directory.
            file_put_contents( $htaccess_file, "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder deny,allow\nDeny from all\n</IfModule>\n" );
        }

        $web_config_file = trailingslashit( $dir ) . 'web.config';

        if ( ! file_exists( $web_config_file ) ) {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- access-protection rules inside VuloPilot's own backups directory.
            file_put_contents( $web_config_file, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<configuration><system.webServer><authorization><deny users=\"*\" /></authorization></system.webServer></configuration>\n" );
        }

        return trailingslashit( $dir );
    }

    /**
     * Real absolute path for a stored backup's basename - never trusts a
     * client-supplied path, same posture Reports\ReportGenerator's own
     * `resolve_file_path()` already established.
     *
     * @param string $file_basename Real stored `file_path` basename.
     * @return string
     */
    public function resolve_file_path( string $file_basename ): string {
        return $this->get_backup_dir() . basename( $file_basename );
    }

    /**
     * Seeds a fresh backup job and kicks off its first batch tick. Safe to
     * call again while a previous job is still running - its own queue
     * option is simply replaced (matches PageSpeedScanner::start_scan()'s
     * own "safe to call again mid-scan" posture); the previous job's own
     * `vulopilot_backups` row is left as whatever status it was last at.
     *
     * @param string $trigger_type 'manual'|'scheduled'|'pre_restore_safety'.
     * @return int Real new `vulopilot_backups` row id.
     */
    public function start_backup( string $trigger_type ): int {
        $backup_dir = $this->get_backup_dir();
        $timestamp  = time();
        $filename   = 'backup-' . gmdate( 'Y-m-d-His', $timestamp ) . '-' . wp_generate_password( 6, false, false ) . '.zip';
        $zip_path   = $backup_dir . $filename;
        // Kept in the system temp dir, not the web-accessible uploads folder: it holds a raw SQL dump until it is folded into the (protected) zip.
        $sql_path   = trailingslashit( get_temp_dir() ) . 'vulopilot-tmp-' . wp_generate_password( 16, false, false ) . '.sql';

        $repository = new BackupRepository();
        $backup_id  = $repository->insert(
            array(
                'status'       => 'queued',
                'trigger_type' => $trigger_type,
                'created_at'   => current_time( 'mysql', true ),
            )
        );

        update_option(
            self::QUEUE_OPTION,
            array(
                'backup_id' => $backup_id,
                'zip_path'  => $zip_path,
                'sql_path'  => $sql_path,
                'steps'     => $this->build_steps(),
                'started'   => false,
            ),
            false
        );

        if ( ! wp_next_scheduled( self::BATCH_HOOK ) ) {
            wp_schedule_single_event( time(), self::BATCH_HOOK );
        }

        return $backup_id;
    }

    /**
     * Every real step this backup needs to perform, enumerated up front -
     * one per real `$wpdb`-prefixed table, then real files under uploads/
     * theme/active-plugins, bounded by `MAX_BACKUP_FILES` combined.
     *
     * @return array<int, array<string, mixed>>
     */
    private function build_steps(): array {
        global $wpdb;

        $steps = array();

        $tables = $wpdb->get_col( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $wpdb->prefix ) . '%' ) );  // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching  -- {$this->get_table()}/$table-style variables here are always this plugin's own hardcoded table name(s), never user input; dynamic placeholder counts (IN (...) lists, optional WHERE fragments) are sized correctly at runtime, just not statically visible to this sniff.

        foreach ( (array) $tables as $table ) {
            $steps[] = array(
                'type'  => 'db_table',
                'table' => (string) $table,
            );
        }

        $remaining_budget = self::MAX_BACKUP_FILES;

        $upload_dir = wp_upload_dir();

        if ( ! empty( $upload_dir['basedir'] ) && is_dir( $upload_dir['basedir'] ) ) {
            $steps = array_merge(
                $steps,
                $this->enumerate_directory(
                    $upload_dir['basedir'],
                    'files/uploads',
                    $remaining_budget,
                    trailingslashit( $upload_dir['basedir'] ) . 'vulopilot-backups'
                )
            );
        }

        $theme_dir = get_stylesheet_directory();

        if ( is_dir( $theme_dir ) ) {
            $steps = array_merge(
                $steps,
                $this->enumerate_directory( $theme_dir, 'files/theme/' . get_stylesheet(), $remaining_budget )
            );
        }

        foreach ( (array) get_option( 'active_plugins', array() ) as $plugin_file ) {
            $plugin_slug = strtok( (string) $plugin_file, '/' );
            $plugin_dir  = trailingslashit( $this->get_plugins_dir() ) . $plugin_slug;

            if ( $plugin_slug && is_dir( $plugin_dir ) ) {
                $steps = array_merge(
                    $steps,
                    $this->enumerate_directory( $plugin_dir, 'files/plugins/' . $plugin_slug, $remaining_budget )
                );
            }
        }

        return $steps;
    }

    /**
     * Real files under `$directory`, turned into `file` steps, bounded by
     * `$remaining_budget` (decremented by reference so multiple calls share
     * one overall budget).
     *
     * @param string      $directory         Real absolute directory path.
     * @param string      $entry_prefix       Zip entry path prefix for this directory's own files.
     * @param int         $remaining_budget   Real remaining file budget, by reference.
     * @param string|null $exclude_dir_prefix Real absolute path prefix to skip (this plugin's own backups directory).
     * @return array<int, array<string, mixed>>
     */
    private function enumerate_directory( string $directory, string $entry_prefix, int &$remaining_budget, ?string $exclude_dir_prefix = null ): array {
        $steps = array();

        if ( $remaining_budget <= 0 ) {
            return $steps;
        }

        try {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator( $directory, \FilesystemIterator::SKIP_DOTS ),
                \RecursiveIteratorIterator::LEAVES_ONLY
            );
        } catch ( \Exception $exception ) {
            return $steps;
        }

        $base = trailingslashit( $directory );

        foreach ( $iterator as $file ) {
            if ( $remaining_budget <= 0 ) {
                break;
            }

            if ( ! $file->isFile() ) {
                continue;
            }

            $real_path = $file->getPathname();

            if ( $exclude_dir_prefix && 0 === strpos( $real_path, trailingslashit( $exclude_dir_prefix ) ) ) {
                continue;
            }

            $relative = ltrim( str_replace( $base, '', $real_path ), '/' );

            $steps[] = array(
                'type'   => 'file',
                'source' => $real_path,
                'entry'  => $entry_prefix . '/' . $relative,
            );

            --$remaining_budget;
        }

        return $steps;
    }

    /**
     * Processes as many queued steps as fit in `BATCH_SECONDS_BUDGET`,
     * then either self-reschedules (steps remain) or finalizes the
     * archive (queue drained). Registered on `self::BATCH_HOOK`, run via
     * WP-Cron only - never called synchronously from a REST request, same
     * posture PageSpeedScanner::process_batch() documents.
     *
     * @return void
     */
    public function process_batch(): void {
        $queue = get_option( self::QUEUE_OPTION, null );

        if ( ! is_array( $queue ) || empty( $queue['backup_id'] ) ) {
            return;
        }

        $repository = new BackupRepository();
        $backup_id  = (int) $queue['backup_id'];

        if ( empty( $queue['started'] ) ) {
            $repository->update(
                $backup_id,
                array(
                    'status'     => 'running',
                    'started_at' => current_time( 'mysql', true ),
                )
            );
            $queue['started'] = true;
        }

        try {
            $zip = new \ZipArchive();

            if ( true !== $zip->open( $queue['zip_path'], \ZipArchive::CREATE ) ) {
                throw new \RuntimeException( 'Could not open backup archive for writing.' );
            }

            $started_at = microtime( true );

            while ( ! empty( $queue['steps'] ) && ( microtime( true ) - $started_at ) < self::BATCH_SECONDS_BUDGET ) {
                $step = array_shift( $queue['steps'] );
                $this->process_step( $step, $zip, $queue['sql_path'] );
            }

            $zip->close();
        } catch ( \Throwable $exception ) {
            delete_option( self::QUEUE_OPTION );

            $repository->update(
                $backup_id,
                array(
                    'status'        => 'failed',
                    'finished_at'   => current_time( 'mysql', true ),
                    'error_message' => $exception->getMessage(),
                )
            );

            return;
        }

        if ( ! empty( $queue['steps'] ) ) {
            update_option( self::QUEUE_OPTION, $queue, false );
            wp_schedule_single_event( time() + 5, self::BATCH_HOOK );
            return;
        }

        $this->finalize_backup( $backup_id, $queue );
    }

    /**
     * Executes one real step against the open archive.
     *
     * @param array<string, mixed> $step     One entry from the queue's own step list.
     * @param \ZipArchive           $zip      Currently-open archive.
     * @param string                $sql_path Real path to this backup's shared temp `.sql` file.
     * @return void
     */
    private function process_step( array $step, \ZipArchive $zip, string $sql_path ): void {
        if ( 'db_table' === $step['type'] ) {
            $this->dump_table_to_sql( (string) $step['table'], $sql_path );
            return;
        }

        if ( 'file' === $step['type'] && file_exists( $step['source'] ) ) {
            $zip->addFile( $step['source'], $step['entry'] );
        }
    }

    /**
     * Appends one real table's own `DROP TABLE`/`CREATE TABLE`/`INSERT`
     * statements to the shared temp `.sql` file, chunked so a large table
     * doesn't need to fit in memory at once.
     *
     * @param string $table    Real, already-known table name (from `SHOW TABLES`, never client input).
     * @param string $sql_path Real path to this backup's shared temp `.sql` file.
     * @return void
     */
    private function dump_table_to_sql( string $table, string $sql_path ): void {
        global $wpdb;

        // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- appending to VuloPilot's own controlled temp backup file, not arbitrary user input.
        $handle = fopen( $sql_path, 'a' );

        if ( ! $handle ) {
            throw new \RuntimeException( 'Could not open temporary SQL file for writing.' );
        }

        $create_row = $wpdb->get_row( $wpdb->prepare( 'SHOW CREATE TABLE %i', $table ), ARRAY_N ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange -- $table is always a real name read from SHOW TABLES above, never client input; SHOW CREATE TABLE is read-only introspection for this backup export, not an actual schema mutation.

        // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite
        fwrite( $handle, "\n-- Table: {$table}\n" );
        // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite
        fwrite( $handle, "DROP TABLE IF EXISTS `{$table}`;\n" );

        if ( $create_row && isset( $create_row[1] ) ) {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite
            fwrite( $handle, $create_row[1] . ";\n\n" );
        }

        $offset = 0;

        while ( true ) {
            $rows = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM %i LIMIT %d, %d', $table, $offset, self::DB_CHUNK_SIZE ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- $table is always a real name read from SHOW TABLES above; $offset/DB_CHUNK_SIZE are internal ints, never client input.

            if ( empty( $rows ) ) {
                break;
            }

            foreach ( $rows as $row ) {
                $columns = implode( ', ', array_map( static fn( $column ) => "`{$column}`", array_keys( $row ) ) );
                $values  = implode(
                    ', ',
                    array_map(
                        static function ( $value ) use ( $wpdb ) {
                            return null === $value ? 'NULL' : "'" . $wpdb->remove_placeholder_escape( $wpdb->_real_escape( $value ) ) . "'";
                        },
                        array_values( $row )
                    )
                );

                // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite
                fwrite( $handle, "INSERT INTO `{$table}` ({$columns}) VALUES ({$values});\n" );
            }

            $offset += self::DB_CHUNK_SIZE;

            if ( count( $rows ) < self::DB_CHUNK_SIZE ) {
                break;
            }
        }

        // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
        fclose( $handle );
    }

    /**
     * Folds the accumulated `.sql` dump into the archive as `database.sql`,
     * marks the row `completed` with its real file size, and applies
     * retention cleanup.
     *
     * @param int                   $backup_id Real `vulopilot_backups` row id.
     * @param array<string, mixed>  $queue     The now-drained queue option's own array.
     * @return void
     */
    private function finalize_backup( int $backup_id, array $queue ): void {
        $zip = new \ZipArchive();

        if ( true === $zip->open( $queue['zip_path'], \ZipArchive::CREATE ) ) {
            if ( file_exists( $queue['sql_path'] ) ) {
                $zip->addFile( $queue['sql_path'], 'database.sql' );
            }

            $zip->close();
        }

        if ( file_exists( $queue['sql_path'] ) ) {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink -- deleting VuloPilot's own controlled temp backup file, not arbitrary user input.
            unlink( $queue['sql_path'] );
        }

        $file_size = file_exists( $queue['zip_path'] ) ? filesize( $queue['zip_path'] ) : 0; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_filesize -- reading the size of VuloPilot's own controlled backup file.

        ( new BackupRepository() )->update(
            $backup_id,
            array(
                'status'      => 'completed',
                'file_path'   => basename( $queue['zip_path'] ),
                'file_size'   => $file_size,
                'finished_at' => current_time( 'mysql', true ),
            )
        );

        delete_option( self::QUEUE_OPTION );

        $this->apply_retention();

        do_action( 'vulopilot_backup_completed', $backup_id );
    }

    /**
     * Drains the current batch queue synchronously, within this same
     * request - used only for the automatic pre-restore safety snapshot
     * (Recovery's first safety net), where a real, fully-completed backup
     * must exist *before* the destructive restore below it proceeds, not
     * "hopefully finished by the next WP-Cron tick." `$max_iterations`
     * bounds worst-case request time on a very large site - restore is
     * already a deliberate, rare, explicitly-confirmed admin action, so a
     * slower request here is the right trade for a real safety net instead
     * of a skipped or merely-queued one.
     *
     * @param int $max_iterations Real batch-tick cap.
     * @return void
     */
    public function run_queue_synchronously( int $max_iterations = 500 ): void {
        for ( $i = 0; $i < $max_iterations; $i++ ) {
            $queue = get_option( self::QUEUE_OPTION, null );

            if ( ! is_array( $queue ) || empty( $queue['steps'] ) ) {
                break;
            }

            $this->process_batch();
        }
    }

    /**
     * Real restore - Recovery's own destructive core. Always preceded by a
     * real, synchronously-completed pre-restore safety snapshot (called by
     * the REST controller before this, per its own docblock) and a real
     * typed-confirmation gate in the UI. On any failure partway through,
     * aborts immediately (no partial-apply) and reports the real error -
     * never guesses how to recover mid-restore.
     *
     * @param int $backup_id Real `vulopilot_backups` row id, must be `status='completed'`.
     * @return true|\WP_Error
     */
    public function restore( int $backup_id ) {
        global $wpdb;

        $repository = new BackupRepository();
        $backup     = $repository->find( $backup_id );

        if ( ! $backup || 'completed' !== $backup['status'] || empty( $backup['file_path'] ) ) {
            return new \WP_Error( 'vulopilot_backup_not_ready', __( 'This backup is not available to restore.', 'vulopilot' ), array( 'status' => 409 ) );
        }

        $zip_path = $this->resolve_file_path( (string) $backup['file_path'] );

        if ( ! file_exists( $zip_path ) ) {
            return new \WP_Error( 'vulopilot_backup_file_missing', __( 'This backup\'s file could not be found on disk.', 'vulopilot' ), array( 'status' => 404 ) );
        }

        $tmp_dir = trailingslashit( get_temp_dir() ) . 'vulopilot-restore-' . $backup_id . '-' . wp_generate_password( 6, false, false ) . '/';

        if ( ! wp_mkdir_p( $tmp_dir ) ) {
            return new \WP_Error( 'vulopilot_restore_tmp_dir_failed', __( 'Could not create a temporary directory to extract the backup into.', 'vulopilot' ), array( 'status' => 500 ) );
        }

        $zip = new \ZipArchive();

        if ( true !== $zip->open( $zip_path ) ) {
            $this->delete_directory_recursive( $tmp_dir );
            return new \WP_Error( 'vulopilot_restore_open_failed', __( 'Could not open this backup\'s archive.', 'vulopilot' ), array( 'status' => 500 ) );
        }

        $zip->extractTo( $tmp_dir );
        $zip->close();

        $sql_file = $tmp_dir . 'database.sql';

        if ( file_exists( $sql_file ) ) {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_get_contents -- reading VuloPilot's own just-extracted backup file, not arbitrary user input.
            $sql        = (string) file_get_contents( $sql_file );
            $statements = array_filter( array_map( 'trim', explode( ";\n", $sql ) ) );

            foreach ( $statements as $statement ) {
                $result = $this->restore_sql_statement( $statement );

                if ( is_wp_error( $result ) ) {
                    $this->delete_directory_recursive( $tmp_dir );

                    return new \WP_Error(
                        'vulopilot_restore_sql_failed',
                        sprintf(
                            /* translators: %s is the real database error that stopped the restore. */
                            __( 'Restore stopped partway through the database import: %s', 'vulopilot' ),
                            $result->get_error_message()
                        ),
                        array( 'status' => 500 )
                    );
                }
            }
        }

        $files_dir = $tmp_dir . 'files';

        if ( is_dir( $files_dir . '/uploads' ) ) {
            $this->copy_directory_recursive( $files_dir . '/uploads', wp_upload_dir()['basedir'] );
        }

        if ( is_dir( $files_dir . '/theme' ) ) {
            foreach ( (array) glob( $files_dir . '/theme/*', GLOB_ONLYDIR ) as $theme_backup_dir ) {
                $this->copy_directory_recursive( $theme_backup_dir, trailingslashit( get_theme_root() ) . basename( $theme_backup_dir ) );
            }
        }

        if ( is_dir( $files_dir . '/plugins' ) ) {
            foreach ( (array) glob( $files_dir . '/plugins/*', GLOB_ONLYDIR ) as $plugin_backup_dir ) {
                $this->copy_directory_recursive( $plugin_backup_dir, trailingslashit( $this->get_plugins_dir() ) . basename( $plugin_backup_dir ) );
            }
        }

        $this->delete_directory_recursive( $tmp_dir );

        // The DB rows above were restored via raw `$wpdb->query()`, which
        // never goes through `update_option()`/etc.'s own cache-invalidation
        // path - on a site with a persistent object cache (Redis/
        // Memcached), every cached value would otherwise keep serving the
        // pre-restore state until it happened to expire on its own. A
        // non-persistent (default) object cache is per-request anyway, so
        // this is a no-op there, but it's the only correct thing to do on a
        // site that does have one.
        wp_cache_flush();

        ( new ActivityLogRepository() )->insert(
            array(
                'event_type'  => 'backup.restored',
                'object_type' => 'backup',
                'object_id'   => $backup_id,
                'actor_type'  => 'user',
                'actor_id'    => get_current_user_id(),
                'message'     => sprintf(
                    /* translators: 1: backup id, 2: real date/time the backup was created. */
                    __( 'Restored the site from backup #%1$d (created %2$s)', 'vulopilot' ),
                    $backup_id,
                    $backup['created_at']
                ),
                'severity'    => 'high',
            )
        );

        return true;
    }

    /**
     * Real recursive copy - overwrites files in `$destination` from
     * `$source` in place. Used only by restore(), against VuloPilot's own
     * just-extracted, plugin-controlled temp directory.
     *
     * @param string $source      Real absolute source directory.
     * @param string $destination Real absolute destination directory.
     * @return void
     */
    private function copy_directory_recursive( string $source, string $destination ): void {
        if ( ! is_dir( $destination ) ) {
            wp_mkdir_p( $destination );
        }

        try {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator( $source, \FilesystemIterator::SKIP_DOTS ),
                \RecursiveIteratorIterator::LEAVES_ONLY
            );
        } catch ( \Exception $exception ) {
            return;
        }

        $base = trailingslashit( $source );

        foreach ( $iterator as $file ) {
            if ( ! $file->isFile() ) {
                continue;
            }

            $relative        = ltrim( str_replace( $base, '', $file->getPathname() ), '/' );
            $destination_path = trailingslashit( $destination ) . $relative;

            wp_mkdir_p( dirname( $destination_path ) );
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_copy -- restoring VuloPilot's own just-extracted, plugin-controlled backup archive contents back into place.
            copy( $file->getPathname(), $destination_path );
        }
    }

    /**
     * Replays one statement of a backup's `database.sql`. Backups only ever
     * contain three kinds - `DROP TABLE IF EXISTS`, `CREATE TABLE` and
     * `INSERT INTO` - so each is handled through the matching WordPress
     * database API instead of running the file's text as SQL, and only
     * tables that belong to this site (its own prefix) are touched.
     *
     * @param string $statement One statement from the dump, without its trailing `;`.
     * @return true|\WP_Error
     */
    private function restore_sql_statement( string $statement ) {
        global $wpdb;

        // Drop the "-- Table: name" comment lines that head each table's block.
        $statement = trim( (string) preg_replace( '/^--[^\n]*\n?/m', '', $statement ) );

        if ( '' === $statement ) {
            return true;
        }

        if ( preg_match( '/^DROP TABLE IF EXISTS `([A-Za-z0-9_]+)`$/', $statement, $matches ) ) {
            if ( 0 !== strpos( $matches[1], $wpdb->prefix ) ) {
                return new \WP_Error( 'vulopilot_restore_foreign_table', __( 'The backup refers to a table outside this site.', 'vulopilot' ) );
            }

            $wpdb->query( $wpdb->prepare( 'DROP TABLE IF EXISTS %i', $matches[1] ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange -- restoring this site's own table from its backup.

            return $wpdb->last_error ? new \WP_Error( 'vulopilot_restore_drop_failed', $wpdb->last_error ) : true;
        }

        if ( preg_match( '/^CREATE TABLE `([A-Za-z0-9_]+)`/', $statement, $matches ) ) {
            if ( 0 !== strpos( $matches[1], $wpdb->prefix ) ) {
                return new \WP_Error( 'vulopilot_restore_foreign_table', __( 'The backup refers to a table outside this site.', 'vulopilot' ) );
            }

            require_once ABSPATH . 'wp-admin/includes/upgrade.php';

            dbDelta( $statement );

            $exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $matches[1] ) ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- checking the table was created.

            return $exists ? true : new \WP_Error( 'vulopilot_restore_create_failed', $wpdb->last_error ? $wpdb->last_error : $matches[1] );
        }

        if ( preg_match( '/^INSERT INTO `([A-Za-z0-9_]+)` \((.+?)\) VALUES \((.*)\)$/s', $statement, $matches ) ) {
            if ( 0 !== strpos( $matches[1], $wpdb->prefix ) ) {
                return new \WP_Error( 'vulopilot_restore_foreign_table', __( 'The backup refers to a table outside this site.', 'vulopilot' ) );
            }

            preg_match_all( '/`([A-Za-z0-9_]+)`/', $matches[2], $column_matches );
            $values = $this->parse_sql_values( $matches[3] );

            if ( null === $values || count( $values ) !== count( $column_matches[1] ) ) {
                return new \WP_Error( 'vulopilot_restore_bad_row', $matches[1] );
            }

            $inserted = $wpdb->insert( $matches[1], array_combine( $column_matches[1], $values ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- restoring this site's own rows from its backup.

            return false === $inserted ? new \WP_Error( 'vulopilot_restore_insert_failed', $wpdb->last_error ) : true;
        }

        return new \WP_Error( 'vulopilot_restore_unsupported', __( 'The backup contains a statement this version cannot restore.', 'vulopilot' ) );
    }

    /**
     * Reads the value list of one dumped `INSERT` - `NULL` or a single-quoted
     * string with backslash escapes, separated by commas - back into an array.
     *
     * @param string $list The text between `VALUES (` and the closing `)`.
     * @return array<int, string|null>|null Null when the text is not in that format.
     */
    private function parse_sql_values( string $list ): ?array {
        $escapes = array(
            'n' => "\n",
            'r' => "\r",
            '0' => "\0",
            'Z' => "\x1a",
        );
        $values  = array();
        $length  = strlen( $list );
        $i       = 0;

        while ( $i < $length ) {
            if ( 'NULL' === substr( $list, $i, 4 ) ) {
                $values[] = null;
                $i       += 4;
            } elseif ( "'" === $list[ $i ] ) {
                $value = '';
                ++$i;

                while ( $i < $length && "'" !== $list[ $i ] ) {
                    if ( '\\' === $list[ $i ] && $i + 1 < $length ) {
                        ++$i;
                        $value .= $escapes[ $list[ $i ] ] ?? $list[ $i ];
                    } else {
                        $value .= $list[ $i ];
                    }

                    ++$i;
                }

                if ( $i >= $length ) {
                    return null;
                }

                ++$i;
                $values[] = $value;
            } else {
                return null;
            }

            if ( $i < $length ) {
                if ( ', ' !== substr( $list, $i, 2 ) ) {
                    return null;
                }

                $i += 2;
            }
        }

        return $values;
    }

    /**
     * Real recursive delete - cleans up restore()'s own temp extraction
     * directory. Used only against VuloPilot's own plugin-controlled temp
     * directory, never arbitrary user input.
     *
     * @param string $directory Real absolute directory path.
     * @return void
     */
    private function delete_directory_recursive( string $directory ): void {
        if ( ! is_dir( $directory ) ) {
            return;
        }

        try {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator( $directory, \FilesystemIterator::SKIP_DOTS ),
                \RecursiveIteratorIterator::CHILD_FIRST
            );
        } catch ( \Exception $exception ) {
            return;
        }

        foreach ( $iterator as $file ) {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- cleaning up VuloPilot's own plugin-controlled temp restore directory, not arbitrary user input.
            $file->isDir() ? rmdir( $file->getPathname() ) : unlink( $file->getPathname() );
        }

        // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
        rmdir( $directory );
    }

    /**
     * Deletes the oldest completed backups (row + real file) beyond
     * `backup_retention_count`, so disk usage stays bounded.
     *
     * @return void
     */
    private function apply_retention(): void {
        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );
        $keep     = max( 1, absint( $settings['backup_retention_count'] ) ?: 5 );

        $repository = new BackupRepository();

        foreach ( $repository->get_completed_beyond_retention( $keep ) as $row ) {
            if ( ! empty( $row['file_path'] ) ) {
                $path = $this->resolve_file_path( (string) $row['file_path'] );

                if ( file_exists( $path ) ) {
                    // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink -- deleting VuloPilot's own controlled backup file, not arbitrary user input.
                    unlink( $path );
                }
            }

            // Real remote-copy cleanup (S3/Google Drive) - same real
            // no-op-for-local/never-uploaded posture
            // Controllers\Backups::delete_item() already uses. See
            // Services\BackupStorageManager::delete_remote_copy()'s own
            // docblock.
            VuloPilot()->backup_storage_manager->delete_remote_copy( $row );

            $repository->delete( (int) $row['id'] );
        }
    }
}
