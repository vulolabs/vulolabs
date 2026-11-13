<?php
/**
 * LlmsTxt controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\GeoAnalysis\Rest;

defined( 'ABSPATH' ) || exit;

/**
 * Fetches `/llms-txt/regenerate`, backing the "Regenerate" button on Crawl & URLs → Robots & Sitemap.
 *
 * @class       LlmsTxt controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class LlmsTxt extends \WP_REST_Controller {

	/**
	 * @var string
	 */
	protected $rest_base = 'llms-txt';

	/**
	 * @inheritDoc
	 */
	public function register_routes() {
		register_rest_route(
			VuloPilot()->rest_namespace,
			'/' . $this->rest_base . '/regenerate',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_regenerated_content' ),
					'permission_callback' => array( $this, 'get_regenerated_content_permissions_check' ),
				),
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Full request object.
	 * @return bool
	 */
	public function get_regenerated_content_permissions_check( $request ) {
		return current_user_can( 'manage_options' );
	}

	/**
	 * @param \WP_REST_Request $request Full request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_regenerated_content( $request ) {
		return $this->prepare_get_regenerated_content_response( $request->get_params(), $request );
	}

	/**
	 * Freshly generated llms.txt content (REST or ability).
	 *
	 * @param array                 $payload Request params.
	 * @param \WP_REST_Request|null $request Request object, if any.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function prepare_get_regenerated_content_response( $payload = array(), $request = null ) {
		return rest_ensure_response( array( 'content' => VuloPilot()->llms_txt_generator->generate() ) );
	}
}
