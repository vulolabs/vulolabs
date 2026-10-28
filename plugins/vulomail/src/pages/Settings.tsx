/* global vulomailAppLocalizer */
import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { __ } from '@wordpress/i18n';
import { CardComponent, ModuleGuardComponent, NavigatorComponent } from '@zyra/components';
import { InputRenderer } from '@zyra/inputs';
import { SettingProvider, useSetting } from '../contexts/SettingContext';
import schemas, { TEMPLATE_PREFIX } from '../components/Settings';
import type { SettingsField, SettingsSchema } from '../components/Settings';
import RequiredPluginPopup from '../components/RequiredPluginPopup';
import { apiGet } from '../services/api';
import { errorMessage } from '../services/notify';
import { settingsUrl } from '../services/types';
import type { Settings as StoredSettings } from '../services/types';

type FormValues = Record<string, unknown>;

/**
 * Converts stored settings into the value each form field expects (see components/Settings/index.ts
 * for the field shapes). The REST controller does the reverse on save.
 */
const toFormValue = (field: SettingsField, stored: StoredSettings): unknown => {
	const triggers = stored.sms_triggers ?? {};

	if ('setting-row' === field.type) {
		const value: Record<string, { enable: boolean }> = {};

		(field.rows ?? []).forEach((row) => {
			value[row.valueKey] = {
				enable:
					field.key.startsWith('sms_triggers')
						? Boolean(triggers[row.valueKey]?.enabled)
						: Boolean((stored as unknown as FormValues)[row.valueKey]),
			};
		});

		return value;
	}

	if (field.key.startsWith(TEMPLATE_PREFIX)) {
		return triggers[field.key.substring(TEMPLATE_PREFIX.length)]?.template ?? '';
	}

	return (stored as unknown as FormValues)[field.key];
};

/** Every value one schema's form holds: its fields' own, plus its `extraKeys`. */
export const schemaValues = (schema: SettingsSchema, stored: StoredSettings): FormValues => {
	const values: FormValues = {};

	schema.modal.forEach((field) => {
		values[field.key] = toFormValue(field, stored);
	});
	(schema.extraKeys ?? []).forEach((key) => {
		values[key] = toFormValue({ key, type: 'textarea' }, stored);
	});

	return values;
};

/**
 * Settings: zyra's sub-tab navigator and auto-saving `InputRenderer`, the same shell VuloPilot's
 * Settings screen uses. Every change is saved a moment after it is made; there is no Save button.
 */
const Settings = () => {
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState('');
	// Form values for every sub-tab, kept across sub-tab switches.
	const valuesRef = useRef<FormValues>({});

	useEffect(() => {
		apiGet<StoredSettings>('settings')
			.then((stored) => {
				valuesRef.current = Object.assign({}, ...schemas.map((schema) => schemaValues(schema, stored)));
			})
			.catch((e) => setError(errorMessage(e)))
			.finally(() => setIsLoading(false));
	}, []);

	const requested = new URLSearchParams(useLocation().hash.substring(1)).get('subtab');
	const current = schemas.some((schema) => schema.id === requested) ? (requested as string) : schemas[0].id;

	const GetForm = (currentTab: string | null) => {
		// Hooks run on every call, whichever sub-tab is showing.
		const { setting, settingName, setSetting, updateSetting } = useSetting();
		const schema = schemas.find((item) => item.id === currentTab);

		useEffect(() => {
			if (schema && !schema.PanelComponent && settingName !== schema.id) {
				const tabValues: FormValues = {};

				[...schema.modal.map((field) => field.key), ...(schema.extraKeys ?? [])].forEach((key) => {
					tabValues[key] = valuesRef.current[key];
				});

				setSetting(schema.id, tabValues);
			}
		}, [currentTab, settingName]);

		useEffect(() => {
			if (schema && settingName === schema.id) {
				valuesRef.current = { ...valuesRef.current, ...setting };
			}
		}, [setting, settingName, currentTab]);

		if (!schema) {
			return null;
		}

		if (schema.PanelComponent) {
			const Panel = schema.PanelComponent;

			return <Panel />;
		}

		if (settingName !== schema.id) {
			return <>{__('Loading…', 'vulomail')}</>;
		}

		return (
			<InputRenderer
				settings={schema}
				setting={setting}
				updateSetting={updateSetting}
				Popup={RequiredPluginPopup}
				groupBySections={schema.groupBySections}
			/>
		);
	};

	if (error) {
		return (
			<CardComponent title={__('Settings', 'vulomail')} titleIcon="error">
				<ModuleGuardComponent icon="error" title={__('Could not load settings', 'vulomail')} desc={error} />
			</CardComponent>
		);
	}

	if (isLoading) {
		return <CardComponent title={__('Settings', 'vulomail')} titleIcon="setting" isLoading />;
	}

	return (
		<SettingProvider>
			<NavigatorComponent
				settingContent={schemas.map((schema) => ({ type: 'file' as const, content: schema }))}
				currentSetting={current}
				getForm={GetForm}
				prepareUrl={settingsUrl}
				appLocalizer={vulomailAppLocalizer}
				Link={Link}
				settingName={'Settings'}
				className="admin-settings"
				menuIcon
			/>
		</SettingProvider>
	);
};

export default Settings;
