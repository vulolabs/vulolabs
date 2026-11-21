import { __ } from '@wordpress/i18n';

/** `id`/`priority`/`headerTitle`/`headerIcon` are read by NavigatorComponent to list the tab and route to it. */
export default {
	id: 'migration',
	priority: 10,
	headerTitle: __('Migration', 'vulopilot'),
	headerDescription: __(
		'Import SEO data from another SEO plugin into VuloPilot.',
		'vulopilot'
	),
	headerIcon: 'import',
	hideSettingHeader: true,
	submitUrl: 'migration',
	modal: [],
};
