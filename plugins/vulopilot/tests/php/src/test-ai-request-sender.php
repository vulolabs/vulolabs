<?php
/**
 * AiRequestSender test file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Tests;

use Brain\Monkey\Functions;
use VuloPilot\AI\AiRequestSender;
use VuloPilot\AI\AISafetyValidator;
use VuloPilot\Exceptions\AiByokNotConfiguredException;
use VuloPilot\Exceptions\GatewayRequestException;
use VuloPilot\Exceptions\RateLimitExceededException;
use VuloPilot\Exceptions\TransientGatewayException;
use VuloPilot\Exceptions\UnsafePromptException;
use VuloPilot\Repositories\AiHistoryRepository;
use VuloPilot\Services\AiByokGatewayClient;
use VuloPilot\Services\AiCreditsConnection;

require_once __DIR__ . '/TestCase.php';

/**
 * Real unit tests over AiRequestSender's own sequence — safety validation,
 * the connection check, the per-minute budget, retry on a transient failure,
 * the history row written for success and failure alike, and response
 * sanitizing. The VuloCloud gateway, the history repository and the
 * connection are Mockery doubles, so no real AI call or database is involved.
 *
 * @class       TestAiRequestSender class
 * @version     1.0.0
 * @author      VuloLabs
 */
class TestAiRequestSender extends TestCase {

    /**
     * @var \Mockery\MockInterface&AiByokGatewayClient
     */
    private $gateway;

    /**
     * @var \Mockery\MockInterface&AiHistoryRepository
     */
    private $history;

    /**
     * @var \Mockery\MockInterface&AiCreditsConnection
     */
    private $connection;

    /**
     * @var AiRequestSender
     */
    private AiRequestSender $sender;

    /**
     * @return void
     */
    protected function setUp(): void {
        parent::setUp();

        $this->gateway    = \Mockery::mock( AiByokGatewayClient::class );
        $this->history    = \Mockery::mock( AiHistoryRepository::class );
        $this->connection = \Mockery::mock( AiCreditsConnection::class );
        $this->sender     = new AiRequestSender( new AISafetyValidator(), $this->gateway, $this->history, $this->connection );

        Functions\when( '__' )->returnArg( 1 );
        Functions\when( 'get_option' )->justReturn( array( 'site_tone' => 'friendly' ) );
        Functions\when( 'wp_parse_args' )->alias( static fn( $args, $defaults = array() ) => array_merge( $defaults, (array) $args ) );
        Functions\when( 'get_current_user_id' )->justReturn( 7 );
        Functions\when( 'wp_kses' )->alias( static fn( $content ) => strip_tags( $content ) );
        Functions\when( 'is_wp_error' )->alias( static fn( $value ) => is_object( $value ) );
        Functions\when( 'get_transient' )->justReturn( 0 );
        Functions\when( 'set_transient' )->justReturn( true );
    }

    /**
     * @return array<int, array{role: string, content: string}>
     */
    private function messages(): array {
        return array(
            array( 'role' => 'system', 'content' => 'You are a helpful assistant.' ),
            array( 'role' => 'user', 'content' => 'Why is my traffic dropping?' ),
        );
    }

    /**
     * @param string $code    WP_Error-style code.
     * @param string $message WP_Error-style message.
     * @return object Stand-in for the \WP_Error the gateway returns on failure.
     */
    private function gateway_error( string $code, string $message ): object {
        return new class( $code, $message ) {
            private string $code;
            private string $message;

            public function __construct( string $code, string $message ) {
                $this->code    = $code;
                $this->message = $message;
            }

            public function get_error_code(): string {
                return $this->code;
            }

            public function get_error_message(): string {
                return $this->message;
            }
        };
    }

    /**
     * @return void
     */
    public function test_send_sends_the_flattened_prompt_records_success_and_returns_the_sanitized_response(): void {
        $this->connection->shouldReceive( 'is_connected' )->once()->andReturn( true );
        $this->gateway->shouldReceive( 'execute' )
            ->once()
            ->with( 'copilot_chat', "You are a helpful assistant.\n\nWhy is my traffic dropping?", array(), 'friendly' )
            ->andReturn( array( 'success' => true, 'request_id' => 'r1', 'response' => 'Check <b>indexing</b> first.' ) );
        $this->history->shouldReceive( 'insert' )
            ->once()
            ->with(
                \Mockery::on(
                    static fn( $row ) => 'success' === $row['status']
                        && 'vulocloud' === $row['provider']
                        && 'copilot_chat' === $row['surface']
                        && 7 === $row['requested_by']
                        && 'Why is my traffic dropping?' === $row['prompt_excerpt']
                        && 'Check <b>indexing</b> first.' === $row['response_excerpt']
                )
            );

        $response = $this->sender->send( $this->messages(), null, 'copilot_chat' );

        $this->assertSame( 'Check indexing first.', $response->get_content() );
    }

