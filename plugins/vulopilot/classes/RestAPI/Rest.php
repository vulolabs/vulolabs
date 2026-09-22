<?php
/**
 * Rest class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\RestAPI;

use VuloPilot\AiCopilot\Rest as AiCopilotRest;
use VuloPilot\BrandIntelligence\Rest as BrandIntelligenceRest;
use VuloPilot\ContentIntelligence\Rest as ContentIntelligenceRest;
use VuloPilot\EntityExtraction\Rest as EntityExtractionRest;
use VuloPilot\Geo\Rest as GeoRest;
use VuloPilot\Seo\Rest as SeoRest;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot Rest class.
 *
 * Plugin-level REST dispatcher — mirrors rest-api.md's documented
 * two-tier pattern exactly: this builds a container of controllers and
 * loops `register_routes()` on `rest_api_init`. All of VuloPilot's own
 * controllers are plugin-level (none are module-scoped yet, since no
 * module has its own REST needs), so they all live here rather than
 * self-hooking individually.
 *
 * `vulopilot_rest_controllers` (Sdk\ExtensionManager, ARCHITECTURE.md's
 * Prompt 15) is the REST extension point for anything that'd rather add
 * itself to this central dispatcher than self-hook `rest_api_init`
 * independently — both are valid, same "module-level controllers can
 * self-hook independently" posture rest-api.md already documents, just
 * with this filter as the second option instead of the only one.
 *
 * @class       Rest class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Rest {

    /**
     * @var array<string, \WP_REST_Controller>
     */
    private array $controllers = array();

    /**
     * Rest constructor.
     */
    public function __construct() {
        add_action( 'rest_api_init', array( $this, 'register_routes' ) );
    }

    /**
     * Instantiates every controller (own + filtered-in) and registers its
     * routes. A filtered-in controller that isn't already an instance, or
     * doesn't extend \WP_REST_Controller, is silently skipped — same
     * defensive posture every other discovery-by-filter registry in this
     * codebase already uses for a broken third-party registration.
     *
     * @return void
     */
    public function register_routes(): void {
        $this->controllers = array(
            'dashboard'                   => new Controllers\Dashboard(),
            'dashboard_layout'            => new Controllers\DashboardLayout(),
            'scans'                       => new Controllers\Scans(),
            'findings'                    => new Controllers\Findings(),
            'reports'                     => new Controllers\Reports(),
            'ai_history'                  => new Controllers\AiHistory(),
            'vulocloud_ai_connection'     => new Controllers\VuloCloudAiConnection(),
            'ai_action_runs'              => new AiCopilotRest\AiActionRuns(),
            'activity_logs'               => new Controllers\ActivityLogs(),
            'history'                     => new Controllers\History(),
            'automations'                 => new Controllers\Automations(),
            // Deliberately NOT keyed 'automation_runs' — that data only ever
            // backed AutomationsActivityCard.tsx's own "Recent automation
            // activity" feed, which moved to vulopilot-pro's own
            // Automations module wholesale per direct instruction (Free now
            // shows AutomationsActivityDummy.tsx in its place). Registering
            // a Free-side fallback here would let that feed keep working
            // even without a licensed Pro Automations module, undermining
            // the gate — vulopilot-pro's own AutomationsRunsRest.php (same
            // `automation_runs` key) is this route's only real owner.
            'automation_dashboard'        => new Controllers\AutomationDashboardStats(),
            'settings'                    => new Controllers\Settings(),
            'llms_txt'                    => new GeoRest\LlmsTxt(),
            'crawler_traffic'             => new Controllers\CrawlerTraffic(),
            'post_seo'                    => new Controllers\PostSeo(),
            'redirects'                   => new Controllers\Redirects(),
            'not_found_logs'              => new Controllers\NotFoundLogs(),
            'broken_links_stats'          => new Controllers\BrokenLinksStats(),
            'robots_sitemap'              => new Controllers\RobotsSitemap(),
            'indexnow'                    => new Controllers\IndexNow(),
            'performance_actions'         => new Controllers\PerformanceActions(),
            'performance_score_snapshots' => new Controllers\PerformanceScoreSnapshots(),
            'security_score_snapshots'    => new Controllers\SecurityScoreSnapshots(),
            'performance_realtime'        => new Controllers\PerformanceRealtime(),
            'core_web_vitals'             => new Controllers\CoreWebVitals(),
            'core_web_vitals_beacon'      => new Controllers\CoreWebVitalsBeaconRest(),
            'page_speed'                  => new Controllers\PageSpeed(),
            'backups'                     => new Controllers\Backups(),
            'backup_storage'              => new Controllers\BackupStorage(),
            'content_assistant'           => new Controllers\ContentAssistant(),
            // "Chat with VuloPilot" (/copilot/chat + /copilot/conversations)
            // — briefly a Pro-only feature (vulopilot-pro's own CopilotChat
            // module); moved back here, genuinely free again, gated the
            // same way as every other AI surface (Controllers\Copilot's
            // own create_item_permissions_check()) rather than a license.
            'copilot'                     => new AiCopilotRest\Copilot(),
            'store_readiness'             => new Controllers\StoreReadiness(),
            'efficiency_checks'           => new Controllers\EfficiencyChecks(),
            'plugin_overlap'              => new Controllers\PluginOverlap(),
            'reports_overview'            => new Controllers\ReportsOverview(),
            // Deliberately NOT keyed 'geo_analysis' — vulopilot-pro's
            // GeoInsights module adds its own controller into
            // $extra_controllers below under that exact key (its `Rest.php`
            // hosts the per-post AI score routes at this same 'geo-analysis'
            // REST base), and this controllers array is keyed by array
            // merge, so a matching key here would let Pro's own entry
            // silently overwrite this one before routes are ever
            // registered. Different key, same REST base string is safe —
            // WP_REST_Server registers routes per controller instance, not
            // per unique base.
            'geo_top_pages'               => new GeoRest\GeoAnalysis(),
            // Deliberately NOT keyed 'content_analysis' — vulopilot-pro's
            // own ContentIntelligence module adds its per-post AI "Topic
            // Authority" controller into $extra_controllers below under
            // that key (same 'content-intelligence' REST base, a
            // `/(?P<post_id>\d+)/analyze` sub-route) — same key-collision
            // reasoning as 'geo_top_pages' above.
            'content_score'               => new ContentIntelligenceRest\ContentIntelligence(),
            // Deliberately NOT keyed 'brand_insights' — vulopilot-pro's own
            // BrandIntelligence module adds its own history/competitor-
            // comparison/knowledge-panel controller into $extra_controllers
            // below under that key (same 'brand-intelligence' REST base) —
            // same key-collision reasoning as 'geo_top_pages'/'content_score'
            // above.
            'brand_score'                 => new BrandIntelligenceRest\BrandIntelligence(),
            // Deliberately NOT keyed 'knowledge_graph' — vulopilot-pro's own
            // KnowledgeGraph module adds its own relationships/health-
            // history/recommendations controller into $extra_controllers
            // below under that key (a different REST base,
            // 'knowledge-graph', so this one isn't strictly required to
            // differ — kept different anyway for consistency with every
            // other Free/Pro controller pairing above).
            'entities'                    => new EntityExtractionRest\EntityExtraction(),
            'seo_score'                   => new SeoRest\Seo(),
            'geo_score'                   => new GeoRest\Geo(),
            'visibility_score'            => new Controllers\Visibility(),
            'schema_coverage'             => new Controllers\Schema(),
            'google_services'             => new Controllers\GoogleServices(),
            'vulocloud_account'           => new Controllers\VuloCloudAccount(),
            'ai_credits'                  => new Controllers\AiCredits(),
            'vulocloud_connect'           => new Controllers\VuloCloudConnect(),
        );

        $extra_controllers = apply_filters( 'vulopilot_rest_controllers', array() );

        foreach ( $extra_controllers as $key => $controller ) {
            if ( $controller instanceof \WP_REST_Controller ) {
                $this->controllers[ $key ] = $controller;
            }
        }

        foreach ( $this->controllers as $controller ) {
            $controller->register_routes();
        }
    }
}
