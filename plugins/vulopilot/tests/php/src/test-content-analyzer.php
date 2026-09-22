<?php
/**
 * ContentAnalyzer test file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Tests;

use Brain\Monkey\Functions;
use VuloPilot\AI\AiRequestSender;
use VuloPilot\ContentIntelligence\ContentAnalyzer;
use VuloPilot\Repositories\FindingRepository;
use VuloPilot\ValueObjects\AIResponse;

require_once __DIR__ . '/TestCase.php';

/**
 * Real unit tests over ContentAnalyzer's own deterministic logic —
 * calculate_deterministic_score()/calculate_overall_score()/parse_response()
 * (all private, invoked via Reflection — same posture
 * test-aeo-schema-scanner.php's own docblock documents) plus analyze()'s
 * published-post guard clause. AiRequestSender/FindingRepository are
 * Mockery doubles, not real AI calls or a real database.
 *
 * @class       TestContentAnalyzer class
 * @version     1.0.0
 * @author      VuloLabs
 */
class TestContentAnalyzer extends TestCase {

    /**
     * @return void
     */
    protected function setUp(): void {
        parent::setUp();
        Functions\when( '__' )->returnArg( 1 );
    }

    /**
     * @param string $method   Private/protected method name.
     * @param object $instance Object to invoke the method on.
     * @param array  $args     Positional arguments.
     * @return mixed
     */
    private function invoke_private( string $method, object $instance, array $args ) {
        $reflection = new \ReflectionMethod( get_class( $instance ), $method );
        $reflection->setAccessible( true );

        return $reflection->invokeArgs( $instance, $args );
    }

    /**
     * @return ContentAnalyzer
     */
    private function make_analyzer(): ContentAnalyzer {
        return new ContentAnalyzer(
            \Mockery::mock( AiRequestSender::class ),
            \Mockery::mock( FindingRepository::class )
        );
    }

    /**
     * @return void
     */
    public function test_analyze_rejects_a_post_id_with_no_matching_post(): void {
        Functions\expect( 'get_post' )->once()->with( 999 )->andReturn( null );

        $this->expectException( \InvalidArgumentException::class );

        $this->make_analyzer()->analyze( 999 );
    }

    /**
     * @return void
     */
    public function test_analyze_rejects_an_unpublished_post(): void {
        $post              = new \stdClass();
        $post->post_type   = 'post';
        $post->post_status = 'draft';

        Functions\expect( 'get_post' )->once()->andReturn( $post );

        $this->expectException( \InvalidArgumentException::class );

        $this->make_analyzer()->analyze( 5 );
    }

    /**
     * @return void
     */
    public function test_analyze_rejects_a_post_type_that_is_not_post_or_page(): void {
        $post              = new \stdClass();
        $post->post_type   = 'attachment';
        $post->post_status = 'publish';

        Functions\expect( 'get_post' )->once()->andReturn( $post );

        $this->expectException( \InvalidArgumentException::class );

        $this->make_analyzer()->analyze( 5 );
    }

    /**
     * @return void
     */
    public function test_calculate_deterministic_score_is_null_with_no_scan_history(): void {
        $findings = \Mockery::mock( FindingRepository::class );
        $findings->shouldReceive( 'find_all' )
            ->once()
            ->andReturn( array( 'total' => 0 ) );

        $analyzer = new ContentAnalyzer( \Mockery::mock( AiRequestSender::class ), $findings );

        $this->assertNull( $this->invoke_private( 'calculate_deterministic_score', $analyzer, array( 42 ) ) );
    }

    /**
     * @return void
     */
    public function test_calculate_deterministic_score_is_100_with_history_but_no_open_failures(): void {
        $findings = \Mockery::mock( FindingRepository::class );
        $findings->shouldReceive( 'find_all' )
            ->once()
            ->andReturn( array( 'total' => 3 ) ); // has_any_history check.
        $findings->shouldReceive( 'find_all' )
            ->once()
            ->andReturn( array( 'total' => 0 ) ); // open_failures for this post.

        $analyzer = new ContentAnalyzer( \Mockery::mock( AiRequestSender::class ), $findings );

        $this->assertSame( 100, $this->invoke_private( 'calculate_deterministic_score', $analyzer, array( 42 ) ) );
    }

