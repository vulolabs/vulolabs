<?php
/**
 * IndexNowClient class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Services;

defined( 'ABSPATH' ) || exit;

/**
 * Real HTTP client for the IndexNow protocol (indexnow.org) — a single
 * submission to this one neutral aggregator endpoint is picked up by every
 * participating search engine (Bing, Yandex, Seznam.cz, Naver, and others),
 * so this never needs a per-engine endpoint list. Uses
 * `wp_remote_post()` + explicit status-code branching (real pass/fail
 * responses worth surfacing to an admin), not SitemapManager's fire-and-
 * forget ping — IndexNow's response codes are meaningful and documented
 * (mockup's own "Response code help" card lists exactly these).
 *
 * Stateless: takes the site's own current key as a constructor argument
 * rather than reading settings itself, so callers (the manual-submit REST
 * endpoint, IndexNowAutoSubmitter's publish/update hook) each own their own
 * one read of the current settings.
 *
 * @class       IndexNowClient class
 * @version     1.0.0
 * @author      VuloLabs
 */
class IndexNowClient {

    private const ENDPOINT = 'https://api.indexnow.org/indexnow';

    /**
     * @var string
     */
    private string $api_key;

    /**
     * @param string $api_key This site's current IndexNow API key.
     */
    public function __construct( string $api_key ) {
        $this->api_key = $api_key;
    }

    /**
     * Submits one or more URLs in a single IndexNow request. Every URL must
     * belong to this site's own host — IndexNow itself rejects (422)
     * cross-host submissions, so this is filtered client-side too rather
     * than relying solely on the API to reject them.
     *
     * @param string[] $urls Absolute URLs to submit.
     * @return array{success: bool, status_code: int|null, status: string, message: string}
     */
    public function submit( array $urls ): array {
        $host       = wp_parse_url( home_url(), PHP_URL_HOST );
        $valid_urls = array_values(
            array_filter(
                $urls,
                static fn( $url ) => is_string( $url ) && wp_parse_url( $url, PHP_URL_HOST ) === $host
            )
        );

        if ( ! $valid_urls ) {
            return array(
                'success'     => false,
                'status_code' => null,
                'status'      => 'invalid',
                'message'     => __( 'No valid URLs for this site were given.', 'vulopilot' ),
            );
        }

        $response = wp_remote_post(
            self::ENDPOINT,
            array(
                'timeout' => 15,
                'headers' => array( 'Content-Type' => 'application/json; charset=utf-8' ),
                'body'    => wp_json_encode(
                    array(
                        'host'        => $host,
                        'key'         => $this->api_key,
                        'keyLocation' => home_url( $this->api_key . '.txt' ),
                        'urlList'     => array_values( $valid_urls ),
                    )
                ),
            )
        );

        if ( is_wp_error( $response ) ) {
            return array(
                'success'     => false,
                'status_code' => null,
                'status'      => 'error',
                'message'     => $response->get_error_message(),
            );
        }

        $status_code = (int) wp_remote_retrieve_response_code( $response );

        return array(
            'success'     => in_array( $status_code, array( 200, 202 ), true ),
            'status_code' => $status_code,
            'status'      => $this->describe_status_code( $status_code ),
            'message'     => $this->status_code_message( $status_code ),
        );
    }

    /**
     * @param int $status_code Real HTTP status code IndexNow returned.
     * @return string Short machine-readable status, backs IndexNowLogRepository's `response_status` column.
     */
    private function describe_status_code( int $status_code ): string {
        if ( in_array( $status_code, array( 200, 202 ), true ) ) {
            return 'success';
        }

        if ( in_array( $status_code, array( 400, 403, 422, 429 ), true ) ) {
            return 'failed';
        }

        return 'unknown';
    }

    /**
     * Real, documented IndexNow response codes (mockup's own "Response code
     * help" card — this is that same list, not paraphrased).
     *
     * @param int $status_code Real HTTP status code IndexNow returned.
     * @return string
     */
    private function status_code_message( int $status_code ): string {
        switch ( $status_code ) {
            case 200:
                return __( 'URL received.', 'vulopilot' );
            case 202:
                return __( 'URL received; key not yet validated.', 'vulopilot' );
            case 400:
                return __( 'Invalid format.', 'vulopilot' );
            case 403:
                return __( "Key not found or doesn't match.", 'vulopilot' );
            case 422:
                return __( "URL doesn't belong to this site.", 'vulopilot' );
            case 429:
                return __( 'Rate limited, try again later.', 'vulopilot' );
            default:
                return sprintf(
                    /* translators: %d: HTTP status code. */
                    __( 'Unexpected response (%d).', 'vulopilot' ),
                    $status_code
                );
        }
    }
}
