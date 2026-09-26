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
	PopupComponent,
	SectionComponent,
} from '@zyra/components';
import { SettingProvider, useSetting } from '../../contexts/SettingContext';
import getTemplateData from '../../services/templateService';
import ModulesPanel from '../../components/Settings/ModulesPanel';
import DeveloperToolsPanel from '../../components/Settings/DeveloperToolsPanel';
import IndexNowPanel from '../../components/Settings/SEO/IndexNowPanel';
import ShowProPopup from '../../components/Popup/Popup';
import { CLOUD_STORAGE_LOCKED_METHODS } from '../../components/Settings/Backups';
import { useFilterSlot } from '../../services/useFilterSlot';
import type { ComponentType } from 'react';

/**
 * Built on zyra's real settings framework (`InputRenderer`/
 * `NavigatorComponent`, `getAvailableSettings`/`getSettingById` from
 * @zyra/core) - the same one the free vulolabs plugin's own
 * components/Settings/Settings.tsx uses, replacing this page's previous
 * hand-built form. Tab configs live under ../../components/Settings/*.ts
 * as plain declarative objects (react-frontend.md's business-hours.ts
 * pattern), auto-discovered by templateService.ts's `require.context`.
 *
 * VuloPilot's settings are one flat wp_options row, not per-tab
 * namespaced data - unlike vulolabs's `vulopilotAppLocalizer.admin_settings`,
 * so this page fetches the full flat object once and, per tab, seeds
 * `SettingContext` with just that tab's own field keys (looked up from
 * the tab's own `modal[].key` list) and merges live edits back into a
 * ref so switching tabs and back doesn't lose unsaved-but-in-flight
 * edits. Each field then auto-saves itself via InputRenderer's own
 * built-in debounce, POSTing `{ setting, settingName }` - Controllers\Settings's
 * `update_item()` merges that subset into the stored option rather than
 * replacing it wholesale.
 *
 * 'modules' is the same "special component" escape hatch (same one
 * vulolabs's Settings.tsx uses for StoreStatus/Invoice/etc.) - real
 * enable/disable toggles, not persisted fields, don't fit the per-field
 * auto-save model, so that one tab id renders ModulesPanel.tsx instead of
 * InputRenderer, added per direct instruction ("move the modules tab in
 * settings after general tab"); see Modules.ts's own docblock for where
 * its content used to live.
 */

