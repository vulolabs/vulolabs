<?php
/**
 * RuleRegistry class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Utill;


defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot RuleRegistry class.
 *
 * @class       RuleRegistry class
 * @version     1.0.0
 * @author      VuloLabs
 */
class RuleRegistry {

	/**
	 * Instantiated rules, keyed by their own get_id().
	 *
	 * @var array<string, RuleInterface>
	 */
	private array $rules = array();

	/**
	 * RuleRegistry constructor.
	 */
	public function __construct() {
		add_action( 'init', array( $this, 'register_rules' ), 20 );
	}

	/**
	 * Instantiates every registered rule class and indexes it by id. A
	 * rule class that doesn't exist, or doesn't implement RuleInterface,
	 * is silently skipped rather than fataling the whole registry.
	 *
	 * @return void
	 */
	public function register_rules(): void {
		$rule_classes = apply_filters( 'vulopilot_rule_sources', $this->get_default_rule_classes() );

		foreach ( $rule_classes as $rule_class ) {
			if ( ! is_string( $rule_class ) || ! class_exists( $rule_class ) ) {
				continue;
			}

			$rule = new $rule_class();

			if ( ! $rule instanceof RuleInterface ) {
				continue;
			}

			$this->rules[ $rule->get_id() ] = $rule;
		}
	}

	/**
	 * Free's own always-available rules.
	 *
	 * @return string[] Fully-qualified class names implementing RuleInterface.
	 */
	private function get_default_rule_classes(): array {
		return array(
			\VuloPilot\Accessibility\MissingAltTextRule::class,
			\VuloPilot\Utill\UnresolvedCriticalFindingRule::class,
			\VuloPilot\SiteHealth\CoreUpdateAvailableRule::class,
			\VuloPilot\SiteHealth\DormantPluginRule::class,
			\VuloPilot\SeoVisibility\SeoTitleRewriteRule::class,
			// SEO module (SEO-MODULE.md).
			\VuloPilot\SeoVisibility\MissingMetaDescriptionRule::class,
			\VuloPilot\SeoVisibility\MissingFeaturedImageRule::class,
			\VuloPilot\SeoVisibility\RobotsBlockingCrawlersRule::class,
			// GEO module (GEO-MODULE.md).
			\VuloPilot\Content\FaqOpportunityRule::class,
			\VuloPilot\Content\MissingSummaryBlockRule::class,
		);
	}

	/**
	 * @param string $rule_id A rule's get_id().
	 * @return RuleInterface|null
	 */
	public function get_rule( string $rule_id ): ?RuleInterface {
		return $this->rules[ $rule_id ] ?? null;
	}

	/**
	 * @return array<string, RuleInterface>
	 */
	public function get_all_rules(): array {
		return $this->rules;
	}

}
