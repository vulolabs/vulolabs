/* global vulomailAppLocalizer */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { ButtonInput, SelectInput, TextInput, ToggleInput } from '@zyra/inputs';
import Switch from '../components/Switch';
import GoogleSignIn from '../components/GoogleSignIn';
import { apiPost } from '../services/api';
import { errorMessage, notify } from '../services/notify';
import type {
	Connection,
	ConnectionsPayload,
	ProviderDefinition,
	ProviderField,
} from '../services/types';

interface ConnectionFormProps {
	channel: 'email' | 'sms';
	/** The connection being edited; omit to create one. */
	connection?: Connection;
	// eslint-disable-next-line no-unused-vars
	onSaved: (payload: ConnectionsPayload) => void;
	onCancel: () => void;
}

type Values = Record<string, string | number | boolean>;

const defaultsFor = (provider?: ProviderDefinition): Values => {
	const values: Values = {};

	provider?.fields.forEach((field) => {
		values[field.key] = field.default ?? ('toggle' === field.type ? false : '');
	});

	return values;
};

const LINK = /<a\s[^>]*?href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gi;

/**
 * Removes markup from a piece of help text. Tags are removed until none is left (removing one can
 * join the pieces of another, as in `<scr<b>ipt>`), and then any angle bracket that remains goes too,
 * so nothing that could start a tag survives. The result is only ever shown as text.
 */
const plain = (text: string): string => {
	let previous = '';
	let current = text;

	while (current !== previous) {
		previous = current;
		current = current.replace(/<[^>]*>/g, '');
	}

	return current.replace(/[<>]/g, '');
};

/** Turns help text that may contain links into text and real, safe link elements. No HTML is injected. */
const withLinks = (text: string): ReactNode[] => {
	const parts: ReactNode[] = [];
	let last = 0;

	text.replace(LINK, (match: string, href: string, label: string, offset: number) => {
		parts.push(text.slice(last, offset));
		parts.push(
			<a key={offset} href={href} target="_blank" rel="noopener noreferrer">
				{plain(label)}
			</a>
		);
		last = offset + match.length;

		return match;
	});

	parts.push(text.slice(last));

	// Any other markup in a help text is shown as plain words, never as markup.
	return parts.map((part) => ('string' === typeof part ? plain(part) : part));
};

/**
 * A field's help says two things: what the value is, and often where to get it, with a link. The
 * first stays beside the field's name; the second goes under the input, where it is needed.
 */
const splitHelp = (help?: string): { note: string; how: ReactNode[] | null } => {
	const text = help ?? '';
	const at = text.search(/<a\s/i);

	if (-1 === at) {
		return { note: plain(text), how: null };
	}

	return { note: text.slice(0, at).trim(), how: withLinks(text.slice(at)) };
};

