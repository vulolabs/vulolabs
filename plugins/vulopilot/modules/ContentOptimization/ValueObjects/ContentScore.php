<?php
/**
 * ContentScore file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\ContentOptimization\ValueObjects;

/**
 * A single post's Content Intelligence score, produced by
 * ContentOptimization\ContentAnalyzer::analyze() (its only real caller,
 * hence living here rather than classes/Utill/) - same shape as
 * GeoAnalysis\ValueObjects\GeoScore (combines deterministic Scanner findings with
 * an AI-judged dimension into one overall score), scoped to "Topic
 * Authority" instead of GEO's 8 answer-engine dimensions - the one AI
 * dimension this module was actually asked for, not an invented larger
 * set.
 *
 * @class       ContentScore class
 * @version     1.0.0
 * @author      VuloLabs
 */
final class ContentScore {

    /**
     * @var int
     */
    private int $post_id;

    /**
     * @var int|null Null when no Content Intelligence scan history exists yet for this post.
     */
    private ?int $deterministic_score;

    /**
     * @var int 0-100. How authoritatively/thoroughly this content covers its own topic.
     */
    private int $topic_authority;

    /**
     * @var int 0-100.
     */
    private int $overall_score;

    /**
     * @var string[]
     */
    private array $suggestions;

    /**
     * @var string MySQL datetime string, UTC.
     */
    private string $generated_at;

    /**
     * @param int      $post_id             Post this score is for.
     * @param int|null $deterministic_score 0-100, or null if no Content Intelligence scan history exists yet.
     * @param int      $topic_authority     0-100, AI-judged.
     * @param int      $overall_score       0-100.
     * @param string[] $suggestions         Human-readable improvement suggestions.
     * @param string   $generated_at        MySQL datetime string, UTC.
     */
    public function __construct(
        int $post_id,
        ?int $deterministic_score,
        int $topic_authority,
        int $overall_score,
        array $suggestions,
        string $generated_at
    ) {
        $this->post_id             = $post_id;
        $this->deterministic_score = $deterministic_score;
        $this->topic_authority     = $topic_authority;
        $this->overall_score       = $overall_score;
        $this->suggestions         = $suggestions;
        $this->generated_at        = $generated_at;
    }

    /**
     * @return int
     */
    public function get_post_id(): int {
        return $this->post_id;
    }

    /**
     * @return int|null
     */
    public function get_deterministic_score(): ?int {
        return $this->deterministic_score;
    }

    /**
     * @return int
     */
    public function get_overall_score(): int {
        return $this->overall_score;
    }

    /**
     * @return string[]
     */
    public function get_suggestions(): array {
        return $this->suggestions;
    }

    /**
     * @return string
     */
    public function get_generated_at(): string {
        return $this->generated_at;
    }

    /**
     * @return array<string, mixed>
     */
    public function to_array(): array {
        return array(
            'post_id'             => $this->post_id,
            'deterministic_score' => $this->deterministic_score,
            'topic_authority'     => $this->topic_authority,
            'overall_score'       => $this->overall_score,
            'suggestions'         => $this->suggestions,
            'generated_at'        => $this->generated_at,
        );
    }
}
