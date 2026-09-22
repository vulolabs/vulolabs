/* global appLocalizer */
import { __ } from '@wordpress/i18n';
import { getApiLink, sendApiResponse, useModules } from '@zyra/core';
import {
	ExpandablePanelInput,
	SelectInput,
	SectionComponent,
	SettingRowComponent
} from '@zyra/inputs';
import { FormGroupComponent, FormGroupWrapperComponent, NoticeComponent, NoticeManager } from '@zyra/components';
import { useSetting } from '../../../contexts/SettingContext';

const STATUS_LABELS = { active: __('Active', 'vulopilot'), inactive: __('Inactive', 'vulopilot') };

interface RowField {
	key: string;
	type: string;
	label: string;
	settingDescription?: string;
	placeholder?: string;
	minNumber?: number;
	maxNumber?: number;
	look?: string;
	options?: { key?: string; label: string; value: string }[];
}

interface Row {
	id: string;
	flatKey: string;
	icon: string;
	label: string;
	desc: string;
	/** Gates on vulopilot-pro's Security Monitoring module. */
	pro?: boolean;
	fields?: RowField[];
}

const SCAN_ROWS: Row[] = [
	{
		id: 'weak-passwords',
		flatKey: 'enable_weak_password_scanner',
		icon: 'lock blue',
		label: __('Weak password checks', 'vulopilot'),
		desc: __(
			'Find users with weak passwords and get suggestions to make them stronger.',
			'vulopilot'
		),
	},
	{
		id: 'wordpress-exposure',
		flatKey: 'enable_basic_vulnerabilities_scanner',
		icon: 'wordpress gray',
		label: __('WordPress exposure', 'vulopilot'),
		desc: __(
			'Check common WordPress exposure issues that can be exploited by attackers, like an exposed version number or a default database table prefix.',
			'vulopilot'
		),
	},
	{
		id: 'core-files',
		flatKey: 'enable_core_file_integrity_scanner',
		icon: 'document orange',
		label: __('Core file changes', 'vulopilot'),
		desc: __(
			'Detect unauthorized changes in WordPress core files.',
			'vulopilot'
		),
	},
	{
		id: 'malware',
		flatKey: 'enable_malware_scanner',
		icon: 'error red',
		label: __('Malware checks', 'vulopilot'),
		desc: __(
			'Scan your website for malware, suspicious code, and harmful scripts.',
			'vulopilot'
		),
	},
	{
		id: 'user-exposure',
		flatKey: 'enable_rest_api_scanner',
		icon: 'person pink',
		label: __('User exposure', 'vulopilot'),
		// The mockup's own copy here ("risky roles or unnecessary access")
		// doesn't describe any real scanner this codebase has — the closest
		// real check is RestApiScanner's anonymous `GET /wp/v2/users`
		// probe, which is about username enumeration, not role/capability
		// auditing. Worded to what it actually does rather than the
		// mockup's literal text.
		desc: __(
			'Check whether your REST API publicly exposes usernames to unauthenticated visitors — a common first step in brute-force login attacks.',
			'vulopilot'
		),
		pro: true,
	},
];

const PROTECTION_ROWS: Row[] = [
	{
		id: 'login-protection',
		flatKey: 'enable_login_protection',
		icon: 'vpn-key blue',
		label: __('Block repeated failed login attempts', 'vulopilot'),
		desc: __(
			'Real brute-force protection — an IP that fails to log in too many times within the window below is blocked from trying again until it passes.',
			'vulopilot'
		),
		fields: [
			{
				key: 'login_max_attempts',
				type: 'number',
				label: __('Failed attempts before lockout', 'vulopilot'),
				minNumber: 1,
				maxNumber: 20,
				settingDescription: __(
					'How many failed login attempts from the same IP are allowed before it\'s blocked.',
					'vulopilot'
				),
			},
			{
				key: 'login_lockout_minutes',
				type: 'number',
				label: __('Lockout window (minutes)', 'vulopilot'),
				minNumber: 1,
				maxNumber: 1440,
				settingDescription: __(
					'How long a blocked IP has to wait — and how far back failed attempts are counted from.',
					'vulopilot'
				),
			},
		],
	},
	{
		id: 'firewall',
		flatKey: 'enable_firewall',
		icon: 'blocks yellow',
		label: __('Log requests matching known attack patterns', 'vulopilot'),
		desc: __(
			'Checks every request\'s URL against known SQL-injection, path-traversal, and direct-PHP-execution patterns and logs any match — always safe, never blocks anyone on its own.',
			'vulopilot'
		),
		fields: [
			{
				key: 'enable_firewall_blocking',
				type: 'checkbox',
				look: 'toggle',
				label: __('Enable active blocking', 'vulopilot'),
				settingDescription: __(
					'Turns the logging above into real blocking — a matched request gets a 403 and is stopped immediately instead of only being recorded. Off by default: review the log for a while first to make sure nothing legitimate is being flagged.',
					'vulopilot'
				),
				options: [{ key: 'enable_firewall_blocking', label: '', value: 'enable_firewall_blocking' }],
			},
		],
	},
];