    /**
     * @return void
     */
    public function test_calculate_deterministic_score_reflects_open_failures_out_of_5_checks(): void {
        $findings = \Mockery::mock( FindingRepository::class );
        $findings->shouldReceive( 'find_all' )
            ->once()
            ->andReturn( array( 'total' => 3 ) );
        $findings->shouldReceive( 'find_all' )
            ->once()
            ->andReturn( array( 'total' => 1 ) ); // 1 of 5 checks currently open/failing.

        $analyzer = new ContentAnalyzer( \Mockery::mock( AiRequestSender::class ), $findings );

        // (5 - 1) / 5 * 100 = 80.
        $this->assertSame( 80, $this->invoke_private( 'calculate_deterministic_score', $analyzer, array( 42 ) ) );
    }

    /**
     * @return void
     */
    public function test_calculate_overall_score_averages_both_dimensions_when_both_known(): void {
        $analyzer = $this->make_analyzer();

        $this->assertSame( 70, $this->invoke_private( 'calculate_overall_score', $analyzer, array( 80, 60 ) ) );
    }

    /**
     * @return void
     */
    public function test_calculate_overall_score_is_ai_alone_with_no_deterministic_history(): void {
        $analyzer = $this->make_analyzer();

        $this->assertSame( 60, $this->invoke_private( 'calculate_overall_score', $analyzer, array( null, 60 ) ) );
    }

    /**
     * @return void
     */
    public function test_parse_response_strips_markdown_fences_and_returns_clamped_values(): void {
        $analyzer = $this->make_analyzer();
        $response = new AIResponse(
            "```json\n" . $this->encode_stub(
                array(
                    'topic_authority' => 150,
                    'suggestions'     => array( 'Add named examples.' ),
                )
            ) . "\n```",
            'stub',
            'stub-model',
            0,
            0,
            'stop'
        );

        $result = $this->invoke_private( 'parse_response', $analyzer, array( $response ) );

        $this->assertSame( 100, $result['topic_authority'] ); // clamped from 150.
        $this->assertSame( array( 'Add named examples.' ), $result['suggestions'] );
    }

    /**
     * @return void
     */
    public function test_parse_response_rejects_unparsable_content(): void {
        $analyzer = $this->make_analyzer();
        $response = new AIResponse( 'not json at all', 'stub', 'stub-model', 0, 0, 'stop' );

        $this->expectException( \RuntimeException::class );

        $this->invoke_private( 'parse_response', $analyzer, array( $response ) );
    }

    /**
     * @return void
     */
    public function test_parse_response_rejects_a_missing_topic_authority_score(): void {
        $analyzer = $this->make_analyzer();
        $response = new AIResponse(
            $this->encode_stub( array( 'suggestions' => array( 'Add named examples.' ) ) ),
            'stub',
            'stub-model',
            0,
            0,
            'stop'
        );

        $this->expectException( \RuntimeException::class );

        $this->invoke_private( 'parse_response', $analyzer, array( $response ) );
    }

    /**
     * @return void
     */
    public function test_parse_response_rejects_empty_suggestions(): void {
        $analyzer = $this->make_analyzer();
        $response = new AIResponse(
            $this->encode_stub(
                array(
                    'topic_authority' => 70,
                    'suggestions'     => array(),
                )
            ),
            'stub',
            'stub-model',
            0,
            0,
            'stop'
        );

        $this->expectException( \RuntimeException::class );

        $this->invoke_private( 'parse_response', $analyzer, array( $response ) );
    }

    /**
     * Minimal, dependency-free stand-in for wp_json_encode() — same
     * test-only helper test-aeo-schema-scanner.php's own encode_stub()
     * already uses.
     *
     * @param array $data Data to encode.
     * @return string
     */
    private function encode_stub( array $data ): string {
        return json_encode( $data ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- test-only helper, not production code.
    }
}
