/* global vulopilotAppLocalizer */
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { ButtonInput, TextInput, TextAreaInput } from '@zyra/inputs';
import { NoticeComponent, NoticeManager, FormGroupWrapperComponent, FormGroupComponent } from '@zyra/components';
import CardHeader from '../CardHeader';
import { useSetting } from '../../contexts/SettingContext';
import { formatWpDate } from '../../services/formatWpDate';

interface VerifyResult {
	success: boolean;
	message: string;
}

/** "Stop typing, then save" debounce for the plain text fields. */
const AUTOSAVE_DEBOUNCE_MS = 1000;

const HELPER_TEXT = __('Paste only the value inside content="...".', 'vulopilot');

const StatusBadge = ({ done, doneLabel, todoLabel }: { done: boolean; doneLabel: string; todoLabel: string }) => (
	<span className={`admin-badge ${done ? 'green' : 'red'}`}>{done ? doneLabel : todoLabel}</span>
);

interface ProviderCardProps {
	icon: string;
	title: string;
	badge: ReactNode;
	steps: string;
	guideLabel: string;
	guideUrl: string;
	children: ReactNode;
}

/** One provider card. */
const ProviderCard = ({ icon, title, badge, steps, guideLabel, guideUrl, children }: ProviderCardProps) => (
	<CardHeader
		className="compact"
		icon={icon}
		title={title}
		badge={badge}
		desc={
			<>
				{steps}
				<br />
				<a className="link-item" href={guideUrl} target="_blank" rel="noopener noreferrer">
					{guideLabel} <i className="adminfont-external-link" />
				</a>
			</>
		}
	>
		<div className="ai-provider-card-body gsc-service-body">
			<div className="ai-provider-field site-verification-code-field">{children}</div>
		</div>
	</CardHeader>
);

/** Baidu/Yandex/Norton - plain code field, saved on a debounce. */
interface PlainCodeFieldProps {
	fieldKey: 'webmaster_baidu_verification' | 'webmaster_yandex_verification' | 'webmaster_norton_verification';
	icon: string;
	title: string;
	steps: string;
	guideLabel: string;
	guideUrl: string;
}

const PlainCodeField = ({ fieldKey, icon, title, steps, guideLabel, guideUrl }: PlainCodeFieldProps) => {
	const { setting, updateSetting } = useSetting();
	const [value, setValue] = useState<string>((setting[fieldKey] as string | undefined) ?? '');
	useEffect(() => {
		setValue((setting[fieldKey] as string | undefined) ?? '');
	}, [setting[fieldKey]]);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const persist = (nextValue: string) => {
		updateSetting(fieldKey, nextValue);
		return sendApiResponse<{ message: string }>(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'settings'), {
			setting: { [fieldKey]: nextValue },
		}).then((response) => {
			NoticeManager.add({
				// zyra's own fallback key is Date.now(), so each notice still shows.
				uniqueKey: `vulopilot-site-verification-${Date.now()}`,
				message: response ? __('Saved.', 'vulopilot') : __('Could not save. Please try again.', 'vulopilot'),
				type: response ? 'success' : 'error',
				position: 'float',
			});
		});
	};

	const scheduleSave = (nextValue: string) => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}
		saveTimerRef.current = setTimeout(() => persist(nextValue), AUTOSAVE_DEBOUNCE_MS);
	};

	const isAdded = '' !== value.trim();

	return (
		<ProviderCard
			icon={icon}
			title={title}
			steps={steps}
			guideLabel={guideLabel}
			guideUrl={guideUrl}
			badge={
				<StatusBadge
					done={isAdded}
					doneLabel={__('Added', 'vulopilot')}
					todoLabel={__('Not Added', 'vulopilot')}
				/>
			}
		>
			<TextInput
				id={`${fieldKey}-input`}
				type="text"
				value={value}
				onChange={(next) => {
					const nextValue = String(next);
					setValue(nextValue);
					scheduleSave(nextValue);
				}}
				placeholder={__('Paste your verification code', 'vulopilot')}
			/>
			<span className="desc">{HELPER_TEXT}</span>
		</ProviderCard>
	);
};

