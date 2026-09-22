import { __ } from '@wordpress/i18n';

export default {
	id: 'developer-tools',
	priority: 3,
	headerTitle: __('Developer Tools', 'vulopilot'),
	tabTitle: 'Dashboard Caching',
	headerDescription: __(
		'Site errors and events are logged for easy troubleshooting.',
		'vulopilot'
	),
	headerIcon: 'database',
	submitUrl: 'settings',
	modal: [
		{
			key: 'reset_settings',
			type: 'button',
			name: __('Reset', 'vulopilot'),
			label: __('Reset All Settings', 'vulopilot'),
			position: 'left',
			desc: __(
				'Restores every VuloPilot setting on this site to its default value. Findings, history, and your VuloCloud AI connection are not affected.',
				'vulopilot'
			),
			redirect_url: '',
		},
		{
			key: 'separator_content',
			type: 'section',
			title: __('Maintenance Tools', 'vulopilot'),
			desc: __('', 'vulopilot'),
		},
		{
			key: 'enable_debug_logging',
			type: 'checkbox',
			label: __('Developer log', 'vulopilot'),
			desc: __(
				'View system logs related to vulopilot to help identify errors, warnings, and debugging information.',
				'vulopilot'
			),
			options: [
				{
					key: 'enable_debug_logging',
					value: 'enable_debug_logging',
				},
			],
			look: 'toggle',
		},
	],
};
