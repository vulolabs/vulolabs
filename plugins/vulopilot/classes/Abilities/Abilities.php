<?php
/**
 * Abilities class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Abilities;

use VuloPilot\Abilities\AbilitiesApi\Automations;
use VuloPilot\Abilities\AbilitiesApi\Dashboard;
use VuloPilot\Abilities\AbilitiesApi\Findings;
use VuloPilot\Abilities\AbilitiesApi\Scans;

defined( 'ABSPATH' ) || exit;

/**
 * Registers VuloPilot's WordPress Abilities API category and abilities, which the MCP Adapter exposes as MCP tools.
 *
 * @class       Abilities class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Abilities {

	/**
	 * Container for all abilities controller classes.
	 *
	 * @var array
	 */
	private $container = array();

	/**
	 * Abilities constructor.
	 */
	public function __construct() {
		$this->init_classes();

		add_action( 'wp_abilities_api_categories_init', array( $this, 'register_categories' ) );
		add_action( 'wp_abilities_api_init', array( $this, 'register_abilities' ) );
	}

	/**
	 * Initialize all abilities controller classes.
	 *
	 * @return void
	 */
	public function init_classes() {
		$this->container = array(
			'scan'       => new Scans(),
			'finding'    => new Findings(),
			'dashboard'  => new Dashboard(),
			'automation' => new Automations(),
		);
	}

	/**
	 * Register the VuloPilot ability category.
	 *
	 * @return void
	 */
	public function register_categories() {
		wp_register_ability_category(
			'vulopilot',
			array(
				'label'       => __( 'VuloPilot', 'vulopilot' ),
				'description' => __( 'VuloPilot site scanning, findings, and automation abilities.', 'vulopilot' ),
			)
		);
	}

	/**
	 * Register abilities for each controller in the container.
	 *
	 * @return void
	 */
	public function register_abilities() {
		/**
		 * Extra abilities controllers, keyed by id. Same key overrides the free controller.
		 *
		 * @param array $controllers Objects exposing register_abilities().
		 */
		$extra_controllers = apply_filters( 'vulopilot_abilities_controllers', array() );

		foreach ( $extra_controllers as $key => $controller ) {
			if ( is_object( $controller ) ) {
				$this->container[ $key ] = $controller;
			}
		}

		foreach ( $this->container as $controller ) {
			if ( method_exists( $controller, 'register_abilities' ) ) {
				$controller->register_abilities();
			}
		}
	}

	/**
	 * @param string $key Controller id.
	 * @return object|null
	 */
	public function get_controller( string $key ) {
		return $this->container[ $key ] ?? null;
	}
}
