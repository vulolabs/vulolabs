/* global vuloformAppLocalizer */
import { useEffect, useRef, useState, JSX } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { __ } from '@wordpress/i18n';
import { getAvailableSettings, getSettingById, SettingProvider, useSetting } from '@zyra/core';
import { CardComponent, ModuleGuardComponent, NavigatorComponent, type SaveStatus } from '@zyra/components';
import { InputRenderer } from '@zyra/inputs';
import { apiGet } from '../services/api';
import { errorMessage } from '../services/notify';
import { settingsTabs } from '../services/slots';
import getTemplateData from '../services/templateService';

interface Stored {
	retention_days: number;
	rate_limit: number;
	honeypot: boolean;
	min_seconds: number;
	store_ip: boolean;
	keep_data_uninstall: string;
	recaptcha_type: string;
	recaptcha_site_key: string;
	recaptcha_score: number;
	/** The secret itself never reaches the browser; this says whether one is saved. */
	recaptcha_secret_set: boolean;
}

/**
 * Settings page built on zyra's settings framework, the same `components/Settings/`
 * file-per-tab + `templateService` + `GetForm` shape the VuloPilot plugin's own Settings page
 * uses: each tab is a declarative `modal` schema in its own file, discovered by
 * `getTemplateData('settings')` and rendered by `InputRenderer`. Extension tabs (VuloForm Pro)
 * still come from the `vuloform_settings_tabs` filter and are appended after VuloForm's own.
 */
const Settings = () => {
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
	const settingsRef = useRef<Record<string, unknown>>({});

	const settingsArray = getAvailableSettings(getTemplateData('settings'), []);
	const location = new URLSearchParams(useLocation().hash.substring(1));

	const extensionTabs = settingsTabs().map((tab) => ({
		type: 'file' as const,
		content: {
			id: tab.id,
			priority: Infinity,
			headerTitle: tab.title,
			headerDescription: tab.desc,
			headerIcon: tab.icon,
			hideSettingHeader: true,
			submitUrl: 'settings',
			modal: [],
			PanelComponent: tab.Component,
		},
	}));

	const settingContent = [...settingsArray, ...extensionTabs];

	const loadSettings = () => {
		setIsLoading(true);
		setError(null);

		apiGet<Stored>('settings')
			.then((stored) => {
				settingsRef.current = {
					retention_days: stored.retention_days,
					rate_limit: stored.rate_limit,
					min_seconds: stored.min_seconds,
					spam_options: { honeypot: { enable: stored.honeypot } },
					keep_data_uninstall: stored.keep_data_uninstall,
					recaptcha_type: stored.recaptcha_type,
					recaptcha_site_key: stored.recaptcha_site_key,
					recaptcha_secret_key: '',
					recaptcha_score: String(stored.recaptcha_score),
					privacy_options: { store_ip: { enable: stored.store_ip } },
				};
			})
			.catch((e) => setError(errorMessage(e)))
			.finally(() => setIsLoading(false));
	};

	useEffect(loadSettings, []);

	const GetForm = (currentTab: string | null): JSX.Element | null => {
		// Every hook this function uses must run on every call regardless of $currentTab.
		const { setting, settingName, setSetting, updateSetting } = useSetting();

		const settingModal = currentTab ? getSettingById(settingContent, currentTab) : null;
		const fieldKeys: string[] = (settingModal?.modal ?? []).map((field: { key: string }) => field.key);

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

		// Extension tabs (VuloForm Pro) render their own already-built component, not a
		// persisted-field settings form - same escape hatch VuloPilot's Settings page uses.
		if (settingModal?.PanelComponent) {
			const PanelComponent = settingModal.PanelComponent;
			return <PanelComponent key={currentTab} />;
		}

		return (
			<>
				{settingName === currentTab ? (
					settingModal ? (
						<InputRenderer
							settings={settingModal}
							setting={setting}
							updateSetting={updateSetting}
							Popup={() => null}
							groupBySections={settingModal.groupBySections}
							onSaveStatusChange={setSaveStatus}
						/>
					) : (
						<ModuleGuardComponent
							icon="error"
							title={__('This settings section isn’t available', 'vuloform')}
							desc={__('The tab you linked to doesn’t exist.', 'vuloform')}
						/>
					)
				) : (
					<>{__('Loading…', 'vuloform')}</>
				)}
			</>
		);
	};

	if (error) {
		return (
			<CardComponent title={__('Settings', 'vuloform')} titleIcon="setting">
				<ModuleGuardComponent icon="error" title={__('Could not load settings', 'vuloform')} desc={error} />
			</CardComponent>
		);
	}

	if (isLoading) {
		return <CardComponent title={__('Settings', 'vuloform')} titleIcon="setting" isLoading />;
	}

	return (
		<SettingProvider>
			<NavigatorComponent
				settingContent={settingContent}
				currentSetting={location.get('subtab') as string}
				getForm={GetForm}
				prepareUrl={(subTab: string) => `?page=vuloform#&tab=settings&subtab=${subTab}`}
				appLocalizer={vuloformAppLocalizer}
				Link={Link}
				settingName={'Settings'}
				className="admin-settings"
				menuIcon
				saveStatus={saveStatus}
			/>
		</SettingProvider>
	);
};

export default Settings;
