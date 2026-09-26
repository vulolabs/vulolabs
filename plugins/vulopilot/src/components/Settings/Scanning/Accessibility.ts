import { __ } from '@wordpress/i18n';

/**
 * Settings → Scanning → Accessibility.
 *
 * New tab pulling together 3 fields that previously lived inside Scanning
 * → Security's own shared "Accessibility" section (`enable_wcag_scanner`,
 * `accessibility_audit_frequency`, `target_wcag_level` - moved, not
 * duplicated, same precedent GetStarted/GoogleServices.ts's own docblock
 * documents for its move out of Scanning), plus one real setting that had
 * no settings-UI exposure anywhere until now:
 *
 * "Restore Defaults" is AccessibilityRestoreDefaultsHeader.tsx, wired via
 * this config's own `settingAction` (same migration AiVisibility.ts/
 * Security.ts already went through - rendered by
 * NavigatorComponent.tsx's renderSettingHeaderInfo(), not Settings.tsx's
 * own currentTab special-case anymore).
 */
export default {
	id: 'accessibility',
	priority: 3,
	headerTitle: __('Accessibility', 'vulopilot'),
	headerDescription: __(
		'These scans help you make your website more accessible for everyone.',
		'vulopilot'
	),
	headerIcon: 'person',
	// settingAction: createElement(AccessibilityRestoreDefaultsHeader),
	submitUrl: 'settings',
	modal: [
		{
			key: 'enable_accessibility_scanning',
			type: 'checkbox',
			look: 'toggle',
			label: __('Accessibility checks', 'vulopilot'),
			settingDescription: __(
				'Checks your website for accessibility issues and reports affected pages so you can improve usability for people with disabilities. <br> <a href="?page=vulopilot#&tab=accessibility">View checklist of accessibility tests</a>',
				'vulopilot'
			),
			options: [
				{ key: 'enable_accessibility_scanning', label: '', value: 'enable_accessibility_scanning' },
			],
			moduleEnabled: 'accessibility-checks',
		},
		{
			key: 'accessibility_audit_frequency',
			label:__('Scan frequency', 'vulopilot'),
			settingDescription: __(
				'Automatically checks your website at the selected interval to catch new accessibility issues.',
				'vulopilot'
			),
			type: 'choice-toggle',
			defaultValue: 'daily',
			options: [
				{ key: 'disabled', value: 'disabled', label: __('Off', 'vulopilot'), width: '100%' },
				{ key: 'hourly', value: 'hourly', label: __('Hourly', 'vulopilot'), width: '100%' },
				{ key: 'daily', value: 'daily', label: __('Daily', 'vulopilot'), width: '100%' },
				{ key: 'weekly', value: 'weekly', label: __('Weekly', 'vulopilot'), width: '100%' },
			],
			moduleEnabled: 'accessibility-checks',
		},
		{
			key: 'target_wcag_level',
			type: 'choice-toggle',
			label:__('WCAG level', 'vulopilot'),
			settingDescription: __(
				'Choose which accessibility standards VuloPilot checks your website against.',
				'vulopilot'
			),
			defaultValue: '2.1_aa',
			options: [
				{ key: '2.1_a', value: '2.1_a', label: __('A', 'vulopilot'), width: '100%' },
				{ key: '2.1_aa', value: '2.1_aa', label: __('AA', 'vulopilot'), width: '100%' },
				{ key: '2.1_aaa', value: '2.1_aaa', label: __('AAA', 'vulopilot'), width: '100%' },
			],
			moduleEnabled: 'accessibility-checks',
		},
		{
			key: 'enable_wcag_scanner',
			type: 'checkbox',
			look: 'toggle',
			label: __('Check for generic, out-of-context link text', 'vulopilot'),
			settingDescription: __(
				'Flags links such as "Click here" or "Read more" when their purpose is unclear without surrounding text, helping screen-reader users navigate.',
				'vulopilot'
			),
			options: [
				{ key: 'enable_wcag_scanner', label: '', value: 'enable_wcag_scanner' },
			],
			moduleEnabled: 'accessibility-checks',
		},
		{
			key: 'accessibility-why-notice',
			type: 'notice',
			noticeType: 'info',
			title: __('Why accessibility matters', 'vulopilot'),
			message: __(
				'An accessible website improves user experience, builds trust, and helps you reach a wider audience.',
				'vulopilot'
			),
		},
	],
};
