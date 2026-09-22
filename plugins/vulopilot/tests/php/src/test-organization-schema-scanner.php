<?php
/**
 * OrganizationSchemaScanner test file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Tests;

use VuloPilot\BrandIntelligence\Scanners\OrganizationSchemaScanner;

require_once __DIR__ . '/TestCase.php';

/**
 * Real unit tests over OrganizationSchemaScanner's own deterministic
 * detection — has_organization_schema() (private, invoked via Reflection —
 * same posture test-aeo-schema-scanner.php's own docblock documents).
 *
 * @class       TestOrganizationSchemaScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class TestOrganizationSchemaScanner extends TestCase {

    /**
     * @var OrganizationSchemaScanner
     */
    private OrganizationSchemaScanner $scanner;

    /**
     * @return void
     */
    protected function setUp(): void {
        parent::setUp();
        $this->scanner = new OrganizationSchemaScanner();
    }

    /**
     * @param string $method Private method name.
     * @param array  $args   Positional arguments.
     * @return mixed
     */
    private function invoke_private( string $method, array $args ) {
        $reflection = new \ReflectionMethod( OrganizationSchemaScanner::class, $method );
        $reflection->setAccessible( true );

        return $reflection->invokeArgs( $this->scanner, $args );
    }

    /**
     * @return void
     */
    public function test_get_id_get_category_are_stable(): void {
        $this->assertSame( 'organization-schema', $this->scanner->get_id() );
        $this->assertSame( 'brand', $this->scanner->get_category() );
        $this->assertSame( 'free', $this->scanner->get_tier() );
    }

    /**
     * @return void
     */
    public function test_detects_organization_type(): void {
        $html = '<script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>';

        $this->assertTrue( $this->invoke_private( 'has_organization_schema', array( $html ) ) );
    }

    /**
     * @return void
     */
    public function test_detects_local_business_type(): void {
        $html = '<script type="application/ld+json">{"@type": "LocalBusiness"}</script>';

        $this->assertTrue( $this->invoke_private( 'has_organization_schema', array( $html ) ) );
    }

    /**
     * @return void
     */
    public function test_detects_organization_nested_as_publisher(): void {
        $html = '{"@type":"WebSite","publisher":{"@type":"Organization","name":"Acme"}}';

        $this->assertTrue( $this->invoke_private( 'has_organization_schema', array( $html ) ) );
    }

    /**
     * @return void
     */
    public function test_no_organization_schema_is_not_a_false_positive(): void {
        $html = '<script type="application/ld+json">{"@type":"WebSite","name":"Acme"}</script>';

        $this->assertFalse( $this->invoke_private( 'has_organization_schema', array( $html ) ) );
    }
}
