/* global appLocalizer */
import { useRef, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { ButtonInput, TextInput, TextAreaInput } from '@zyra/inputs';
import { NoticeComponent, NoticeManager, FormGroupWrapperComponent, FormGroupComponent } from '@zyra/components';
import CardHeader from '../../CardHeader';
import { useSetting } from '../../../contexts/SettingContext';
import { formatWpDate } from '../../../services/formatWpDate';

interface VerifyResult {
	success: boolean;
	message: string;
}

interface ProviderRowConfig {
	provider: 'google' | 'bing' | 'pinterest';
	icon: string;
	title: string;
	desc: string;
}

const PROVIDERS: ProviderRowConfig[] = [
	{
		provider: 'google',
		icon: 'google yellow',
		title: __('Google ', 'vulopilot'),
		desc: __(
			'Verify your site with Google to access Search Console data, indexing status, and rich insights.',
			'vulopilot'
		),
	},
	{
		provider: 'bing',
		icon: 'search-discovery blue',
		title: __('Bing', 'vulopilot'),
		desc: __('Verify your site with Bing to get insights from Bing Webmaster Tools.', 'vulopilot'),
	},
	{
		provider: 'pinterest',
		icon: 'pinterest red',
		title: __('Pinterest', 'vulopilot'),
		desc: __('Verify your site with Pinterest to claim your site and unlock analytics.', 'vulopilot'),
	},
];

/** "Stop typing, then save" debounce — same shape TitleFormatsPanel.tsx's own `scheduleSave()` already uses for a hand-built (non-InputRenderer) panel's plain text fields, rather than saving every keystroke. */
const AUTOSAVE_DEBOUNCE_MS = 1000;

interface PlainCodeFieldConfig {
	key: 'webmaster_baidu_verification' | 'webmaster_yandex_verification' | 'webmaster_norton_verification';
	icon: string;
	title: string;
	fieldLabel: string;
	desc: string;
}

/**
 * Baidu/Yandex/Norton — real `<meta>`-tag verification codes
 * (Services\WebmasterToolsManager, same as the 3 `ProviderRow`s above),
 * merged in from Scanning → SEO & Content's own now-removed "Webmaster
 * Tools" section per direct instruction ("can i marge that 2 settings"),
 * restyled to match `ProviderRow`'s own icon/title/badge/desc/code-field/
 * button row per direct instruction ("change image 1 look and structure
 * to image 2"). Badge reads "Added"/"Not Added" rather than
 * `ProviderRow`'s "Verified"/"Not Verified", and the button is a real,
 * honest "Save" (an immediate save, not a debounce-only field) rather
 * than "Verify" — this plugin has no real self-check
 * (`POST /settings/verify-webmaster`) for these 3 providers the way it
 * does for Google/Bing/Pinterest, so claiming a "Verify" action here
 * would either no-op or falsely claim a check that never ran.
 */
const PLAIN_CODE_FIELDS: PlainCodeFieldConfig[] = [
	{
		key: 'webmaster_baidu_verification',
		icon: 'search-discovery red',
		title: __('Baidu', 'vulopilot'),
		// fieldLabel: __('Baidu Webmaster Tools verification ID', 'vulopilot'),
		desc: __(
			'Enter your Baidu Webmaster Tools verification ID. Rendered as <meta name="baidu-site-verification" content="...">.',
			'vulopilot'
		),
	},
	{
		key: 'webmaster_yandex_verification',
		icon: 'search yellow',
		title: __('Yandex', 'vulopilot'),
		// fieldLabel: __('Yandex verification ID', 'vulopilot'),
		desc: __(
			'Enter your Yandex.Webmaster verification ID. Rendered as <meta name="yandex-verification" content="...">.',
			'vulopilot'
		),
	},
	{
		key: 'webmaster_norton_verification',
		icon: 'security green',
		title: __('Norton Safe Web', 'vulopilot'),
		// fieldLabel: __('Norton Safe Web verification ID', 'vulopilot'),
		desc: __(
			'Enter your Norton Safe Web ownership verification ID. Rendered as <meta name="norton-safeweb-site-verification" content="...">.',
			'vulopilot'
		),
	},
];

/** One `ProviderRow`-shaped row for a plain (no-Verify) code field — its own local `value`/debounce timer, same "type, then save 1s later" autosave every field in this panel shares, plus a real immediate "Save" button for the same explicit-action affordance `ProviderRow`'s own "Verify" button gives. */
const PlainCodeField = ({ field }: { field: PlainCodeFieldConfig }) => {
	const { setting, updateSetting } = useSetting();
	const [value, setValue] = useState<string>(
		(setting[field.key] as string | undefined) ?? ''
	);
	const [isSaving, setIsSaving] = useState(false);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const persist = (nextValue: string) => {
		updateSetting(field.key, nextValue);
		return sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'settings'), {
			setting: { [field.key]: nextValue },
		});
	};

	const scheduleSave = (nextValue: string) => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}
		saveTimerRef.current = setTimeout(() => persist(nextValue), AUTOSAVE_DEBOUNCE_MS);
	};

	const handleSaveClick = () => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}
		setIsSaving(true);
		persist(value)
			.then((response) => {
				NoticeManager.add({
					message: response
						? __('Saved.', 'vulopilot')
						: __('Could not save. Please try again.', 'vulopilot'),
					type: response ? 'success' : 'error',
					position: 'float',
				});
			})
			.finally(() => setIsSaving(false));
	};

	const isAdded = '' !== value.trim();

	return (
		<CardHeader
			className='compact'
			icon={field.icon}
			title={field.title}
			desc={field.desc}
			badge={
				<span className={`admin-badge ${isAdded ? 'green' : 'red'}`}>
					{isAdded ? __('Added', 'vulopilot') : __('Not Added', 'vulopilot')}
				</span>
			}
			action={
				<ButtonInput
					buttons={{
						text: isSaving ? __('Saving…', 'vulopilot') : __('Save', 'vulopilot'),
						color: 'purple-bg',
						icon: 'setting',
						disabled: isSaving,
						onClick: handleSaveClick,
					}}
				/>
			}
		>
			<div className="ai-provider-card-body gsc-service-body">
				<div className="ai-provider-field site-verification-code-field">
					<label htmlFor={`${field.key}-input`}>{field.fieldLabel}</label>
					<TextInput
						id={`${field.key}-input`}
						type="text"
						value={value}
						onChange={(next) => {
							const nextValue = String(next);
							setValue(nextValue);
							scheduleSave(nextValue);
						}}
						placeholder={__('Paste the verification code from your provider', 'vulopilot')}
					/>
				</div>
			</div>
		</CardHeader>
	);
};

