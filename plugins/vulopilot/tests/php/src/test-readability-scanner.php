<?php
/**
 * ReadabilityScanner test file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Tests;

use VuloPilot\ContentIntelligence\Scanners\ReadabilityScanner;

require_once __DIR__ . '/TestCase.php';

/**
 * Real unit tests over ReadabilityScanner's own deterministic math —
 * calculate_flesch_reading_ease() (public, the standard formula) and
 * count_syllables() (private, invoked via Reflection — same "exercise real
 * code, don't change visibility just to test" posture
 * test-aeo-schema-scanner.php's own docblock documents).
 *
 * @class       TestReadabilityScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class TestReadabilityScanner extends TestCase {

    /**
     * @var ReadabilityScanner
     */
    private ReadabilityScanner $scanner;

    /**
     * @return void
     */
    protected function setUp(): void {
        parent::setUp();
        $this->scanner = new ReadabilityScanner();
    }

    /**
     * @param string $method Private/protected method name.
     * @param array  $args   Positional arguments.
     * @return mixed
     */
    private function invoke_private( string $method, array $args ) {
        $reflection = new \ReflectionMethod( ReadabilityScanner::class, $method );
        $reflection->setAccessible( true );

        return $reflection->invokeArgs( $this->scanner, $args );
    }

    /**
     * @return void
     */
    public function test_get_id_get_category_are_stable(): void {
        $this->assertSame( 'readability', $this->scanner->get_id() );
        $this->assertSame( 'content', $this->scanner->get_category() );
        $this->assertSame( 'free', $this->scanner->get_tier() );
    }

    /**
     * @return void
     */
    public function test_flesch_reading_ease_scores_simple_short_sentences_highly(): void {
        $easy = str_repeat( 'The cat sat. The dog ran. I see a cat. It is fun. We play now. ', 3 );

        $this->assertSame( 100, $this->scanner->calculate_flesch_reading_ease( $easy ) );
    }

    /**
     * @return void
     */
    public function test_flesch_reading_ease_scores_dense_multisyllabic_text_lowly(): void {
        $hard = 'The comprehensive utilization of multidimensional organizational infrastructure '
            . 'necessitates unprecedented interdisciplinary collaboration methodologies '
            . 'incorporating heterogeneous computational paradigms';

        $this->assertSame( 0, $this->scanner->calculate_flesch_reading_ease( $hard ) );
    }

    /**
     * @return void
     */
    public function test_flesch_reading_ease_returns_100_for_empty_text(): void {
        $this->assertSame( 100, $this->scanner->calculate_flesch_reading_ease( '' ) );
    }

    /**
     * @return void
     */
    public function test_count_syllables_drops_trailing_silent_e(): void {
        // "make" -> "mak" (1 vowel group) once the silent e is dropped.
        $this->assertSame( 1, $this->invoke_private( 'count_syllables', array( 'make' ) ) );
    }

    /**
     * @return void
     */
    public function test_count_syllables_keeps_le_ending_as_its_own_syllable(): void {
        // "apple"/"table" both keep their trailing "e" (a-e / a-e = 2 vowel groups).
        $this->assertSame( 2, $this->invoke_private( 'count_syllables', array( 'apple' ) ) );
        $this->assertSame( 2, $this->invoke_private( 'count_syllables', array( 'table' ) ) );
    }

    /**
     * @return void
     */
    public function test_count_syllables_floors_every_word_at_one(): void {
        // "the" -> silent e dropped -> "th" has no vowel groups at all, floored to 1.
        $this->assertSame( 1, $this->invoke_private( 'count_syllables', array( 'the' ) ) );
    }

    /**
     * @return void
     */
    public function test_count_syllables_sums_across_multiple_words(): void {
        $this->assertSame( 3, $this->invoke_private( 'count_syllables', array( 'cat dog run' ) ) );
    }
}
