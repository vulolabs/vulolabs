/* global appLocalizer */
import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { NoticeManager } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { useSetting } from '../../../contexts/SettingContext';

/**
 * Settings → Scanning → Security's own "Restore Defaults" button — moved
 * out of SecurityPanel.tsx (per direct instruction, same extraction
 * AiVisibilityScansHeader.tsx already got) into Security.ts's own
 * top-level `settingAction` instead of being
 * rendered inline at the top of that panel's own body. `DEFAULTS` moved
 * here with it — it was only ever read by this button's own reset call,
 * nowhere else in SecurityPanel.tsx.
 *
 * Real, scoped reset (`POST /settings`, `settingName: 'security-scanning'`,
 * the full flat `DEFAULTS` object as the patch) — not a UI-only component
 * field, since it needs to persist server-side and refresh SettingContext
 * in place. Same shape every other Restore Defaults header here uses.
 */
const DEFAULTS: Record<string, unknown> = {
	enable_weak_password_scanner: ['enable_weak_password_scanner'],
	enable_basic_vulnerabilities_scanner: ['enable_basic_vulnerabilities_scanner'],
	enable_core_file_integrity_scanner: ['enable_core_file_integrity_scanner'],
	enable_malware_scanner: ['enable_malware_scanner'],
	enable_rest_api_scanner: ['enable_rest_api_scanner'],
	enable_login_protection: ['enable_login_protection'],
	login_max_attempts: 5,
	login_lockout_minutes: 15,
	enable_firewall: ['enable_firewall'],
	enable_firewall_blocking: [],
	security_scan_frequency: 'daily',
	security_alerts_enabled: [],
	security_alert_email: '',
	security_alert_min_severity: 'high',
	enable_integrity_monitoring: ['enable_integrity_monitoring'],
	integrity_monitoring_max_files: 2000,
};

const SecurityRestoreDefaultsHeader = () => {
	const { updateSetting } = useSetting();
	const [isResetting, setIsResetting] = useState(false);

	const restoreDefaults = () => {
		setIsResetting(true);

		sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'settings'), {
			setting: DEFAULTS,
			settingName: 'security-scanning',
		})
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-security-restore-defaults',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('Settings restored to defaults.', 'vulopilot')
						: __('Could not restore defaults. Please try again.', 'vulopilot'),
				});
				if (!response) {
					return;
				}
				Object.entries(DEFAULTS).forEach(([key, value]) => updateSetting(key, value));
			})
			.finally(() => setIsResetting(false));
	};

	return (
		<ButtonInput
			wrapperClass="ai-visibility-restore-defaults"
			buttons={{
				text: isResetting ? __('Restoring…', 'vulopilot') : __('Restore Defaults', 'vulopilot'),
				icon: 'refresh',
				color: 'border-purple',
				disabled: isResetting,
				onClick: restoreDefaults,
			}}
		/>
	);
};

export default SecurityRestoreDefaultsHeader;
