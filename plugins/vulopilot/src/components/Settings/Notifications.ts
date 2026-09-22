import { createElement, Fragment, type ReactNode } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import CrawlerAlertTestPanel from './CrawlerAlertTestPanel';
import SendTestEmailButton from './SendTestEmailButton';

const THRESHOLD_OPTIONS = [5, 10, 20, 30].map((points) => ({
	label: sprintf(__('%d%% or more', 'vulopilot'), points),
	value: String(points),
}));

const FREQUENCY_OPTIONS = [
	{ label: __('Immediately', 'vulopilot'), value: 'immediate' },
	{ label: __('Daily digest', 'vulopilot'), value: 'daily_digest' },
	{ label: __('Weekly digest', 'vulopilot'), value: 'weekly_digest' },
];

// Shared by every row's own `control.toggleStatusLabel` below — "On"/"Off"
// per direct instruction, rather than SettingToggle's own default
// "Enabled"/"Disabled" flip text.
const TOGGLE_STATUS_LABEL = { on: __('On', 'vulopilot'), off: __('Off', 'vulopilot') };

const DAYS_OPTIONS = [
	{ label: __('3 days', 'vulopilot'), value: '3' },
	{ label: __('7 days', 'vulopilot'), value: '7' },
	{ label: __('14 days', 'vulopilot'), value: '14' },
	{ label: __('30 days', 'vulopilot'), value: '30' },
];

interface CrawlerAlertRow {
	/** This row's own key within the `crawler_alerts` value object — SettingRowComponent's own `valueKey`. */
	valueKey: string;
	icon: string;
	title: string;
	desc: ReactNode;
	/**
	 * zyra's real declarative `SettingRowControl` shape (`{ toggle?,
	 * select? }`) — `SettingRowComponent` builds the actual `SettingToggle`/
	 * `SelectInput` pair itself, bound to this row's own `valueKey` slice
	 * of the field's `value`/`onChange` (wired through by
	 * `SettingRowFieldComponent`, zyra's `type: 'setting-row'` field type
	 * — see this file's own docblock). No bespoke API-call component
	 * needed per row: persisting a row's toggle/select goes through
	 * InputRenderer's normal auto-save path, the same as every other
	 * field on this tab.
	 */
	control: {
		toggle: boolean;
		// zyra's own SettingRowControl.toggleStatusLabel — a real on/off
		// pair for each row's own toggle (SettingToggle's own
		// `statusLabel`), same shape email_on_crawler_alerts's own master
		// switch already uses via MultiCheckboxInput's `toggleStatusLabel`.
		toggleStatusLabel?: { on: string; off: string };
		select?: { key: string; label: string; options: { label: string; value: string }[] };
	};
}

/**
 * Same 5 alert types the old `type: 'expandable-panel'` field listed —
 * copy/values ported verbatim. `traffic_drop` alone has no `select` (its
 * old `formFields` entry was always just a `type: 'notice'` linking to
 * Scanning → AI Visibility rather than a functional dropdown; that link
 * now lives in this row's own `desc`).
 */