const Settings = () => {
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const settingsRef = useRef<Record<string, unknown>>({});

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
		// Every hook this function uses must run on every call regardless
		// of $currentTab - an early `return null` before useEffect() (the
		// original shape this was ported from also has this same latent
		// issue) makes the number of hooks React sees differ between the
		// render where NavigatorComponent hasn't picked a subtab yet
		// (currentTab === null) and the one right after it does, which is
		// exactly React error #310 ("rendered fewer hooks than expected").
		const { setting, settingName, setSetting, updateSetting } = useSetting();

		const CloudStoragePanel = useFilterSlot<ComponentType>(
			'vulopilot_backup_cloud_storage_panel'
		);
		const [isCloudStoragePopupOpen, setIsCloudStoragePopupOpen] = useState(false);

		const settingModal = currentTab ? getSettingById(settingsArray, currentTab) : null;
		const fieldKeys: string[] = (settingModal?.modal ?? []).map(
			(field: { key: string }) => field.key
		);

		// Was a synchronous `setSetting()` call made straight in the render
		// body - React flags that as "Cannot update a component while
		// rendering a different component" (confirmed live, every tab
		// switch) since it's a real setState-during-render of a DIFFERENT
		// component's context (SettingProvider) triggered from inside
		// NavigatorComponent's (zyra) own render. Usually tolerated by
		// React's batching, but not guaranteed - real, unhurried click
		// timing (unlike a fast synthetic click) can let a stale render
		// win, which is the likely cause of a reported bug where a module
		// card's settings-gear link stopped navigating after an earlier
		// tab switch. Moved into an effect, keyed on the same
		// `currentTab`/`settingName` mismatch, so it only ever runs as a
		// committed update, never mid-render. The existing `settingName
		// === currentTab ? … : 'Loading…'` branch further down already
		// treats this one-render gap as an expected, handled state.
		useEffect(() => {
			if (currentTab && settingName !== currentTab) {
				const tabFields: Record<string, unknown> = {};
				fieldKeys.forEach((key) => {
					tabFields[key] = settingsRef.current[key];
				});
				setSetting(currentTab, tabFields);
			}
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [currentTab, settingName]);

		useEffect(() => {
			if (currentTab && settingName === currentTab) {
				settingsRef.current = { ...settingsRef.current, ...setting };
			}
		}, [setting, settingName, currentTab]);

		if (!currentTab) {
			return null;
		}

		// Modules tab - real enable/disable toggles (ModuleGridComponent's
		// own `apiLink="modules"` round-trip), not persisted-field settings
		// - same escape hatch as the generic `PanelComponent` case below
		// (AI Providers/Licensing use that one instead since their config
		// lives outside this plugin's own hardcoded tab ids). Moved here
		// from a standalone top-level page per direct instruction ("move
		// the modules tab in settings after general tab") - see Modules.ts's
		// own docblock.
		if (currentTab === 'modules') {
			return <ModulesPanel />;
		}

		// Instant Indexing tab's "Submit URLs"/"History" cards are real
		// actions/logs, not persisted-field settings - same escape hatch as
		// 'modules' above (see InstantIndexing.ts's own docblock).
		if (currentTab === 'indexnow') {
			return <IndexNowPanel />;
		}

		// Developer Tools' "Clear cache" is a real action, not a
		// persisted field - same escape hatch as 'indexnow' above.
		if (currentTab === 'developer-tools') {
			return <DeveloperToolsPanel />;
		}

		if (settingModal?.PanelComponent) {
			const PanelComponent = settingModal.PanelComponent;
			return <PanelComponent />;
		}

		return (
			<>
				{settingName === currentTab ? (
					<>
						{/* `settingModal` is `getSettingById(settingsArray, currentTab)`
						 * (line ~93) - real `null` for a `currentTab` that doesn't
						 * match any entry in `settingsArray` (a stale/unknown
						 * `subtab=` URL param, or a tab gated behind a module
						 * that's since been deactivated). `InputRenderer` itself
						 * unconditionally destructures its own `settings` prop
						 * (zyra's own InputRenderer.tsx) and crashes the whole
						 * page rather than degrading, so this has to stay guarded
						 * here rather than just passing `settingModal` through. */}
						{settingModal ? (
							<InputRenderer
								settings={settingModal}
								setting={setting}
								updateSetting={updateSetting}
								Popup={ShowProPopup}
								// Per-tab opt-in (General.ts's own `groupBySections: true`
								// is the first) into InputRenderer's card-grouped layout -
								// same `.settings-section-group` real CSS
								// NavigatorComponent.scss already ships, matching
								// NavigatorComponent's own "Default" Storybook story.
								// `hideSettingHeader` is deliberately NOT forwarded here:
								// it only ever gates NavigatorComponent's own outer header
								// (see that story's own docblock), not this grouping.
								groupBySections={settingModal.groupBySections}
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
						{/* AI Crawler Alerts' own "Send Test Alert" button
						 * (CrawlerAlertTestPanel.tsx) is NOT appended here
						 * - unlike Backups above, it's wired straight into
						 * AiCrawlerAlerts.ts's own "Notification channels"
						 * `type: 'section'` field via SectionComponent's
						 * `rightContent` slot, so InputRenderer renders it
						 * inline as part of that tab's own fields. See
						 * that file's own docblock. */}
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
			/>
		</SettingProvider>
	);
};

export default Settings;
