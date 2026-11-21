import { __ } from '@wordpress/i18n';

/** Header search index, built by walking the declarative Settings tab and Modules configs. */
const contextSettings = require.context(
	'./components/Settings',
	true,
	/\.(ts|tsx)$/
);
const contextModules = require.context('./components/Modules', true, /\.ts$/);

export type SearchItem = {
	id: string;
	/** Real destination tab this result navigates to - e.g. `'security'`, `'performance'`. */
	tab: string;
	/** Which of app.tsx's own search dropdown options this result belongs to. */
	category: 'modules' | 'settings' | 'sections';
	name: string;
	desc?: string;
	link: string;
	icon?: string;
	/** Real DOM id of the card this result should land on. */
	sectionId?: string;
};

interface ModalField {
	key: string;
	label: string;
	desc?: string;
	[key: string]: unknown;
}

interface BaseConfig {
	id?: string;
	tab?: string;
	submitUrl?: string;
	headerTitle?: string;
	headerIcon?: string;
	modal?: ModalField[];
}

interface ModuleItem {
	id: string;
	name: string;
	desc?: string;
	icon?: string;
	[key: string]: unknown;
}

interface ModuleConfig extends BaseConfig {
	modules?: ModuleItem[];
}

/** A webpack `require.context()` over the config folders. */
function buildIndexFromContext(
	context: ReturnType<typeof require.context>,
	category: 'modules' | 'settings'
): SearchItem[] {
	return context
		.keys()
		.map((key) => context(key).default as ModuleConfig)
		.flatMap((cfg) => {
			// Not every `.ts`/`.tsx` under this require.context glob is a Settings-tab config or a Modules catalog.
			if (!cfg) {
				return [];
			}

			const baseTab = cfg.tab || cfg.submitUrl || 'modules';

			// Modules catalog - cfg.modules holds the real, searchable items.
			if (cfg.modules && Array.isArray(cfg.modules)) {
				return cfg.modules
					.filter((mod) => mod.id && mod.name)
					.map((mod) => ({
						id: mod.id,
						tab: 'settings',
						category,
						name: mod.name,
						desc: mod.desc,
						link: `#&tab=settings&subtab=modules&module=${mod.id}`,
						icon: mod.icon || '',
					}));
			}

			// A Settings tab - its config uses headerTitle/headerIcon, which are mapped into the shared SearchItem shape below.
			if (cfg.id && (cfg.tab || cfg.submitUrl)) {
				const baseLink = `#&tab=${baseTab}&subtab=${cfg.id}`;

				const items: SearchItem[] = [
					{
						id: cfg.id,
						tab: baseTab,
						category,
						name: cfg.headerTitle || '',
						link: baseLink,
						icon: cfg.headerIcon,
					},
				];

				if (cfg.modal && Array.isArray(cfg.modal)) {
					cfg.modal.forEach((field) => {
						if (!field.key || !field.label) {
							return;
						}

						items.push({
							id: `${cfg.id}_${field.key}`,
							tab: baseTab,
							category,
							name: field.label,
							desc: field.desc,
							link: `${baseLink}&field=${field.key}`,
							icon: cfg.headerIcon,
						});
					});
				}

				return items;
			}

			return [];
		});
}