/**
 * "Custom webmaster tags" — the same real free-text `<meta>`-tag textarea
 * (Services\WebmasterToolsManager strips anything that isn't a `<meta>`
 * tag before output), merged in alongside the 3 `PlainCodeField`s above,
 * same restyle to `ProviderRow`'s own row shape.
 */
const CustomTagsField = () => {
	const { setting, updateSetting } = useSetting();
	const [value, setValue] = useState<string>(
		(setting.webmaster_custom_tags as string | undefined) ?? ''
	);
	const [isSaving, setIsSaving] = useState(false);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const persist = (nextValue: string) => {
		updateSetting('webmaster_custom_tags', nextValue);
		return sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'settings'), {
			setting: { webmaster_custom_tags: nextValue },
		});
	};

	const scheduleSave = (nextValue: string) => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}
		saveTimerRef.current = setTimeout(() => persist(nextValue), AUTOSAVE_DEBOUNCE_MS);
	};

	const handleSaveClick = () => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}
		setIsSaving(true);
		persist(value)
			.then((response) => {
				NoticeManager.add({
					message: response
						? __('Saved.', 'vulopilot')
						: __('Could not save. Please try again.', 'vulopilot'),
					type: response ? 'success' : 'error',
					position: 'float',
				});
			})
			.finally(() => setIsSaving(false));
	};

	const isAdded = '' !== value.trim();

	return (
		<CardHeader
			className='compact'
			icon="shortcode"
			title={__('Custom webmaster tags', 'vulopilot')}
			desc={__(
				'Enter your own custom webmaster tags. Only <meta> tags are allowed — anything else is stripped out before being added to the page.',
				'vulopilot'
			)}
			badge={
				<span className={`admin-badge ${isAdded ? 'green' : 'red'}`}>
					{isAdded ? __('Added', 'vulopilot') : __('Not Added', 'vulopilot')}
				</span>
			}
			action={
				<ButtonInput
					buttons={{
						text: isSaving ? __('Saving…', 'vulopilot') : __('Save', 'vulopilot'),
						color: 'purple-bg',
						icon: 'setting',
						disabled: isSaving,
						onClick: handleSaveClick,
					}}
				/>
			}
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

/**
 * One Google/Bing/Pinterest row — code field, real "Verify" action, and an
 * honest status pill. See SiteVerification.ts's own docblock for why
 * "Verified" here means "the tag is live on your homepage" (a real,
 * self-checkable fact this plugin can confirm on its own) rather than
 * "Google/Bing/Pinterest have confirmed your account" (an external claim
 * this plugin has no API access to confirm).
 */
const ProviderRow = ({ provider, icon, title, desc }: ProviderRowConfig) => {
	const { setting, updateSetting } = useSetting();
	const codeKey = `webmaster_${provider}_verification`;
	const verifiedAtKey = `webmaster_${provider}_verified_at`;

	const [code, setCode] = useState<string>(
		(setting[codeKey] as string | undefined) ?? ''
	);
	const [isVerifying, setIsVerifying] = useState(false);

	const verifiedAt = (setting[verifiedAtKey] as string | undefined) || '';
	const isVerified = '' !== verifiedAt;

	const verify = () => {
		setIsVerifying(true);

		sendApiResponse<VerifyResult>(
			appLocalizer,
			getApiLink(appLocalizer, 'settings/verify-webmaster'),
			{ provider, code }
		)
			.then((response) => {
				if (!response) {
					return;
				}
				// Floating notice (NoticeReceiverComponent position="float",
				// already mounted app-wide by zyra's own HeaderComponent) —
				// same conversion PageSpeedStatusPanel.tsx's own Test
				// Connection result already uses, not the inline <p> this
				// used to render below the code field.
				NoticeManager.add({
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
		<CardHeader
			className='compact'
			icon={icon}
			title={title}
			desc={desc}
			badge={
				<span className={`admin-badge ${isVerified ? 'green' : 'red'}`}>
					{isVerified ? __('Verified', 'vulopilot') : __('Not Verified', 'vulopilot')}
				</span>
			}
			action={
				<>
					<ButtonInput
						buttons={{
							text: isVerifying
								? __('Verifying…', 'vulopilot')
								: isVerified
									? __('Manage Verification', 'vulopilot')
									: sprintf(
										/* translators: %s is the provider name (Bing, Pinterest). */
										__('Verify with %s', 'vulopilot'),
										title
									),
							color: isVerifying
								? 'purple-bg'
								: isVerified
									? 'border-purple'
									: 'purple-bg',
							icon: isVerifying
								? 'setting'
								: isVerified
									? 'spmv'
									: 'setting',
							disabled: isVerifying,
							onClick: verify,
						}}
					/>
				</>
			}
		>
			<div className="ai-provider-card-body gsc-service-body">
				<div className="ai-provider-field site-verification-code-field">
					{/* <label htmlFor={`${codeKey}-input`}>
						{sprintf(
							__('%s verification code', 'vulopilot'),
							title
						)}
					</label> */}
					<TextInput
						id={`${codeKey}-input`}
						type="text"
						value={code}
						onChange={(value) => setCode(String(value))}
						placeholder={__('Paste the verification code from your provider', 'vulopilot')}
					/>
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
				</div>
			</div>
		</CardHeader>
	);
};

/**
 * Settings → Connections → Site Verification.
 *
 * Real backing: Services\WebmasterToolsManager already outputs one
 * `<meta>` tag per provider on `wp_head` from `webmaster_*_verification`
 * (Utill::VULOPILOT_SETTINGS_DEFAULTS) — Google/Bing/Pinterest get a real
 * "Verify" self-check (Controllers\Settings::verify_webmaster_tool()) —
 * this plugin fetches its OWN homepage and confirms the tag actually
 * renders there; it never calls Google/Bing/Pinterest's own APIs, so
 * "Verified" means "the tag is live," not "your account is confirmed" —
 * see `webmaster_google_verified_at`'s own docblock (Utill.php).
 *
 * Baidu/Yandex/Norton/Custom Tags (`PlainCodeField`/`CustomTagsField`
 * above) used to live as plain text fields on Scanning → SEO & Content
 * (SeoContent.ts) instead of here, with this panel only deep-linking over
 * to them via an "Other verification" summary card. Merged into this one
 * panel per direct instruction ("can i marge that 2 settings") — SeoContent.ts's
 * own "Webmaster Tools"/"Custom Webmaster Tags" sections were removed
 * entirely, so there's now exactly one editor for all 6 real verification
 * codes instead of two. These 3 stay plain autosaving fields, no "Verify"
 * button — this plugin has no real self-check for Baidu/Yandex/Norton the
 * way it does for Google/Bing/Pinterest, and a Verify button with nothing
 * real behind it would either no-op or falsely claim a check that never
 * ran.
 */
const SiteVerificationPanel = () => {
	return (
		<>

			<FormGroupWrapperComponent>
				{PROVIDERS.map((row) => (
					<ProviderRow key={row.provider} {...row} />
				))}
				{PLAIN_CODE_FIELDS.map((field) => (
					<PlainCodeField key={field.key} field={field} />
				))}
				<CustomTagsField />
				<FormGroupComponent>
					<NoticeComponent
						displayPosition="inline-notice"
						type="info"
						title={__('Why verify your site?', 'vulopilot')}
						message={__(
							'Site verification helps VuloPilot fetch accurate data, monitor your presence, and provide personalized recommendations.',
							'vulopilot'
						)}
					/>
				</FormGroupComponent>
			</FormGroupWrapperComponent>
		</>
	);
};

export default SiteVerificationPanel;
