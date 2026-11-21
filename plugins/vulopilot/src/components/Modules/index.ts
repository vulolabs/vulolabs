import { __ } from '@wordpress/i18n';

export interface ModuleCatalogEntry {
	id: string;
	name: string;
	desc: string;
	proModule: boolean;
	category: string;
	miniModule?: boolean;
	freeFeatures?: string[];
	proFeatures?: string[];
	icon?: string;
	settingsLink?: string;
	popupTitle?: string;
	/** Sentence shown under `popupTitle` in that same popup. */
	popupDesc?: string;
}

/** A category-pill-bar heading, not a real module. */
export interface ModuleCatalogSeparator {
	type: 'separator';
	id: string;
	label: string;
}

export type ModuleCatalogItem = ModuleCatalogEntry | ModuleCatalogSeparator;

export const isModuleCatalogEntry = (
	item: ModuleCatalogItem
): item is ModuleCatalogEntry => !('type' in item);

const MODULES_CATALOG: { category: boolean; tab: string; modules: ModuleCatalogItem[] } = {
	category: true,
	tab: 'settings',
	modules: [
		// AI Visibility Section
		{ type: 'separator', id: 'ai-visibility', label: __('AI Visibility', 'vulopilot') },
		{
            id: 'geo-analysis',
            icon: 'geo',
            settingsLink: '?page=vulopilot#&tab=settings&subtab=ai-visibility',
            name: __('GEO Analysis', 'vulopilot'),
            desc: __('Scans structure, entities, and machine-readability so AI models can understand your pages.', 'vulopilot'),
            popupTitle: __('Show Up in AI Answers', 'vulopilot'),
            popupDesc: __('Track GEO trends, schedule scans, fix issues in bulk with AI, and benchmark your site against competitors.', 'vulopilot'),
            proModule: false,
            category: 'ai-visibility',
            freeFeatures: [
                __('Structure & machine-readability audit', 'vulopilot'),
                __('Entity & purpose-clarity checks', 'vulopilot'),
                __('Live GEO score (0–100)', 'vulopilot'),
                __('Manual re-scan on demand', 'vulopilot')
            ],
            proFeatures: [
                __('Historical GEO trend charts', 'vulopilot'),
                __('Scheduled automated scans', 'vulopilot'),
                __('AI-powered bulk fixes', 'vulopilot'),
                __('Competitor GEO benchmarking', 'vulopilot')
            ]
        },
        {
            id: 'answer-engine-optimization',
            icon: 'aeo',
            settingsLink: '?page=vulopilot#&tab=settings&subtab=ai-visibility',
            name: __('Answer Engine Optimization', 'vulopilot'),
            desc: __('Detects FAQs, direct-answer structure, and question coverage - then helps you get cited by ChatGPT, Perplexity, Gemini, and Copilot.', 'vulopilot'),
            popupTitle: __('Turn Content into Better Answers', 'vulopilot'),
            popupDesc: __('Generate llms.txt, score citation potential, build AI-ready snippets, and test across ChatGPT, Perplexity, Gemini, and Copilot.', 'vulopilot'),
            proModule: false,
            category: 'ai-visibility',
            freeFeatures: [
                __('FAQ & direct-answer detection', 'vulopilot'),
                __('Question-coverage scanning', 'vulopilot'),
                __('Answer-position checks (first 200 words)', 'vulopilot'),
                __('Retrieval-chunk thinness checks', 'vulopilot'),
                __('llms.txt generation', 'vulopilot')
            ],
            proFeatures: [
                __('Citation-probability scoring', 'vulopilot'),
                __('AI-ready snippet builder', 'vulopilot'),
                __('Multi-engine answer testing (ChatGPT, Perplexity, Gemini, Copilot)', 'vulopilot')
            ]
        },
        {
            id: 'knowledge-graph',
            icon: 'knowledge-graph',
            settingsLink: '?page=vulopilot#&tab=settings&subtab=business-information',
            name: __('Knowledge Graph', 'vulopilot'),
            desc: __('Reads real people, organizations, products, services, and categories from your site and turns them into structured entities.', 'vulopilot'),
            popupTitle: __('Make Your Business Clear to AI', 'vulopilot'),
            popupDesc: __('Map relationships between your brand, people, products, and topics, enrich them with AI, and add custom schema.', 'vulopilot'),
            proModule: false,
            category: 'ai-visibility',
            miniModule: true,
            freeFeatures: [
                __('Entity extraction: people, orgs, products, services', 'vulopilot'),
                __('Location & category detection', 'vulopilot'),
                __('Source-verified entity list (never fabricated)', 'vulopilot')
            ],
            proFeatures: [
                __('Entity relationship mapping', 'vulopilot'),
                __('AI-powered graph enrichment', 'vulopilot'),
                __('Custom schema creation', 'vulopilot')
            ]
        },
        {
            id: 'ai-crawler-tracking',
            icon: 'url',
            settingsLink: '?page=vulopilot#&tab=settings&subtab=ai-visibility',
            name: __('AI Crawler Tracking', 'vulopilot'),
            desc: __('Tracks which AI bots - GPTBot, ClaudeBot, PerplexityBot, and others - are visiting your site, and what they\'re reading.', 'vulopilot'),
            popupTitle: __('See How AI Bots Use Your Site', 'vulopilot'),
            popupDesc: __('Keep 12 months of crawler history, catch unusual activity, and understand AI crawl-budget patterns.', 'vulopilot'),
            proModule: false,
            category: 'ai-visibility',
            miniModule: true,
            freeFeatures: [
                __('7-day crawler visit log', 'vulopilot'),
                __('Top pages crawled by AI bots', 'vulopilot'),
                __('Per-bot visit counts', 'vulopilot')
            ],
            proFeatures: [
                __('Historical trends & anomaly alerts', 'vulopilot'),
                __('Extended log retention (12 months)', 'vulopilot'),
                __('Crawl-budget insights', 'vulopilot')
            ]
        },

		// Brand Visibility Section
		{ type: 'separator', id: 'brand-visibility', label: __('Brand Visibility', 'vulopilot') },
		{
            id: 'brand-visibility',
            icon: 'brand-visibility',
            settingsLink: '?page=vulopilot#&tab=settings&subtab=business-information',
            name: __('Brand Visibility', 'vulopilot'),
            desc: __('Organization & author schema, About-page completeness, and off-site mentions across the web.', 'vulopilot'),
            popupTitle: __('See Where Your Brand Stands', 'vulopilot'),
            popupDesc: __('Monitor off-site mentions, compare share of voice, and benchmark competitors through your connected Ahrefs account.', 'vulopilot'),
            proModule: false,
            category: 'brand-visibility',
            miniModule: true,
            freeFeatures: [
                __('Organization & author schema checks', 'vulopilot'),
                __('About-page completeness', 'vulopilot'),
                __('NAP / contact consistency', 'vulopilot')
            ],
            proFeatures: [
                __('Off-site mention monitoring', 'vulopilot'),
                __('Share-of-voice vs. competitors', 'vulopilot'),
                __('Competitor comparison via connected Ahrefs account', 'vulopilot')
            ]
        },

		// SEO & Content Section
		{ type: 'separator', id: 'seo-content', label: __('SEO & Content', 'vulopilot') },
		{
            id: 'technical-seo',
            icon: 'seo',
            settingsLink: '?page=vulopilot#&tab=settings&subtab=seo-content',
            name: __('Technical SEO', 'vulopilot'),
            desc: __('Titles, meta, canonical, schema, internal links, sitemap, and robots.txt checks.', 'vulopilot'),
            popupTitle: __('Catch SEO Problems Site-Wide', 'vulopilot'),
            popupDesc: __('Find keyword cannibalization, validate structured data across your site, and auto-fix supported SEO issues.', 'vulopilot'),
            proModule: false,
            category: 'seo-content',
            miniModule: true,
            freeFeatures: [
                __('Title & meta description checks', 'vulopilot'),
                __('Canonical & schema validation', 'vulopilot'),
                __('Internal link & sitemap audit', 'vulopilot'),
                __('robots.txt checks', 'vulopilot')
            ],
            proFeatures: [
                __('Keyword cannibalization detection', 'vulopilot'),
                __('Site-wide structured data validation', 'vulopilot')
            ]
        },
        {
            id: 'content-optimization',
            icon: 'document',
            settingsLink: '?page=vulopilot#&tab=content',
            name: __('Content Optimization', 'vulopilot'),
            desc: __('Readability, thin/duplicate content, and freshness flags - plus AI-assisted rewriting.', 'vulopilot'),
            popupTitle: __('Create What Your Site Is Missing', 'vulopilot'),
            popupDesc: __('Generate new content, rewrite or expand existing pages, build topic clusters, and uncover competitor content gaps.', 'vulopilot'),
            proModule: false,
            category: 'seo-content',
            miniModule: true,
            freeFeatures: [
                __('Readability scoring', 'vulopilot'),
                __('Thin & duplicate content detection', 'vulopilot'),
                __('Content freshness flags', 'vulopilot')
            ],
            proFeatures: [
                __('AI rewrite & expansion', 'vulopilot'),
                __('Topic clustering', 'vulopilot'),
                __('Content gap analysis vs. competitors', 'vulopilot')
            ]
        },
        {
            id: 'redirect-manager',
            icon: 'redirect-url',
            settingsLink: '?page=vulopilot#&tab=settings&subtab=seo-content',
            name: __('Redirect Manager', 'vulopilot'),
            desc: __('301 redirects and 404 tracking, with automatic redirects on slug change.', 'vulopilot'),
            proModule: false,
            category: 'seo-content',
            miniModule: true,
            freeFeatures: [
                __('Unlimited 301 redirects', 'vulopilot'),
                __('404 log with hit counts', 'vulopilot'),
                __('Automatic redirect on slug change', 'vulopilot')
            ]
        },
        {
            id: 'keyword-rank-tracking',
            icon: 'keyword',
            settingsLink: '?page=vulopilot#&tab=seo-visibility&subtab=keywords',
            name: __('Keyword Rank Tracking', 'vulopilot'),
            desc: __('Real, synced Google Search Console rank tracking - positions, impressions, clicks, and keyword groups, tracked over time.', 'vulopilot'),
            popupTitle: __('Know What’s Rising and Dropping', 'vulopilot'),
            popupDesc: __('Track Search Console rankings, position history, trends, keyword groups, and your best opportunities.', 'vulopilot'),
            proModule: true,
            category: 'seo-content',
            miniModule: true,
            freeFeatures: [],
            proFeatures: [
                __('Synced Search Console rank tracking', 'vulopilot'),
                __('Keyword position history & trends', 'vulopilot'),
                __('Top opportunities & keyword groups', 'vulopilot')
            ]
        },

		// Site Health Section
		{ type: 'separator', id: 'site-health', label: __('Site Health', 'vulopilot') },
		{
            id: 'performance-monitoring',
            icon: 'speed',
            settingsLink: '?page=vulopilot#&tab=performance',
            name: __('Core Web Vitals', 'vulopilot'),
            desc: __('Core Web Vitals, database health, and autoload size checks.', 'vulopilot'),
            popupTitle: __('Keep Your Site Fast', 'vulopilot'),
            popupDesc: __('Track performance trends, schedule audits, and get AI-generated optimization suggestions.', 'vulopilot'),
            proModule: false,
            category: 'site-health',
            miniModule: true,
            freeFeatures: [
                __('Core Web Vitals snapshot', 'vulopilot'),
                __('Database health checks', 'vulopilot'),
                __('Autoload size checks', 'vulopilot')
            ],
            proFeatures: [
                __('Historical performance trends', 'vulopilot'),
                __('Scheduled audits', 'vulopilot'),
                __('AI-generated optimization suggestions', 'vulopilot')
            ]
        },
        {
            /** Must be the real backend module id - AccessibilityAudits' folder name kebab-cased. */
            id: 'accessibility-checks',
            icon: 'accessibility',
            settingsLink: '?page=vulopilot#&tab=settings&subtab=accessibility',
            name: __('Accessibility Checks', 'vulopilot'),
            desc: __('WCAG checks - alt text, headings, ARIA, and form labels.', 'vulopilot'),
            popupTitle: __('Fix Accessibility at Scale', 'vulopilot'),
            popupDesc: __('Bulk-fix supported accessibility issues, schedule audits, and track compliance history.', 'vulopilot'),
            proModule: false,
            category: 'site-health',
            miniModule: true,
            freeFeatures: [
                __('Alt text & heading structure checks', 'vulopilot'),
                __('ARIA attribute checks', 'vulopilot'),
                __('Form label checks', 'vulopilot')
            ],
            proFeatures: [
                __('Bulk accessibility fixes', 'vulopilot'),
                __('Scheduled audits', 'vulopilot'),
                __('Historical compliance reports', 'vulopilot')
            ]
        },
        {
            id: 'website-security',
            icon: 'security',
            settingsLink: '?page=vulopilot#&tab=settings&subtab=security-scanning',
            name: __('Website Security', 'vulopilot'),
            desc: __('Weak passwords, basic vulnerabilities, core file integrity, and update checks.', 'vulopilot'),
            popupTitle: __('Catch Security Risks Early', 'vulopilot'),
            popupDesc: __('Schedule security scans, monitor live CVEs and plugin/theme integrity, and get alerts and incident reports.', 'vulopilot'),
            proModule: false,
            category: 'site-health',
            miniModule: true,
            freeFeatures: [
                __('Weak password detection', 'vulopilot'),
                __('Core file integrity checks', 'vulopilot'),
                __('Plugin/theme update checks', 'vulopilot')
            ],
            proFeatures: [
                __('Scheduled security scans', 'vulopilot'),
                __('Live CVE vulnerability feed', 'vulopilot'),
                __('Plugin/theme integrity monitoring', 'vulopilot'),
                __('Alerts & incident reports', 'vulopilot')
            ]
        },

		// Automation & AI Section
		{ type: 'separator', id: 'automation-ai', label: __('Automations & AI', 'vulopilot') },
		{
            id: 'ai-copilot',
            icon: 'ai',
            settingsLink: '?page=vulopilot#&tab=settings&subtab=integrations',
            name: __('AI Copilot', 'vulopilot'),
            desc: __('Explainable AI recommendations for any finding across every module.', 'vulopilot'),
            proModule: false,
            category: 'automation-ai',
            miniModule: true,
            freeFeatures: [
                __('Manual AI suggestions (bring your own API key)', 'vulopilot'),
                __('Explainable, side-by-side fix previews', 'vulopilot')
            ],
            proFeatures: [
                __('One-click AI fixes', 'vulopilot'),
                __('Bulk AI fixes across any module', 'vulopilot'),
                __('Auto-apply with approval queue', 'vulopilot')
            ]
        },
        {
            id: 'workflow-automation',
            icon: 'automation',
            settingsLink: '?page=vulopilot#&tab=automations',
            name: __('Workflow Automation', 'vulopilot'),
            desc: __('Triggers, conditions, schedules, and workflows that react to scan findings automatically.', 'vulopilot'),
            popupTitle: __('Put Your Website to Work Automatically', 'vulopilot'),
            popupDesc: __('Auto-fix supported issues, generate or refresh content, schedule scans, and trigger actions when VuloPilot finds something that needs attention.', 'vulopilot'),
            proModule: false,
            category: 'automation-ai',
            miniModule: true,
            freeFeatures: [
                __('Full Site Scan', 'vulopilot'),
                __('Website Health Check', 'vulopilot')
            ],
            proFeatures: [
                __('Custom triggers & conditions', 'vulopilot'),
                __('Scheduled workflows', 'vulopilot'),
                __('Auto-react to scan findings', 'vulopilot')
            ]
        },

		// Commerce Section
		{ type: 'separator', id: 'commerce', label: __('Commerce', 'vulopilot') },
		{
            id: 'woo-commerce-analytics',
            icon: 'cart',
            settingsLink: '?page=vulopilot#&tab=commerce',
            name: __('WooCommerce Analytics', 'vulopilot'),
            desc: __('Store health, product/checkout/order insights, revenue reports, and AI-powered sales optimization for WooCommerce.', 'vulopilot'),
            popupTitle: __('Find More Store Opportunities', 'vulopilot'),
            popupDesc: __('Track store health, categories, revenue, and sales trends, with AI-powered cross-sell and upsell suggestions.', 'vulopilot'),
            proModule: true,
            category: 'commerce',
            miniModule: true,
            freeFeatures: [],
            proFeatures: [
                __('Store health & category breakdowns', 'vulopilot'),
                __('Revenue reports & sales trends', 'vulopilot'),
                __('AI-powered cross-sell/upsell suggestions', 'vulopilot')
            ]
        }
	],
};

export default MODULES_CATALOG;
