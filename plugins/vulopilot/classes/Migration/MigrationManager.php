<?php
/**
 * MigrationManager class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Migration;

defined( 'ABSPATH' ) || exit;

/**
 * Registry of every supported "import from another SEO plugin" migrator - the
 * Status & Tools → Migration tab's own backend. Mirrors the migration-tab pattern other
 * plugins (e.g. MultiVendorX) use: list detected sources with a found-data count, then run one
 * on demand.
 *
 * @class       MigrationManager
 * @version     1.0.0
 * @author      VuloLabs
 */
class MigrationManager {

	/**
	 * @var class-string<MigratorInterface>[]
	 */
	private const MIGRATOR_CLASSES = array(
		RankMathMigrator::class,
		YoastSeoMigrator::class,
		AllInOneSeoMigrator::class,
		ThinkRankMigrator::class,
	);

	/**
	 * @return MigratorInterface[] Keyed by `get_id()`.
	 */
	public function get_migrators(): array {
		$migrators = array();

		foreach ( self::MIGRATOR_CLASSES as $class ) {
			$migrator                         = new $class();
			$migrators[ $migrator->get_id() ] = $migrator;
		}

		return $migrators;
	}

	/**
	 * @param string $id One of `get_migrators()`'s keys.
	 * @return MigratorInterface|null
	 */
	public function get_migrator( string $id ): ?MigratorInterface {
		return $this->get_migrators()[ $id ] ?? null;
	}

	/**
	 * Every migrator, with its `count_available()` already resolved - the Migration tab's list.
	 *
	 * @return array<int, array{id: string, label: string, count: int}>
	 */
	public function list_sources(): array {
		$sources = array();

		foreach ( $this->get_migrators() as $migrator ) {
			$sources[] = array(
				'id'    => $migrator->get_id(),
				'label' => $migrator->get_label(),
				'count' => $migrator->count_available(),
			);
		}

		return $sources;
	}
}
