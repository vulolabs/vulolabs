<?php
/**
 * Modules class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot Modules class.
 *
 * Distinct from Scanners\ScannerRegistry/RuleEngine\RuleRegistry/etc. -
 * those are a single class implementing one small interface (a plain
 * class-name filter is enough); a module is a whole package (potentially
 * `Module.php` + `Frontend.php`/`Rest.php`/`Admin.php`/`src/`), which is
 * why it needs the heavier folder-scan discovery this class provides
 * instead.
 *
 * @class       Modules class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Modules {

    /**
     * Every discovered module, keyed by its kebab-case id (or
     * `{namespace}_{id}` if two sources both register the same id).
     *
     * @var array
     */
    private $modules = array();

    /**
     * Currently active module ids, once loaded.
     *
     * @var array
     */
    private $active_modules = array();

    /**
     * Whether load_active_modules() has already run this request.
     *
     * @var bool
     */
    private static $module_activated = false;

    /**
     * Instantiated active module objects, keyed the same as $modules.
     *
     * @var array
     */
    private $container = array();

    /**
     * Modules constructor.
     */
    public function __construct() {}

    /**
     * @param string $string_param e.g. 'ComplianceReports'.
     * @return string e.g. 'compliance-reports'.
     */
    private function camel_to_kebab( string $string_param ): string {
        return strtolower(
            preg_replace(
                '/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/',
                '-',
                $string_param
            )
        );
    }

    /**
     * Scans every registered module source directory for a `{Folder}/Module.php`
     * and indexes what it finds - this never instantiates anything, see
     * load_active_modules() for that.
     *
     * @return array
     */
    public function get_all_modules(): array {
        if ( ! empty( $this->modules ) ) {
            return $this->modules;
        }

        $sources = apply_filters(
            'vulopilot_module_sources',
            array(
                array(
                    'path'      => trailingslashit( VuloPilot()->plugin_path . 'modules' ),
                    'namespace' => 'VuloPilot',
                ),
            )
        );

        foreach ( $sources as $source ) {
            $base_path = $source['path'];
            $namespace = $source['namespace'];

            if ( ! is_dir( $base_path ) ) {
                continue;
            }

            $folders = scandir( $base_path );

            foreach ( $folders as $folder ) {
                if ( in_array( $folder, array( '.', '..' ), true ) ) {
                    continue;
                }

                $module_file = $base_path . $folder . '/Module.php';

                if ( ! is_dir( $base_path . $folder ) || ! file_exists( $module_file ) ) {
                    continue;
                }

                $module_id = $this->camel_to_kebab( $folder );

                $key = array_key_exists( $module_id, $this->modules )
                    ? $namespace . '_' . $module_id
                    : $module_id;

                $this->modules[ $key ] = array(
                    'id'           => $module_id,
                    'module_file'  => $module_file,
                    'module_class' => "{$namespace}\\{$folder}\\Module",
                );
            }
        }

        return $this->modules;
    }

    /**
     * @return array Active module ids - from the in-request cache once
     *               load_active_modules() has run, otherwise straight from
     *               the stored option.
     */
    public function get_active_modules() {
        if ( $this->active_modules ) {
            return $this->active_modules;
        }

        return get_option( Utill::ACTIVE_MODULES_DB_KEY, array() );
    }

    /**
     * @return void
     */
    public function load_active_modules() {
        if ( self::$module_activated ) {
            return;
        }

        $active_modules = $this->get_active_modules();
        $all_modules    = $this->get_all_modules();

        $validated_active = array();

        foreach ( $active_modules as $module_id ) {
            $resolved = false;

            foreach ( $all_modules as $key => $module ) {
                if ( empty( $module['id'] ) || $module['id'] !== $module_id ) {
                    continue;
                }

                if ( ! $this->is_module_available( $module ) ) {
                    continue;
                }

                require_once $module['module_file'];

                try {
                    $class                   = $module['module_class'];
                    $this->container[ $key ] = new $class();
                } catch ( \Throwable $e ) {
                    VuloPilot()->util->log( $e );
                    continue;
                }

                do_action( "vulopilot_activated_module_{$module_id}", $this->container[ $key ] );

                $resolved = true;
            }

            if ( $resolved ) {
                $validated_active[] = $module_id;
            }
        }

        if ( $validated_active !== $active_modules ) {
            update_option( Utill::ACTIVE_MODULES_DB_KEY, $validated_active );
            $this->active_modules = $validated_active;
        }

        self::$module_activated = true;
    }

    /**
     * @param array $module One get_all_modules() entry.
     * @return bool False if the module's file vanished, or its own static
     *              `is_compatible()` (module-architecture.md's optional
     *              gate) says no.
     */
    private function is_module_available( $module ) {
        if ( ! file_exists( $module['module_file'] ) ) {
            return false;
        }

        require_once $module['module_file'];

        $class = $module['module_class'];

        if ( class_exists( $class ) && method_exists( $class, 'is_compatible' ) ) {
            if ( ! $class::is_compatible() ) {
				return false;
            }
        }

        return true;
    }

    /**
     * @param array $modules Module ids to add to the active list.
     * @return array The full, updated active-module id list.
     */
    public function activate_modules( $modules ) {
        $active_modules       = $this->get_active_modules();
        $this->active_modules = array_unique( array_merge( $active_modules, $modules ) );

        update_option( Utill::ACTIVE_MODULES_DB_KEY, $this->active_modules );

        self::$module_activated = false;

        $this->load_active_modules();

        return $this->active_modules;
    }

    /**
     * @param array $modules Module ids to remove from the active list.
     * @return array The full, updated active-module id list.
     */
    public function deactivate_modules( array $modules ): array {
        $this->active_modules = array_values(
            array_diff( $this->get_active_modules(), $modules )
        );

        update_option( Utill::ACTIVE_MODULES_DB_KEY, $this->active_modules );

        add_action(
            'shutdown',
            function () use ( $modules ) {
                foreach ( $modules as $module_id ) {
                    if ( isset( $this->container[ $module_id ] ) ) {
                        do_action( "vulopilot_deactivated_module_{$module_id}", $this->container[ $module_id ] );
                    }
                }
            }
        );

        return $this->active_modules;
    }

    /**
     * @param string $module_id A module's id.
     * @return bool
     */
    public function is_active( $module_id ) {
        return in_array( $module_id, $this->get_active_modules(), true );
    }
}
