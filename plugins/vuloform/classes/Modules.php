<?php
/**
 * Modules class file.
 *
 * @package VuloForm
 */

namespace VuloForm;

defined( 'ABSPATH' ) || exit;

/**
 * Loads extension modules. VuloForm itself ships none: an extension such as VuloForm Pro adds a
 * folder of modules through the `vuloform_module_sources` filter, and the ones switched on are
 * instantiated here.
 *
 * A module is a folder holding a `Module.php` whose class is `{Namespace}\{Folder}\Module`. Its id
 * is the folder name in kebab case (`CrmSync` is `crm-sync`).
 */
class Modules {

	/**
	 * Option holding the ids of the modules that are switched on.
	 */
	const ACTIVE_KEY = 'vuloform_active_modules';

	/**
	 * @var array<string, array{id: string, file: string, class: string}>|null
	 */
	private $modules = null;

	/**
	 * @var array<string, object> Module id => instance.
	 */
	private $loaded = array();

	/**
	 * Every module an extension offers, whether switched on or not.
	 *
	 * @return array<string, array{id: string, file: string, class: string}>
	 */
	public function get_all_modules() {
		if ( null !== $this->modules ) {
			return $this->modules;
		}

		$this->modules = array();

		/**
		 * Filters where modules are looked for.
		 *
		 * @param array $sources Each `path` (a folder of module folders) and `namespace`.
		 */
		foreach ( (array) apply_filters( 'vuloform_module_sources', array() ) as $source ) {
			$base = isset( $source['path'] ) ? trailingslashit( (string) $source['path'] ) : '';

			if ( '' === $base || empty( $source['namespace'] ) || ! is_dir( $base ) ) {
				continue;
			}

			foreach ( (array) scandir( $base ) as $folder ) {
				$file = $base . $folder . '/Module.php';

				if ( ! preg_match( '/^[A-Za-z][A-Za-z0-9]*$/', (string) $folder ) || ! is_file( $file ) ) {
					continue;
				}

				$id = strtolower( preg_replace( '/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/', '-', $folder ) );

				$this->modules[ $id ] = array(
					'id'    => $id,
					'file'  => $file,
					'class' => $source['namespace'] . '\\' . $folder . '\\Module',
				);
			}
		}

		return $this->modules;
	}

	/**
	 * @return string[] Ids of the modules that are switched on and available.
	 */
	public function get_active_modules() {
		$stored = get_option( self::ACTIVE_KEY, array() );

		return array_values( array_intersect( is_array( $stored ) ? $stored : array(), array_keys( $this->get_all_modules() ) ) );
	}

	/**
	 * Instantiates every active module once. A module that fails to start is skipped, never fatal:
	 * forms keep working without it.
	 *
	 * @return void
	 */
	public function load_active_modules() {
		$all = $this->get_all_modules();

		foreach ( $this->get_active_modules() as $id ) {
			if ( isset( $this->loaded[ $id ] ) ) {
				continue;
			}

			try {
				require_once $all[ $id ]['file'];

				$class = $all[ $id ]['class'];

				if ( ! class_exists( $class ) ) {
					continue;
				}

				$this->loaded[ $id ] = new $class();
			} catch ( \Throwable $e ) {
				// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- a broken extension module must be traceable without taking the site down.
				error_log( 'VuloForm: module "' . $id . '" could not start: ' . $e->getMessage() );
				continue;
			}

			/**
			 * Fires when a module has started.
			 *
			 * @param object $module Module instance.
			 */
			do_action( "vuloform_activated_module_{$id}", $this->loaded[ $id ] );
		}
	}

	/**
	 * Switches a module on or off. Stored ids that no longer match a module are left alone, so
	 * deactivating an extension and activating it again restores what was switched on.
	 *
	 * @param string $id     Module id.
	 * @param bool   $active Whether it should be on.
	 * @return bool False when no such module is available.
	 */
	public function set_active( $id, $active ) {
		if ( ! isset( $this->get_all_modules()[ $id ] ) ) {
			return false;
		}

		$stored = get_option( self::ACTIVE_KEY, array() );
		$stored = array_values( array_diff( is_array( $stored ) ? $stored : array(), array( $id ) ) );

		if ( $active ) {
			$stored[] = $id;
		}

		update_option( self::ACTIVE_KEY, $stored );

		return true;
	}
}