const ConnectionForm = ({ channel, connection, onSaved, onCancel }: ConnectionFormProps) => {
	const providers = vulomailAppLocalizer.providers.filter(
		(provider) => provider.channel === channel
	);

	const [providerId, setProviderId] = useState(connection?.provider ?? providers[0]?.id ?? '');
	const provider = providers.find((item) => item.id === providerId);

	const [label, setLabel] = useState(connection?.label ?? '');
	const [enabled, setEnabled] = useState(connection?.enabled ?? true);
	const [values, setValues] = useState<Values>(connection?.settings ?? defaultsFor(provider));
	const [isSaving, setIsSaving] = useState(false);

	const setValue = (key: string, value: string | number | boolean) =>
		setValues((current) => ({ ...current, [key]: value }));

	// Whether a field's `show_if` rule holds, as ConnectionRepository::field_applies() reads it: a toggle
	// compares on/off, a select its chosen value or one of a list of values.
	const applies = (field?: ProviderField) =>
		!field?.show_if ||
		Object.entries(field.show_if).every(([key, expected]) => {
			if ('boolean' === typeof expected) {
				return Boolean(values[key]) === expected;
			}

			return ([] as (string | number)[]).concat(expected).map(String).includes(String(values[key] ?? ''));
		});

	const isVisible = (field: ProviderField) => !field.hidden && !field.advanced && applies(field);

	const save = () =>
		apiPost<ConnectionsPayload & { saved: string }>('connections', {
			id: connection?.id,
			channel,
			provider: providerId,
			label,
			enabled,
			settings: values,
		});

	const handleSave = () => {
		setIsSaving(true);

		save()
			.then((payload) => {
				notify('success', __('Connection saved.', 'vulomail'));
				onSaved(payload);
			})
			.catch((error) => notify('error', errorMessage(error)))
			.finally(() => setIsSaving(false));
	};

	// Saves what is in the form first (Google returns to a saved connection), then leaves for Google.
	const handleGoogleSignIn = () => {
		setIsSaving(true);

		save()
			.then((payload) => apiPost<{ url: string }>(`connections/${payload.saved}/google`))
			.then(({ url }) => {
				window.location.assign(url);
			})
			.catch((error) => {
				notify('error', errorMessage(error));
				setIsSaving(false);
			});
	};

	const renderField = (field: ProviderField) => {
		const value = values[field.key];

		if ('toggle' === field.type) {
			return (
				<Switch
					name={field.key}
					label={field.label}
					checked={Boolean(value)}
					onChange={(checked) => setValue(field.key, checked)}
				/>
			);
		}

		if ('select' === field.type && 'cards' === field.display) {
			return (
				<ToggleInput
					variant="compact"
					fieldkey={field.key}
					options={(field.options ?? []).map((option) => ({ ...option, key: option.value }))}
					value={String(value ?? '')}
					onChange={(next) => setValue(field.key, next as string)}
				/>
			);
		}

		if ('select' === field.type) {
			return (
				<SelectInput
					type="single-select"
					name={field.key}
					options={field.options ?? []}
					value={String(value ?? '')}
					isClearable={false}
					onChange={(next) => setValue(field.key, next as string)}
				/>
			);
		}

		return (
			<TextInput
				id={`vulomail-field-${field.key}`}
				name={field.key}
				type={'text' === field.type ? 'text' : field.type}
				value={(value as string | number) ?? ''}
				// A saved secret comes back masked; typing a new value replaces it, leaving it keeps it.
				placeholder={field.secret && connection ? __('Leave unchanged to keep the saved value', 'vulomail') : ''}
				onFocus={() => {
					if (field.secret && String(value ?? '').startsWith('••••')) {
						setValue(field.key, '');
					}
				}}
				onChange={(next) => setValue(field.key, 'number' === field.type ? Number(next) : String(next))}
			/>
		);
	};

	// One setting: what it is and its help on the left, the control on the right.
	const row = (
		key: string,
		label: string,
		help: string | undefined,
		control: ReactNode,
		htmlFor?: string,
		wide = false
	) => {
		const { note, how } = splitHelp(help);

		return (
			<div className={`vulomail-field-row${wide ? ' is-wide' : ''}`} key={key}>
				<div className="vulomail-field-text">
					<label htmlFor={htmlFor}>{label}</label>
					{note && <span>{note}</span>}
				</div>
				<div className="vulomail-field-control">
					{control}
					{how && (
						<span className="vulomail-field-how">
							<i className="adminfont-link" aria-hidden="true" />
							<span>{how}</span>
						</span>
					)}
				</div>
			</div>
		);
	};

	const fields = provider?.fields.filter(isVisible) ?? [];
	const advancedFields = provider?.fields.filter((field) => field.advanced && applies(field)) ?? [];

	const fieldRow = (field: ProviderField) =>
		row(
			field.key,
			field.label,
			field.help,
			'toggle' === field.type ? (
				<Switch
					name={field.key}
					label={values[field.key] ? __('On', 'vulomail') : __('Off', 'vulomail')}
					checked={Boolean(values[field.key])}
					onChange={(checked) => setValue(field.key, checked)}
				/>
			) : (
				renderField(field)
			),
			`vulomail-field-${field.key}`,
			'cards' === field.display
		);

	return (
		<div className="vulomail-connection-form">
			<div className="vulomail-connection-scroll">
				{/* Chrome ignores autoComplete="off" on a text input immediately followed by a password
				    input and autofills a saved login into both - these absorb that instead of "Connection
				    name" and the real secret field below. Invisible and never focusable by a real visitor. */}
				<div className="vulomail-autofill-trap" aria-hidden="true">
					<input type="text" name="vulomail-decoy-user" tabIndex={-1} autoComplete="off" />
					<input type="password" name="vulomail-decoy-pass" tabIndex={-1} autoComplete="new-password" />
				</div>
				<div className="vulomail-fields">
					{!connection &&
						row(
							'provider',
							__('Provider', 'vulomail'),
							provider?.desc,
							<SelectInput
								type="single-select"
								name="provider"
								options={providers.map((item) => ({ value: item.id, label: item.label }))}
								value={providerId}
								isClearable={false}
								onChange={(next) => {
									setProviderId(next as string);
									setValues(defaultsFor(providers.find((item) => item.id === next)));
								}}
							/>
						)}
					{row(
						'label',
						__('Connection name', 'vulomail'),
						__('Only used to tell your connections apart.', 'vulomail'),
						<TextInput name="label" value={label} placeholder={provider?.label ?? ''} onChange={(next) => setLabel(String(next))} />
					)}
					{row(
						'enabled',
						__('Connection enabled', 'vulomail'),
						__('Off: kept, but nothing is sent through it.', 'vulomail'),
						<Switch name="enabled" label={enabled ? __('On', 'vulomail') : __('Off', 'vulomail')} checked={enabled} onChange={setEnabled} />
					)}
				</div>
				{fields.length > 0 && (
					<>
						<h3 className="vulomail-fields-title">
							{sprintf(
								/* translators: %s: provider name, e.g. SMTP. */
								__('%s details', 'vulomail'),
								provider?.label ?? ''
							)}
						</h3>
						<div className="vulomail-fields">
							{fields.map(fieldRow)}
						</div>
					</>
				)}
				{/* The sign-in panel stands in for the hidden `refresh_token` field, while that applies. */}
				{'google' === provider?.oauth && applies(provider.fields.find((field) => 'refresh_token' === field.key)) && (
					<GoogleSignIn
						advanced={
							advancedFields.length > 0 ? <div className="vulomail-fields">{advancedFields.map(fieldRow)}</div> : null
						}
						needsSetup={advancedFields.some((field) => field.required && '' === String(values[field.key] ?? ''))}
						isConnected={'' !== String(values.refresh_token ?? '')}
						accountEmail={String(values.account_email ?? '')}
						isBusy={isSaving}
						onSignIn={handleGoogleSignIn}
					/>
				)}
			</div>
			<div className="vulomail-connection-footer">
				<span>{__('Credentials are encrypted before they are saved.', 'vulomail')}</span>
				<ButtonInput
					buttons={[
						{
							text: __('Cancel', 'vulomail'),
							color: 'purple',
							onClick: onCancel,
							disabled: isSaving,
						},
						{
							text: isSaving ? __('Saving…', 'vulomail') : __('Save connection', 'vulomail'),
							icon: 'check',
							onClick: handleSave,
							disabled: isSaving || !provider,
						},
					]}
				/>
			</div>
		</div>
	);
};

export default ConnectionForm;
