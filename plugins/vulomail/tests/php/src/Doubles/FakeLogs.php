<?php
/**
 * FakeLogs test double file.
 *
 * @package VuloMail
 */

namespace VuloMail\Tests;

use VuloMail\Logging\LogRepository;

/**
 * Keeps log rows in memory.
 */
class FakeLogs extends LogRepository {

	/**
	 * Rows inserted so far.
	 *
	 * @var array<int, array>
	 */
	public $rows = array();

	/**
	 * Appends a row and returns its 1-based position as the row id.
	 *
	 * @param array $row Column => value.
	 * @return int
	 */
	public function insert( array $row ) {
		$this->rows[] = array_merge(
			array(
				'open_count'  => 0,
				'click_count' => 0,
				'links'       => array(),
			),
			$row
		);

		return count( $this->rows );
	}

	/**
	 * Finds a row by its tracking token.
	 *
	 * @param string $token Tracking token.
	 * @return array|null
	 */
	public function find_by_token( $token ) {
		foreach ( $this->rows as $index => $row ) {
			if ( ( $row['tracking_token'] ?? '' ) === $token ) {
				return array_merge( $row, array( 'id' => $index + 1 ) );
			}
		}

		return null;
	}

	/**
	 * Counts an open.
	 *
	 * @param int    $id  Row id.
	 * @param string $now UTC datetime.
	 * @return bool
	 */
	public function record_open( $id, $now ) {
		++$this->rows[ $id - 1 ]['open_count'];
		$this->rows[ $id - 1 ]['first_opened_at'] = $this->rows[ $id - 1 ]['first_opened_at'] ?? $now;
		$this->rows[ $id - 1 ]['last_opened_at']  = $now;

		return true;
	}

	/**
	 * Counts a click on one link.
	 *
	 * @param int    $id       Row id.
	 * @param int    $position Link position.
	 * @param string $url      Link as logged.
	 * @param string $now      UTC datetime.
	 * @return bool
	 */
	public function record_click( $id, $position, $url, $now ) {
		++$this->rows[ $id - 1 ]['click_count'];

		$link = $this->rows[ $id - 1 ]['links'][ $position ] ?? array(
			'url'         => $url,
			'click_count' => 0,
		);

		++$link['click_count'];
		$this->rows[ $id - 1 ]['links'][ $position ] = $link;

		return true;
	}
}
