<?php
/**
 * ScoreSnapshotRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Repositories;

defined( 'ABSPATH' ) || exit;

/**
 * The free tier's daily category score history behind the Performance
 * "Speed History" and Security "Security Trend" cards — a
 * `performance`/`security` slice of `vulopilot_snapshots`. Rows come back
 * as `[ snapshot_date, {category}_score ]` (`performance_score` /
 * `security_score`), the shape the front-end charts read.
 *
 * @class       ScoreSnapshotRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class ScoreSnapshotRepository extends SnapshotRepository {

    /**
     * Inserts today's score for this category, or updates it if today's row exists.
     *
     * @param int $score 0-100.
     * @return void
     */
    public function upsert_today( int $score ): void {
        $this->store_today( array( $this->snapshot_type . '_score' => $score ) );
    }

    /**
     * @inheritDoc
     */
    protected function flatten( array $row ): array {
        $flat = parent::flatten( $row );

        return array(
            'snapshot_date'                  => $flat['snapshot_date'],
            $this->snapshot_type . '_score' => $flat[ $this->snapshot_type . '_score' ] ?? 0,
        );
    }
}
