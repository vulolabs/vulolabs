/* global vulopilotAppLocalizer */
import React, { useEffect, useRef, useState, JSX } from 'react';
import { __ } from '@wordpress/i18n';
import './Settings.scss';
import { useLocation, Link } from 'react-router-dom';
import { getApiLink, getApiResponse } from '@zyra/core';
import { getAvailableSettings, getSettingById } from '@zyra/core';
import { ExpandablePanelInput, InputRenderer } from '@zyra/inputs';
import {
	CardComponent,
	FormGroupComponent,
	FormGroupWrapperComponent,
	ModuleGuardComponent,
	NavigatorComponent,
	type SaveStatus,
	PopupComponent,
	SectionComponent,
} from '@zyra/components';
import { SettingProvider, useSetting } from '../../contexts/SettingContext';
import getTemplateData from '../../services/templateService';
import ModulesPanel from '../../components/Settings/ModulesPanel';
import DeveloperToolsPanel from '../../components/Settings/DeveloperToolsPanel';
import MigrationPanel from '../../components/Settings/MigrationPanel';
import IndexNowPanel from '../../components/Settings/SEO/IndexNowPanel';
import ShowProPopup from '../../components/Popup/Popup';
import { CLOUD_STORAGE_LOCKED_METHODS } from '../../components/Settings/Backups';
import { useFilterSlot } from '../../services/useFilterSlot';
import type { ComponentType } from 'react';

/** Settings page built on zyra's settings framework. */