/** Google/Bing/Pinterest - code field plus a real "Verify" action. */
interface ProviderRowProps {
	provider: 'google' | 'bing' | 'pinterest';
	icon: string;
	title: string;
	steps: string;
	guideLabel: string;
	guideUrl: string;
}

const ProviderRow = ({ provider, icon, title, steps, guideLabel, guideUrl }: ProviderRowProps) => {
	const { setting, updateSetting } = useSetting();
	const codeKey = `webmaster_${provider}_verification`;
	const verifiedAtKey = `webmaster_${provider}_verified_at`;

	const [code, setCode] = useState<string>((setting[codeKey] as string | undefined) ?? '');
	useEffect(() => {
		setCode((setting[codeKey] as string | undefined) ?? '');
	}, [setting[codeKey]]);
	const [isVerifying, setIsVerifying] = useState(false);

	const verifiedAt = (setting[verifiedAtKey] as string | undefined) || '';
	const isVerified = '' !== verifiedAt;

	const verify = () => {
		setIsVerifying(true);

		sendApiResponse<VerifyResult>(
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, 'settings/verify-webmaster'),
			{ provider, code }
		)
			.then((response) => {
				if (!response) {
					return;
				}
				// Floating notice.
				NoticeManager.add({
					// zyra's own fallback key is Date.now(), so each notice still shows.
					uniqueKey: `vulopilot-site-verification-${Date.now()}`,
					message: response.message,
					type: response.success ? 'success' : 'error',
					position: 'float',
				});
				updateSetting(codeKey, code);
				if (response.success) {
					updateSetting(verifiedAtKey, new Date().toISOString());
				}
			})
			.finally(() => setIsVerifying(false));
	};

	return (
		<ProviderCard
			icon={icon}
			title={title}
			steps={steps}
			guideLabel={guideLabel}
			guideUrl={guideUrl}
			badge={
				<StatusBadge
					done={isVerified}
					doneLabel={__('Verified', 'vulopilot')}
					todoLabel={__('Not Verified', 'vulopilot')}
				/>
			}
		>
			<div className="site-verification-code-row">
				<TextInput
					id={`${codeKey}-input`}
					type="text"
					value={code}
					onChange={(value) => setCode(String(value))}
					placeholder={__('Paste your verification code', 'vulopilot')}
				/>
				<ButtonInput
					buttons={{
						text: isVerifying
							? __('Verifying…', 'vulopilot')
							: isVerified
								? __('Manage Verification', 'vulopilot')
								: __('Verify', 'vulopilot'),
						color: 'text-purple',
						disabled: isVerifying,
						onClick: verify,
					}}
				/>
			</div>
			<span className="desc">{HELPER_TEXT}</span>
			{isVerified && (
				<NoticeComponent
					displayPosition="inline"
					type="success"
					message={sprintf(
						/* translators: %s is a formatted date/time. */
						__('Verified on %s. Method: HTML Tag.', 'vulopilot'),
						formatWpDate(verifiedAt)
					)}
				/>
			)}
		</ProviderCard>
	);
};

