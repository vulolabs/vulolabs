import { __ } from '@wordpress/i18n';
import SeoTitlesPanel from './SeoTitlesPanel';

/**
 * Settings → SEO → SEO Titles.
 */
export default {
	id: 'seo-titles',
	priority: 1,
	headerTitle: __('SEO Titles', 'vulopilot'),
	headerDescription: __(
		'Configure how your page titles and descriptions are formatted across your website.',
		'vulopilot'
	),
	hideSettingHeader: true,
	headerIcon: 'document',
	submitUrl: 'settings',
	modal: [
		{ key: 'site_identity_enabled', type: 'text', label: '' },
		{ key: 'title_separator', type: 'text', label: '' },
		{ key: 'title_format_home', type: 'text', label: '' },
		{ key: 'title_format_post', type: 'text', label: '' },
		{ key: 'title_format_page', type: 'text', label: '' },
		{ key: 'title_format_category', type: 'text', label: '' },
		{ key: 'title_format_tag', type: 'text', label: '' },
		{ key: 'title_format_search', type: 'text', label: '' },
		{ key: 'title_format_archive', type: 'text', label: '' },
		{ key: 'title_format_author', type: 'text', label: '' },
		{ key: 'description_format_home', type: 'text', label: '' },
		{ key: 'description_format_post', type: 'text', label: '' },
		{ key: 'description_format_page', type: 'text', label: '' },
		{ key: 'description_format_category', type: 'text', label: '' },
		{ key: 'description_format_tag', type: 'text', label: '' },
		{ key: 'description_format_search', type: 'text', label: '' },
		{ key: 'description_format_archive', type: 'text', label: '' },
		{ key: 'description_format_author', type: 'text', label: '' },
	],
	PanelComponent: SeoTitlesPanel,
};
