import { createElement } from 'react';
import { __ } from '@wordpress/i18n';
import SendTestReportButton from './SendTestReportButton';

/**
 * Settings → Reports.
 *
 * The whole tab is a Pro feature: both fields carry `proSetting: true`
 * (zyra's InputRenderer then shows its "Pro" tag and, on any click inside
 * the field, opens `ShowProPopup` — the `Popup` Settings.tsx already passes
 * it — while `appLocalizer.khali_dabba` is false), and
 * SendTestReportButton.tsx does the same by hand for the header button,
 * since that isn't a declarative field. With Pro active nothing is locked.
 *
 * `default_report_format`/`default_report_period_days` are real, existing
 * settings (Utill::VULOPILOT_SETTINGS_DEFAULTS) already read by
 * Controllers\Reports::create_item() — this is a restyle of how they're
 * edited, not new settings. Two real changes from the previous plain
 * select/number-input shape:
 *
 * - Format narrows from PDF/CSV/JSON to PDF/CSV/Both, matching the mockup —
 *   `Reports\ReportExporterRegistry` registers csv/json in Free; pdf only
 *   exists once vulopilot-pro's AdvancedReports module registers
 *   `PdfExporter` via the `vulopilot_report_exporter_sources` filter. The
 *   PDF and Both options are `moduleEnabled: 'advanced-reports'` so a free
 *   site sees the real lock/Pro-module badge instead of silently picking a
 *   default that `create_item()` would just fall back to CSV for anyway.
 *   "Both" isn't a real export format `ReportExporterRegistry` registers —
 *   it's a frontend-only value ReportsOverviewHeader.tsx's own "Download"
 *   button reads to decide whether to ask which format each time, rather
 *   than a raw format string ever sent to the server. JSON stays a fully
 *   real, working export format (unchanged, still selectable by name when
 *   generating a report) — just not offered as a *default* choice here,
 *   per the mockup.
 * - Period becomes a real `type: 'choice-toggle'` card row (7/30/90 days,
 *   6/12 months) bound to `default_report_period_days` directly — no
 *   separate free-text field duplicating the same key (zyra's InputRenderer
 *   keys each field's own React list entry AND its setting lookup off the
 *   same `key` string, so two entries can't share one key without a real
 *   render collision). The mockup's "Custom / choose custom range" card
 *   isn't reproduced as a literal date-range picker: `default_report_period_days`
 *   is a single day-count, not two dates, and nothing in this codebase
 *   resolves a saved date range into one — a card with no real control
 *   behind it would be worse than the five real presets on their own.
 *
 * "Report Delivery" points at the real schedule manager instead of
 * duplicating it — Pro's `AdvancedReports\ReportSchedulesRest` (daily/
 * weekly/monthly, recipients, format) already has a full CRUD UI on the
 * Reports page itself (`pages/Reports/ScheduleReportBanner.tsx`/
 * `ReportSchedulesSummary.tsx`), not this Settings tab; rebuilding that
 * here would just be a second, drifting copy of the same real feature.
 *
 * No "Report Branding" section: no real backend for it anywhere in this
 * codebase (no logo/watermark/color setting, nothing `PdfExporter.php`
 * reads) — added only once that's a real, built feature rather than a
 * settings card with nothing behind it.
 */
export default {
	id: 'reports',
	priority: 5,
	headerTitle: __('Reports', 'vulopilot'),
	headerDescription: __(
		'Choose how you want VuloPilot to generate and deliver your reports.',
		'vulopilot'
	),
	headerIcon: 'document',
	submitUrl: 'settings',
	// SendTestReportButton.tsx's own "Send Test Report" button + persisted
	// "Last test report sent on ..." line — moved here (per direct
	// instruction) from a declarative `type: 'button'` field, same real
	// `settingAction` header-action slot CrawlerAlertTestPanel.tsx/
	// SecurityRestoreDefaultsHeader.tsx already use, rather than sitting at
	// the bottom of this tab's own field list.
	settingAction: createElement(SendTestReportButton),
	modal: [
		{
			key: 'default_report_format',
			type: 'choice-toggle',
			variant: 'compact',
			defaultValue: 'pdf',
			proSetting: true,
			label: 'Default report format',
			settingDescription: __(
				'Select the file format VuloPilot will use when you download or schedule reports.',
				'vulopilot'
			),
			desc:  __(
				'You can change the format each time while generating a report.',
				'vulopilot'
			),
			options: [
				{
					key: 'pdf',
					value: 'pdf',
					label: __('PDF', 'vulopilot'),
					badgeColor: 'green', badgeText: __('Recommended', 'vulopilot') ,
					desc: __('Great for sharing and printing.', 'vulopilot'),
					icon: 'pdf blue',
				},
				{
					key: 'csv',
					value: 'csv',
					label: __('CSV', 'vulopilot'),
					desc: __('Best for data analysis in spreadsheets.', 'vulopilot'),
					icon: 'csv green',
				},
				{
					key: 'both',
					value: 'both',
					label: __('Both', 'vulopilot'),
					desc: __('Choose PDF or CSV each time you download.', 'vulopilot'),
					icon: 'document orange',
				},
			],
		},
		{
			key: 'default_report_period_days',
			type: 'choice-toggle',
			defaultValue: '30',
			proSetting: true,
			label: __('Default reporting period', 'vulopilot'),
			settingDescription: __(
				'Choose the time period VuloPilot will use by default when generating reports.',
				'vulopilot'
			),
			desc: __(
				'You can change the period anytime while generating a report.',
				'vulopilot'
			),
			options: [
				{ key: '7', value: '7', label: __('7 days', 'vulopilot'), width: '100%' },
				{ key: '30', value: '30', label: __('30 days', 'vulopilot'), width: '100%' },
				{ key: '90', value: '90', label: __('90 days', 'vulopilot'), width: '100%' },
				{ key: '180', value: '180', label: __('6 months', 'vulopilot'), width: '100%' },
				{ key: '365', value: '365', label: __('12 months', 'vulopilot'), width: '100%' },
			],
		},
	],
};