/** Real dashboard cards worth deep-linking to by title/content. */
const PAGE_SECTIONS: SearchItem[] = [
	{
		id: 'page-section-site-overview',
		tab: 'ai-assistant',
		category: 'sections',
		name: __('Site Overview', 'vulopilot'),
		desc: __(
			'Your overall health score, broken down by SEO & Visibility, Performance, Security, and Content.',
			'vulopilot'
		),
		link: '#&tab=ai-assistant',
		sectionId: 'site-overview-card',
		icon: 'analytics',
	},
	{
		id: 'page-section-create-new-automation',
		tab: 'ai-assistant',
		category: 'sections',
		name: __('Create new automation', 'vulopilot'),
		desc: __(
			'Quick-start templates for a website health scan, security monitoring, SEO optimization, WooCommerce monitor, or content optimizer automation.',
			'vulopilot'
		),
		link: '#&tab=ai-assistant',
		sectionId: 'create-new-automation-card',
		icon: 'analytics',
	},
	// The rest of this list: sections that carry a real DOM id, so `handleResultClick` can scroll to and highlight them.
	{
		id: 'page-section-seo-findings',
		tab: 'seo-visibility',
		category: 'sections',
		name: __('All SEO Findings', 'vulopilot'),
		desc: __('Every real SEO finding, filterable by category - SEO tab.', 'vulopilot'),
		link: '#&tab=seo-visibility&subtab=seo',
		sectionId: 'seo-all-issues-table',
		icon: 'search',
	},
	{
		id: 'page-section-aeo-findings',
		tab: 'seo-visibility',
		category: 'sections',
		name: __('All SEO Findings', 'vulopilot'),
		desc: __('Every real AEO finding, filterable by category - AEO tab.', 'vulopilot'),
		link: '#&tab=seo-visibility&subtab=aeo',
		sectionId: 'aeo-all-issues-table',
		icon: 'search',
	},
	{
		id: 'page-section-geo-findings',
		tab: 'seo-visibility',
		category: 'sections',
		name: __('All SEO Findings', 'vulopilot'),
		desc: __('Every real GEO finding, filterable by category - GEO tab.', 'vulopilot'),
		link: '#&tab=seo-visibility&subtab=geo',
		sectionId: 'geo-all-issues-table',
		icon: 'search',
	},
	{
		id: 'page-section-schema-inspector',
		tab: 'seo-visibility',
		category: 'sections',
		name: __('Inspect a specific page', 'vulopilot'),
		desc: __(
			'See exactly what structured information search engines receive from any page or product.',
			'vulopilot'
		),
		link: '#&tab=seo-visibility&subtab=schema-knowledge',
		sectionId: 'schema-knowledge-inspector',
		icon: 'search',
	},
	{
		id: 'page-section-recent-crawl-requests',
		tab: 'seo-visibility',
		category: 'sections',
		name: __('Recent Crawl Requests', 'vulopilot'),
		desc: __('Every real crawler visit to your site, searchable and filterable.', 'vulopilot'),
		link: '#&tab=seo-visibility&subtab=crawl-urls',
		sectionId: 'recent-crawl-requests',
		icon: 'search-discovery',
	},
	{
		id: 'page-section-woocommerce-issues',
		tab: 'commerce',
		category: 'sections',
		name: __('All WooCommerce Issues', 'vulopilot'),
		link: '#&tab=commerce',
		sectionId: 'woocommerce-issues-table',
		icon: 'cart',
	},
	{
		id: 'page-section-recent-content',
		tab: 'content',
		category: 'sections',
		name: __('Recent Content', 'vulopilot'),
		desc: __('Your most recently published or updated content.', 'vulopilot'),
		link: '#&tab=content',
		sectionId: 'content-audit-section',
		icon: 'edit',
	},
	{
		id: 'page-section-content-tools',
		tab: 'content',
		category: 'sections',
		name: __('Content Tools', 'vulopilot'),
		desc: __('AI tools to help you create and improve content.', 'vulopilot'),
		link: '#&tab=content',
		sectionId: 'content-tools-grid',
		icon: 'tools',
	},
	{
		id: 'page-section-core-web-vitals',
		tab: 'performance',
		category: 'sections',
		name: __('Core Web Vitals', 'vulopilot'),
		desc: __('Real Google Core Web Vitals for this site.', 'vulopilot'),
		link: '#&tab=performance',
		sectionId: 'performance-core-web-vitals-card',
		icon: 'analytics',
	},
	{
		id: 'page-section-performance-top-issues',
		tab: 'performance',
		category: 'sections',
		name: __('Top Issues', 'vulopilot'),
		desc: __('Findings from your most recent scans, grouped by check.', 'vulopilot'),
		link: '#&tab=performance',
		sectionId: 'performance-section-findings',
		icon: 'security',
	},
	{
		id: 'page-section-automation-manage',
		tab: 'automations',
		category: 'sections',
		name: __('Your automations', 'vulopilot'),
		desc: __(
			'React to scan findings automatically - enable, pause, or run an automation, and see when it last ran.',
			'vulopilot'
		),
		link: '#&tab=automations',
		sectionId: 'automation-manage',
		icon: 'automation',
	},
	{
		id: 'page-section-report-history',
		tab: 'reports',
		category: 'sections',
		name: __('Report History', 'vulopilot'),
		desc: __('A complete log of all generated reports.', 'vulopilot'),
		link: '#&tab=reports&subtab=overview',
		sectionId: 'reports-history',
		icon: 'clock',
	},
	{
		id: 'page-section-scheduled-reports',
		tab: 'reports',
		category: 'sections',
		name: __('Scheduled Reports', 'vulopilot'),
		desc: __(
			'Automate report generation and delivery to keep your team and clients updated.',
			'vulopilot'
		),
		link: '#&tab=reports&subtab=overview',
		sectionId: 'reports-schedules',
		icon: 'calendar',
	},
	// Batch added for a broad search-coverage pass across every page that previously had zero or only 1-2 PAGE_SECTIONS entries.
	{
		id: 'page-section-security-trend',
		tab: 'security',
		category: 'sections',
		name: __('Security Trend', 'vulopilot'),
		desc: __('Your real security score trend over time.', 'vulopilot'),
		link: '#&tab=security',
		sectionId: 'security-trend-card',
		icon: 'analytics',
	},
	{
		id: 'page-section-live-threat-monitor',
		tab: 'security',
		category: 'sections',
		name: __('Live Threat Monitor', 'vulopilot'),
		desc: __('Real-time status for each real security check.', 'vulopilot'),
		link: '#&tab=security',
		sectionId: 'live-threat-monitor-card',
		icon: 'security',
	},
	{
		id: 'page-section-security-recent-activity',
		tab: 'security',
		category: 'sections',
		name: __('Recent Activity', 'vulopilot'),
		desc: __('Your last 4 real security-related events.', 'vulopilot'),
		link: '#&tab=security',
		sectionId: 'security-recent-activity-card',
		icon: 'clock',
	},
	{
		id: 'page-section-plugin-overlap',
		tab: 'security',
		category: 'sections',
		name: __('VuloPilot already covers this', 'vulopilot'),
		desc: __(
			'Active plugins that overlap with a feature already built into VuloPilot.',
			'vulopilot'
		),
		link: '#&tab=security',
		sectionId: 'plugin-overlap-card',
		icon: 'module',
	},
	{
		id: 'page-section-performance-overall-speed-score',
		tab: 'performance',
		category: 'sections',
		name: __('Overall Speed Score', 'vulopilot'),
		desc: __('Your real performance score from Google PageSpeed Insights.', 'vulopilot'),
		link: '#&tab=performance&subtab=overview',
		sectionId: 'performance-overall-speed-score-card',
		icon: 'analytics',
	},
	{
		id: 'page-section-performance-quick-actions',
		tab: 'performance',
		category: 'sections',
		name: __('Quick Actions', 'vulopilot'),
		desc: __('Common performance fixes you can run in one click.', 'vulopilot'),
		link: '#&tab=performance&subtab=overview',
		sectionId: 'performance-quick-actions-card',
		icon: 'tools',
	},
	{
		id: 'page-section-biggest-speed-opportunity',
		tab: 'performance',
		category: 'sections',
		name: __('Biggest Speed Opportunity', 'vulopilot'),
		desc: __('The single fix with the biggest real impact on your speed score.', 'vulopilot'),
		link: '#&tab=performance&subtab=overview',
		sectionId: 'biggest-speed-opportunity-card',
		icon: 'analytics',
	},
	{
		id: 'page-section-slow-pages-why',
		tab: 'performance',
		category: 'sections',
		name: __('Why these pages are slow?', 'vulopilot'),
		desc: __('The most common issues dragging your pages down.', 'vulopilot'),
		link: '#&tab=performance&subtab=slow-pages',
		sectionId: 'slow-pages-why-card',
		icon: 'info',
	},
	{
		id: 'page-section-why-accessibility-matters',
		tab: 'accessibility',
		category: 'sections',
		name: __('Why accessibility matters', 'vulopilot'),
		desc: __("More than a checkbox - it's good for everyone.", 'vulopilot'),
		link: '#&tab=accessibility',
		sectionId: 'why-accessibility-matters-card',
		icon: 'question',
	},
	{
		id: 'page-section-accessibility-manual-testing',
		tab: 'accessibility',
		category: 'sections',
		name: __('Some accessibility checks need a person', 'vulopilot'),
		desc: __(
			'Automated tests can find many technical issues, but real user experiences need to be checked manually.',
			'vulopilot'
		),
		link: '#&tab=accessibility',
		sectionId: 'accessibility-manual-testing-card',
		icon: 'person',
	},
	{
		id: 'page-section-ai-sales-assistant',
		tab: 'commerce',
		category: 'sections',
		name: __('AI Sales Assistant', 'vulopilot'),
		desc: __('Real open WooCommerce findings, summarized.', 'vulopilot'),
		link: '#&tab=commerce',
		sectionId: 'ai-sales-assistant-card',
		icon: 'ai',
	},
	{
		id: 'page-section-ai-sales-optimizer',
		tab: 'commerce',
		category: 'sections',
		name: __('AI Sales Optimizer', 'vulopilot'),
		desc: __(
			'Real cross-sell, upsell, and bundle opportunities across your store.',
			'vulopilot'
		),
		link: '#&tab=commerce',
		sectionId: 'ai-sales-optimizer-card',
		icon: 'ai',
	},
	{
		id: 'page-section-content-stats',
		tab: 'content',
		category: 'sections',
		name: __('Content Stats', 'vulopilot'),
		desc: __('Your real content numbers for the selected period.', 'vulopilot'),
		link: '#&tab=content',
		sectionId: 'content-stats-card',
		icon: 'ai',
	},
	{
		id: 'page-section-content-quick-actions',
		tab: 'content',
		category: 'sections',
		name: __('Quick Actions', 'vulopilot'),
		desc: __('Jump straight to your most common content tasks.', 'vulopilot'),
		link: '#&tab=content',
		sectionId: 'content-quick-actions-card',
		icon: 'ai',
	},
];

export const searchIndex: SearchItem[] = [
	...buildIndexFromContext(contextSettings, 'settings'),
	...buildIndexFromContext(contextModules, 'modules'),
	...PAGE_SECTIONS,
];
