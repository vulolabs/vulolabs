<?php
/**
 * EntityExtractor test file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Tests;

use Brain\Monkey\Functions;
use VuloPilot\EntityExtraction\EntityExtractor;

require_once __DIR__ . '/TestCase.php';

/**
 * Real unit tests over EntityExtractor's own deterministic extraction
 * logic — each private extract_*()/get_homepage_publisher() method
 * (invoked via Reflection — same posture test-about-page-analysis-scanner.php's
 * own docblock documents), stubbing only the plain WordPress functions
 * each one touches. extract_products()'s "WooCommerce active" branch isn't
 * covered here (would need a real/mocked WC_Product graph this test suite
 * has no precedent for — same scope choice ProductMissingCategoriesScanner's
 * own test coverage, or lack thereof, already reflects); its "WooCommerce
 * inactive" branch is covered for free since the `WooCommerce` class
 * genuinely doesn't exist in this Brain\Monkey-only bootstrap.
 *
 * @class       TestEntityExtractor class
 * @version     1.0.0
 * @author      VuloLabs
 */
class TestEntityExtractor extends TestCase {

    /**
     * @var EntityExtractor
     */
    private EntityExtractor $extractor;

    /**
     * @return void
     */
    protected function setUp(): void {
        parent::setUp();
        $this->extractor = new EntityExtractor();
        Functions\when( '__' )->returnArg( 1 );
    }

    /**
     * @param string $method Private method name.
     * @param array  $args   Positional arguments.
     * @return mixed
     */
    private function invoke_private( string $method, array $args = array() ) {
        $reflection = new \ReflectionMethod( EntityExtractor::class, $method );
        $reflection->setAccessible( true );

        return $reflection->invokeArgs( $this->extractor, $args );
    }

    /**
     * @return void
     */
    public function test_get_homepage_publisher_returns_null_when_option_is_empty(): void {
        Functions\expect( 'get_option' )->once()->with( 'vulopilot_homepage_schema_json', '' )->andReturn( '' );

        $this->assertNull( $this->invoke_private( 'get_homepage_publisher' ) );
    }

    /**
     * @return void
     */
    public function test_get_homepage_publisher_returns_null_when_no_publisher_present(): void {
        Functions\expect( 'get_option' )->once()->andReturn( '{"@type":"WebSite","name":"Acme"}' );

        $this->assertNull( $this->invoke_private( 'get_homepage_publisher' ) );
    }

    /**
     * @return void
     */
    public function test_get_homepage_publisher_returns_the_real_stored_organization(): void {
        Functions\expect( 'get_option' )->once()->andReturn(
            '{"@type":"WebSite","name":"Acme","publisher":{"@type":"Organization","name":"Acme Inc","url":"https://acme.test/","logo":"https://acme.test/logo.png"}}'
        );

        $this->assertSame(
            array(
				'@type' => 'Organization',
				'name'  => 'Acme Inc',
				'url'   => 'https://acme.test/',
				'logo'  => 'https://acme.test/logo.png',
            ),
            $this->invoke_private( 'get_homepage_publisher' )
        );
    }

    /**
     * @return void
     */
    public function test_extract_organizations_falls_back_to_site_title_and_home_url(): void {
        Functions\expect( 'get_option' )->once()->andReturn( '' );
        Functions\when( 'get_bloginfo' )->justReturn( 'Acme Site' );
        Functions\when( 'home_url' )->justReturn( 'https://acme.test/' );

        $organizations = $this->invoke_private( 'extract_organizations' );

        $this->assertCount( 1, $organizations );
        $this->assertSame( 'organization:site', $organizations[0]['id'] );
        $this->assertSame( 'Acme Site', $organizations[0]['name'] );
        $this->assertSame( 'https://acme.test/', $organizations[0]['url'] );
    }

    /**
     * @return void
     */
    public function test_extract_organizations_prefers_the_real_stored_publisher(): void {
        Functions\expect( 'get_option' )->once()->andReturn(
            '{"@type":"WebSite","publisher":{"@type":"Organization","name":"Acme Inc","url":"https://acme.test/hq/"}}'
        );
        Functions\when( 'get_bloginfo' )->justReturn( 'Acme Site' );
        Functions\when( 'home_url' )->justReturn( 'https://acme.test/' );

        $organizations = $this->invoke_private( 'extract_organizations' );

        $this->assertSame( 'Acme Inc', $organizations[0]['name'] );
        $this->assertSame( 'https://acme.test/hq/', $organizations[0]['url'] );
    }

    /**
     * @return void
     */
    public function test_extract_products_returns_null_when_woocommerce_is_not_active(): void {
        $this->assertNull( $this->invoke_private( 'extract_products' ) );
    }

    /**
     * @return void
     */
    public function test_extract_pages_from_setting_resolves_a_real_published_page(): void {
        Functions\expect( 'get_option' )->once()->andReturn( array( 'entity_service_pages' => "https://acme.test/consulting/\n" ) );
        Functions\when( 'wp_parse_args' )->alias(
            static fn( $args, $defaults ) => is_array( $args ) ? array_merge( $defaults, $args ) : $defaults
        );
        Functions\when( 'url_to_postid' )->justReturn( 42 );
        Functions\when( 'get_post_status' )->justReturn( 'publish' );
        Functions\when( 'get_the_title' )->justReturn( 'Consulting' );
        Functions\when( 'get_permalink' )->justReturn( 'https://acme.test/consulting/' );

        $services = $this->invoke_private( 'extract_pages_from_setting', array( 'entity_service_pages', 'service' ) );

        $this->assertCount( 1, $services );
        $this->assertSame( 'service:42', $services[0]['id'] );
        $this->assertSame( 'Consulting', $services[0]['name'] );
    }