const Settings = () => {
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
	const settingsRef = useRef<Record<string, unknown>>({});
	// Remounts the navigator (via `key`) when a filter adds tabs after this page first rendered.
	const [proTabsTick, setProTabsTick] = useState(0);

	useEffect(() => {
		const refresh = () => setProTabsTick((tick) => tick + 1);

		window.addEventListener('vulopilot_pro_modules_loaded', refresh);

		return () =>
			window.removeEventListener('vulopilot_pro_modules_loaded', refresh);
	}, []);

	const settingsArray = getAvailableSettings(getTemplateData('settings'), []);
	const location = new URLSearchParams(useLocation().hash.substring(1));

	const loadSettings = () => {
		setIsLoading(true);
		setError(null);

		getApiResponse<Record<string, unknown>>(
			getApiLink(vulopilotAppLocalizer, 'settings'),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				if (!response) {
					setError(__('Could not load settings.', 'vulopilot'));
					return;
				}

				settingsRef.current = response;
			})
			.finally(() => setIsLoading(false));
	};

	useEffect(loadSettings, []);

	const GetForm = (currentTab: string | null): JSX.Element | null => {
		// Every hook this function uses must run on every call regardless of $currentTab.
		const { setting, settingName, setSetting, updateSetting } = useSetting();

		const CloudStoragePanel = useFilterSlot<ComponentType>(
			'vulopilot_backup_cloud_storage_panel'
		);
		const [isCloudStoragePopupOpen, setIsCloudStoragePopupOpen] = useState(false);

		const settingModal = currentTab ? getSettingById(settingsArray, currentTab) : null;
		const fieldKeys: string[] = (settingModal?.modal ?? []).map(
			(field: { key: string }) => field.key
		);

		// Zyra runs a pro field's own change handler before its pro-lock check, so a locked "Add" button still changes the value.
		const guardedUpdateSetting = (key: string, value: unknown) => {
			const field = (settingModal?.modal ?? []).find(
				(f: { key: string; proSetting?: boolean }) => f.key === key
			) as { proSetting?: boolean } | undefined;

			if (field?.proSetting && !vulopilotAppLocalizer.khali_dabba) {
				return;
			}

			updateSetting(key, value);
		};

		// Was a synchronous `setSetting()` call made straight in the render body.
		useEffect(() => {
			if (currentTab && settingName !== currentTab) {
				const tabFields: Record<string, unknown> = {};
				fieldKeys.forEach((key) => {
					tabFields[key] = settingsRef.current[key];
				});
				setSetting(currentTab, tabFields);
			}
		}, [currentTab, settingName]);

		useEffect(() => {
			if (currentTab && settingName === currentTab) {
				settingsRef.current = { ...settingsRef.current, ...setting };
			}
		}, [setting, settingName, currentTab]);

		if (!currentTab) {
			return null;
		}

		// Modules tab - real enable/disable toggles, not persisted-field settings.
		if (currentTab === 'modules') {
			return <ModulesPanel />;
		}

		// Instant Indexing tab's "Submit URLs"/"History" cards are real actions/logs, not persisted-field settings.
		if (currentTab === 'indexnow') {
			return <IndexNowPanel />;
		}

		// Developer Tools' "Clear cache" is a real action, not a persisted field.
		if (currentTab === 'developer-tools') {
			return <DeveloperToolsPanel />;
		}

		// Migration tab's source list + run buttons are real actions/results, not persisted-field settings.
		if (currentTab === 'migration') {
			return <MigrationPanel />;
		}

		if (settingModal?.PanelComponent) {
			const PanelComponent = settingModal.PanelComponent;
			return <PanelComponent />;
		}

		return (
			<>
				{settingName === currentTab ? (
					<>
						{/* `settingModal` is `getSettingById(settingsArray, currentTab)` * (line ~93). */}
						{settingModal ? (
							<InputRenderer
								settings={settingModal}
								setting={setting}
								updateSetting={guardedUpdateSetting}
								Popup={ShowProPopup}
								// Per-tab opt-in into InputRenderer's card-grouped layout.
								groupBySections={settingModal.groupBySections}
								onSaveStatusChange={setSaveStatus}
							/>
						) : (
							<ModuleGuardComponent
								icon="error"
								title={__('This settings section isn’t available', 'vulopilot')}
								desc={__(
									'The tab you linked to doesn’t exist, or the module it belongs to is turned off.',
									'vulopilot'
								)}
							/>
						)}
						{'backups' === currentTab &&
							(CloudStoragePanel ? (
								<CloudStoragePanel />
							) : (
								<div className="settings-section-group cloud-storage-section-group">
									<div className="settings-left-section" style={{ position: 'relative' }}>
										<span className="admin-tag pro-tag">
											<i className="adminfont-pro-tag" />
											{__('Pro', 'vulopilot')}
										</span>
										<SectionComponent
											icon="cloud-upload"
											title={__('Cloud Storage', 'vulopilot')}
											desc={__(
												'Credentials for the remote destinations "Storage destination" above can upload completed backups to. Every backup always saves to this server first regardless.',
												'vulopilot'
											)}
										/>
									</div>
									<div className="settings-right-section">
										<FormGroupWrapperComponent>
											<FormGroupComponent>
												<div
													className="cloud-storage-locked"
													onClickCapture={(event) => {
														event.preventDefault();
														event.stopPropagation();
														setIsCloudStoragePopupOpen(true);
													}}
												>
													<ExpandablePanelInput
														name="backup-storage-destinations-locked"
														methods={CLOUD_STORAGE_LOCKED_METHODS}
														value={{}}
														onChange={() => {}}
														canAccess={false}
													/>
												</div>
											</FormGroupComponent>
										</FormGroupWrapperComponent>
									</div>
								</div>
							))}
						{'backups' === currentTab && (
							<PopupComponent
								open={isCloudStoragePopupOpen}
								onClose={() => setIsCloudStoragePopupOpen(false)}
								width={31.25}
								height="auto"
								position="lightbox"
							>
								<ShowProPopup />
							</PopupComponent>
						)}
						{/* AI Crawler Alerts' own "Send Test Alert" button * (CrawlerAlertTestPanel.tsx) is NOT appended here *. */}
					</>
				) : (
					<>{__('Loading…', 'vulopilot')}</>
				)}
			</>
		);
	};

	if (error) {
		return (
			<CardComponent
				title={__('Settings', 'vulopilot')}
				titleIcon="setting"
				desc={__('There was a problem loading your settings.', 'vulopilot')}
			>
				<ModuleGuardComponent
					icon="error"
					title={__('Could not load settings', 'vulopilot')}
					desc={error}
				/>
			</CardComponent>
		);
	}

	if (isLoading) {
		return (
			<CardComponent
				title={__('Settings', 'vulopilot')}
				titleIcon="setting"
				desc={__('Configure how vulopilot works on this site.', 'vulopilot')}
				isLoading
			/>
		);
	}

	return (
		<SettingProvider>
			<NavigatorComponent
				key={proTabsTick}
				settingContent={settingsArray}
				currentSetting={location.get('subtab') as string}
				getForm={GetForm}
				prepareUrl={(subTab: string) =>
					`?page=vulopilot#&tab=settings&subtab=${subTab}`
				}
				appLocalizer={vulopilotAppLocalizer}
				Link={Link}
				settingName={'Settings'}
				className="admin-settings"
				saveStatus={saveStatus}
			/>
		</SettingProvider>
	);
};

export default Settings;
