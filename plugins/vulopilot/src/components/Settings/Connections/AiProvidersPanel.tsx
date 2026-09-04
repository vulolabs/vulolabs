/* global appLocalizer */
import { useEffect, useRef, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import { FormGroupWrapperComponent, FormGroupComponent, NoticeManager } from '@zyra/components';
import { ExpandablePanelInput } from '@zyra/inputs';

interface ConfiguredProvider {
	id: number;
	provider: string;
	label: string;
	default_model: string | null;
	is_active: boolean;
	has_credential: boolean;
	/**
	 * Whether the stored credential can actually still be decrypted
	 * (Controllers\AiProviders::prepare_config_for_response()). A site
	 * that rotates its auth salts/keys after this was saved (a
	 * regenerated wp-config.php, a database copied to a fresh
	 * environment, ...) leaves this `false` forever — the row still
	 * looks "configured," but ProviderRegistry::build_fallback_chain()
	 * (the real request path every "Generate with AI" call goes through)
	 * already silently skips it. This panel surfaces that instead of
	 * only ever showing "Configured with your own credentials."
	 */
	credential_ok: boolean;
	created_at: string;
}

interface AdapterMeta {
	label: string;
	available_models: string[];
	requires_credential: boolean;
}

interface AiProvidersResponse {
	configured: ConfiguredProvider[];
	adapters: Record<string, AdapterMeta>;
}

const nonceHeaders = { headers: { 'X-WP-Nonce': appLocalizer.nonce } };

/**
 * Gemini/OpenAI get their own fixed hero cards (mockup) — real copy, not
 * fabricated data (ProviderRegistry has no "description" field for an
 * adapter, only label/available_models/requires_credential), and a real
 * external link to where that provider's own API key page actually lives.
 * Every other registered adapter (Anthropic, OpenRouter, Ollama, Groq —
 * whatever `vulopilot_ai_provider_sources` adds) is bundled into the
 * "Other providers" section below instead of getting its own hero card.
 */
const HERO_PROVIDERS: Record<string, { desc: string; helpLabel: string; helpUrl: string }> = {
	gemini: {
		desc: __("Google's next-generation AI model.", 'vulopilot'),
		helpLabel: __('Google AI Studio', 'vulopilot'),
		helpUrl: 'https://aistudio.google.com/apikey',
	},
	openai: {
		desc: __('Advanced AI models for chat, content, and more.', 'vulopilot'),
		helpLabel: 'platform.openai.com',
		helpUrl: 'https://platform.openai.com/api-keys',
	},
};

/**
 * Real per-provider brand icons (zyra's own adminfont set — `.adminfont-google`,
 * `.adminfont-chatgpt`, `.adminfont-openrouter` all exist), not the one
 * generic `icon: 'ai'` every provider row used before. Adapters this map
 * doesn't know about (Anthropic, Ollama, Groq, or anything else
 * `vulopilot_ai_provider_sources` adds with no dedicated icon in the font)
 * fall back to `'link'` — still a real, distinct icon, not the same `'ai'`
 * glyph repeated for every row regardless of which provider it is.
 */
const PROVIDER_ICONS: Record<string, string> = {
	gemini: 'google yellow',
	openai: 'chatgpt blue',
	openrouter: 'openrouter green',
};
const providerIcon = (providerId: string): string => PROVIDER_ICONS[providerId] ?? 'link pink';

/**
 * Settings → Connections → AI Providers.
 *
 * Moved here from the old top-level Settings → AI Providers tab, nested
 * under a new Connections folder alongside Webhooks/External Services —
 * same "folder of sub-tab files" shape Settings/Scanning/,
 * Settings/Notifications/, and Settings/Automation/ already use.
 *
 * Redesigned per direct instruction to match a mockup: Gemini and OpenAI
 * each get a fixed hero card (Enabled/Disabled toggle, API key, Model,
 * real Connection status, real Test Connection); every other registered
 * adapter (Anthropic, OpenRouter, Ollama, Groq, or anything
 * `vulopilot_ai_provider_sources` adds) stays in the original generic
 * `ExpandablePanelInput`-driven "Other providers" list this panel already
 * had, just scoped to exclude the two hero providers.
 *
 * "Test Connection" (`POST /ai-providers/{id}/test`,
 * Controllers\AiProviders::test_connection_item()) is new, real
 * functionality — previously there was no way to know a saved key actually
 * worked short of trying "Generate with AI" and possibly having a
 * different, still-working provider in the fallback chain quietly answer
 * instead. It reuses ProviderRegistry::build_provider() (rate-limited,
 * retried, usage-tracked — the exact real request path a generation call
 * takes) and sends the smallest real request that still proves the key
 * works.
 *
 * Hand-built rather than InputRenderer-driven, same escape hatch as
 * ImportExportPanel.tsx: AI provider configs live in their own
 * `vulopilot_ai_provider_configs` table (AI-ARCHITECTURE.md), not the flat
 * settings option row every other Settings tab auto-saves into.
 */
const AiProvidersPanel = () => {
	const [configured, setConfigured] = useState<ConfiguredProvider[]>([]);
	const [adapters, setAdapters] = useState<Record<string, AdapterMeta>>({});
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [savingProviderId, setSavingProviderId] = useState<string | null>(null);
	const [newProviderValues, setNewProviderValues] = useState<
		Record<string, Record<string, unknown>>
	>({});
	const [newProviderPanelKey, setNewProviderPanelKey] = useState(0);
	const newProviderValuesRef = useRef(newProviderValues);
	const isSavingRef = useRef(false);

	// Gemini/OpenAI hero cards, now real `ExpandablePanelInput` panels
	// (per direct instruction, matching Storybook's own
	// inputs-expandablepanelinput--ai-providers story) instead of
	// hand-rolled JSX. `heroValues` holds each panel's own live-typed
	// fields (a freshly-typed API key, an in-progress model pick) the
	// same way `newProviderValues` already does for "Other providers"
	// below — merged with real server state (`is_active`,
	// `default_model`) in `heroPanelValues` just like that section's own
	// `otherPanelValues` already does.
	const [heroValues, setHeroValues] = useState<Record<string, Record<string, unknown>>>({});
	// `ExpandablePanelInput` decides whether to re-sync a row's own
	// `formFields` (and, with them, get a fresh `onClick` closure) by
	// diffing its `methods` prop with `[Function]` standing in for every
	// function value — so once a row's other fields (e.g. `disabled`) stop
	// changing, its `onClick` closure stays frozen at whatever
	// `heroPanelValues` looked like at that moment, even as the user keeps
	// typing. Same staleness `newProviderValuesRef` above already guards
	// against for "Other providers" — read through this ref inside
	// Connect/Save key's own `onClick` instead of the render-scoped
	// `heroPanelValues` so a click always sees the latest typed value.
	const heroPanelValuesRef = useRef<Record<string, Record<string, unknown>>>({});
	const [heroTestState, setHeroTestState] = useState<
		Record<string, { isTesting: boolean; testResult: { success: boolean; message: string } | null }>
	>({});

	const load = () => {
		setIsLoading(true);

		getApiResponse<AiProvidersResponse>(
			getApiLink(appLocalizer, 'ai-providers'),
			nonceHeaders
		)
			.then((response) => {
				if (!response) {
					return;
				}

				setConfigured(response.configured);
				setAdapters(response.adapters);
			})
			.finally(() => setIsLoading(false));
	};

	useEffect(load, []);

	const heroProviderIds = Object.keys(HERO_PROVIDERS).filter((id) => adapters[id]);
	const otherAdapterIds = Object.keys(adapters).filter((id) => !HERO_PROVIDERS[id]);
	const otherConfigured = configured.filter((row) => !HERO_PROVIDERS[row.provider]);
	const otherUnconfiguredIds = otherAdapterIds.filter(
		(id) => !configured.some((row) => row.provider === id)
	);

	const activeCount = configured.filter((row) => row.is_active).length;

	const genericUpdate = (
		id: number,
		data: Record<string, unknown>,
		successMessage: string,
		errorMessage: string
	) => {
		setIsSaving(true);

		return sendApiResponse(appLocalizer, getApiLink(appLocalizer, `ai-providers/${id}`), data)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: `vulopilot-ai-provider-${id}`,
					type: response ? 'success' : 'error',
					position: 'float',
					message: response ? successMessage : errorMessage,
				});

				if (response) {
					load();
				}

				return response;
			})
			.finally(() => setIsSaving(false));
	};

	/** Real `POST /ai-providers` connect, scoped to one hero provider's own card rather than the generic "Add a new provider" picker below. */
	const handleHeroConnect = (providerId: string, credential: string, defaultModel: string) => {
		if (isSavingRef.current) {
			return;
		}

		if ('' === credential.trim()) {
			NoticeManager.add({
				uniqueKey: 'vulopilot-ai-provider-add',
				type: 'error',
				position: 'float',
				message: __('Enter an API key first.', 'vulopilot'),
			});
			return;
		}

		isSavingRef.current = true;
		setIsSaving(true);
		setSavingProviderId(providerId);

		sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'ai-providers'), {
			provider: providerId,
			credential,
			default_model: defaultModel,
		})
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-ai-provider-add',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('AI provider connected.', 'vulopilot')
						: __('Could not connect this provider — check the key and try again.', 'vulopilot'),
				});

				if (response) {
					load();
				}
			})
			.finally(() => {
				isSavingRef.current = false;
				setIsSaving(false);
				setSavingProviderId(null);
			});
	};

	const handleToggleActive = (row: ConfiguredProvider) => {
		genericUpdate(
			row.id,
			{ is_active: !row.is_active },
			row.is_active ? __('Provider disabled.', 'vulopilot') : __('Provider enabled.', 'vulopilot'),
			__('Could not update this provider.', 'vulopilot')
		);
	};

	const handleSaveModel = (row: ConfiguredProvider, model: string) => {
		if ('' === model || model === row.default_model) {
			return;
		}

		genericUpdate(
			row.id,
			{ default_model: model },
			__('Default model updated.', 'vulopilot'),
			__('Could not update the default model.', 'vulopilot')
		);
	};

	/** Re-saves a configured provider's credential — re-encrypts under the site's CURRENT auth salt (see ConfiguredProvider's own `credential_ok` docblock) rather than requiring a full Disconnect + re-Add round trip. */
	const handleReconnect = (row: ConfiguredProvider, credential: string) => {
		if ('' === credential.trim()) {
			NoticeManager.add({
				uniqueKey: 'vulopilot-ai-provider-reconnect',
				type: 'error',
				position: 'float',
				message: __('Enter the new API key first.', 'vulopilot'),
			});
			return;
		}

		genericUpdate(
			row.id,
			{ credential },
			__('AI provider reconnected.', 'vulopilot'),
			__('Could not save this key — check it and try again.', 'vulopilot')
		);
	};

	const handleDisconnect = (row: ConfiguredProvider) => {
		if (
			!window.confirm(
				__(
					'Remove this AI provider? Anything relying on it for AI fixes/generation will fall back to another configured provider, if any.',
					'vulopilot'
				)
			)
		) {
			return;
		}

		sendApiResponse(appLocalizer, getApiLink(appLocalizer, `ai-providers/${row.id}/delete`), {}).then(
			(response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-ai-provider-delete',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('AI provider removed.', 'vulopilot')
						: __('Could not remove this provider.', 'vulopilot'),
				});

				if (response) {
					load();
				}
			}
		);
	};

	/** Real `POST /ai-providers/{id}/test` — see this file's own docblock. */
	const handleTest = (row: ConfiguredProvider) =>
		sendApiResponse<{ success: boolean; message: string }>(
			appLocalizer,
			getApiLink(appLocalizer, `ai-providers/${row.id}/test`),
			{}
		).then(
			(response) =>
				response ?? {
					success: false,
					message: __('Could not reach the server to test this connection.', 'vulopilot'),
				}
		);

	/** `heroTestState` is keyed by provider id since both hero panels share this one component instance. */
	const handleHeroTest = (providerId: string, row: ConfiguredProvider) => {
		setHeroTestState((s) => ({ ...s, [providerId]: { isTesting: true, testResult: null } }));

		handleTest(row).then((result) =>
			setHeroTestState((s) => ({ ...s, [providerId]: { isTesting: false, testResult: result } }))
		);
	};

	/**
	 * `ExpandablePanelInput`'s own `onChange` — fires on every keystroke in
	 * a live field (api_key/model) AND on the panel's own built-in
	 * Enable/Disable gesture (the 3-dot "Disable" action, or the "Enable"
	 * link when `disableBtn` and not yet on). Live field edits just update
	 * local state (same as `newProviderValues` below); an actual
	 * enable/disable flip on an already-connected row is routed into the
	 * real `PATCH /ai-providers/{id}` via `handleToggleActive` — for a
	 * not-yet-connected provider there's nothing to toggle server-side yet
	 * (that's what the real "Connect" button is for), so it's left as
	 * local-only state.
	 */
	const handleHeroChange = (next: Record<string, Record<string, unknown>>) => {
		heroProviderIds.forEach((providerId) => {
			const config = configured.find((row) => row.provider === providerId) ?? null;
			if (!config) {
				return;
			}

			const prevOn = Boolean(heroValues[providerId]?.enable ?? config.is_active);
			const nextOn = Boolean(next[providerId]?.enable);

			if (nextOn !== prevOn && nextOn !== config.is_active) {
				handleToggleActive(config);
			}

			const nextModel = next[providerId]?.model;
			if (nextModel !== undefined && nextModel !== config.default_model) {
				handleSaveModel(config, String(nextModel));
			}
		});

		setHeroValues(next);
	};

	// --- "Other providers" — the original generic add/edit list, scoped
	// to exclude the two hero providers above.
	const handleAdd = (provider: string) => {
		if (isSavingRef.current) {
			return;
		}

		const values = newProviderValuesRef.current[provider] ?? {};

		isSavingRef.current = true;
		setIsSaving(true);

		sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'ai-providers'), {
			provider,
			label: values.label ?? '',
			credential: values.credential ?? '',
			default_model: values.default_model ?? '',
		})
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-ai-provider-add',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('AI provider connected.', 'vulopilot')
						: __('Could not connect this provider — check the key and try again.', 'vulopilot'),
				});

				if (response) {
					newProviderValuesRef.current = {};
					setNewProviderValues({});
					setNewProviderPanelKey((key) => key + 1);
					load();
				}
			})
			.finally(() => {
				isSavingRef.current = false;
				setIsSaving(false);
			});
	};

	const handleNewProviderChange = (values: Record<string, Record<string, unknown>>) => {
		newProviderValuesRef.current = values;
		setNewProviderValues(values);
	};

	const newProviderOptions = otherUnconfiguredIds.map((id) => {
		const adapter = adapters[id];

		return {
			value: id,
			label: adapter.label,
			template: {
				icon: providerIcon(id),
				label: adapter.label,
				desc: __('Configure this provider with your own credentials.', 'vulopilot'),
				badgeColor: 'blue',
				badgeText: __('Not connected', 'vulopilot'),
				formFields: [
					{
						key: 'label',
						type: 'text',
						label: __('Label', 'vulopilot'),
						placeholder: adapter.label,
					},
					{
						key: 'credential',
						type: adapter.requires_credential ? 'password' : 'text',
						label: adapter.requires_credential ? __('API key', 'vulopilot') : __('Base URL', 'vulopilot'),
						desc: adapter.requires_credential
							? undefined
							: __('Defaults to http://localhost:11434 if left blank.', 'vulopilot'),
					},
					...(adapter.available_models.length > 0
						? [
							{
								key: 'default_model',
								type: 'select',
								label: __('Default model', 'vulopilot'),
								options: adapter.available_models.map((model) => ({
									label: model,
									value: model,
								})),
							},
						]
						: []),
					{
						key: 'connect',
						type: 'button',
						label: '',
						text: __('Connect provider', 'vulopilot'),
						disabled: isSaving,
						onClick: () => handleAdd(id),
					},
				],
			},
		};
	});

	const otherConfiguredMethods = otherConfigured.map((row) => {
		const providerLabel = row.label || adapters[row.provider]?.label || row.provider;
		const needsReconnect = !row.credential_ok;
		const adapter = adapters[row.provider];

		return {
			id: row.provider,
			icon: providerIcon(row.provider),
			label: providerLabel,
			desc: needsReconnect
				? __('This provider stopped working — see below.', 'vulopilot')
				: __('Configured with your own credentials.', 'vulopilot'),
			badgeColor: needsReconnect ? 'red' : 'green',
			badgeText: needsReconnect
				? __('Needs reconnecting', 'vulopilot')
				: __('Connected', 'vulopilot'),
			isCustom: true,
			hideDeleteBtn: true,
			wrapperClass: 'vulopilot-ai-provider-configuration',
			formFields: needsReconnect
				? [
					{
						key: 'provider_details',
						type: 'notice',
						label: '',
						noticeType: 'error',
						message: __(
							'VuloPilot can no longer read this provider’s saved API key (this usually happens after moving to a new server or environment). AI features have silently stopped using it. Enter the key again to reconnect it.',
							'vulopilot'
						),
					},
					{
						key: 'credential',
						type: adapter?.requires_credential ? 'password' : 'text',
						label: adapter?.requires_credential ? __('API key', 'vulopilot') : __('Base URL', 'vulopilot'),
					},
					{
						key: 'reconnect',
						type: 'button',
						label: '',
						text: __('Save key', 'vulopilot'),
						disabled: isSaving,
						onClick: () => handleReconnect(row, String(newProviderValuesRef.current[row.provider]?.credential ?? '')),
					},
					{
						key: 'disconnect',
						type: 'button',
						label: '',
						text: __('Disconnect', 'vulopilot'),
						icon: 'disconnect',
						onClick: () => handleDisconnect(row),
					},
				]
				: [
					{
						key: 'provider_details',
						type: 'notice',
						label: '',
						noticeType: 'info',
						message: sprintf(__('Provider: %s', 'vulopilot'), providerLabel),
					},
					...(adapter && adapter.available_models.length > 0
						? [
							{
								key: 'default_model',
								type: 'select',
								label: __('Default model', 'vulopilot'),
								options: adapter.available_models.map((model) => ({
									label: model,
									value: model,
								})),
							},
							{
								key: 'save_model',
								type: 'button',
								label: '',
								text: __('Save model', 'vulopilot'),
								disabled: isSaving,
								onClick: () =>
									handleSaveModel(
										row,
										String(newProviderValuesRef.current[row.provider]?.default_model ?? '')
									),
							},
						]
						: []),
					{
						key: 'disconnect',
						type: 'button',
						label: '',
						text: __('Disconnect', 'vulopilot'),
						icon: 'disconnect',
						onClick: () => handleDisconnect(row),
					},
				],
		};
	});

	const otherPanelValues = {
		...newProviderValues,
		...Object.fromEntries(
			otherConfigured.map((row) => [
				row.provider,
				{
					...(newProviderValues[row.provider] ?? {}),
					enable: true,
					title: row.label || adapters[row.provider]?.label || row.provider,
					default_model:
						newProviderValues[row.provider]?.default_model ?? row.default_model ?? '',
				},
			])
		),
	};

	// Merges each hero panel's live-typed fields with real server state —
	// `enable` reflects `is_active` once connected (unset/false before
	// that, so the panel starts collapsed/"Disabled"), `model` falls back
	// to the saved `default_model` until the user picks a different one.
	const heroPanelValues: Record<string, Record<string, unknown>> = Object.fromEntries(
		heroProviderIds.map((providerId) => {
			const config = configured.find((row) => row.provider === providerId) ?? null;
			const live = heroValues[providerId] ?? {};

			return [
				providerId,
				{
					...live,
					enable: config ? config.is_active : Boolean(live.enable),
					model: live.model ?? config?.default_model ?? '',
				},
			];
		})
	);
	heroPanelValuesRef.current = heroPanelValues;

	const heroMethods = heroProviderIds.map((providerId) => {
		const adapter = adapters[providerId];
		const hero = HERO_PROVIDERS[providerId];
		const config = configured.find((row) => row.provider === providerId) ?? null;
		const needsReconnect = !!config && !config.credential_ok;
		const connecting = isSaving && savingProviderId === providerId;
		const { isTesting, testResult } = heroTestState[providerId] ?? { isTesting: false, testResult: null };

		const helpDesc = hero
			? sprintf(
				/* translators: 1: help URL, 2: help link label (e.g. "Google AI Studio"). */
				__('Get your API key from <a href="%1$s" target="_blank" rel="noreferrer">%2$s</a>', 'vulopilot'),
				hero.helpUrl,
				hero.helpLabel
			)
			: undefined;

		const modelFields = adapter.available_models.length > 0
			? [
				{
					key: 'model',
					type: 'select',
					label: __('Model', 'vulopilot'),
					settingDescription: __('Choose the model to use for AI responses.', 'vulopilot'),
					options: adapter.available_models.map((m) => ({ label: m, value: m })),
				},
			]
			: [];

		const testResultFields = testResult
			? [
				{
					key: 'test_result',
					type: 'notice',
					label: '',
					noticeType: testResult.success ? 'success' : 'error',
					message: testResult.message,
				},
			]
			: [];

		const statusField = (color: string, label: string) => ({
			key: 'connection_status',
			type: 'section',
			title: `<span style="display:inline-block;width:0.5rem;height:0.5rem;border-radius:50%;background:${color};margin-right:0.5rem"></span>${__('Connection status:', 'vulopilot')} <strong style="color:${color}">${label}</strong>`,
		});

		let formFields;

		if (!config) {
			formFields = [
				{
					key: 'api_key',
					type: 'password',
					label: __('API Key', 'vulopilot'),
					settingDescription: helpDesc,
				},
				...modelFields,
				{
					key: 'connect',
					type: 'button',
					label: '',
					text: connecting ? __('Connecting…', 'vulopilot') : __('Connect', 'vulopilot'),
					// Not gated on `connecting`/an empty api_key here —
					// `ExpandablePanelInput` seeds `state.methods` (and
					// every `formFields` property, `disabled` included)
					// from this `methods` prop only once, at mount, for a
					// non-`isCustom` row like this one; its own resync
					// effect only refreshes *custom* methods' formFields
					// from `value`, so a `disabled` computed from live
					// typed state here would freeze at whatever it was on
					// first render (permanently `true`, since the field
					// starts empty) — exactly the "Connect never becomes
					// clickable" bug this replaced. `isSavingRef`
					// (double-submit) and the empty-credential check
					// (handleHeroConnect's own docblock-adjacent guard,
					// same pattern handleReconnect already uses) do this
					// job instead, inside the handler itself.
					onClick: () =>
						handleHeroConnect(
							providerId,
							String(heroPanelValuesRef.current[providerId]?.api_key ?? ''),
							String(heroPanelValuesRef.current[providerId]?.model ?? '')
						),
				},
			];
		} else if (needsReconnect) {
			formFields = [
				{
					key: 'api_key',
					type: 'password',
					label: __('API Key', 'vulopilot'),
					settingDescription: helpDesc,
				},
				...modelFields,
				statusField('#dc2626', __('Needs reconnecting', 'vulopilot')),
				{
					key: 'save_key',
					type: 'button',
					label: '',
					text: isSaving ? __('Saving…', 'vulopilot') : __('Save key', 'vulopilot'),
					// See the "connect" field above — not gated on
					// `isSaving`/an empty api_key for the same
					// frozen-`state.methods` reason; `handleReconnect`
					// already guards the empty case itself.
					onClick: () => handleReconnect(config, String(heroPanelValuesRef.current[providerId]?.api_key ?? '')),
				},
				{
					key: 'disconnect',
					type: 'button',
					label: '',
					text: __('Disconnect', 'vulopilot'),
					icon: 'disconnect',
					color: 'red',
					onClick: () => handleDisconnect(config),
				},
				...testResultFields,
			];
		} else {
			formFields = [
				...modelFields,
				statusField('#16a34a', __('Connected', 'vulopilot')),
				{
					key: 'test_connection',
					type: 'button',
					label: '',
					text: isTesting ? __('Testing…', 'vulopilot') : __('Test Connection', 'vulopilot'),
					icon: 'refresh',
					disabled: isTesting,
					onClick: () => handleHeroTest(providerId, config),
				},
				{
					key: 'disconnect',
					type: 'button',
					label: '',
					text: __('Disconnect', 'vulopilot'),
					icon: 'disconnect',
					color: 'red',
					onClick: () => handleDisconnect(config),
				},
				...testResultFields,
			];
		}

		return {
			id: providerId,
			icon: providerIcon(providerId),
			label: adapter.label,
			desc: hero?.desc ?? '',
			disableBtn: true,
			statusLabels: { active: __('Enabled', 'vulopilot'), inactive: __('Disabled', 'vulopilot') },
			formFields,
		};
	});

	return (
		<>
			<FormGroupWrapperComponent>

				{isLoading ? (
					<div className="desc">{__('Loading…', 'vulopilot')}</div>
				) : (
					<>
						{(heroMethods.length > 0 || otherConfiguredMethods.length > 0 || newProviderOptions.length > 0) && (
							<FormGroupComponent>
								<ExpandablePanelInput
									key={`${newProviderPanelKey}-${otherConfigured.map(({ id }) => id).join('-')}`}
									name="ai-providers"
									methods={[...heroMethods, ...otherConfiguredMethods]}
									value={{ ...heroPanelValues, ...otherPanelValues }}
									onChange={(next) => {
										handleHeroChange(next);
										handleNewProviderChange(next);
									}}
									canAccess
									addNewBtn={newProviderOptions.length > 0}
									addNewTemplate={{
										editableFields: { title: false, description: false },
									}}
									addNewOptions={newProviderOptions}
								/>
							</FormGroupComponent>
						)}
					</>
				)}
			</FormGroupWrapperComponent>
			{activeCount > 1 && (
				<div className="desc settings-metabox-description">
					{sprintf(
						/* translators: %d is how many AI providers are currently active. */
						__(
							'%d providers are active — if the first one fails or is rate-limited, VuloPilot automatically retries with the next.',
							'vulopilot'
						),
						activeCount
					)}
				</div>
			)}
		</>
	);
};

export default AiProvidersPanel;