const CRAWLER_ALERT_ROWS: CrawlerAlertRow[] = [
	{
		valueKey: 'blocked',
		icon: 'lock red',
		title: __('AI crawler blocked', 'vulopilot'),
		desc: __(
			'When a known AI bot keeps visiting a page your robots.txt disallows specifically for it.',
			'vulopilot'
		),
		control: {
			toggle: true,
			toggleStatusLabel: TOGGLE_STATUS_LABEL,
			select: { key: 'frequency', label: __('Notify if', 'vulopilot'), options: FREQUENCY_OPTIONS },
		},
	},
	{
		valueKey: 'access_limited',
		// Was `icon: 'warning'` in the old expandable-panel item — not a
		// real adminfont icon name (confirmed against fonts.scss); 'error'
		// is the closest real one.
		icon: 'error red',
		title: __('AI crawler access limited', 'vulopilot'),
		desc: __(
			"When a bot's recent requests are disproportionately hitting missing (404) pages on your site.",
			'vulopilot'
		),
		control: {
			toggle: true,
			toggleStatusLabel: TOGGLE_STATUS_LABEL,
			select: { key: 'frequency', label: __('Notify if', 'vulopilot'), options: FREQUENCY_OPTIONS },
		},
	},
	{
		valueKey: 'traffic_drop',
		icon: 'bar-chart blue',
		title: __('AI crawler traffic drop', 'vulopilot'),
		// `createElement()` (not JSX) — this is a plain `.ts` file, not
		// `.tsx`, same as every other settings-schema file in this folder;
		// TypeScript's default @babel/preset-typescript config (this
		// workspace's own @wordpress/babel-preset-default, no
		// `isTSX`/`allExtensions` override) only parses JSX inside `.tsx`.
		desc: createElement(
			Fragment,
			null,
			__(
				'When visits from AI crawlers drop by a certain percentage vs. their trailing 7-day average.',
				'vulopilot'
			),
			' ',
			createElement(
				'a',
				{ href: '?page=vulopilot#&tab=settings&subtab=ai-visibility' },
				__('Set the % threshold under Scanning → AI Visibility.', 'vulopilot')
			)
		),
		control: { toggle: true, toggleStatusLabel: TOGGLE_STATUS_LABEL },
	},
	{
		valueKey: 'inactive',
		icon: 'clock lime',
		title: __('AI crawler inactive', 'vulopilot'),
		desc: __(
			'When a bot that has visited before goes quiet — only re-notifies if it comes back and then goes quiet again.',
			'vulopilot'
		),
		control: {
			toggle: true,
			toggleStatusLabel: TOGGLE_STATUS_LABEL,
			select: {
				key: 'days_threshold',
				label: __('Notify if inactive for', 'vulopilot'),
				options: DAYS_OPTIONS,
			},
		},
	},
	{
		valueKey: 'new_bot',
		icon: 'plus green',
		title: __('New AI crawler detected', 'vulopilot'),
		desc: __('When a bot starts visiting your website for the first time.', 'vulopilot'),
		control: {
			toggle: true,
			toggleStatusLabel: TOGGLE_STATUS_LABEL,
			select: { key: 'frequency', label: __('Notify if', 'vulopilot'), options: FREQUENCY_OPTIONS },
		},
	},
];

/**
 * Settings → Notifications — one flat tab (per direct instruction; merges
 * what used to be two separate inner tabs, `Notifications/EmailSettings.ts`
 * and `Notifications/Alerts.ts`, each its own file inside a
 * `Notifications/` folder — that folder shape is what gave this tab its own
 * inner "Email Settings"/"Alerts Settings" sub-nav in the first place,
 * templateService.ts's own `importAll()` turning any folder of files into a
 * `type: 'folder'` node with its own child tab bar; a single flat file here
 * instead becomes a `type: 'file'` node with none, the same shape
 * `Automation.ts`/`Reports.ts`/`DeveloperTools.ts`/`Modules.ts` already use
 * for a single-page top-level tab). `Notifications/FolderPriority.ts`
 * (the folder's own top-level ordering — `priority: 6`, "Get Started 1,
 * Site Identity 2, Scanning 3, Automation 4, Reports 5, Notifications 6,
 * Developer Tools 7, Modules 8") is gone too; that same `priority: 6` is
 * set directly on this file below so the top-level tab order doesn't shift.
 *
 * Real backend, unchanged either way — only where the UI for it lives
 * changed:
 *
 * Email fields (`notification_email`/`email_from_name`/`email_from_address`)
 * — same real setting keys the old `EmailSettings.ts` used.
 *
 * "AI Crawler Alerts": vulopilot-pro's CrawlerAlertMonitor runs 5 checks
 * once daily (CrawlerAlertScheduler) — see that class's own docblock for
 * the full detail on each. Every row below toggles a real,
 * independently-gated setting that class reads; nothing here is
 * decorative. "Notify me about" is a real zyra `type: 'setting-row'` field
 * (`components-settingrowcomponent--with-select-and-toggle`) — one flat row
 * per alert type, each with its own frequency/duration select and on/off
 * toggle both visible at once, no expand/collapse step. `rows` is this
 * file's own `CRAWLER_ALERT_ROWS` above, using zyra's declarative
 * `control: { toggle, select }` shape (SettingRowComponent's own
 * `resolveControl()` builds the real `SettingToggle`/`SelectInput` pair and
 * reads/writes each row's own `valueKey` slice of this field's
 * `value`/`onChange` itself) — so persisting a row goes through
 * InputRenderer's normal auto-save path, same as every other field here.
 * That field's own value shape is one nested object keyed by alert type
 * (`{ [valueKey]: { enable, frequency? | days_threshold? } }`,
 * `crawler_alerts` in Utill::VULOPILOT_SETTINGS_DEFAULTS), not N flat
 * settings.
 *
 * One shared "Notification channels" control applies to every alert
 * section below (AI Crawler/Security/Visibility/Critical issue alerts) —
 * shown once, rather than repeating an identical multi-checkbox per
 * section (per direct instruction; replaces four former per-section
 * `*_alert_channels` settings with one `alert_channels` setting read by
 * every alert sender — CrawlerAlertMonitor/AlertDispatcher/
 * VisibilityMonitor/BrandMonitor/KnowledgeGraphHealthMonitor/
 * ScanPersistenceListener).
 *
 * "Send Test Alert" + the persisted "Last test alert sent on ..." line
 * needs live state (an API call, and a value that must survive a page
 * refresh) InputRenderer's own declarative fields can't provide, so it's a
 * hand-built component (CrawlerAlertTestPanel.tsx) rather than another
 * field type — set as this tab's own top-level `settingAction`.
 * `settingAction` is NavigatorComponent.tsx's own per-tab header action
 * slot: its `renderSettingHeaderInfo()` renders one `<SectionComponent
 * rightContent={activeFile.settingAction} />` above every tab's own fields,
 * using this exact settings object's `settingTitle ?? headerTitle`/
 * `settingSubTitle ?? headerDescription` as that header's own title/desc —
 * so this sits right next to this tab's own header, above every field
 * below (including the "Email Settings" fields this tab now also has).
 */
