import { __ } from '@wordpress/i18n';

/** `id`/`priority`/`headerTitle`/`headerIcon` are read by NavigatorComponent to list the tab and route to it. */
export default {
	id: 'developer-tools',
	priority: 9,
	headerTitle: __('Developer Tools', 'vulopilot'),
	headerDescription: __(
		'Diagnostics and maintenance actions for troubleshooting VuloPilot.',
		'vulopilot'
	),
	hideSettingHeader: true,
	headerIcon: 'setting',
	submitUrl: 'settings',
	modal: [
		{ key: 'keep_data_uninstall', type: 'choice-toggle', label: '', options: [] },
		{ key: 'anonymous_usage_data', type: 'choice-toggle', label: '', options: [] },
	],
};
