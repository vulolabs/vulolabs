import { __ } from '@wordpress/i18n';

/**
 * Settings → Data: what happens to forms, submissions and uploaded files on uninstall.
 */
export default {
	id: 'data',
	priority: 3,
	headerTitle: __('Data', 'vuloform'),
	headerDescription: __(
		'What happens to your forms, submissions and uploaded files when VuloForm is deleted.',
		'vuloform'
	),
	groupBySections: true,
	hideSettingHeader: true,
	headerIcon: 'database',
	submitUrl: 'settings',
	modal: [
		{
			key: 'data-section',
			type: 'section',
			icon: 'database',
			title: __('Data', 'vuloform'),
			desc: __(
				'What happens to your forms, submissions and uploaded files when VuloForm is deleted.',
				'vuloform'
			),
		},
		{
			key: 'keep_data_uninstall',
			type: 'choice-toggle',
			iconEnable: true,
			defaultValue: 'keep_data',
			label: __('When VuloForm is deleted', 'vuloform'),
			options: [
				{
					key: 'keep_data',
					value: 'keep_data',
					label: __('Keep data', 'vuloform'),
					desc: __('Reinstalling picks up where you left off.', 'vuloform'),
					icon: 'database',
				},
				{
					key: 'delete_everything',
					value: 'delete_everything',
					label: __('Delete everything', 'vuloform'),
					desc: __('Removes forms, submissions and uploaded files.', 'vuloform'),
					icon: 'delete',
				},
			],
		},
	],
};
