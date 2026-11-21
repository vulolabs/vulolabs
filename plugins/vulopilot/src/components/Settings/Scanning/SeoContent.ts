import { __ } from '@wordpress/i18n';

/** Settings → Scanning → SEO & Content - first tab under Scanning (`priority: 0` below). */
export default {
	id: 'seo-content',
	// First tab under Scanning, now that Content & Search was removed entirely and this tab absorbed its real settings.
	priority: 0,
	headerTitle: __('SEO & Content', 'vulopilot'),
	settingTitle: __('Titles & meta', 'vulopilot'),
	headerDescription: __(
		'Controls what shows up in the SEO page\'s "Titles & Meta" and "Content Structure" findings.',
		'vulopilot'
	),
	hideSettingHeader: true,
	groupBySections: true,
	headerIcon: 'search',
	submitUrl: 'settings',
	modal: [
		{
            key: 'brand-section-about-page',
            type: 'section',
            title: __('About Page', 'vulopilot'),
            icon: 'web-page-website',
            desc: __('Checks whether your site’s About or Company page gives visitors (and search engines) enough real information to trust it. Only runs if your site has a page that looks like an About page.',
                'vulopilot'
            ),
        },
        {
            key: 'brand_about_page_min_words',
            type: 'number',
            size: 10,
            label: __('Minimum About page word count', 'vulopilot'),
            settingDescription: __(
                'An About page under this word count is flagged as too thin to be a genuine trust signal.',
                'vulopilot'
            ),
        },
        {
            // Not a real, independently-writable field here.
            key: 'brand-drop-threshold-note',
            type: 'notice',
            noticeType: 'info',
            label: '',
            message: __(
                'Brand score drop alerts (and their threshold) are configured under <a href="?page=vulopilot#&tab=settings&subtab=notifications">Notifications → Visibility Alerts</a>.',
                'vulopilot'
            ),
        },
		{
			key: 'general_settings',
			type: 'section',
			icon: 'setting',
			title: __('Titles & meta', 'vulopilot'),
			desc:  __(
		'Controls what shows up in the SEO page\'s "Titles & Meta" and "Content Structure" findings.',
		'vulopilot'
	),
		},
		{
			key: 'flag_orphan_pages',
			type: 'checkbox',
			look: 'toggle',
			moduleEnabled: 'technical-seo',
			label: __('Flag orphan pages', 'vulopilot'),
			settingDescription: __('Pages with no incoming internal links, making them harder for visitors and search engines to discover.', 'vulopilot'),
			options: [
				{ key: 'flag_orphan_pages', label: '', value: 'flag_orphan_pages' },
			],
		},
		{
			key: 'thin_content_word_threshold',
			type: 'number',
			size: 15,
			label: __('Thin content threshold (words)', 'vulopilot'),
			settingDescription: __(
				'Set the minimum word count for a page. Pages below this limit will be flagged for review.',
				'vulopilot'
			),
			moduleEnabled: 'technical-seo',
		},
		{
			key: 'flag_missing_meta_description',
			type: 'checkbox',
			look: 'toggle',

			label: __('Flag missing meta descriptions', 'vulopilot'),
			settingDescription: __('Pages without a meta description that summarizes their content for search engines.', 'vulopilot'),
			options: [
				{ key: 'flag_missing_meta_description', label: '', value: 'flag_missing_meta_description' },
			],
			moduleEnabled: 'technical-seo',
		},
		{
			key: 'flag_duplicate_titles',
			type: 'checkbox',
			look: 'toggle',

			label: __('Flag duplicate title tags', 'vulopilot'),
			settingDescription: __(
				'Pages sharing the same SEO title, so you can give each page a distinct title.',
				'vulopilot'
			),
			options: [
				{ key: 'flag_duplicate_titles', label: '', value: 'flag_duplicate_titles' },
			],
			moduleEnabled: 'technical-seo',
		},
		{
			key: 'seo-section-images',
			type: 'section',
			icon: 'image',
			title: __('Images', 'vulopilot'),
			desc: __(
				'Controls the "Images" findings group on the SEO page.',
				'vulopilot'
			),
		},
		{
			key: 'flag_missing_alt_text',
			type: 'checkbox',
			look: 'toggle',
			moduleEnabled: 'technical-seo',
			label: __('Flag missing alt text', 'vulopilot'),
			settingDescription: __('Images without alternative text that describes their content for screen readers and search engines.', 'vulopilot'),
			options: [
				{ key: 'flag_missing_alt_text', label: '', value: 'flag_missing_alt_text' },
			],
		},
		{
			key: 'flag_broken_images',
			type: 'checkbox',
			look: 'toggle',

			label: __('Flag broken images', 'vulopilot'),
			settingDescription: __(
				'Images that fail to load because their source URL returns an error.',
				'vulopilot'
			),
			options: [
				{ key: 'flag_broken_images', label: '', value: 'flag_broken_images' },
			],
			moduleEnabled: 'technical-seo',
		},
		{
			key: 'flag_missing_featured_image',
			type: 'checkbox',
			look: 'toggle',

			label: __('Flag missing featured images', 'vulopilot'),
			settingDescription: __(
				'Published pages, posts, or products with no featured image set.',
				'vulopilot'
			),
			options: [
				{
					key: 'flag_missing_featured_image',
					label: '',
					value: 'flag_missing_featured_image',
				},
			],
			moduleEnabled: 'technical-seo',
		},
		{
			key: 'seo-section-links-schema',
			type: 'section',
			icon: 'link',
			title: __('Links & schema', 'vulopilot'),
			desc: __(
				'Controls the "Links & Indexability" findings group.',
				'vulopilot'
			),
		},
		{
			key: 'flag_broken_links',
			type: 'checkbox',
			look: 'toggle',
			label: __('Flag broken internal links', 'vulopilot'),
			settingDescription: __(
				'Find links pointing to missing or unavailable pages on your website.',
				'vulopilot'
			),
			options: [
				{ key: 'flag_broken_links', label: '', value: 'flag_broken_links' },
			],
			moduleEnabled: 'technical-seo',
		},
		{
			key: 'canonical_url_enabled',
			type: 'checkbox',
			look: 'toggle',
			moduleEnabled: 'technical-seo',
			label: __('Add canonical URL tags', 'vulopilot'),
			settingDescription: __(
				'Canonical tags indicate the preferred URL for pages with duplicate or similar content. WordPress already adds these by default - only turn this on if the "Canonical URLs" finding shows them missing.',
				'vulopilot'
			),
			options: [
				{
					key: 'canonical_url_enabled',
					label: '',
					value: 'canonical_url_enabled',
				},
			],
		},
		{
			key: 'social_meta_tags_enabled',
			type: 'checkbox',
			look: 'toggle',
			moduleEnabled: 'technical-seo',
			label: __('Add Open Graph & Twitter Card tags', 'vulopilot'),
			settingDescription: __(
				'Social sharing metadata so supported platforms can display page titles, descriptions, and images.',
				'vulopilot'
			),
			options: [
				{
					key: 'social_meta_tags_enabled',
					label: '',
					value: 'social_meta_tags_enabled',
				},
			],
		},
		{
			key: 'social_twitter_username',
			type: 'text',
			size: 20,
			moduleEnabled: 'technical-seo',
			label: __('X/Twitter username', 'vulopilot'),
			placeholder: __('@yoursite', 'vulopilot'),
			settingDescription: __(
				'Adds twitter:site (and twitter:creator, absent a per-post author handle) to the tags above. Leave blank to omit both.',
				'vulopilot'
			),
		},
		{
			key: 'seo-section-robots',
			type: 'section',
			icon: 'txt',
			title: __('Robots.txt', 'vulopilot'),
			desc: __(
				'Manage sitemap discovery and identify crawler restrictions that may prevent search engines and AI bots from accessing your content.',
				'vulopilot'
			),
		},
		{
			key: 'robots_auto_generate',
			type: 'checkbox',
			look: 'toggle',
			moduleEnabled: 'technical-seo',
			label: __('Auto-generate robots.txt', 'vulopilot'),
			settingDescription: __(
				'Add a sitemap reference to your robots.txt file to help search engines discover your sitemap.',
				'vulopilot'
			),
			options: [
				{ key: 'robots_auto_generate', label: '', value: 'robots_auto_generate' },
			],
		},
		{
			key: 'flag_ai_crawler_blocked_pages',
			type: 'checkbox',
			look: 'toggle',
			label: __('Flag pages blocked for specific AI crawlers', 'vulopilot'),
			settingDescription: __(
				'Find published pages affected by robots.txt rules for selected AI crawlers, such as GPTBot and ClaudeBot.',
				'vulopilot'
			),
			options: [
				{
					key: 'flag_ai_crawler_blocked_pages',
					label: '',
					value: 'flag_ai_crawler_blocked_pages',
				},
			],
			moduleEnabled: 'ai-crawler-tracking',
		},
		{
			key: 'seo-section-redirects',
			type: 'section',
			icon: 'external',
			title: __('Redirects', 'vulopilot'),
			desc: __(
				'Keep visitors on the right pages when URLs change and identify broken links that need attention.',
				'vulopilot'
			),
		},
		{
			key: 'enable_redirect_manager',
			type: 'checkbox',
			look: 'toggle',
			label: __('Enable redirect manager', 'vulopilot'),
			settingDescription: __(
				'Create and manage 301 redirects to send visitors from old URLs to new pages.',
				'vulopilot'
			),
			options: [
				{
					key: 'enable_redirect_manager',
					label: '',
					value: 'enable_redirect_manager',
				},
			],
		},
		{
			key: 'auto_redirect_on_slug_change',
			type: 'checkbox',
			look: 'toggle',
			label: __('Auto-create redirect on slug change', 'vulopilot'),
			settingDescription: __(
				'Automatically redirect the previous URL when you change a published post or page slug.',
				'vulopilot'
			),
			options: [
				{
					key: 'auto_redirect_on_slug_change',
					label: '',
					value: 'auto_redirect_on_slug_change',
				},
			],
			dependent: {
				key: 'enable_redirect_manager',
				value: 'enable_redirect_manager',
				set: true,
			},
		},
		{
			key: 'log_404s',
			type: 'checkbox',
			look: 'toggle',
			label: __('Log 404s', 'vulopilot'),
			settingDescription: __(
				'Record visits to missing pages so you can identify broken URLs and create redirects where needed.',
				'vulopilot'
			),
			options: [{ key: 'log_404s', label: '', value: 'log_404s' }],
		},
		// { key: 'content-section', type.
		{
			key: 'seo-section-readability',
			type: 'section',
			icon: 'text',
			title: __('Readability', 'vulopilot'),
			desc: __(
				"Analyze content readability to ensure it's easy for your visitors to read and understand.",
				'vulopilot'
			),
		},
		{
			key: 'content_readability_min_score',
			type: 'number',
			size: 5,
			label: __('Minimum readability score', 'vulopilot'),
			settingDescription: __(
				'Posts scoring below this on the Flesch Reading Ease scale (0-100, higher is easier to read) are flagged. 50 is that scale\'s own "Fairly Difficult" boundary.',
				'vulopilot'
			),
		},
	],
};
