<?php
/**
 * AiCrawlerBlockedPagesScanner test file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Tests;

use VuloPilot\Seo\Scanners\AiCrawlerBlockedPagesScanner;

require_once __DIR__ . '/TestCase.php';

/**
 * Real unit tests over AiCrawlerBlockedPagesScanner's own deterministic
 * matching logic — path_matches_any() (private, invoked via Reflection —
 * same posture test-about-page-analysis-scanner.php's own docblock
 * documents).
 *
 * @class       TestAiCrawlerBlockedPagesScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class TestAiCrawlerBlockedPagesScanner extends TestCase {

    /**
     * @var AiCrawlerBlockedPagesScanner
     */
    private AiCrawlerBlockedPagesScanner $scanner;

    /**
     * @return void
     */
    protected function setUp(): void {
        parent::setUp();
        $this->scanner = new AiCrawlerBlockedPagesScanner();
    }

    /**
     * @param string $method Private method name.
     * @param array  $args   Positional arguments.
     * @return mixed
     */
    private function invoke_private( string $method, array $args ) {
        $reflection = new \ReflectionMethod( AiCrawlerBlockedPagesScanner::class, $method );
        $reflection->setAccessible( true );

        return $reflection->invokeArgs( $this->scanner, $args );
    }

    /**
     * @return void
     */
    public function test_get_id_get_category_are_stable(): void {
        $this->assertSame( 'ai-crawler-blocked-pages', $this->scanner->get_id() );
        $this->assertSame( 'seo', $this->scanner->get_category() );
        $this->assertSame( 'free', $this->scanner->get_tier() );
    }

    /**
     * @return void
     */
    public function test_matches_an_exact_prefix(): void {
        $this->assertTrue(
            $this->invoke_private( 'path_matches_any', array( '/private/notes/', array( '/private/' ) ) )
        );
    }

    /**
     * @return void
     */
    public function test_does_not_match_an_unrelated_path(): void {
        $this->assertFalse(
            $this->invoke_private( 'path_matches_any', array( '/blog/hello-world/', array( '/private/' ) ) )
        );
    }

    /**
     * @return void
     */
    public function test_empty_disallowed_path_never_matches(): void {
        $this->assertFalse(
            $this->invoke_private( 'path_matches_any', array( '/blog/hello-world/', array( '' ) ) )
        );
    }

    /**
     * @return void
     */
    public function test_matches_against_any_of_several_paths(): void {
        $this->assertTrue(
            $this->invoke_private(
                'path_matches_any',
                array( '/drafts/post-1/', array( '/private/', '/drafts/' ) )
            )
        );
    }
}