    /**
     * @return void
     */
    public function test_extract_pages_from_setting_skips_a_page_that_does_not_resolve(): void {
        Functions\expect( 'get_option' )->once()->andReturn( array( 'entity_service_pages' => "not-a-real-page\n" ) );
        Functions\when( 'wp_parse_args' )->alias(
            static fn( $args, $defaults ) => is_array( $args ) ? array_merge( $defaults, $args ) : $defaults
        );
        Functions\when( 'url_to_postid' )->justReturn( 0 );

        $this->assertSame(
            array(),
            $this->invoke_private( 'extract_pages_from_setting', array( 'entity_service_pages', 'service' ) )
        );
    }

    /**
     * @return void
     */
    public function test_extract_locations_parses_name_and_address(): void {
        Functions\expect( 'get_option' )->once()->andReturn(
            array( 'entity_business_locations' => "Downtown Store | 123 Main St\nWarehouse\n" )
        );
        Functions\when( 'wp_parse_args' )->alias(
            static fn( $args, $defaults ) => is_array( $args ) ? array_merge( $defaults, $args ) : $defaults
        );

        $locations = $this->invoke_private( 'extract_locations' );

        $this->assertCount( 2, $locations );
        $this->assertSame( 'Downtown Store', $locations[0]['name'] );
        $this->assertSame( '123 Main St', $locations[0]['meta']['address'] );
        $this->assertSame( 'Warehouse', $locations[1]['name'] );
        $this->assertSame( '', $locations[1]['meta']['address'] );
    }

    /**
     * @return void
     */
    public function test_extract_locations_is_empty_when_setting_is_blank(): void {
        Functions\expect( 'get_option' )->once()->andReturn( array( 'entity_business_locations' => '' ) );
        Functions\when( 'wp_parse_args' )->alias(
            static fn( $args, $defaults ) => is_array( $args ) ? array_merge( $defaults, $args ) : $defaults
        );

        $this->assertSame( array(), $this->invoke_private( 'extract_locations' ) );
    }

    /**
     * @return void
     */
    public function test_extract_categories_maps_real_terms(): void {
        $term           = new \stdClass();
        $term->term_id  = 5;
        $term->name     = 'Widgets';
        $term->taxonomy = 'category';
        $term->count    = 3;

        Functions\expect( 'get_terms' )->once()->andReturn( array( $term ) );
        Functions\when( 'is_wp_error' )->justReturn( false );
        Functions\when( 'get_term_link' )->justReturn( 'https://acme.test/category/widgets/' );

        $categories = $this->invoke_private( 'extract_categories' );

        $this->assertCount( 1, $categories );
        $this->assertSame( 'category:5', $categories[0]['id'] );
        $this->assertSame( 'Widgets', $categories[0]['name'] );
        $this->assertSame( 'https://acme.test/category/widgets/', $categories[0]['url'] );
    }

    /**
     * @return void
     */
    public function test_extract_categories_returns_empty_on_wp_error(): void {
        Functions\expect( 'get_terms' )->once()->andReturn( null );
        Functions\when( 'is_wp_error' )->justReturn( true );

        $this->assertSame( array(), $this->invoke_private( 'extract_categories' ) );
    }

    /**
     * @return void
     */
    public function test_extract_people_resolves_real_users(): void {
        global $wpdb;

        $wpdb = \Mockery::mock(); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- test-only stand-in, no real $wpdb loaded in this Brain\Monkey bootstrap.
        $wpdb->shouldReceive( 'prepare' )->andReturn( 'SQL' );
        $wpdb->shouldReceive( 'get_col' )->andReturn( array( '1' ) );
        $wpdb->posts = 'wp_posts';

        $user               = new \stdClass();
        $user->ID           = 1;
        $user->display_name = 'Jane Doe';

        Functions\expect( 'get_userdata' )->once()->with( 1 )->andReturn( $user );
        Functions\when( 'get_author_posts_url' )->justReturn( 'https://acme.test/author/jane/' );
        Functions\when( 'get_the_author_meta' )->justReturn( 'A short bio.' );

        $people = $this->invoke_private( 'extract_people' );

        $this->assertCount( 1, $people );
        $this->assertSame( 'person:1', $people[0]['id'] );
        $this->assertSame( 'Jane Doe', $people[0]['name'] );
    }

    /**
     * @return void
     */
    public function test_extract_people_skips_a_deleted_user(): void {
        global $wpdb;

        $wpdb = \Mockery::mock(); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- test-only stand-in, no real $wpdb loaded in this Brain\Monkey bootstrap.
        $wpdb->shouldReceive( 'prepare' )->andReturn( 'SQL' );
        $wpdb->shouldReceive( 'get_col' )->andReturn( array( '999' ) );
        $wpdb->posts = 'wp_posts';

        Functions\expect( 'get_userdata' )->once()->with( 999 )->andReturn( false );

        $this->assertSame( array(), $this->invoke_private( 'extract_people' ) );
    }
}