export default {
	id: 'notifications',
	priority: 6,
	headerTitle: __('Notifications', 'vulopilot'),
	headerDescription: __(
		'Configure where VuloPilot sends notifications, and what it should alert you about.',
		'vulopilot'
	),
	headerIcon: 'mail',
	submitUrl: 'settings',
	hideSettingHeader: true,
	groupBySections: true,
	settingAction: createElement(CrawlerAlertTestPanel),
	modal: [
		{
			key: 'email-settings-section',
			type: 'section',
			icon: 'mail',
			title: __('Email Settings', 'vulopilot'),
			desc: __(
				'The email address where you want to receive VuloPilot notifications, and the sender details they\'re sent from.',
				'vulopilot'
			),
			// "Send Test Email" — same real zyra `field.rightContent` slot
			// (SectionComponent's own `right-content`) CrawlerAlertTestPanel.tsx
			// used to sit in before it got promoted to this whole tab's
			// `settingAction` — reused here instead for a section-scoped
			// action, since that page-level slot is now this tab's own
			// "Send Test Alert" button (per direct instruction: same
			// hand-built button + persisted "Last test … sent on …" design
			// as SendTestReportButton.tsx, replacing the old declarative
			// `type: 'button'` field below).
			rightContent: createElement(SendTestEmailButton),
		},
		{
			key: 'notification_email',
			type: 'email',
			size: 30,
			label: __('Notification email', 'vulopilot'),
			placeholder: __('noreply@yourstore.com', 'vulopilot'),
			settingDescription: __(
				'Where critical findings and automation failures are sent. Falls back to the site admin email when left blank.',
				'vulopilot'
			),
		},
		{
			key: 'email_from_name',
			type: 'text',
			size: 30,
			label: __('Sender name', 'vulopilot'),
			settingDescription: __(
				'The name VuloPilot\'s own emails (notifications, automation actions, scheduled reports) are sent from. Defaults to your site name.',
				'vulopilot'
			),
		},
		{
			key: 'email_from_address',
			type: 'email',
			label: __('Sender email', 'vulopilot'),
			size: 30,
			placeholder: __('noreply@yourstore.com', 'vulopilot'),
			settingDescription: __(
				'The address VuloPilot\'s own emails are sent from. Leave blank to use your site\'s default mail sender.',
				'vulopilot'
			),
		},
		{
			// Same real `type: 'notice'` field Scanning/SeoContent.ts's own
			// sitemap tips already use.
			key: 'send-test-email-notice',
			type: 'notice',
			noticeType: 'info',
			title: __('Why send a test email?', 'vulopilot'),
			message: __(
				'This helps you confirm that notifications are delivered to the right inbox and that your email settings are correct.',
				'vulopilot'
			),
		},
		// One shared "Notification channels" control for all four alert
		// sections below — see this file's own docblock.
		{
			key: 'notification-settings-section',
			type: 'section',
			icon: 'mail',
			title: __('Notification channels', 'vulopilot'),
			desc: __(
				'Select how you want to receive notifications for all alert types below.',
				'vulopilot'
			),
		},
		{
			key: 'alert_channels',
			type: 'checkbox',
			options: [
				{ key: 'email', value: 'email', label: __('Email', 'vulopilot') },
				{ key: 'dashboard', value: 'dashboard', label: __('In-dashboard', 'vulopilot') },
			],
		},
		{
			key: 'alert-channels-notice',
			type: 'notice',
			noticeType: 'info',
			label: '',
			message: __(
				'Applies to every alert type below. Mobile push notifications aren\'t available yet — Email and In-dashboard are the two real delivery channels today.',
				'vulopilot'
			),
		},
		{
			key: 'general_settings',
			type: 'section',
			icon: 'setting',
			title: __('AI Crawler Alerts', 'vulopilot'),
			desc: __(
				'Get notified when AI crawlers are blocked, limited, or stop visiting your website.',
				'vulopilot'
			),
		},
		{
			label: __('Notify me about', 'vulopilot'),
			row: false,
			key: 'crawler_alerts',
			type: 'setting-row',
			rows: CRAWLER_ALERT_ROWS,
		},

		{
			key: 'general_settings',
			type: 'section',
			icon: 'setting',
			title: __('Security Alerts', 'vulopilot'),
			desc: __(
				'Get notified about security risks and suspicious activity on your website.',
				'vulopilot'
			),
		},
		{
			label: __('Notify me about', 'vulopilot'),
			key: 'security_alert_types',
			row: false,
			type: 'setting-row',
			rows: [
				{
					valueKey: 'vulnerabilities',
					icon: 'security blue',
					title: __('Security vulnerabilities', 'vulopilot'),
					desc: __(
						'Critical WordPress core, theme, or plugin vulnerabilities.',
						'vulopilot'
					),
					control: { checkbox: true },
				},
				{
					valueKey: 'malware',
					icon: 'error red',
					title: __('Malware detected', 'vulopilot'),
					desc: __(
						'When malware, suspicious files, or malicious code is detected.',
						'vulopilot'
					),
					control: { checkbox: true },
				},
				{
					valueKey: 'failed_login',
					icon: 'lock lime',
					title: __('Failed login attempts', 'vulopilot'),
					desc: __(
						'Multiple failed login attempts or brute-force login activity.',
						'vulopilot'
					),
					control: { checkbox: true },
				},
				{
					valueKey: 'new_user',
					icon: 'profile yellow',
					title: __('New user created', 'vulopilot'),
					desc: __(
						'When a new administrator or user account is created.',
						'vulopilot'
					),
					control: { checkbox: true },
				},
				{
					valueKey: 'file_changes',
					icon: 'file-submission pink',
					title: __('File changes', 'vulopilot'),
					desc: __(
						'When core, plugin, or theme files are modified.',
						'vulopilot'
					),
					control: { checkbox: true },
				},
				{
					valueKey: 'ssl_certificate',
					icon: 'web-page-website red',
					title: __('SSL / Certificate issues', 'vulopilot'),
					desc: __(
						'When your SSL certificate is about to expire or has issues.',
						'vulopilot'
					),
					control: { checkbox: true },
				},
			],
		},
		{
			key: 'general_settings',
			type: 'section',
			icon: 'bar-chart',
			title: __('Visibility Alerts', 'vulopilot'),
			desc: __(
				'Get notified when your visibility scores drop so you can take action early.',
				'vulopilot'
			),
		},

		{
			// zyra's real `type: 'setting-row'` field — one flat row per
			// score type, each with its own threshold select and on/off
			// toggle both visible at once, no expand/collapse step — same
			// field type/`row: false` shape `crawler_alerts` above uses
			// (without `row: false` zyra adds a `.row` class to the field
			// wrapper that overlaps this row's own title/desc with its
			// select — confirmed live: two-line titles like "AI visibility
			// score drop" rendered on top of "Notify if score drops
			// by"/the select).
			label: __('Notify me when', 'vulopilot'),
			row: false,
			key: 'visibility_alerts',
			type: 'setting-row',
			rows: [
				{
					valueKey: 'geo',
					icon: 'ai green',
					title: __('AI visibility score drop', 'vulopilot'),
					desc: __(
						'When your overall AI visibility score drops by the selected percentage.',
						'vulopilot'
					),
					control: {
						toggle: true,
						toggleStatusLabel: TOGGLE_STATUS_LABEL,
						select: {
							key: 'threshold',
							label: __('Notify me if score drops by', 'vulopilot'),
							options: THRESHOLD_OPTIONS,
						},
					},
				},
				{
					valueKey: 'brand',
					icon: 'announcement red',
					title: __('Brand score drop', 'vulopilot'),
					desc: __(
						'When your brand visibility score drops by the selected percentage.',
						'vulopilot'
					),
					control: {
						toggle: true,
						toggleStatusLabel: TOGGLE_STATUS_LABEL,
						select: {
							key: 'threshold',
							label: __('Notify me if score drops by', 'vulopilot'),
							options: THRESHOLD_OPTIONS,
						},
					},
				},
				{
					valueKey: 'kg',
					icon: 'intelligence yellow',
					title: __('Knowledge Graph score drop', 'vulopilot'),
					desc: __(
						'When your Knowledge Graph score drops by the selected percentage.',
						'vulopilot'
					),
					control: {
						toggle: true,
						toggleStatusLabel: TOGGLE_STATUS_LABEL,
						select: {
							key: 'threshold',
							label: __('Notify me if score drops by', 'vulopilot'),
							options: THRESHOLD_OPTIONS,
						},
					},
				},
			],
		},
		{
			key: 'general_settings',
			type: 'section',
			icon: 'error',
			title: __('Critical issue alerts', 'vulopilot'),
			desc: __(
				'Get notified immediately when critical issues are found on your website.',
				'vulopilot'
			),
		},
		{
			// zyra's real `type: 'setting-row'` field — see this file's own
			// docblock for why `control: { checkbox: true }` fits this flat
			// multi-select array field, same shape `security_alert_types`
			// above already uses.
			label: __('Notify me about', 'vulopilot'),
			key: 'critical_alert_types',
			row: false,
			type: 'setting-row',
			rows: [
				{
					valueKey: 'security',
					icon: 'security red',
					title: __('Security vulnerabilities', 'vulopilot'),
					desc: __(
						'High-risk security vulnerabilities and malware infections.',
						'vulopilot'
					),
					control: { checkbox: true },
				},
				{
					valueKey: 'availability',
					icon: 'error red',
					title: __('Website down', 'vulopilot'),
					desc: __(
						'Your website is not accessible or is returning errors.',
						'vulopilot'
					),
					control: { checkbox: true },
				},
				{
					valueKey: 'performance',
					icon: 'bar-chart orange',
					title: __('Critical performance issues', 'vulopilot'),
					desc: __(
						'Severe performance problems affecting your site speed or Core Web Vitals.',
						'vulopilot'
					),
					control: { checkbox: true },
				},
				{
					valueKey: 'seo',
					icon: 'search blue',
					title: __('SEO indexing problems', 'vulopilot'),
					desc: __(
						'Pages blocked from indexing or major crawling issues.',
						'vulopilot'
					),
					control: { checkbox: true },
				},
				{
					valueKey: 'other',
					icon: 'database gray',
					title: __('Data or functionality issues', 'vulopilot'),
					desc: __(
						'Problems affecting important site data or core functionality.',
						'vulopilot'
					),
					control: { checkbox: true },
				},
			],
		},
	],
};
