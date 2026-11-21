/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { NoticeManager } from '@zyra/components';
import { ButtonInput, MultiCheckboxInput, ToggleInput } from '@zyra/inputs';
import { useSetting } from '../../contexts/SettingContext';
import './DeveloperToolsPanel.scss';

/** One setting: icon tile, title and a short line on the left, its control on the right. */
const ToolRow = ({
	icon,
	title,
	desc,
	children,
}: {
	icon: string;
	title: string;
	desc: ReactNode;
	children: ReactNode;
}) => (
	<div className="vp-tool-row">
		<i className={`vp-tool-icon adminfont-${icon}`} aria-hidden="true" />
		<div className="vp-tool-text">
			<div className="vp-tool-title">{title}</div>
			<div className="vp-tool-desc">{desc}</div>
		</div>
		<div className="vp-tool-control">{children}</div>
	</div>
);

/** Settings → Developer Tools: everyday maintenance, then the irreversible actions in a danger zone of their own. */
const DeveloperToolsPanel = () => {
	const [isClearing, setIsClearing] = useState(false);
	const [isResetting, setIsResetting] = useState(false);
	// Reset asks once more before it runs; the question goes away again after a few seconds.
	const [confirmReset, setConfirmReset] = useState(false);
	const { setting, updateSetting } = useSetting();

	const keepDataUninstall = (setting.keep_data_uninstall as string) || 'keep_data';
	const anonymousUsageData = (setting.anonymous_usage_data as string) || 'disabled';

	useEffect(() => {
		if (!confirmReset) {
			return undefined;
		}
		const timer = window.setTimeout(() => setConfirmReset(false), 5000);
		return () => window.clearTimeout(timer);
	}, [confirmReset]);

	const handleSettingChange = (key: string, value: string) => {
		updateSetting(key, value);
		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'settings'), {
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

		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'settings/clear-cache'), {})
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-clear-cache',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('Cache cleared.', 'vulopilot')
						: __('Could not clear the cache. Please try again.', 'vulopilot'),
				});
			})
			.finally(() => setIsClearing(false));
	};

	const handleResetSettings = () => {
		if (!confirmReset) {
			setConfirmReset(true);
			return;
		}
		setConfirmReset(false);
		setIsResetting(true);

		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'settings/reset'), {})
			.then((response) => {
				// Every Settings tab keeps its own copy of the stored values in React state.
				if (response) {
					setTimeout(() => window.location.reload(), 1200);
				}

				NoticeManager.add({
					uniqueKey: 'vulopilot-reset-settings',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('Settings reset to defaults.', 'vulopilot')
						: __('Could not reset settings. Please try again.', 'vulopilot'),
				});
			})
			.finally(() => setIsResetting(false));
	};

	let resetText = __('Reset settings', 'vulopilot');
	if (isResetting) {
		resetText = __('Resetting…', 'vulopilot');
	} else if (confirmReset) {
		resetText = __('Click again to confirm', 'vulopilot');
	}

	return (
		<div className="vp-tools">
			<section className="vp-tools-card">
				<header className="vp-tools-head">
					<h3>{__('Maintenance', 'vulopilot')}</h3>
					<p>{__('Diagnostics and housekeeping for troubleshooting VuloPilot.', 'vulopilot')}</p>
				</header>

				<ToolRow
					icon="analytics"
					title={__('Anonymous usage data', 'vulopilot')}
					desc={__(
						'Share how features are used to help improve VuloPilot. Only your preference is saved for now - nothing is collected yet, and never site content, passwords or customer data.',
						'vulopilot'
					)}
				>
					<MultiCheckboxInput
						look="toggle"
						options={[{ key: 'enabled', value: 'enabled', label: '' }]}
						value={'enabled' === anonymousUsageData ? ['enabled'] : []}
						onChange={(value) =>
							handleSettingChange(
								'anonymous_usage_data',
								(value as string[]).includes('enabled') ? 'enabled' : 'disabled'
							)
						}
						toggleStatusLabel={{
							on: __('Enabled', 'vulopilot'),
							off: __('Disabled', 'vulopilot'),
						}}
						modules={[]}
					/>
				</ToolRow>

				<ToolRow
					icon="database"
					title={__('Clear cache', 'vulopilot')}
					desc={__(
						'Drops cached Knowledge Graph entities and recommendations, the Schema Coverage snapshot and the robots.txt check. They rebuild on next use; nothing is lost.',
						'vulopilot'
					)}
				>
					<ButtonInput
						buttons={{
							text: isClearing ? __('Clearing…', 'vulopilot') : __('Clear cache', 'vulopilot'),
							icon: 'refresh',
							color: 'purple',
							onClick: handleClearCache,
							disabled: isClearing,
						}}
					/>
				</ToolRow>
			</section>

			<section className="vp-tools-card is-danger">
				<header className="vp-tools-head">
					<h3>
						<i className="adminfont-info" aria-hidden="true" />
						{__('Danger zone', 'vulopilot')}
					</h3>
					<p>{__('These actions change or remove your saved data. Take a backup first.', 'vulopilot')}</p>
				</header>

				<ToolRow
					icon="refresh"
					title={__('Reset settings', 'vulopilot')}
					desc={__(
						'Restore every VuloPilot setting to its default. Scan reports and history are kept.',
						'vulopilot'
					)}
				>
					<div className={`vp-danger-btn${confirmReset ? ' is-confirming' : ''}`}>
						<ButtonInput
							buttons={{
								text: resetText,
								icon: 'refresh',
								onClick: handleResetSettings,
								disabled: isResetting,
							}}
						/>
					</div>
				</ToolRow>

				<ToolRow
					icon="delete"
					title={__('Data on uninstall', 'vulopilot')}
					desc={
						'delete_everything' === keepDataUninstall
							? __(
									'Settings, scan history and reports are permanently deleted when the plugin is removed.',
									'vulopilot'
								)
							: __(
									'Settings, scan history and reports stay, so reinstalling VuloPilot picks up where you left off.',
									'vulopilot'
								)
					}
				>
					<ToggleInput
						value={keepDataUninstall}
						modules={[]}
						options={[
							{ key: 'keep_data', label: __('Keep data', 'vulopilot'), value: 'keep_data' },
							{
								key: 'delete_everything',
								label: __('Delete everything', 'vulopilot'),
								value: 'delete_everything',
							},
						]}
						onChange={(value) => handleSettingChange('keep_data_uninstall', value as string)}
					/>
				</ToolRow>
			</section>
		</div>
	);
};

export default DeveloperToolsPanel;