/** Custom meta tags. */
const CustomTagsField = () => {
	const { setting, updateSetting } = useSetting();
	const [value, setValue] = useState<string>((setting.webmaster_custom_tags as string | undefined) ?? '');
	useEffect(() => {
		setValue((setting.webmaster_custom_tags as string | undefined) ?? '');
	}, [setting.webmaster_custom_tags]);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const persist = (nextValue: string) => {
		updateSetting('webmaster_custom_tags', nextValue);
		return sendApiResponse<{ message: string }>(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'settings'), {
			setting: { webmaster_custom_tags: nextValue },
		}).then((response) => {
			NoticeManager.add({
				// zyra's own fallback key is Date.now(), so each notice still shows.
				uniqueKey: `vulopilot-site-verification-${Date.now()}`,
				message: response ? __('Saved.', 'vulopilot') : __('Could not save. Please try again.', 'vulopilot'),
				type: response ? 'success' : 'error',
				position: 'float',
			});
		});
	};

	const scheduleSave = (nextValue: string) => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}
		saveTimerRef.current = setTimeout(() => persist(nextValue), AUTOSAVE_DEBOUNCE_MS);
	};

	const isAdded = '' !== value.trim();

	return (
		<CardHeader
			className="compact"
			icon="shortcode"
			title={__('Custom webmaster tags', 'vulopilot')}
			badge={
				<StatusBadge
					done={isAdded}
					doneLabel={__('Added', 'vulopilot')}
					todoLabel={__('Not Added', 'vulopilot')}
				/>
			}
			desc={__('Paste complete verification meta tags from other services. Only <meta> tags are kept.', 'vulopilot')}
		>
			<div className="ai-provider-card-body gsc-service-body">
				<div className="ai-provider-field site-verification-code-field">
					<TextAreaInput
						id="webmaster_custom_tags-input"
						value={value}
						onChange={(next) => {
							const nextValue = String(next);
							setValue(nextValue);
							scheduleSave(nextValue);
						}}
					/>
				</div>
			</div>
		</CardHeader>
	);
};

/** Settings → Integrations → Webmaster Tools. */
const SiteVerificationPanel = () => {
	return (
		<FormGroupWrapperComponent>
			<ProviderRow
				provider="google"
				icon="google yellow"
				title={__('Google', 'vulopilot')}
				steps={__('Add your site in Google Search Console. Choose URL prefix → HTML tag.', 'vulopilot')}
				guideLabel={__('Get Google verification code', 'vulopilot')}
				guideUrl="https://search.google.com/search-console/welcome"
			/>
			<ProviderRow
				provider="bing"
				icon="search-discovery blue"
				title={__('Bing', 'vulopilot')}
				steps={__('Add your site in Bing Webmaster Tools and choose HTML meta tag.', 'vulopilot')}
				guideLabel={__('Get Bing verification code', 'vulopilot')}
				guideUrl="https://www.bing.com/webmasters"
			/>
			<ProviderRow
				provider="pinterest"
				icon="pinterest red"
				title={__('Pinterest', 'vulopilot')}
				steps={__('Go to Settings → Link to Pinterest → Claim website → Add HTML tag.', 'vulopilot')}
				guideLabel={__('Get Pinterest verification code', 'vulopilot')}
				guideUrl="https://www.pinterest.com/settings/claim"
			/>
			<PlainCodeField
				fieldKey="webmaster_baidu_verification"
				icon="search-discovery red"
				title={__('Baidu', 'vulopilot')}
				steps={__('Add your site in Baidu and choose HTML tag verification.', 'vulopilot')}
				guideLabel={__('Get Baidu verification code', 'vulopilot')}
				guideUrl="https://ziyuan.baidu.com/"
			/>
			<PlainCodeField
				fieldKey="webmaster_yandex_verification"
				icon="search yellow"
				title={__('Yandex', 'vulopilot')}
				steps={__('Add your site in Yandex Webmaster and choose Meta tag.', 'vulopilot')}
				guideLabel={__('Get Yandex verification code', 'vulopilot')}
				guideUrl="https://webmaster.yandex.com/"
			/>
			<PlainCodeField
				fieldKey="webmaster_norton_verification"
				icon="security green"
				title={__('Norton Safe Web', 'vulopilot')}
				steps={__('If Norton provided a verification code, add it here.', 'vulopilot')}
				guideLabel={__('Open Norton Safe Web', 'vulopilot')}
				guideUrl="https://safeweb.norton.com/"
			/>
			<CustomTagsField />
			<FormGroupComponent>
				<NoticeComponent
					displayPosition="inline-notice"
					type="info"
					title={__('Where do I get my code?', 'vulopilot')}
					message={__(
						'Use the link beside each service. Save your code here, then return to the provider to verify.',
						'vulopilot'
					)}
				/>
			</FormGroupComponent>
		</FormGroupWrapperComponent>
	);
};

export default SiteVerificationPanel;
