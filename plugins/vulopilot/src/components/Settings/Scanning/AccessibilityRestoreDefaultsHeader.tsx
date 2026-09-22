/* global appLocalizer */
import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { NoticeManager } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { useSetting } from '../../../contexts/SettingContext';

/**
 * Settings → Scanning → Accessibility's own "Restore Defaults" button.
 *
 * Unlike AiVisibilityScansHeader.tsx's own scoped
 * `POST /settings/reset-ai-visibility-scans` route, this tab's 4 real
 * fields are all plain flat settings (not one nested object), so no new
 * REST route is needed — this just saves the same real default values
 * Utill::VULOPILOT_SETTINGS_DEFAULTS already declares for them, through
 * the exact same `{ setting, settingName }` shape InputRenderer's own
 * auto-save already POSTs to `settings` (this class's own docblock), then
 * calls `updateSetting()` for each so the fields below reflect the
 * restored values immediately, without a page reload.
 */
const DEFAULTS: Record<string, unknown> = {
	enable_accessibility_scanning: ['enable_accessibility_scanning'],
	enable_wcag_scanner: ['enable_wcag_scanner'],
	accessibility_audit_frequency: 'daily',
	target_wcag_level: '2.1_aa',
};

const AccessibilityRestoreDefaultsHeader = () => {
	const { updateSetting } = useSetting();
	const [isResetting, setIsResetting] = useState(false);

	const restoreDefaults = () => {
		setIsResetting(true);

		sendApiResponse(
			appLocalizer,
			getApiLink(appLocalizer, 'settings'),
			{ setting: DEFAULTS, settingName: 'accessibility' }
		)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-accessibility-restore-defaults',
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
		<>
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
		</>
	);
};

export default AccessibilityRestoreDefaultsHeader;
