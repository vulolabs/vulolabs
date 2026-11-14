import { __ } from '@wordpress/i18n';

/**
 * Settings → Spam protection: rate limiting, honeypot and Google reCAPTCHA, all applied to every
 * form.
 */
export default {
	id: 'spam',
	priority: 2,
	headerTitle: __('Spam protection', 'vuloform'),
	headerDescription: __(
		'Limits and checks that apply to every form, and the keys for Google reCAPTCHA.',
		'vuloform'
	),
	groupBySections: true,
	hideSettingHeader: true,
	headerIcon: 'lock',
	submitUrl: 'settings',
	modal: [
		{
			key: 'spam-section',
			type: 'section',
			icon: 'security',
			title: __('Abuse protection', 'vuloform'),
			desc: __('Checks that need no outside service. They apply to every form.', 'vuloform'),
		},
		{
			key: 'rate_limit',
			type: 'number',
			size: 10,
			minNumber: 0,
			maxNumber: 120,
			postText: __('per minute', 'vuloform'),
			label: __('Submissions allowed from one visitor', 'vuloform'),
			settingDescription: __(
				'Per form. Further attempts in the same minute are refused. 0 switches the limit off.',
				'vuloform'
			),
		},
		{
			key: 'min_seconds',
			type: 'number',
			size: 10,
			minNumber: 0,
			maxNumber: 60,
			postText: __('seconds', 'vuloform'),
			label: __('Minimum fill time', 'vuloform'),
			settingDescription: __(
				'A form sent faster than a person could fill it in is filed as spam. 0 switches this off.',
				'vuloform'
			),
		},
		{
			key: 'spam_options',
			type: 'setting-row',
			row: false,
			rows: [
				{
					valueKey: 'honeypot',
					icon: 'security purple',
					title: __('Hidden trap field', 'vuloform'),
					desc: __('A field people never see. A submission that fills it in is filed as spam.', 'vuloform'),
					control: {
						toggle: true,
						toggleStatusLabel: { on: __('On', 'vuloform'), off: __('Off', 'vuloform') },
					},
				},
			],
		},
		{
			key: 'recaptcha-section',
			type: 'section',
			icon: 'security',
			title: __('Google reCAPTCHA', 'vuloform'),
			desc: __(
				'Optional. Create a site key and secret key for the version you choose here, then switch reCAPTCHA on in each form, at the bottom of its Fields tab.',
				'vuloform'
			),
		},
		{
			key: 'recaptcha_type',
			type: 'choice-toggle',
			iconEnable: true,
			defaultValue: 'v2',
			label: __('Version', 'vuloform'),
			options: [
				{
					key: 'v2',
					value: 'v2',
					label: __('v2 checkbox', 'vuloform'),
					desc: __("Visitors tick \"I'm not a robot\".", 'vuloform'),
					icon: 'check',
				},
				{
					key: 'v3',
					value: 'v3',
					label: __('v3 invisible', 'vuloform'),
					desc: __('Scores each visitor in the background.', 'vuloform'),
					icon: 'security',
				},
			],
		},
		{
			key: 'recaptcha_site_key',
			type: 'text',
			size: 30,
			label: __('Site key', 'vuloform'),
			settingDescription:
				__('Keys only work for the version they were created for. Empty this to switch reCAPTCHA off everywhere.', 'vuloform') +
				' <a href="https://www.google.com/recaptcha/admin" target="_blank" rel="noopener noreferrer" style="color: var(--color-primary); text-decoration: underline;">' +
				__('Get reCAPTCHA keys', 'vuloform') +
				'</a>',
		},
		{
			key: 'recaptcha_secret_key',
			type: 'password',
			size: 30,
			label: __('Secret key', 'vuloform'),
			settingDescription: __('Kept on the server and never shown again. Leave empty to keep the key already saved.', 'vuloform'),
		},
		{
			key: 'recaptcha_score',
			type: 'select',
			size: 16,
			label: __('v3 strictness', 'vuloform'),
			settingDescription: __('Only used by v3. Submissions scoring below this are filed as spam, not refused.', 'vuloform'),
			options: [
				{ label: __('Lenient (0.3)', 'vuloform'), value: '0.3' },
				{ label: __('Balanced (0.5)', 'vuloform'), value: '0.5' },
				{ label: __('Strict (0.7)', 'vuloform'), value: '0.7' },
			],
		},
	],
};
