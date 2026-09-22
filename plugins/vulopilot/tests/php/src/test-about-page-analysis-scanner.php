<?php
/**
 * AboutPageAnalysisScanner test file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Tests;

use VuloPilot\BrandIntelligence\Scanners\AboutPageAnalysisScanner;

require_once __DIR__ . '/TestCase.php';

/**
 * Real unit tests over AboutPageAnalysisScanner's own deterministic
 * content-substance check — has_contact_signal() (private, invoked via
 * Reflection — same posture test-aeo-schema-scanner.php's own docblock
 * documents).
 *
 * @class       TestAboutPageAnalysisScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class TestAboutPageAnalysisScanner extends TestCase {

    /**
     * @var AboutPageAnalysisScanner
     */
    private AboutPageAnalysisScanner $scanner;

    /**
     * @return void
     */
    protected function setUp(): void {
        parent::setUp();
        $this->scanner = new AboutPageAnalysisScanner();
    }

    /**
     * @param string $method Private method name.
     * @param array  $args   Positional arguments.
     * @return mixed
     */
    private function invoke_private( string $method, array $args ) {
        $reflection = new \ReflectionMethod( AboutPageAnalysisScanner::class, $method );
        $reflection->setAccessible( true );

        return $reflection->invokeArgs( $this->scanner, $args );
    }

    /**
     * @return void
     */
    public function test_get_id_get_category_are_stable(): void {
        $this->assertSame( 'about-page-analysis', $this->scanner->get_id() );
        $this->assertSame( 'brand', $this->scanner->get_category() );
        $this->assertSame( 'free', $this->scanner->get_tier() );
    }

    /**
     * @return void
     */
    public function test_detects_an_email_address(): void {
        $this->assertTrue(
            $this->invoke_private( 'has_contact_signal', array( 'Reach us at hello@example.com anytime.' ) )
        );
    }

    /**
     * @return void
     */
    public function test_detects_a_phone_shaped_number(): void {
        $this->assertTrue(
            $this->invoke_private( 'has_contact_signal', array( 'Call us at (555) 123-4567 for help.' ) )
        );
    }

    /**
     * @return void
     */
    public function test_no_contact_signal_is_not_a_false_positive(): void {
        $this->assertFalse(
            $this->invoke_private( 'has_contact_signal', array( 'We are a small team who loves widgets.' ) )
        );
    }
}
