/* global appLocalizer */
import { useEffect, useRef, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import {
	SectionComponent,
	FormGroupWrapperComponent,
	FormGroupComponent,
	NoticeComponent,
	NoticeManager,
} from '@zyra/components';
import { ExpandablePanelInput } from '@zyra/inputs';
import { formatWpDate } from '../../../services/formatWpDate';

interface S3Status {
	configured: boolean;
	bucket: string;
	region: string;
	access_key_masked: string;
}

interface GoogleDriveStatus {
	client_configured: boolean;
	connected: boolean;
	connected_at: string;
	redirect_uri: string;
	authorize_url: string | null;
}

interface BackupStorageStatus {
	s3: S3Status;
	google_drive: GoogleDriveStatus;
}

interface TestResult {
	success: boolean;
	message: string;
}

const nonceHeaders = { headers: { 'X-WP-Nonce': appLocalizer.nonce } };

/** Same real display names BackupsTab.tsx's own `DESTINATION_PROVIDER_LABEL` uses for these 2 remote destinations — not exported there (that file's own module), so kept as a small local copy here rather than reaching across pages for 2 strings. */
const DESTINATION_PROVIDER_LABEL: Record<string, string> = {
	s3: __('Amazon S3', 'vulopilot'),
	google_drive: __('Google Drive', 'vulopilot'),
};

/** Real "stop typing, then save" delay — long enough that pasting/typing a full Access Key + Secret Key + Bucket in sequence doesn't fire a save after each one, short enough that it still feels immediate once you actually stop. */
const AUTOSAVE_DEBOUNCE_MS = 1200;

/**
 * Settings → Backups' own "Cloud Storage" section — real Amazon S3
 * credentials (Access Key ID/Secret Access Key/bucket/region, a real signed
 * `HeadBucket` "Test connection") and a real, direct-to-Google OAuth
 * connection for Google Drive (bring-your-own OAuth Client — see
 * Services\BackupGoogleDriveConnection's own docblock for why this isn't
 * the shared "Connect Google Services" flow). Backs the
 * `backup_storage_destination` select immediately above it
 * (Backups.ts/InputRenderer) — that field picks which one (if any) a
 * completed backup actually uploads to
 * (Services\BackupStorageManager); this panel is only where each
 * destination's own credentials/connection live. Same "hand-built
 * escape-hatch panel appended after InputRenderer's own fields" shape
 * Settings.tsx's own GetForm() already uses for `ai-visibility`'s llms.txt
 * card — see Backups.ts's own docblock for exactly where this is appended.
 *
 * Both destinations are now one real `ExpandablePanelInput` (per direct
 * instruction, matching VuloCloudAiConnectionPanel.tsx's own "Other providers"
 * list) instead of two hand-rolled `is-clickable` header divs — same real
 * zyra component, `isCustom`/`hideDeleteBtn`/`badgeColor`/`badgeText` rows
 * with no on/off `enable` semantics of their own (neither destination has
 * an "activate" concept, only "configured or not"/"connected or not"), and
 * expand/collapse is the panel's own built-in `activeTab` state rather
 * than the `isS3Open`/`isGoogleDriveOpen` state this file used to keep by
 * hand. Each row's live-typed fields (access key, client secret, ...) live
 * in `panelValues`, merged with real server state in `mergedValues` the
 * same way VuloCloudAiConnectionPanel.tsx's own `heroPanelValues` merges `heroValues`
 * with `configured` — `handleSaveS3`/`handleSaveGoogleClient` read off
 * `mergedValues` instead of the individual `accessKey`/`secretKey`/...
 * state this file used to keep per field.
 *
 * Neither section pretends a save/connect succeeded — every "Saved"/
 * "Connected" state and every "Test connection" result comes straight back
 * from a real REST call to Controllers\BackupStorage, which itself only
 * ever reports what S3Client/GoogleDriveClient's own real HTTP calls
 * actually returned.
 *
 * Autosaves (per direct instruction, matching every other field on this
 * page instead of standing out with its own explicit "Save" click) —
 * `handlePanelValuesChange()` below debounces a real save to the same
 * secrets-safe `backup-storage/*` endpoints once all of a provider's
 * required fields are non-empty, same "debounce, don't save every
 * keystroke" posture every other autosaving field in this plugin already
 * uses, just hand-rolled here rather than InputRenderer's own built-in
 * debounce (this panel was never InputRenderer-driven in the first place —
 * see this docblock's own opening paragraph for why). Deliberately still
 * gated on "all required fields present," not "any field changed": autosaving
 * a Secret Access Key the instant it's typed, before Bucket has a value, would
 * either silently fail or (worse) save a real secret paired with an empty/
 * stale bucket.
 *
 * `panelKey`/`expandedMethodId` below work around a real limitation in
 * zyra's own `ExpandablePanelInput` (confirmed by reading its installed
 * build): it only ever reads its `methods` prop once, into a `useReducer`
 * initializer, on mount — a later render passing a new `methods` array
 * (e.g. once `status.google_drive.client_configured` flips true right
 * after a save) has no effect on what's actually displayed; only field
 * *values* stay live (those flow through the separate `value`/`onChange`
 * contract). Confirmed live: without this, saving a Google OAuth Client
 * shows the real "saved" toast and a real 200 response, but the panel
 * keeps showing the empty Client ID/Secret form — the real "Connect Google
 * Drive" button only ever appeared after a manual page reload. The fix is
 * a forced remount (`key`) whenever anything that should change what's
 * displayed changes, with `expandedMethodId` fed back in as `openForm` so
 * the remount doesn't also collapse whichever panel the user was just
 * looking at.
 */
const BackupStoragePanel = () => {
	const [status, setStatus] = useState<BackupStorageStatus | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	/** The real, currently-saved "Storage destination" select value (Backups.ts, `GET /settings`'s own `backup_storage_destination`) — read here only to power the mismatch warning below; this panel never writes it. */
	const [activeDestination, setActiveDestination] = useState<string | null>(null);

	const [panelValues, setPanelValues] = useState<Record<string, Record<string, unknown>>>({});

	const [isSavingS3, setIsSavingS3] = useState(false);
	const [isTestingS3, setIsTestingS3] = useState(false);
	const [s3TestResult, setS3TestResult] = useState<TestResult | null>(null);
	const [isDisconnectingS3, setIsDisconnectingS3] = useState(false);

	const [isSavingGoogleClient, setIsSavingGoogleClient] = useState(false);
	const [isTestingGoogleDrive, setIsTestingGoogleDrive] = useState(false);
	const [googleTestResult, setGoogleTestResult] = useState<TestResult | null>(null);
	const [isDisconnectingGoogleDrive, setIsDisconnectingGoogleDrive] = useState(false);

	/** Which provider's panel to keep expanded across a forced remount (see this file's own top docblock) — set wherever the user actually interacts with one provider's fields/buttons, never guessed. */
	const [expandedMethodId, setExpandedMethodId] = useState<'s3' | 'google_drive' | null>(null);

	/** Real debounce timers — one per provider, so typing across both S3 and Google Drive fields in one sitting debounces each independently rather than one resetting the other's. */
	const s3SaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const googleClientSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (s3SaveTimer.current) {
				clearTimeout(s3SaveTimer.current);
			}
			if (googleClientSaveTimer.current) {
				clearTimeout(googleClientSaveTimer.current);
			}
		},
		[]
	);

	const refreshStatus = () =>
		getApiResponse<BackupStorageStatus>(
			getApiLink(appLocalizer, 'backup-storage'),
			nonceHeaders
		).then((response) => {
			if (response) {
				setStatus(response);
			}
			return response;
		});

	useEffect(() => {
		setIsLoading(true);
		refreshStatus().finally(() => setIsLoading(false));

		getApiResponse<{ backup_storage_destination?: string }>(
			getApiLink(appLocalizer, 'settings'),
			nonceHeaders
		).then((response) => {
			if (response) {
				setActiveDestination(response.backup_storage_destination ?? 'local');
			}
		});

		// BackupGoogleDriveOAuthCallbackHandler.php's own real redirect
		// lands back on this exact URL carrying `gdrive_status=connected|error`
		// as a real signal, not a fabricated success message — same
		// convention useGoogleServicesConnection.ts's own `gsc_status`
		// handling already establishes.
		const params = new URLSearchParams(
			window.location.hash.split('?')[1] || window.location.hash.substring(1)
		);
		const gdriveStatus = params.get('gdrive_status');

		if (gdriveStatus === 'connected') {
			NoticeManager.add({
				uniqueKey: 'vulopilot-backup-gdrive-connected',
				type: 'success',
				position: 'float',
				message: __('Connected to Google Drive.', 'vulopilot'),
			});
		} else if (gdriveStatus === 'error') {
			NoticeManager.add({
				uniqueKey: 'vulopilot-backup-gdrive-connect-failed',
				type: 'error',
				position: 'float',
				message: __(
					'Could not connect to Google Drive. Please check the Client ID/Secret and try again.',
					'vulopilot'
				),
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Live-typed fields merged with real server state — `bucket`/`region`
	// fall back to the saved values until the user types their own, same
	// "live merged with saved" shape VuloCloudAiConnectionPanel.tsx's own
	// `heroPanelValues` uses.
	const mergedValues: Record<string, Record<string, unknown>> = {
		s3: {
			access_key: panelValues.s3?.access_key ?? '',
			secret_key: panelValues.s3?.secret_key ?? '',
			bucket: panelValues.s3?.bucket ?? status?.s3.bucket ?? '',
			region: panelValues.s3?.region ?? status?.s3.region ?? 'us-east-1',
		},
		google_drive: {
			client_id: panelValues.google_drive?.client_id ?? '',
			client_secret: panelValues.google_drive?.client_secret ?? '',
		},
	};

	/**
	 * `ExpandablePanelInput`'s own `onChange` — fires with the full,
	 * already-merged-by-key `newValues` object on every keystroke in any
	 * field of either provider (same shape `panelValues` itself holds).
	 * Updates local state as before, then — per provider, independently —
	 * (re)starts that provider's own debounce timer once its required
	 * fields are all non-empty in `newValues` itself (not the possibly one-
	 * keystroke-stale `mergedValues` from this render), same real "only
	 * autosave a complete, submittable set of fields" gate the removed
	 * Save button's own `disabled` condition used to enforce by hand.
	 */
	const handlePanelValuesChange = (
		newValues: Record<string, Record<string, unknown>>
	) => {
		setPanelValues(newValues);

		// zyra's own `handleChange()` spreads its `value` PROP (our own
		// `mergedValues`, a brand new object every render regardless of
		// which field changed) into `newValues` — so a reference check
		// against either `panelValues` or `mergedValues` would always
		// "detect" both providers as changed. Comparing actual field
		// values against `mergedValues` (this render's "before" state)
		// finds the one provider whose values genuinely differ.
		const changedMethodId = (['s3', 'google_drive'] as const).find((id) => {
			const nextFields = newValues[id] ?? {};
			const previousFields = mergedValues[id] ?? {};
			return Object.keys(nextFields).some(
				(key) => nextFields[key] !== previousFields[key]
			);
		});
		if (changedMethodId) {
			setExpandedMethodId(changedMethodId);
		}

		const s3Values = {
			access_key: (newValues.s3?.access_key as string) ?? '',
			secret_key: (newValues.s3?.secret_key as string) ?? '',
			bucket: (newValues.s3?.bucket as string) ?? status?.s3.bucket ?? '',
			region:
				(newValues.s3?.region as string) ?? status?.s3.region ?? 'us-east-1',
		};

		if (s3Values.access_key && s3Values.secret_key && s3Values.bucket) {
			if (s3SaveTimer.current) {
				clearTimeout(s3SaveTimer.current);
			}
			s3SaveTimer.current = setTimeout(
				() => handleSaveS3(s3Values),
				AUTOSAVE_DEBOUNCE_MS
			);
		}

		const googleClientValues = {
			client_id: (newValues.google_drive?.client_id as string) ?? '',
			client_secret: (newValues.google_drive?.client_secret as string) ?? '',
		};

		if (googleClientValues.client_id && googleClientValues.client_secret) {
			if (googleClientSaveTimer.current) {
				clearTimeout(googleClientSaveTimer.current);
			}
			googleClientSaveTimer.current = setTimeout(
				() => handleSaveGoogleClient(googleClientValues),
				AUTOSAVE_DEBOUNCE_MS
			);
		}
	};

	const handleSaveS3 = (values: {
		access_key: string;
		secret_key: string;
		bucket: string;
		region: string;
	}) => {
		const { access_key, secret_key, bucket, region } = values;

		setIsSavingS3(true);
		setS3TestResult(null);

		sendApiResponse<S3Status>(
			appLocalizer,
			getApiLink(appLocalizer, 'backup-storage/s3'),
			{ access_key, secret_key, bucket, region }
		)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-backup-s3-saved',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('Amazon S3 credentials saved.', 'vulopilot')
						: __('Could not save these credentials. Please try again.', 'vulopilot'),
				});

				if (response) {
					setStatus((prev) => (prev ? { ...prev, s3: response } : prev));
					// Never left sitting in the form after a successful
					// save — the Secret Access Key is never returned by
					// the server either, so there's nothing to re-show.
					setPanelValues((prev) => ({
						...prev,
						s3: { ...prev.s3, access_key: '', secret_key: '' },
					}));
				}
			})
			.finally(() => setIsSavingS3(false));
	};

	const handleTestS3 = () => {
		setExpandedMethodId('s3');
		setIsTestingS3(true);
		setS3TestResult(null);

		sendApiResponse<TestResult>(
			appLocalizer,
			getApiLink(appLocalizer, 'backup-storage/s3/test'),
			{}
		)
			.then((response) => setS3TestResult(response ?? null))
			.finally(() => setIsTestingS3(false));
	};

	/** Removes the saved Access Key/Secret/Bucket/Region entirely (`BackupS3Connection::disconnect()`) — unlike Google Drive's disconnect, there's no separate "app-level" credential to keep, so this returns S3 to the same "Not configured" state as before it was ever set up. */
	const handleDisconnectS3 = () => {
		setExpandedMethodId('s3');
		setIsDisconnectingS3(true);

		sendApiResponse<S3Status>(
			appLocalizer,
			getApiLink(appLocalizer, 'backup-storage/s3/disconnect'),
			{}
		)
			.then((response) => {
				if (response) {
					setStatus((prev) => (prev ? { ...prev, s3: response } : prev));
					setPanelValues((prev) => ({
						...prev,
						s3: { access_key: '', secret_key: '', bucket: '', region: '' },
					}));
				}
				setS3TestResult(null);
			})
			.finally(() => setIsDisconnectingS3(false));
	};

	const handleSaveGoogleClient = (values: {
		client_id: string;
		client_secret: string;
	}) => {
		const { client_id, client_secret } = values;

		setIsSavingGoogleClient(true);
		setGoogleTestResult(null);

		sendApiResponse<GoogleDriveStatus>(
			appLocalizer,
			getApiLink(appLocalizer, 'backup-storage/google-drive/client'),
			{ client_id, client_secret }
		)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-backup-gdrive-client-saved',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('Google OAuth Client saved.', 'vulopilot')
						: __('Could not save this Client ID/Secret. Please try again.', 'vulopilot'),
				});

				if (response) {
					setStatus((prev) => (prev ? { ...prev, google_drive: response } : prev));
					setPanelValues((prev) => ({
						...prev,
						google_drive: { ...prev.google_drive, client_id: '', client_secret: '' },
					}));
				}
			})
			.finally(() => setIsSavingGoogleClient(false));
	};

	const handleTestGoogleDrive = () => {
		setExpandedMethodId('google_drive');
		setIsTestingGoogleDrive(true);
		setGoogleTestResult(null);

		sendApiResponse<TestResult>(
			appLocalizer,
			getApiLink(appLocalizer, 'backup-storage/google-drive/test'),
			{}
		)
			.then((response) => setGoogleTestResult(response ?? null))
			.finally(() => setIsTestingGoogleDrive(false));
	};

	const handleDisconnectGoogleDrive = () => {
		setExpandedMethodId('google_drive');
		setIsDisconnectingGoogleDrive(true);

		sendApiResponse<GoogleDriveStatus>(
			appLocalizer,
			getApiLink(appLocalizer, 'backup-storage/google-drive/disconnect'),
			{}
		)
			.then((response) => {
				if (response) {
					setStatus((prev) => (prev ? { ...prev, google_drive: response } : prev));
				}
				setGoogleTestResult(null);
			})
			.finally(() => setIsDisconnectingGoogleDrive(false));
	};

	const methods = status
		? [
			{
				id: 's3',
				icon: 'cloud-upload red',
				label: __('Amazon S3', 'vulopilot'),
				desc: __('Store backups in an Amazon S3 bucket.', 'vulopilot'),
				isCustom: true,
				hideDeleteBtn: true,
				openForm: 's3' === expandedMethodId,
				badgeColor: status.s3.configured ? 'green' : 'red',
				badgeText: status.s3.configured
					? __('Configured', 'vulopilot')
					: __('Not configured', 'vulopilot'),
				formFields: [
					...(status.s3.configured
						? [
							{
								key: 's3_status',
								type: 'notice',
								label: '',
								noticeType: 'info',
								message: sprintf(
									/* translators: 1: bucket name, 2: AWS region, 3: masked access key. */
									__('%1$s · %2$s · Access Key %3$s', 'vulopilot'),
									status.s3.bucket,
									status.s3.region,
									status.s3.access_key_masked
								),
							},
							{
								key: 'test_s3',
								type: 'button',
								label: '',
								text: isTestingS3
									? __('Testing…', 'vulopilot')
									: __('Test connection', 'vulopilot'),
								onClick: handleTestS3,
								disabled: isTestingS3,
							},
							{
								key: 'disconnect_s3',
								type: 'button',
								label: '',
								text: isDisconnectingS3
									? __('Disconnecting…', 'vulopilot')
									: __('Disconnect', 'vulopilot'),
								icon: 'sign-out',
								onClick: handleDisconnectS3,
								disabled: isDisconnectingS3,
							},
						]
						: []),
					...(s3TestResult
						? [
							{
								key: 's3_test_result',
								type: 'notice',
								label: '',
								noticeType: s3TestResult.success ? 'success' : 'error',
								message: s3TestResult.message,
							},
						]
						: []),
					{
						key: 'access_key',
						type: 'text',
						label: __('Access Key ID', 'vulopilot'),
						placeholder: 'AKIAIOSFODNN7EXAMPLE',
					},
					{
						key: 'secret_key',
						type: 'password',
						label: __('Secret Access Key', 'vulopilot'),
						placeholder: '••••••••••••••••••••••••',
					},
					{
						key: 'bucket',
						type: 'text',
						label: __('Bucket', 'vulopilot'),
						placeholder: 'my-backups-bucket',
					},
					{
						key: 'region',
						type: 'text',
						label: __('Region', 'vulopilot'),
						placeholder: 'us-east-1',
					},
					...(isSavingS3
						? [
							{
								key: 'saving_s3',
								type: 'notice',
								label: '',
								noticeType: 'info',
								message: __('Saving…', 'vulopilot'),
							},
						]
						: []),
				],
			},
			{
				id: 'google_drive',
				icon: 'google yellow',
				label: __('Google Drive', 'vulopilot'),
				desc: __('Store backups in a Google Drive folder.', 'vulopilot'),
				isCustom: true,
				hideDeleteBtn: true,
				openForm: 'google_drive' === expandedMethodId,
				badgeColor: status.google_drive.connected ? 'green' : 'red',
				badgeText: status.google_drive.connected
					? __('Connected', 'vulopilot')
					: __('Not connected', 'vulopilot'),
				formFields: status.google_drive.connected
					? [
						{
							key: 'gdrive_status',
							type: 'notice',
							label: '',
							noticeType: 'success',
							message: status.google_drive.connected_at
								? `${__('Since', 'vulopilot')} ${formatWpDate(status.google_drive.connected_at)}`
								: __('Connected', 'vulopilot'),
						},
						{
							key: 'test_gdrive',
							type: 'button',
							label: '',
							text: isTestingGoogleDrive
								? __('Testing…', 'vulopilot')
								: __('Test connection', 'vulopilot'),
							onClick: handleTestGoogleDrive,
							disabled: isTestingGoogleDrive,
						},
						{
							key: 'disconnect_gdrive',
							type: 'button',
							label: '',
							text: isDisconnectingGoogleDrive
								? __('Disconnecting…', 'vulopilot')
								: __('Disconnect', 'vulopilot'),
							icon: 'sign-out',
							onClick: handleDisconnectGoogleDrive,
							disabled: isDisconnectingGoogleDrive,
						},
						...(googleTestResult
							? [
								{
									key: 'gdrive_test_result',
									type: 'notice',
									label: '',
									noticeType: googleTestResult.success ? 'success' : 'error',
									message: googleTestResult.message,
								},
							]
							: []),
					]
					: status.google_drive.client_configured
						? [
							{
								key: 'gdrive_client_saved',
								type: 'notice',
								label: '',
								noticeType: 'info',
								message: __(
									'OAuth Client saved — connect your Google account to finish.',
									'vulopilot'
								),
							},
							{
								key: 'connect_gdrive',
								type: 'button',
								label: '',
								text: __('Connect Google Drive', 'vulopilot'),
								icon: 'link',
								onClick: () => {
									if (status.google_drive.authorize_url) {
										window.location.href = status.google_drive.authorize_url;
									}
								},
								disabled: !status.google_drive.authorize_url,
							},
						]
						: [
							{
								key: 'gdrive_setup_notice',
								type: 'notice',
								label: '',
								noticeType: 'info',
								message: __(
									'Register your own free Google Cloud OAuth Client (one-time setup) to connect Google Drive — VuloPilot never uses a shared account for this, only files it creates itself.',
									'vulopilot'
								),
							},
							{
								key: 'gdrive_redirect_uri',
								type: 'copy-to-clipboard',
								label: __('Authorized redirect URI to register on that Client:', 'vulopilot'),
								text: status.google_drive.redirect_uri,
								variant: 'code',
								copyButtonLabel: __('Copy', 'vulopilot'),
								copiedLabel: __('Copied!', 'vulopilot'),
							},
							{
								key: 'client_id',
								type: 'text',
								label: __('Client ID', 'vulopilot'),
								placeholder: 'xxxxxxxx.apps.googleusercontent.com',
							},
							{
								key: 'client_secret',
								type: 'password',
								label: __('Client Secret', 'vulopilot'),
								placeholder: '••••••••••••••••••••',
							},
							...(isSavingGoogleClient
								? [
									{
										key: 'saving_gdrive_client',
										type: 'notice',
										label: '',
										noticeType: 'info',
										message: __('Saving…', 'vulopilot'),
									},
								]
								: []),
						],
			},
		]
		: [];

	// Forces `ExpandablePanelInput` to remount (see this file's own top
	// docblock for why that's necessary) whenever anything that should
	// change what's actually displayed changes — every other piece of
	// `methods` above is derived from exactly these values.
	const panelKey = status
		? [
			status.s3.configured ? '1' : '0',
			status.google_drive.client_configured ? '1' : '0',
			status.google_drive.connected ? '1' : '0',
			isSavingS3 ? '1' : '0',
			isTestingS3 ? '1' : '0',
			isDisconnectingS3 ? '1' : '0',
			s3TestResult ? `${s3TestResult.success}:${s3TestResult.message}` : '',
			isSavingGoogleClient ? '1' : '0',
			isTestingGoogleDrive ? '1' : '0',
			googleTestResult ? `${googleTestResult.success}:${googleTestResult.message}` : '',
			isDisconnectingGoogleDrive ? '1' : '0',
		].join('|')
		: '';

	/**
	 * "Storage destination" (Backups.ts) can be set to 's3'/'google_drive'
	 * without either actually being configured/connected yet — the select
	 * itself has no such guard (it's a plain 3-option dropdown, see that
	 * file's own docblock). Left that way, a completed backup's own
	 * `destination_status` silently comes back `skipped_not_configured`
	 * (Services\BackupStorageManager) with nothing on THIS settings page
	 * explaining why — confirmed live: a backup row showed "Completed"
	 * next to a "Google Drive Not Configured" destination badge with no
	 * indication here of what to do about it. This cross-checks the real
	 * saved destination against this panel's own already-fetched
	 * connection status so the warning shows up exactly where the fix is.
	 */
	const destinationNotReady =
		('s3' === activeDestination && status && !status.s3.configured) ||
		('google_drive' === activeDestination && status && !status.google_drive.connected);

	return (
		<div className="settings-section-group">
			<div className="settings-left-section">
				<SectionComponent
					icon="cloud-upload"
					title={__('Cloud Storage', 'vulopilot')}
					desc={__(
						'Credentials for the remote destinations "Storage destination" above can upload completed backups to. Every backup always saves to this server first regardless.',
						'vulopilot'
					)}
					isLoading={isLoading}
				/>
			</div>
			<div className="settings-right-section">
				<FormGroupWrapperComponent>
					<FormGroupComponent>
						{destinationNotReady && (
							<NoticeComponent
								displayPosition="inline-notice"
								type="warning"
								title={sprintf(
									/* translators: %s: 'Amazon S3' or 'Google Drive', the currently-selected but not-yet-connected destination. */
									__('Storage destination is set to %s, but it isn\'t connected yet', 'vulopilot'),
									DESTINATION_PROVIDER_LABEL[activeDestination as string] ?? activeDestination
								)}
								message={__(
									'New backups will only be saved on this server until you finish connecting it below.',
									'vulopilot'
								)}
							/>
						)}
					</FormGroupComponent>
					<FormGroupComponent>
						{!isLoading && status && (
							<ExpandablePanelInput
								key={panelKey}
								name="backup-storage-destinations"
								methods={methods}
								value={mergedValues}
								onChange={handlePanelValuesChange}
								canAccess
							/>
						)}
					</FormGroupComponent>
				</FormGroupWrapperComponent>
			</div>
		</div>
	);
};

export default BackupStoragePanel;
