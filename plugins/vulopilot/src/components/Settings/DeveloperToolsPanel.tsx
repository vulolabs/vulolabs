/* global appLocalizer */
import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { FormGroupWrapperComponent, NoticeManager } from '@zyra/components';
import { ButtonInput, ToggleInput } from '@zyra/inputs';
import { useSetting } from '../../contexts/SettingContext';
import CardHeader from '../CardHeader';

/**
 * Hand-built rather than InputRenderer-driven — same escape hatch
 * VuloCloudAiConnectionPanel.tsx/IndexNowPanel.tsx already use (Settings.tsx's
 * GetForm() special-cases `currentTab === 'developer-tools'`).
 *
 * "Keep VuloPilot data after uninstall"/"Anonymous usage data" — moved
 * here from Settings → General per direct instruction (General.ts is now
 * empty). Real `choice-toggle` fields (`vulopilot_settings.
 * keep_data_uninstall`/`anonymous_usage_data`), just rendered by hand via
 * `ToggleInput` + `useSetting()` instead of InputRenderer, same as
 * "Reset VuloPilot" below. Their `desc` text is a single plain sentence
 * here rather than General.ts's own two-line `<br />`-separated HTML —
 * CardHeader's own `desc` slot renders as a plain ReactNode child, not
 * `dangerouslySetInnerHTML` the way InputRenderer's field `desc` is, so an
 * embedded `<br />` string would show up as literal text instead of a line
 * break.
 *
 * "Clear cache" (`POST /settings/clear-cache`, Controllers\Settings::clear_cache())
 * clears every real content cache both this plugin and vulopilot-pro (if
 * active) own — Knowledge Graph's own extracted entities, the Schema
 * Coverage snapshot, the robots.txt bot-group parse, and Pro's own
 * Knowledge Graph recommendations. Deliberately does NOT touch AI
 * rate-limit counters, Pro's security-alert-already-sent dedup marker, or
 * the license status cache — see that controller method's own docblock for
 * why those aren't "stale data" the same way.
 *
 * "Reset VuloPilot" — also moved here from Settings → General per direct
 * instruction, a real action (`POST /settings/reset`) rather than a
 * persisted field.
 */
