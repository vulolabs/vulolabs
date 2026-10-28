<?php
/**
 * VuloMail class file.
 *
 * @package VuloMail
 */

namespace VuloMail;

defined( 'ABSPATH' ) || exit;

/**
 * VuloMail Class.
 *
 * @class       VuloMail class
 * @version     1.0.0
 * @author      VuloLabs
 */
final class VuloMail {

	/**
	 * Holds the single instance of the class (singleton pattern).
	 *
	 * @var self|null
	 */
	private static $instance = null;

	/**
	 * Container for shared class instances and config values.
	 *
	 * @var array
	 */
	private $container = array();

	/**
	 * Class constructor.
	 *
	 * @param string $file Main plugin file path.
	 */
	public function __construct( $file ) {
		require_once trailingslashit( dirname( $file ) ) . 'config.php';

		$this->container['plugin_url']     = trailingslashit( plugins_url( '', $file ) );
		$this->container['plugin_path']    = trailingslashit( dirname( $file ) );
		$this->container['plugin_base']    = plugin_basename( $file );
		$this->container['version']        = VULOMAIL_PLUGIN_VERSION;
		$this->container['rest_namespace'] = 'vulomail/v1';
		$this->container['plugin_slug']    = VULOMAIL_PLUGIN_SLUG;

		register_activation_hook( $file, array( $this, 'activate' ) );
		register_deactivation_hook( $file, array( $this, 'deactivate' ) );
		// uninstall.php isn't in the shared release script's file list, so the uninstall routine is
		// registered as a hook instead.
		register_uninstall_hook( $file, array( Install::class, 'uninstall' ) );

		// The delivery services are built here, not on `init`: other plugins call wp_mail() as early
		// as `plugins_loaded`, and those messages must reach the configured connection too.
		$this->init_services();

		add_action( 'plugins_loaded', array( $this, 'init_plugin' ) );
	}

	/**
	 * Runs on plugin activation.
	 *
	 * @return void
	 */
	public function activate() {
		add_option( Utill::OTHER_SETTINGS['run_installer'], true );
	}

	/**
	 * Runs on plugin deactivation.
	 *
	 * @return void
	 */
	public function deactivate() {
		wp_clear_scheduled_hook( Logging\Logger::RETENTION_HOOK );
	}

	/**
	 * Builds the delivery pipeline. Nothing here touches the database until a message is sent.
	 *
	 * @return void
	 */
	private function init_services() {
		$this->container['secrets']     = new Security\Secrets();
		$this->container['settings']    = new Settings\Settings();
		$this->container['providers']   = new Connections\ProviderRegistry();
		$this->container['connections'] = new Connections\ConnectionRepository( $this->container['secrets'], $this->container['providers'] );
		$this->container['google']      = new Connections\GoogleOAuth( $this->container['connections'] );
		$this->container['logs']        = new Logging\LogRepository();
		$this->container['logger']      = new Logging\Logger( $this->container['logs'], $this->container['settings'] );
		$this->container['tracking']    = new Email\Tracking( $this->container['settings'], $this->container['logs'] );

		$this->container['email'] = new Email\Dispatcher(
			$this->container['settings'],
			$this->container['connections'],
			$this->container['providers'],
			$this->container['logger'],
			$this->container['tracking']
		);
		$this->container['sms']   = new Sms\Dispatcher(
			$this->container['settings'],
			$this->container['connections'],
			$this->container['providers'],
			$this->container['logger']
		);

		$this->container['wp_mail'] = new Email\WpMailInterceptor(
			$this->container['settings'],
			$this->container['email'],
			$this->container['logger'],
			$this->container['tracking']
		);
	}

	/**
	 * Boots the plugin once every other active plugin has loaded.
	 *
	 * @return void
	 */
	public function init_plugin() {
		$needs_install = get_option( Utill::OTHER_SETTINGS['run_installer'] )
			|| get_option( Utill::OTHER_SETTINGS['plugin_db_version'] ) !== VULOMAIL_PLUGIN_VERSION
			|| (int) get_option( Utill::OTHER_SETTINGS['db_schema_version'] ) !== Install::SCHEMA_VERSION;

		if ( $needs_install ) {
			new Install();
			delete_option( Utill::OTHER_SETTINGS['run_installer'] );
		}

		add_action( 'init', array( $this, 'init_classes' ), 0 );
	}

	/**
	 * Instantiate the plugin's core classes.
	 *
	 * @return void
	 */
	public function init_classes() {
		$this->container['admin']           = new Admin();
		$this->container['frontendScripts'] = new FrontendScripts();
		$this->container['diagnostics']     = new Diagnostics\Diagnostics();
		$this->container['sms_triggers']    = new Sms\Triggers( $this->container['settings'], $this->container['sms'] );
		$this->container['rest']            = new Rest();

		$this->container['logger']->register_retention();
		$this->container['tracking']->register_endpoint();

		/**
		 * Fires once VuloMail has booted. Integrations should wait for this before calling the
		 * public API in classes/Integrations/functions.php.
		 */
		do_action( 'vulomail_loaded' );
	}

	/**
	 * Magic getter for the container.
	 *
	 * @param string $class_name Container key to retrieve.
	 * @return mixed
	 * @throws \Exception If the requested key does not exist in the container.
	 */
	public function __get( $class_name ) { // phpcs:ignore Universal.NamingConventions.NoReservedKeywordParameterNames.classFound
		if ( array_key_exists( $class_name, $this->container ) ) {
			return $this->container[ $class_name ];
		}

		throw new \Exception( sprintf( 'Call to unknown class %s.', esc_html( $class_name ) ) );
	}

	/**
	 * Magic isset for the container.
	 *
	 * @param string $class_name Container key to check.
	 * @return bool
	 */
	public function __isset( $class_name ) { // phpcs:ignore Universal.NamingConventions.NoReservedKeywordParameterNames.classFound
		return array_key_exists( $class_name, $this->container );
	}

	/**
	 * Magic setter for the container.
	 *
	 * @param string $class_name Container key to store under.
	 * @param mixed  $value      Value to store.
	 * @return void
	 */
	public function __set( $class_name, $value ) { // phpcs:ignore Universal.NamingConventions.NoReservedKeywordParameterNames.classFound
		$this->container[ $class_name ] = $value;
	}

	/**
	 * Returns the single instance of this class, creating it if necessary.
	 *
	 * @param string $file Main plugin file path.
	 * @return self
	 */
	public static function init( $file ) {
		if ( null === self::$instance ) {
			self::$instance = new self( $file );
		}

		return self::$instance;
	}
}
