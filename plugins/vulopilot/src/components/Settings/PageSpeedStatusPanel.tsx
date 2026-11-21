/* global vulopilotAppLocalizer */
import { useEffect, useRef, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import { ButtonInput, TextInput } from '@zyra/inputs';
import { FormGroupComponent, FormGroupWrapperComponent, NoticeComponent, NoticeManager } from '@zyra/components';
import CardHeader from '../CardHeader';
import { useSetting } from '../../contexts/SettingContext';

interface PsiStatus {
	connected: boolean;
	mobile: number | null;
	desktop: number | null;
	checked_at: string | null;
	requests_today: number;
	daily_limit: number;
}

interface TestResult {
	success: boolean;
	message: string;
	mobile: number | null;
	desktop: number | null;
}

const nonceHeaders = { headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } };

/** Settings → Connections' own PageSpeed Insights section. */
const AUTOSAVE_DEBOUNCE_MS = 1000;

const PageSpeedStatusPanel = () => {
	const { setting, updateSetting } = useSetting();
	const [status, setStatus] = useState<PsiStatus | null>(null);
	const [isTesting, setIsTesting] = useState(false);
	const [apiKey, setApiKey] = useState((setting.psi_api_key as string) || '');
	// The settings context fills in after first render, so pick up the saved value when it arrives.
	useEffect(() => {
		setApiKey((setting.psi_api_key as string) || '');
	}, [setting.psi_api_key]);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const scheduleSave = (key: string, value: string) => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}
		saveTimerRef.current = setTimeout(() => {
			updateSetting(key, value);
			sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'settings'), {
				setting: { [key]: value },
			});
		}, AUTOSAVE_DEBOUNCE_MS);
	};

	const handleApiKeyChange = (value: string) => {
		setApiKey(value);
		scheduleSave('psi_api_key', value);
	};


	const loadStatus = () => {
		getApiResponse<PsiStatus>(getApiLink(vulopilotAppLocalizer, 'settings/test-pagespeed'), nonceHeaders).then(
			(response) => {
				if (response) {
					setStatus(response);
				}
			}
		);
	};

	useEffect(loadStatus, []);

	// The test reads the key stored on the server, so save what's typed first.
	const testConnection = () => {
		setIsTesting(true);

		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
		}
		updateSetting('psi_api_key', apiKey);

		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'settings'), {
			setting: { psi_api_key: apiKey },
		})
			.then(() =>
				sendApiResponse<TestResult>(
					vulopilotAppLocalizer,
					getApiLink(vulopilotAppLocalizer, 'settings/test-pagespeed'),
					{}
				)
			)
			.then((response) => {
				if (!response) {
					return;
				}
				// Floating notice.
				NoticeManager.add({
					// zyra's own fallback key is Date.now(), so each notice still shows.
					uniqueKey: `vulopilot-pagespeed-${Date.now()}`,
					message: response.message,
					type: response.success ? 'success' : 'error',
					position: 'float',
				});
				if (response.success) {
					loadStatus();
				}
			})
			.finally(() => setIsTesting(false));
	};


	return (
		<FormGroupWrapperComponent>
			<CardHeader
				icon="analytics green"
				title={__('Google API key', 'vulopilot')}
				desc={__(
					'Get real-performance data and optimization insights directly from Google PageSpeed Insights.',
					'vulopilot'
				)}
				badge={
					<span className={`admin-badge ${status?.connected ? 'green' : 'red'}`}>
						{status?.connected ? __('Connected', 'vulopilot') : __('Not Connected', 'vulopilot')}
					</span>
				}
				action={
					<ButtonInput
						wrapperClass="psi-test-connection-button"
						buttons={{
							color: 'purple-bg',
							text: isTesting ? __('Testing…', 'vulopilot') : __('Connect', 'vulopilot'),
							icon: 'link',
							disabled: isTesting,
							onClick: testConnection,
						}}
					/>
				}
			>
				<div className='ai-provider-card-body'>
					{/* Plain text with masked display, not type="password": a password box on the page makes Chrome autofill saved logins. */}
					<TextInput
						id="psi-api-key-input"
						type="text"
						inputClass="psi-api-key-masked"
						value={apiKey}
						onChange={(value) => handleApiKeyChange(String(value))}
					/>
				</div>
			</CardHeader>
			<FormGroupComponent>
				<NoticeComponent
					displayPosition="inline-notice"
					type="info"
					message={__(
						'VuloPilot uses PageSpeed Insights API data to show speed reports under Improve My Speed. We only read performance data and never make changes to your site.',
						'vulopilot'
					)}
				/>
			</FormGroupComponent>
		</FormGroupWrapperComponent>
	);
};

export default PageSpeedStatusPanel;
