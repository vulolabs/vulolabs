<?php
namespace VuloPilot\SeoVisibility\Rest;

use VuloPilot\SeoVisibility\SchemaCoverageAnalyzer;
use VuloPilot\SeoVisibility\SchemaPageInspector;

defined( 'ABSPATH' ) || exit;

/**
 * `POST /schema/inspect` backs the Inspector section's real single-page
 * checker (SchemaPageInspector) - POST, not GET, same "real outbound HTTP
 * only on explicit request" reasoning as `/schema/coverage`.
 *
 * @class       Schema controller
 * @version     1.0.0
 * @author      VuloLabs
 */
class Schema extends \WP_REST_Controller {

    /**
     * @var string
     */
    protected $rest_base = 'schema';

    /**
     * Real post_type => human label map for the Inspector's own page-picker
     * dropdown option text, e.g. "T-Shirt with Logo (Product)" - same 3
     * real post types SchemaCoverageAnalyzer::analyze() already samples
     * from.
     *
     * @var array<string, string>
     */
    private const TYPE_LABELS = array(
        'post'    => 'Post',
        'page'    => 'Page',
        'product' => 'Product',
    );

    /**
     * @var SchemaCoverageAnalyzer
     */
    private SchemaCoverageAnalyzer $analyzer;

    /**
     * @var SchemaPageInspector
     */
    private SchemaPageInspector $inspector;

    /**
     * @param SchemaCoverageAnalyzer|null $analyzer  Defaults to a new instance (injectable for tests).
     * @param SchemaPageInspector|null    $inspector Defaults to a new instance (injectable for tests).
     */
    public function __construct( ?SchemaCoverageAnalyzer $analyzer = null, ?SchemaPageInspector $inspector = null ) {
        $this->analyzer  = $analyzer ?? new SchemaCoverageAnalyzer();
        $this->inspector = $inspector ?? new SchemaPageInspector();
    }

    /**
     * @inheritDoc
     */
    public function register_routes() {
        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/coverage',
            array(
                array(
                    'methods'             => \WP_REST_Server::READABLE,
                    'callback'            => array( $this, 'get_coverage' ),
                    'permission_callback' => array( $this, 'permissions_check' ),
                ),
                array(
                    'methods'             => \WP_REST_Server::CREATABLE,
                    'callback'            => array( $this, 'analyze_coverage' ),
                    'permission_callback' => array( $this, 'permissions_check' ),
                ),
            )
        );

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/inspect',
            array(
                array(
                    'methods'             => \WP_REST_Server::CREATABLE,
                    'callback'            => array( $this, 'inspect_page' ),
                    'permission_callback' => array( $this, 'permissions_check' ),
                ),
            )
        );

        register_rest_route(
            VuloPilot()->rest_namespace,
            '/' . $this->rest_base . '/inspectable-pages',
            array(
                array(
                    'methods'             => \WP_REST_Server::READABLE,
                    'callback'            => array( $this, 'list_inspectable_pages' ),
                    'permission_callback' => array( $this, 'permissions_check' ),
                ),
            )
        );
    }

    /**
     * Same manage_options gate every other VuloPilot REST route uses.
     *
     * @param \WP_REST_Request $request Full request object.
     * @return bool
     */
    public function permissions_check( $request ) {
        return current_user_can( 'manage_options' );
    }

    /**
     * @return \WP_REST_Response
     */
    public function get_coverage() {
        return rest_ensure_response( $this->analyzer->get_stored_snapshot() );
    }

    /**
     * @return \WP_REST_Response
     */
    public function analyze_coverage() {
        return rest_ensure_response( $this->analyzer->analyze() );
    }

    /**
     * Inspector section's "Inspect a specific page" - resolves either a
     * given `url` or a `post_id`'s real permalink, runs a real
     * `wp_remote_get()` + JSON-LD extraction against it
     * (SchemaPageInspector), and returns the real result. Real outbound
     * HTTP only on this explicit request, same as `analyze_coverage()`.
     *
     * @param \WP_REST_Request $request Full request object.
     * @return \WP_REST_Response|\WP_Error
     */
    public function inspect_page( $request ) {
        $url     = esc_url_raw( (string) $request->get_param( 'url' ) );
        $post_id = absint( $request->get_param( 'post_id' ) );

        if ( '' === $url && $post_id ) {
            $permalink = get_permalink( $post_id );
            $url       = $permalink ? $permalink : '';
        }

        if ( '' === $url ) {
            return new \WP_Error( 'vulopilot_schema_inspect_missing_url', __( 'Provide a URL or post to inspect.', 'vulopilot' ), array( 'status' => 400 ) );
        }

        $result = $this->inspector->inspect( $url );

        if ( null === $result ) {
            return new \WP_Error( 'vulopilot_schema_inspect_failed', __( 'Could not fetch that page. Check the URL and try again.', 'vulopilot' ), array( 'status' => 502 ) );
        }

        return rest_ensure_response( $result );
    }

    /**
     * Real posts/pages/products the Inspector's own page-picker dropdown
     * offers (InspectorSection.tsx) - same post_type scope
     * SchemaCoverageAnalyzer::analyze() already samples from, most-recently-
     * modified first, capped to a real usable dropdown length. No outbound
     * HTTP here (unlike inspect_page() itself) - just this site's own
     * already-stored post data, so this is safe to call on every mount
     * rather than gated behind an explicit action.
     *
     * @return \WP_REST_Response
     */
    public function list_inspectable_pages() {
        $post_ids = get_posts(
            array(
                'post_type'      => array( 'post', 'page', 'product' ),
                'post_status'    => 'publish',
                // One extra, because the static front page may be dropped below.
                'posts_per_page' => 31,
                'orderby'        => 'modified',
                'order'          => 'DESC',
                'fields'         => 'ids',
            )
        );

        // A static front page (Settings → Reading) is the homepage, which is
        // added separately below - keep it out so it isn't listed twice.
        $post_ids = array_slice( array_values( array_diff( $post_ids, array( (int) get_option( 'page_on_front' ) ) ) ), 0, 30 );

        $pages = array_map(
            static function ( int $post_id ): array {
                $post_type = (string) get_post_type( $post_id );

                return array(
                    'id'         => $post_id,
                    'title'      => get_the_title( $post_id ) ?: __( '(no title)', 'vulopilot' ),
                    'type'       => $post_type,
                    'type_label' => self::TYPE_LABELS[ $post_type ] ?? ucfirst( $post_type ),
                    'url'        => get_permalink( $post_id ),
                );
            },
            $post_ids
        );

        // The homepage isn't a post, so the query above never returns it -
        // but SchemaCoverageAnalyzer::analyze() checks it as a page in its
        // own right, so it's listed first here too. Keeps this list in step
        // with the coverage sample's "Pages checked" count.
        array_unshift(
            $pages,
            array(
                'id'         => 0,
                'title'      => __( 'Homepage', 'vulopilot' ),
                'type'       => 'homepage',
                'type_label' => __( 'Homepage', 'vulopilot' ),
                'url'        => home_url( '/' ),
            )
        );

        return rest_ensure_response( $pages );
    }
}