const MONITORING_ROWS: Row[] = [
	{
		id: 'alerts',
		flatKey: 'security_alerts_enabled',
		icon: 'notification green',
		label: __('Email me on new security alerts', 'vulopilot'),
		desc: __(
			'Send an email when a scan detects a new security finding at or above the minimum severity below. Already-alerted, still-open findings aren\'t re-sent on every scan.',
			'vulopilot'
		),
		pro: true,
		fields: [
			{
				key: 'security_alert_email',
				type: 'email',
				label: __('Security alert email', 'vulopilot'),
				placeholder: __('noreply@yourstore.com', 'vulopilot'),
				settingDescription: __(
					'Where security alerts are sent. Falls back to the site admin email when left blank.',
					'vulopilot'
				),
			},
			{
				key: 'security_alert_min_severity',
				type: 'select',
				label: __('Minimum alert severity', 'vulopilot'),
				settingDescription: __(
					'Only findings at or above this severity trigger a security alert email.',
					'vulopilot'
				),
				options: [
					{ label: __('Critical only', 'vulopilot'), value: 'critical' },
					{ label: __('High and above', 'vulopilot'), value: 'high' },
					{ label: __('Medium and above', 'vulopilot'), value: 'medium' },
					{ label: __('Low and above', 'vulopilot'), value: 'low' },
				],
			},
		],
	},
	{
		id: 'integrity-monitoring',
		flatKey: 'enable_integrity_monitoring',
		icon: 'view-files lime',
		label: __('Monitor plugin/theme files for changes', 'vulopilot'),
		desc: __(
			'Maintains a local baseline of every plugin/theme PHP file and flags any added, modified, or removed since the last scan.',
			'vulopilot'
		),
		pro: true,
		fields: [
			{
				key: 'integrity_monitoring_max_files',
				type: 'number',
				label: __('Integrity monitoring file limit', 'vulopilot'),
				minNumber: 100,
				maxNumber: 20000,
				settingDescription: __(
					'Maximum combined number of plugin/theme PHP files checked per scan, to bound the cost of hashing on large sites.',
					'vulopilot'
				),
			},
		],
	},
];

const ALL_ROWS = [...SCAN_ROWS, ...PROTECTION_ROWS, ...MONITORING_ROWS];

const isChecked = (value: unknown): boolean => Array.isArray(value) && value.length > 0;


/**
 * Settings → Scanning → Security.
 *
 * Full real replacement for InputRenderer on this tab (Security.ts's own
 * `PanelComponent`) — every field it renders is a genuinely real,
 * already-working setting with its own real PHP consumer; this is a pure
 * UI reshape into the mockup's card style, not new backend work. Three
 * groups:
 *
 * - "Security scans" — a real zyra `SettingRowComponent` checkbox list
 *   (per direct instruction, "make this like Notifications → Security
 *   Alerts' own checkbox rows, not Active/Inactive + a "..." menu" — see
 *   `buildScanRows()`'s own docblock below), not `ExpandablePanelInput`.
 *   None of these 5 rows has any nested/expandable settings of its own,
 *   so a plain checkbox per row is a strict simplification, not a loss
 *   of any real control.
 * - "Protection" — login protection and the request firewall, still each
 *   an `ExpandablePanelInput` card whose own nested settings (lockout
 *   threshold/window, active blocking) expand via the card's own real
 *   chevron/"Settings" control, instead of always-visible flat fields.
 * - "Security Monitoring" (Pro) — alerts and file-integrity monitoring,
 *   same card treatment; `security_scan_frequency` is left as a plain
 *   select (hand-rendered below, not a card) since it isn't boolean-shaped
 *   — there's no separate on/off flag for it, only the frequency value
 *   itself (`'disabled'` already means off), so forcing it into a card's
 *   own `enable` toggle would either duplicate that meaning or invent a
 *   setting that doesn't exist.
 *
 * Unlike `ExpandablePanelInput`'s/`SettingRowComponent`'s own usual
 * declarative usage (one field key → one nested settings object or one
 * shared array), every row on this tab is wired by hand (`useSetting()`
 * directly via `handleChange`) because these are independent flat
 * settings, not one nested object or array — see Security.ts's own
 * docblock for why they aren't migrated into a nested shape.
 *
 * Every Pro row (`pro: true`, currently just "User exposure") is locked
 * by hand when vulopilot-pro's Security Monitoring module isn't active —
 * its checkbox renders `disabled` (`buildScanRows()`) and `handleChange`
 * silently ignores a toggle/edit on that row in that case rather than
 * writing a setting nothing will ever read — neither `ExpandablePanelInput`
 * nor `SettingRowComponent` has a per-row Pro gate of its own the way
 * InputRenderer's top-level fields do.
 */
