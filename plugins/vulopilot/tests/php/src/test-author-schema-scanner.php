<?php
/**
 * AuthorSchemaScanner test file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Tests;

use Brain\Monkey\Functions;
use VuloPilot\BrandIntelligence\Scanners\AuthorSchemaScanner;

require_once __DIR__ . '/TestCase.php';

/**
 * Real unit tests over AuthorSchemaScanner's own deterministic detection —
 * has_person_schema() (private, invoked via Reflection — same posture
 * test-aeo-schema-scanner.php's own docblock documents).
 *
 * @class       TestAuthorSchemaScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class TestAuthorSchemaScanner extends TestCase {

    /**
     * @var AuthorSchemaScanner
     */
    private AuthorSchemaScanner $scanner;

    /**
     * @return void
     */
    protected function setUp(): void {
        parent::setUp();
        $this->scanner = new AuthorSchemaScanner();
    }

    /**
     * @param string $method Private method name.
     * @param array  $args   Positional arguments.
     * @return mixed
     */
    private function invoke_private( string $method, array $args ) {
        $reflection = new \ReflectionMethod( AuthorSchemaScanner::class, $method );
        $reflection->setAccessible( true );

        return $reflection->invokeArgs( $this->scanner, $args );
    }

    /**
     * @return void
     */
    public function test_get_id_get_category_are_stable(): void {
        $this->assertSame( 'author-schema', $this->scanner->get_id() );
        $this->assertSame( 'brand', $this->scanner->get_category() );
        $this->assertSame( 'free', $this->scanner->get_tier() );
    }

    /**
     * @return void
     */
    public function test_detects_person_schema_top_level(): void {
        Functions\expect( 'get_post_meta' )
            ->once()
            ->with( 42, '_vulopilot_schema_json', true )
            ->andReturn( '{"@context":"https://schema.org","@type":"Person","name":"Jane"}' );

        $this->assertTrue( $this->invoke_private( 'has_person_schema', array( 42 ) ) );
    }

    /**
     * @return void
     */
    public function test_detects_person_schema_nested_as_author(): void {
        Functions\expect( 'get_post_meta' )
            ->once()
            ->andReturn( '{"@type":"Article","author":{"@type":"Person","name":"Jane"}}' );

        $this->assertTrue( $this->invoke_private( 'has_person_schema', array( 42 ) ) );
    }

    /**
     * @return void
     */
    public function test_no_person_schema_is_not_a_false_positive(): void {
        Functions\expect( 'get_post_meta' )
            ->once()
            ->andReturn( '{"@type":"Article","headline":"Post"}' );

        $this->assertFalse( $this->invoke_private( 'has_person_schema', array( 42 ) ) );
    }

    /**
     * @return void
     */
    public function test_is_false_when_nothing_saved(): void {
        Functions\expect( 'get_post_meta' )
            ->once()
            ->andReturn( '' );

        $this->assertFalse( $this->invoke_private( 'has_person_schema', array( 42 ) ) );
    }
}
