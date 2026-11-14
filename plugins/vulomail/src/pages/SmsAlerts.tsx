/* global vulomailAppLocalizer */
import { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { Link } from 'react-router-dom';
import { CardComponent, ModuleGuardComponent, NavigatorComponent, type SaveStatus } from '@zyra/components';
import { InputRenderer } from '@zyra/inputs';
import { SettingProvider, useSetting } from '../contexts/SettingContext';
import { notificationsSchema as schema } from '../components/Settings';
import RequiredPluginPopup from '../components/RequiredPluginPopup';
import { apiGet } from '../services/api';
import { errorMessage } from '../services/notify';
import type { Settings as StoredSettings } from '../services/types';
import { schemaValues } from './Settings';

const Form = ({ values, onSaveStatusChange }: { values: Record<string, unknown>; onSaveStatusChange: (status: SaveStatus) => void }) => {
	const { setting, settingName, setSetting, updateSetting } = useSetting();

	useEffect(() => {
		setSetting(schema.id, values);
	}, []);

	if (settingName !== schema.id) {
		return null;
	}

	return (
		<InputRenderer
			settings={schema}
			setting={setting}
			updateSetting={updateSetting}
			Popup={RequiredPluginPopup}
			groupBySections={schema.groupBySections}
			onSaveStatusChange={onSaveStatusChange}
		/>
	);
};

// One array for the life of the page, so the navigator does not re-select the tab on every render.
const settingContent = [{ type: 'file' as const, content: schema }];

/**
 * SMS Alerts: every alert and the message it sends. The same auto-saving form the Settings
 * sub-tabs use, in zyra's own settings shell, on a screen of its own.
 */
const SmsAlerts = () => {
	const [values, setValues] = useState<Record<string, unknown> | null>(null);
	const [error, setError] = useState('');
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

	useEffect(() => {
		apiGet<StoredSettings>('settings')
			.then((stored) => setValues(schemaValues(schema, stored)))
			.catch((e) => setError(errorMessage(e)));
	}, []);

	if (error) {
		return (
			<CardComponent title={schema.headerTitle} titleIcon="error">
				<ModuleGuardComponent icon="error" title={__('Could not load SMS alerts', 'vulomail')} desc={error} />
			</CardComponent>
		);
	}

	if (!values) {
		return <CardComponent title={schema.headerTitle} titleIcon={schema.headerIcon} isLoading />;
	}

	return (
		<SettingProvider>
			<NavigatorComponent
				settingContent={settingContent}
				currentSetting={schema.id}
				getForm={() => <Form values={values} onSaveStatusChange={setSaveStatus} />}
				prepareUrl={() => '?page=vulomail#&tab=sms-alerts'}
				appLocalizer={vulomailAppLocalizer}
				Link={Link}
				settingName={__('VuloMail', 'vulomail')}
				headerDescription={schema.headerDescription}
				className="admin-settings"
				menuIcon
				saveStatus={saveStatus}
			/>
		</SettingProvider>
	);
};

export default SmsAlerts;
