<?php
/**
 * Rest class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot;

use VuloPilot\AiCopilot\Rest as AiCopilotRest;
use VuloPilot\BrandVisibility\Rest as BrandIntelligenceRest;
use VuloPilot\ContentOptimization\Rest as ContentIntelligenceRest;
use VuloPilot\KnowledgeGraph\Rest as EntityExtractionRest;
use VuloPilot\GeoAnalysis\Rest as GeoRest;
use VuloPilot\TechnicalSeo\Rest as SeoRest;
use VuloPilot\Dashboard\Rest as DashboardRest;
use VuloPilot\Utill\Scans as UtillRestScans;
use VuloPilot\Utill\Findings as UtillRestFindings;
use VuloPilot\AiAssistant\Rest as AiAssistantRest;
use VuloPilot\Automations\Rest as AutomationsRest;
use VuloPilot\Settings\Rest as SettingsRest;
use VuloPilot\SeoVisibility\Rest as SeoVisibilityRest;
use VuloPilot\Content\Rest as ContentRest;
use VuloPilot\Performance\Rest as PerformanceRest;
use VuloPilot\Reports\Rest as ReportsRest;
use VuloPilot\Security\Rest as SecurityRest;
use VuloPilot\SiteHealth\Rest as SiteHealthRest;
use VuloPilot\Utill\StoreReadiness;
use VuloPilot\Migration\Rest as MigrationRest;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot Rest class.
 *
 * @class       Rest class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Rest {

	/**
	 * @var array
	 */
	private array $controllers = array();

	/** Rest constructor. */
	public function __construct() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Instantiates every controller (own + filtered-in) and registers its routes.
	 *
	 * @return void
	 */
	public function register_routes(): void {
		foreach ( $this->build_controllers() as $controller ) {
			$controller->register_routes();
		}
	}

	/**
	 * Instantiates every controller once (own + filtered-in), keyed by id.
	 *
	 * @return array
	 */
	private function build_controllers(): array {
		if ( $this->controllers ) {
			return $this->controllers;
		}

		$this->controllers = array(
			'dashboard'                   => new DashboardRest\Dashboard(),
			'dashboard_layout'            => new DashboardRest\DashboardLayout(),
			'scans'                       => new UtillRestScans(),
			'findings'                    => new UtillRestFindings(),
			'history'                     => new ReportsRest\History(),
			'ai_history'                  => new AiAssistantRest\AiHistory(),
			'vulocloud_ai_connection'     => new AiAssistantRest\VuloCloudAiConnection(),
			'ai_action_runs'              => new AiCopilotRest\AiActionRuns(),
			'activity_logs'               => new DashboardRest\ActivityLogs(),
			'automations'                 => new AutomationsRest\Automations(),
			'automation_dashboard'        => new AutomationsRest\AutomationDashboardStats(),
			'settings'                    => new SettingsRest\Settings(),
			'llms_txt'                    => new GeoRest\LlmsTxt(),
			'crawler_traffic'             => new SeoVisibilityRest\CrawlerTraffic(),
			'post_seo'                    => new SeoVisibilityRest\PostSeo(),
			'redirects'                   => new ContentRest\Redirects(),
			'not_found_logs'              => new ContentRest\NotFoundLogs(),
			'broken_links_stats'          => new ContentRest\BrokenLinksStats(),
			'robots_sitemap'              => new SeoVisibilityRest\RobotsSitemap(),
			'indexnow'                    => new SeoVisibilityRest\IndexNow(),
			'performance_actions'         => new PerformanceRest\PerformanceActions(),
			'performance_score_snapshots' => new PerformanceRest\PerformanceScoreSnapshots(),
			'security_score_snapshots'    => new SecurityRest\SecurityScoreSnapshots(),
			'performance_realtime'        => new PerformanceRest\PerformanceRealtime(),
			'core_web_vitals'             => new PerformanceRest\CoreWebVitals(),
			'core_web_vitals_beacon'      => new PerformanceRest\CoreWebVitalsBeaconRest(),
			'page_speed'                  => new PerformanceRest\PageSpeed(),
			'backups'                     => new SiteHealthRest\Backups(),
			'content_assistant'           => new ContentRest\ContentAssistant(),
			'copilot'                     => new AiCopilotRest\Copilot(),
			'store_readiness'             => new StoreReadiness(),
			'efficiency_checks'           => new PerformanceRest\EfficiencyChecks(),
			'plugin_overlap'              => new SiteHealthRest\PluginOverlap(),
			'geo_top_pages'               => new GeoRest\GeoAnalysis(),
			'content_score'               => new ContentIntelligenceRest\ContentIntelligence(),
			'brand_score'                 => new BrandIntelligenceRest\BrandIntelligence(),
			'entities'                    => new EntityExtractionRest\EntityExtraction(),
			'seo_score'                   => new SeoRest\Seo(),
			'geo_score'                   => new GeoRest\Geo(),
			'visibility_score'            => new SeoVisibilityRest\Visibility(),
			'schema_coverage'             => new SeoVisibilityRest\Schema(),
			'google_services'             => new SettingsRest\GoogleServices(),
			'ai_credits'                  => new AiAssistantRest\AiCredits(),
			'migration'                   => new MigrationRest(),
		);

		$extra_controllers = apply_filters( 'vulopilot_rest_controllers', array() );

		foreach ( $extra_controllers as $key => $controller ) {
			if ( $controller instanceof \WP_REST_Controller ) {
				$this->controllers[ $key ] = $controller;
			}
		}

		return $this->controllers;
	}

	/**
	 * Resolves a controller by key (e.g. `VuloPilot()->rest->scans`) so abilities can reuse its prepare_*_response() methods outside a REST request.
	 *
	 * @param string $key Controller key.
	 * @return \WP_REST_Controller|null
	 */
	public function __get( $key ) {
		return $this->build_controllers()[ $key ] ?? null;
	}
}