const DeveloperToolsPanel = () => {
	const [isClearing, setIsClearing] = useState(false);
	const [isResetting, setIsResetting] = useState(false);
	const { setting, updateSetting } = useSetting();

	const keepDataUninstall = (setting.keep_data_uninstall as string) || 'keep_data';
	const anonymousUsageData = (setting.anonymous_usage_data as string) || 'disabled';

	// Moved from Settings → General's own "Basic Preferences" section
	// (General.ts) per direct instruction — same real `vulopilot_settings.
	// keep_data_uninstall`/`anonymous_usage_data` fields, read/written via
	// `useSetting()` + a direct `PATCH /settings` call instead of
	// InputRenderer's own `choice-toggle` field type, since this tab is
	// hand-built (see this file's own top docblock) — same
	// `useSetting()`-inside-a-hand-built-panel shape IndexNowPanel.tsx's own
	// `handlePostTypesChange` already establishes. `keep_data_uninstall`'s
	// modal entry in DeveloperTools.ts is what makes GetForm() (Settings.tsx)
	// seed `setting` with its real stored value in the first place.
	const handleSettingChange = (key: string, value: string) => {
		updateSetting(key, value);
		sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'settings'), {
			setting: { [key]: value },
		}).then((response) => {
			NoticeManager.add({
				uniqueKey: 'vulopilot-developer-tools-saved',
				type: response ? 'success' : 'error',
				position: 'float',
				message: response
					? __('Settings saved.', 'vulopilot')
					: __('Could not save settings. Please try again.', 'vulopilot'),
			});
		});
	};

	const handleClearCache = () => {
		setIsClearing(true);

		sendApiResponse(
			appLocalizer,
			getApiLink(appLocalizer, 'settings/clear-cache'),
			{}
		)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-clear-cache',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('Cache cleared.', 'vulopilot')
						: __(
								'Could not clear the cache. Please try again.',
								'vulopilot'
							),
				});
			})
			.finally(() => setIsClearing(false));
	};

	// Moved from Settings → General's own "Basic Preferences" section
	// (General.ts) per direct instruction — same real `POST /settings/reset`
	// route (Controllers\Settings::reset_settings(), deletes the whole
	// stored settings option, reverting to VULOPILOT_SETTINGS_DEFAULTS;
	// findings/scan history/reports live in their own tables, untouched by
	// this), just called directly here instead of through InputRenderer's
	// declarative `type: 'button'` + `apilink` field — this tab is hand-built
	// (see this file's own top docblock), so `modal` in DeveloperTools.ts is
	// never read and can't drive it the way General.ts's own field did.
	const handleResetSettings = () => {
		setIsResetting(true);

		sendApiResponse(
			appLocalizer,
			getApiLink(appLocalizer, 'settings/reset'),
			{}
		)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-reset-settings',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('Settings reset to defaults.', 'vulopilot')
						: __(
								'Could not reset settings. Please try again.',
								'vulopilot'
							),
				});
			})
			.finally(() => setIsResetting(false));
	};

	return (
		<FormGroupWrapperComponent>
			<CardHeader
				icon="setting pink"
				title={__('Keep VuloPilot data after uninstall', 'vulopilot')}
				desc={__(
					"Choose what happens to VuloPilot's settings and saved data if the plugin is removed. 1. Keep data — Your settings, scan history, and reports remain available if you reinstall VuloPilot. 2. Delete everything — Permanently removes VuloPilot settings and stored data when the plugin is uninstalled.",
					'vulopilot'
				)}
			>
				<ToggleInput
					value={keepDataUninstall}
					modules={[]}
					options={[
						{ key: 'keep_data', label: __('Keep data', 'vulopilot'), value: 'keep_data' },
						{ key: 'delete_everything', label: __('Delete everything', 'vulopilot'), value: 'delete_everything' },
					]}
					onChange={(value) =>
						handleSettingChange('keep_data_uninstall', value as string)
					}
				/>
			</CardHeader>
			<CardHeader
				icon="setting pink"
				title={__('Anonymous usage data', 'vulopilot')}
				desc={__(
					'Help improve VuloPilot by sharing anonymous information about how its features are used. Not yet collected — this stores your preference for when usage reporting ships. No website content, passwords, customer information, or personal data is collected.',
					'vulopilot'
				)}
			>
				<ToggleInput
					value={anonymousUsageData}
					modules={[]}
					options={[
						{ key: 'enabled', label: __('Enabled', 'vulopilot'), value: 'enabled' },
						{ key: 'disabled', label: __('Disabled', 'vulopilot'), value: 'disabled' },
					]}
					onChange={(value) =>
						handleSettingChange('anonymous_usage_data', value as string)
					}
				/>
			</CardHeader>
			<CardHeader
				icon="refresh pink"
				title={__('Cache', 'vulopilot')}
				desc={__(
					'Clears every real cached result VuloPilot computes — the Knowledge Graph’s extracted entities, the Schema Coverage snapshot, the robots.txt bot-access parse, and (if active) vulopilot-pro’s own Knowledge Graph recommendations. Everything is rebuilt fresh automatically the next time it’s needed — nothing is deleted permanently.',
					'vulopilot'
				)}
			>
				<ButtonInput
					buttons={{
						text: isClearing
							? __('Clearing…', 'vulopilot')
							: __('Clear cache', 'vulopilot'),
						onClick: handleClearCache,
						disabled: isClearing,
					}}
				/>
			</CardHeader>
			<CardHeader
				icon="refresh pink"
				title={__('Reset VuloPilot', 'vulopilot')}
				desc={__(
					'Restore VuloPilot settings to their original defaults. Your existing scan reports and history will not be deleted.',
					'vulopilot'
				)}
			>
				<ButtonInput
					buttons={{
						text: isResetting
							? __('Resetting…', 'vulopilot')
							: __('Reset settings', 'vulopilot'),
						onClick: handleResetSettings,
						disabled: isResetting,
					}}
				/>
			</CardHeader>
		</FormGroupWrapperComponent>
	);
};

export default DeveloperToolsPanel;