const SecurityPanel = () => {
	const { setting, updateSetting } = useSetting();
	const { modules } = useModules();
	const hasSecurityMonitoring = modules.includes('security-monitoring');

	const buildMethods = (rows: Row[]) =>
		rows.map((row) => ({
			id: row.id,
			icon: row.icon,
			label: row.label,
			desc: row.pro && !hasSecurityMonitoring ? `${row.desc}` : row.desc,
			settingDescription: '',
			disableBtn: true,
			statusLabels: STATUS_LABELS,
			formFields: (row.fields ?? []).map((field) => ({
				key: field.key,
				type: field.type,
				look: field.look,
				label: field.label,
				settingDescription: field.settingDescription,
				placeholder: field.placeholder,
				minNumber: field.minNumber,
				maxNumber: field.maxNumber,
				options: field.options,
			})),
		}));

	// "Security scans" own rows — per direct instruction ("shift the active
	// deactive to checkbox use our zyra components"), styled like
	// Notifications/SecurityAlerts.ts's own "Notify me about" list
	// (zyra's real `SettingRowComponent`, `control: { checkbox: true }`)
	// instead of `ExpandablePanelInput`'s Active/Inactive badge + "..."
	// menu. Unlike that list — one flat array setting, each row a member
	// of it — these 5 rows are independent flat booleans
	// (`enable_weak_password_scanner` etc., same shape `isChecked()`
	// already reads), so `resolveControl()`'s own array-membership
	// checkbox logic doesn't apply here; passing a real `<input>` element
	// as `control` bypasses that resolution entirely (SettingRowComponent's
	// own `resolveControl()` returns a valid React element as-is), reusing
	// the exact same `setting-row-checkbox` markup/CSS class that built-in
	// path renders, wired to `handleChange` (below) instead — same
	// save/patch/Pro-gating logic every other row on this tab already
	// goes through, just a different control element. Protection/Security
	// Monitoring stay `ExpandablePanelInput` cards — unlike Security
	// scans, every one of those rows has its own real expandable
	// `fields` (lockout thresholds, active blocking, alert email/severity,
	// file limit), which a plain checkbox list can't show.
	const buildScanRows = () =>
		SCAN_ROWS.map((row) => {
			const locked = Boolean(row.pro) && !hasSecurityMonitoring;
			return {
				valueKey: row.id,
				icon: row.icon,
				title: row.label,
				desc: row.desc,
				control: (
					<input
						type="checkbox"
						className="setting-row-checkbox"
						checked={isChecked(setting[row.flatKey])}
						disabled={locked}
						onChange={(e) => handleChange({ [row.id]: { enable: e.target.checked } })}
					/>
				),
			};
		});

	const buildValue = (rows: Row[]) =>
		Object.fromEntries(
			rows.map((row) => [
				row.id,
				{
					enable: isChecked(setting[row.flatKey]),
					...Object.fromEntries((row.fields ?? []).map((f) => [f.key, setting[f.key]])),
				},
			])
		);

	const handleChange = (next: Record<string, Record<string, unknown>>) => {
		const patch: Record<string, unknown> = {};

		ALL_ROWS.forEach((row) => {
			if (!(row.id in next) || (row.pro && !hasSecurityMonitoring)) {
				return;
			}

			const wasOn = isChecked(setting[row.flatKey]);
			const nowOn = Boolean(next[row.id]?.enable);
			if (nowOn !== wasOn) {
				patch[row.flatKey] = nowOn ? [row.flatKey] : [];
			}

			(row.fields ?? []).forEach((f) => {
				const nextVal = next[row.id]?.[f.key];
				if (nextVal !== undefined && nextVal !== setting[f.key]) {
					patch[f.key] = nextVal;
				}
			});
		});

		if (Object.keys(patch).length === 0) {
			return;
		}

		Object.entries(patch).forEach(([key, value]) => updateSetting(key, value));
		sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'settings'), {
			setting: patch,
			settingName: 'security-scanning',
		}).then((response) => {
			NoticeManager.add({
				uniqueKey: 'vulopilot-security-panel-saved',
				type: response ? 'success' : 'error',
				position: 'float',
				message: response
					? __('Settings saved.', 'vulopilot')
					: __('Could not save settings. Please try again.', 'vulopilot'),
			});
		});
	};

	return (
		<>
			<div className="settings-section-group">
				<div className="settings-left-section">
					<SectionComponent
						icon="security"
						title={__('Security scans', 'vulopilot')}
						desc={__('Block brute-force logins and log known attack patterns.', 'vulopilot')}
					/>
				</div>
				<div className="settings-right-section">
					<FormGroupWrapperComponent>
						<FormGroupComponent>
							<SettingRowComponent rows={buildScanRows()} />
						</FormGroupComponent>
						<FormGroupComponent className="full-width" label="">
							<NoticeComponent
								displayPosition="inline-notice"
								type="info"
								title={__('Why these scans matter', 'vulopilot')}
								message={__(
									'Regular security scans help you protect your website, your users, and your business from threats and attacks.',
									'vulopilot'
								)}
							/>
						</FormGroupComponent>
					</FormGroupWrapperComponent>
				</div>
			</div>
			{/*
			 * `.settings-section-group` > `.settings-left-section` (the
			 * section header) + `.settings-right-section` (a nested
			 * `FormGroupWrapperComponent` holding that group's own fields)
			 * — the exact same markup/classes InputRenderer.tsx's own
			 * `renderForm()` generates automatically when grouping a
			 * declarative `modal` array by its `type: 'section'` fields
			 * (`groupBySections`). This tab is hand-built rather than
			 * InputRenderer-driven (see this file's own docblock — every
			 * "section" here wraps a real `ExpandablePanelInput` wired to
			 * live handlers, not a flat FIELD_REGISTRY field), so it
			 * doesn't get that grouping for free; replicated by hand
			 * instead of inventing new markup, so a hand-built tab's own
			 * section cards render identically to a declarative one's
			 * (e.g. General.ts).
			 */}
			<div className="settings-section-group">
				<div className="settings-left-section">
					<SectionComponent
						icon="vpn-key"
						title={__('Protection', 'vulopilot')}
						desc={__('Block brute-force logins and log known attack patterns.', 'vulopilot')}
					/>
				</div>
				<div className="settings-right-section">
				<FormGroupWrapperComponent>
					<FormGroupComponent>
						<ExpandablePanelInput
							name="security_protection_cards"
							methods={buildMethods(PROTECTION_ROWS)}
							value={buildValue(PROTECTION_ROWS)}
							onChange={handleChange}
							canAccess
						/>
					</FormGroupComponent>
				</FormGroupWrapperComponent>
				</div>
			</div>

			<div className="settings-section-group">
				<div className="settings-left-section">
					<SectionComponent
						icon="view-files"
						title={__('Security Monitoring', 'vulopilot')}
						desc={__('Ongoing monitoring beyond a single scan run.', 'vulopilot')}
					/>
				</div>
				<div className="settings-right-section">
					<FormGroupWrapperComponent>
						<FormGroupComponent
							row
							label={__('Scheduled security monitoring', 'vulopilot')}
							desc={__(
								'Runs only the security-category scanners on this cadence, independent of the general Scan frequency setting under General.',
								'vulopilot'
							)}
						>
							<SelectInput
								value={String(setting.security_scan_frequency ?? 'daily')}
								size={15}
								disabled={!hasSecurityMonitoring}
								onChange={(value) => {
									if (!hasSecurityMonitoring) {
										return;
									}
									const next = value as string;
									updateSetting('security_scan_frequency', next);
									sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'settings'), {
										setting: { security_scan_frequency: next },
										settingName: 'security-scanning',
									}).then((response) => {
										NoticeManager.add({
											uniqueKey: 'vulopilot-security-panel-saved',
											type: response ? 'success' : 'error',
											position: 'float',
											message: response
												? __('Settings saved.', 'vulopilot')
												: __('Could not save settings. Please try again.', 'vulopilot'),
										});
									});
								}}
								options={[
									{ label: __('Off', 'vulopilot'), value: 'disabled' },
									{ label: __('Hourly', 'vulopilot'), value: 'hourly' },
									{ label: __('Daily', 'vulopilot'), value: 'daily' },
									{ label: __('Weekly', 'vulopilot'), value: 'weekly' },
								]}
							/>
						</FormGroupComponent>
						<FormGroupComponent label={__('Security Monitoring', 'vulopilot')}>
							<ExpandablePanelInput
								name="security_monitoring_cards"
								methods={buildMethods(MONITORING_ROWS)}
								value={buildValue(MONITORING_ROWS)}
								onChange={handleChange}
								canAccess
							/>
						</FormGroupComponent>
					</FormGroupWrapperComponent>
				</div>
			</div>
		</>
	);
};

export default SecurityPanel;
