<?php
/**
 * EntityExtraction controller file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\EntityExtraction\Rest;

use VuloPilot\EntityExtraction\EntityExtractor;

defined( 'ABSPATH' ) || exit;

/**
 * `GET /entities` backs src/pages/KnowledgeGraph/KnowledgeGraph.tsx —
 * Services\EntityExtractor's own docblock has the full extraction design.
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

        // Backs BusinessProfileCard.tsx's own "Business Name Details" side
        // panel — see EntityExtractor::get_business_name_sources()'s own
        // docblock for what this real 4-source cross-check actually is.
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

        // Backs BusinessProfileCard.tsx's own "Product Details" side panel
        // — see EntityExtractor::get_product_schema_details()'s own
        // docblock for what these real per-product completeness issues
        // actually are.
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
     * @inheritDoc
     */
    public function get_items( $request ) {
        $data = $this->extractor->extract_all();

        // `edit_url` is a real, per-viewer capability check
        // (`current_user_can( 'edit_user', ... )`) — computed fresh on
        // every request rather than inside EntityExtractor::extract_all()
        // itself, since that method's own result is cached in one
        // site-wide transient shared by every admin who views this tab;
        // baking a single viewer's own edit capability into that shared
        // cache would leak whichever admin happened to trigger the cache
        // fill.
        $data['people'] = array_map(
            function ( array $person ): array {
                $user_id = (int) $person['source_object_ref'];

                // Not `get_edit_user_link()` — core's own version routes to
                // `profile.php` instead of `user-edit.php` whenever
                // `$user_id` happens to be the currently logged-in admin
                // (e.g. viewing this list as "admin" and that same "admin"
                // is also one of the detected people), which isn't what
                // this "Edit" action is for here. Always the real
                // `user-edit.php?user_id=` admin screen instead, same one
                // every *other* user in the list already gets.
                $person['meta']['edit_url'] = current_user_can( 'edit_user', $user_id )
                    ? add_query_arg( 'user_id', $user_id, admin_url( 'user-edit.php' ) )
                    : null;

                return $person;
            },
            $data['people']
        );

        // Same real, per-viewer `edit_url` reasoning as `people` above —
        // `current_user_can( 'edit_term', ... )` respects each taxonomy's
        // own real capability mapping (e.g. WooCommerce's own
        // `manage_product_terms` for `product_cat`, not just the default
        // `category` taxonomy's `manage_categories`), so this can't be
        // baked into EntityExtractor::extract_all()'s own shared cache
        // either.
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

        // "Contact details" row (BusinessProfileCard.tsx, "Key Information
        // Found by AI") — deliberately checks the real site admin's account
        // email, not `has_contact_page`/`contact_page_url` above (those
        // stay as-is; still real signals used elsewhere on this same
        // response, per direct instruction only this row's own check
        // changes). Same real, per-viewer `edit_url` reasoning as
        // `people`/`categories` above, so this is computed here rather
        // than inside EntityExtractor::extract_all()'s own shared cache.
        // `get_option( 'admin_email' )` is this codebase's own established
        // "the site's admin email" primitive (VisibilityReportMailer.php,
        // SiteTelemetryReporter.php, etc. all read it the same way); the
        // matching \WP_User (falling back to the first real Administrator
        // account when no user's own `user_email` matches it) is who the
        // "View" action below actually opens, with `?highlight=email` so
        // Admin::enqueue_user_edit_highlight_script() can jump straight to
        // that one field on WP core's own user-edit.php screen.
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