    /**
     * @return void
     */
    public function test_send_throws_before_touching_the_gateway_when_the_site_is_not_connected(): void {
        $this->connection->shouldReceive( 'is_connected' )->once()->andReturn( false );
        $this->gateway->shouldNotReceive( 'execute' );
        $this->history->shouldNotReceive( 'insert' );

        $this->expectException( \RuntimeException::class );
        $this->expectExceptionMessage( 'No AI connection is configured.' );

        $this->sender->send( $this->messages() );
    }

    /**
     * @return void
     */
    public function test_send_rejects_an_unsafe_prompt_before_anything_else_happens(): void {
        $this->connection->shouldNotReceive( 'is_connected' );
        $this->gateway->shouldNotReceive( 'execute' );
        $this->history->shouldNotReceive( 'insert' );

        $this->expectException( UnsafePromptException::class );

        $this->sender->send( array( array( 'role' => 'user', 'content' => 'my key is sk-' . str_repeat( 'a', 24 ) ) ) );
    }

    /**
     * @return void
     */
    public function test_send_records_a_failure_row_and_rethrows_a_gateway_error(): void {
        $this->connection->shouldReceive( 'is_connected' )->andReturn( true );
        $this->gateway->shouldReceive( 'execute' )->once()->andReturn( $this->gateway_error( 'vulopilot_ai_byok_unparseable_response', 'boom' ) );
        $this->history->shouldReceive( 'insert' )
            ->once()
            ->with( \Mockery::on( static fn( $row ) => 'failure' === $row['status'] && 0 === $row['prompt_tokens'] && 'vulocloud' === $row['provider'] ) );

        $this->expectException( GatewayRequestException::class );
        $this->expectExceptionMessage( 'boom' );

        $this->sender->send( $this->messages() );
    }

    /**
     * @return void
     */
    public function test_send_maps_the_not_configured_code_to_its_own_exception(): void {
        $this->connection->shouldReceive( 'is_connected' )->andReturn( true );
        $this->gateway->shouldReceive( 'execute' )->once()->andReturn( $this->gateway_error( 'vulopilot_ai_byok_not_configured', 'No AI connection is configured for this site.' ) );
        $this->history->shouldReceive( 'insert' )->once();

        $this->expectException( AiByokNotConfiguredException::class );

        $this->sender->send( $this->messages() );
    }

    /**
     * @return void
     */
    public function test_send_stops_when_the_per_minute_budget_is_already_spent(): void {
        Functions\when( 'get_transient' )->justReturn( 20 );

        $this->connection->shouldReceive( 'is_connected' )->andReturn( true );
        $this->gateway->shouldNotReceive( 'execute' );
        $this->history->shouldReceive( 'insert' )->once()->with( \Mockery::on( static fn( $row ) => 'failure' === $row['status'] ) );

        $this->expectException( RateLimitExceededException::class );

        $this->sender->send( $this->messages() );
    }

    /**
     * @return void
     */
    public function test_send_retries_a_transient_failure_then_succeeds_and_records_one_row(): void {
        $this->connection->shouldReceive( 'is_connected' )->andReturn( true );

        $calls = 0;
        $this->gateway->shouldReceive( 'execute' )->twice()->andReturnUsing(
            function () use ( &$calls ) {
                ++$calls;

                if ( 1 === $calls ) {
                    throw new TransientGatewayException( 'HTTP 503' );
                }

                return array( 'success' => true, 'request_id' => 'r2', 'response' => 'ok' );
            }
        );
        $this->history->shouldReceive( 'insert' )->once()->with( \Mockery::on( static fn( $row ) => 'success' === $row['status'] ) );

        $response = $this->sender->send( $this->messages() );

        $this->assertSame( 'ok', $response->get_content() );
        $this->assertSame( 2, $calls );
    }
}
