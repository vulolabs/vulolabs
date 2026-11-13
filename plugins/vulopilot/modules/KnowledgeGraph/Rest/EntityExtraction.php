<?php
/**
 * EntityExtraction controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\KnowledgeGraph\Rest;

use VuloPilot\KnowledgeGraph\EntityExtractor;

defined( 'ABSPATH' ) || exit;

/**
 * `GET /entities` backs src/pages/KnowledgeGraph/KnowledgeGraph.tsx.
 *
 * @class       EntityExtraction controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class EntityExtraction extends \WP_REST_Controller {

	/**
	 * @var string
	 */
	protected $rest_base = 'entities';

	/**
	 * @var EntityExtractor
	 */
	private EntityExtractor $extractor;

	/**
	 * @param EntityExtractor|null $extractor Defaults to a new instance (injectable for tests).
	 */
	public function __construct( ?EntityExtractor $extractor = null ) {
		$this->extractor = $extractor ?? new EntityExtractor();
	}

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
					'callback'            => array( $this, 'get_items' ),
					'permission_callback' => array( $this, 'get_items_permissions_check' ),
				),
			)
		);

		// Backs BusinessProfileCard.tsx's own "Business Name Details" side panel.
		register_rest_route(
			VuloPilot()->rest_namespace,
			'/' . $this->rest_base . '/business-name-sources',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_business_name_sources' ),
					'permission_callback' => array( $this, 'get_items_permissions_check' ),
					'args'                => array(
						'refresh' => array(
							'type'    => 'boolean',
							'default' => false,
						),
					),
				),
			)
		);

		// Backs BusinessProfileCard.tsx's own "Product Details" side panel.
		register_rest_route(
			VuloPilot()->rest_namespace,
			'/' . $this->rest_base . '/product-details',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_product_schema_details' ),
					'permission_callback' => array( $this, 'get_items_permissions_check' ),
				),
			)
		);
	}

	/**
	 * @inheritDoc
	 */
	public function get_items_permissions_check( $request ) {
		return current_user_can( 'manage_options' );
	}

	/**
	 * @param \WP_REST_Request $request Full request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_items( $request ) {
		return $this->prepare_get_items_response( $request->get_params(), $request );
	}

	/**
	 * Extracted site entities (REST or ability).
	 *
	 * @param array                 $payload Request params.
	 * @param \WP_REST_Request|null $request Request object, if any.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function prepare_get_items_response( $payload = array(), $request = null ) {
		$data = $this->extractor->extract_all();

		// `edit_url` is a real, per-viewer capability check (`current_user_can( 'edit_user',... )`).
		$data['people'] = array_map(
			function ( array $person ): array {
				$user_id = (int) $person['source_object_ref'];

				// Not `get_edit_user_link()`.
				$person['meta']['edit_url'] = current_user_can( 'edit_user', $user_id )
					? add_query_arg( 'user_id', $user_id, admin_url( 'user-edit.php' ) )
					: null;

				return $person;
			},
			$data['people']
		);

		// Same real, per-viewer `edit_url` reasoning as `people` above.
		$data['categories'] = array_map(
			function ( array $category ): array {
				$term_id  = (int) $category['source_object_ref'];
				$taxonomy = is_string( $category['meta']['taxonomy'] ?? null ) ? $category['meta']['taxonomy'] : '';
				$edit_url = current_user_can( 'edit_term', $term_id ) ? get_edit_term_link( $term_id, $taxonomy ) : null;

				$category['meta']['edit_url'] = is_string( $edit_url ) ? $edit_url : null;

				return $category;
			},
			$data['categories']
		);

		// "Contact details" row (BusinessProfileCard.tsx, "Key Information Found by AI").
		$admin_email = get_option( 'admin_email' );
		$admin_user  = $admin_email ? get_user_by( 'email', $admin_email ) : false;

		if ( ! $admin_user ) {
			$admins     = get_users(
				array(
					'role__in' => array( 'administrator' ),
					'number'   => 1,
					'orderby'  => 'ID',
					'order'    => 'ASC',
				)
			);
			$admin_user = $admins[0] ?? null;
		}

		$data['contact_email'] = array(
			'found'    => (bool) $admin_email,
			'edit_url' => ( $admin_user && current_user_can( 'edit_user', $admin_user->ID ) )
				? add_query_arg(
					array(
						'user_id'   => $admin_user->ID,
						'highlight' => 'email',
					),
					admin_url( 'user-edit.php' )
				)
				: null,
		);

		return rest_ensure_response( $data );
	}

	/**
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response
	 */
	public function get_business_name_sources( $request ) {
		return rest_ensure_response(
			$this->extractor->get_business_name_sources( (bool) $request->get_param( 'refresh' ) )
		);
	}

	/**
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response
	 */
	public function get_product_schema_details( $request ) {
		return rest_ensure_response( $this->extractor->get_product_schema_details() );
	}
}
