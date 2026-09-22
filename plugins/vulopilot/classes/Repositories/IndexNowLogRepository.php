<?php
/**
 * IndexNowLogRepository class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Repositories;

defined( 'ABSPATH' ) || exit;

/**
 * Persistence for the shared activity log (`indexnow.submitted`) (Scanning → Instant Indexing's
 * "History" card — the mockup's own "The last 100 IndexNow API requests"
 * copy). `find_all()`/pagination is entirely inherited from
 * AbstractRepository, same "repository adds its own query methods beyond
 * the generic CRUD base" pattern CrawlerVisitRepository already uses.
 *
 * One row per real submission attempt (manual or auto-submitted), never
 * upserted/deduped — unlike NotFoundLogRepository's own path-keyed upsert,
 * a repeat IndexNow submission of the same URL weeks apart is each a
 * distinct, meaningful API call worth its own row in the history.
 *
 * @class       IndexNowLogRepository class
 * @version     1.0.0
 * @author      VuloLabs
 */
class IndexNowLogRepository {

    private const EVENT_TYPE = 'indexnow.submitted';

    private const MAX_ROWS = 100;

    /**
     * Records one submission in the shared activity log
     * (`vulopilot_activity_logs`) — the URL as the message, the rest as
     * JSON in `meta`. No table of its own: this is a short, capped,
     * read-newest-first log, which is exactly what the activity log is.
     *
     * @param string   $url             Submitted URL.
     * @param int|null $response_code   HTTP status from the IndexNow endpoint.
     * @param string   $response_status Short machine-readable status.
     * @param string   $trigger_type    'manual' or 'auto'.
     * @return int The new row's id.
     */
    public function log( string $url, ?int $response_code, string $response_status, string $trigger_type = 'manual' ): int {
        $id = ( new ActivityLogRepository() )->insert(
            array(
                'event_type' => self::EVENT_TYPE,
                'message'    => $url,
                'severity'   => 'failed' === $response_status ? 'warning' : 'info',
                'actor_type' => 'auto' === $trigger_type ? 'system' : 'user',
                'meta'       => wp_json_encode(
                    array(
                        'response_code'   => $response_code,
                        'response_status' => $response_status,
                        'trigger_type'    => $trigger_type,
                    )
                ),
            )
        );

        $this->trim_to_max_rows();

        return $id;
    }

    /**
     * Newest first, in the shape the IndexNow tab has always read:
     * `id`, `url`, `response_code`, `response_status`, `trigger_type`, `created_at`.
     *
     * @return array<int, array<string, mixed>>
     */
    public function get_recent(): array {
        $rows = ( new ActivityLogRepository() )->find_all(
            array(
                'event_type' => self::EVENT_TYPE,
                'per_page'   => self::MAX_ROWS,
                'orderby'    => 'id',
                'order'      => 'desc',
            )
        )['data'];

        return array_map(
            static function ( array $row ): array {
                $meta = json_decode( (string) ( $row['meta'] ?? '' ), true );
                $meta = is_array( $meta ) ? $meta : array();

                return array(
                    'id'              => (int) $row['id'],
                    'url'             => $row['message'],
                    'response_code'   => $meta['response_code'] ?? null,
                    'response_status' => $meta['response_status'] ?? '',
                    'trigger_type'    => $meta['trigger_type'] ?? 'manual',
                    'created_at'      => $row['created_at'],
                );
            },
            $rows
        );
    }

    /**
     * Keeps only the newest MAX_ROWS submissions.
     *
     * @return void
     */
    private function trim_to_max_rows(): void {
        global $wpdb;

        $table = $wpdb->prefix . \VuloPilot\Utill::TABLES['activity_log'];

        $wpdb->query( // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                "DELETE FROM {$table} WHERE event_type = %s AND id NOT IN (SELECT id FROM (SELECT id FROM {$table} WHERE event_type = %s ORDER BY id DESC LIMIT %d) AS keep_ids)", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                self::EVENT_TYPE,
                self::EVENT_TYPE,
                self::MAX_ROWS
            )
        );
    }
}
