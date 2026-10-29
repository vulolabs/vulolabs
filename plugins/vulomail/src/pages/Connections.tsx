import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import {
	BadgeComponent,
	CardComponent,
	FormGroupComponent,
	FormGroupWrapperComponent,
	ModuleGuardComponent,
	NoticeComponent,
	PopupComponent,
	SectionComponent,
	SettingRowComponent,
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import ConnectionForm from './ConnectionForm';
import { apiDelete, apiGet, apiPost } from '../services/api';
import { errorMessage, notify } from '../services/notify';
import type { Connection, ConnectionsPayload, Routing, Settings as SettingsShape } from '../services/types';

const ROUTING_KEYS: (keyof Routing)[] = ['email_primary', 'email_backup', 'sms_primary', 'sms_backup'];

type Channel = 'email' | 'sms';

interface Editing {
	channel: Channel;
	connection?: Connection;
}

const CHANNELS: { id: Channel; title: string; icon: string; desc: string; empty: string }[] = [
	{
		id: 'email',
		title: __('Email', 'vulomail'),
		icon: 'mail',
		desc: __(
			'Add the email service you want to send through. WordPress keeps sending with its own mailer until you set a connection as primary. A backup takes over if the primary fails.',
			'vulomail'
		),
		empty: '',
	},
	{
		id: 'sms',
		title: __('SMS', 'vulomail'),
		icon: 'send',
		desc: __(
			'Add an SMS gateway to send text messages. The first one you add becomes the primary; a backup takes over if it fails.',
			'vulomail'
		),
		empty: __('No SMS gateway connected yet, so no text messages are sent.', 'vulomail'),
	},
];

const Connections = () => {
	const [payload, setPayload] = useState<ConnectionsPayload | null>(null);
	const [error, setError] = useState('');
	const [editing, setEditing] = useState<Editing | null>(null);
	const [pendingDelete, setPendingDelete] = useState<Connection | null>(null);

	useEffect(() => {
		apiGet<ConnectionsPayload>('connections')
			.then(setPayload)
			.catch((e) => setError(errorMessage(e)));
	}, []);

	// Back from "Sign in with Google": say how it went, then drop the result from the address so a
	// reload doesn't repeat it.
	useEffect(() => {
		const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
		const outcome = params.get('google');

		if (!outcome) {
			return;
		}

		notify('connected' === outcome ? 'success' : 'error', params.get('google_message') ?? '', 'vulomail-google');

		params.delete('google');
		params.delete('google_message');
		window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${params.toString()}`);
	}, []);

	const confirmDelete = () => {
		if (!pendingDelete) {
			return;
		}

		apiDelete<ConnectionsPayload>(`connections/${pendingDelete.id}`)
			.then((next) => {
				setPayload(next);
				notify('success', __('Connection deleted.', 'vulomail'));
			})
			.catch((e) => notify('error', errorMessage(e)))
			.finally(() => setPendingDelete(null));
	};

	if (error) {
		return (
			<CardComponent title={__('Connections', 'vulomail')} titleIcon="error">
				<ModuleGuardComponent icon="error" title={__('Could not load connections', 'vulomail')} desc={error} />
			</CardComponent>
		);
	}

	if (!payload) {
		return (
			<CardComponent title={__('Connections', 'vulomail')} titleIcon="mail" isLoading />
		);
	}

	/** Points a routing slot at a connection, keeping primary and backup distinct. */
	const setSlot = (channel: Channel, slot: 'primary' | 'backup', id: string) => {
		const primaryKey = `${channel}_primary` as keyof Routing;
		const backupKey = `${channel}_backup` as keyof Routing;
		const changes: Partial<Routing> = { [`${channel}_${slot}`]: id };

		// One connection can't hold both slots; taking one frees the other.
		if ('primary' === slot && payload.routing[backupKey] === id) {
			changes[backupKey] = '';
		}

		if ('backup' === slot && payload.routing[primaryKey] === id) {
			changes[primaryKey] = '';
		}

		// Back to the WordPress mailer as primary: nothing is left for a backup to back up.
		if ('primary' === slot && '' === id) {
			changes[backupKey] = '';
		}

		const previousRouting = payload.routing;

		setPayload({ ...payload, routing: { ...payload.routing, ...changes } });

		apiPost<Partial<SettingsShape>>('settings', changes)
			.then((saved) => {
				// The server is the source of truth: a routing slot it rejected (e.g. the
				// connection failed validation) must not be left looking set on screen.
				setPayload((current) =>
					current
						? {
								...current,
								routing: ROUTING_KEYS.reduce(
									(routing, key) => ({ ...routing, [key]: saved[key] ?? routing[key] }),
									current.routing
								),
						  }
						: current
				);
				notify('success', __('Routing updated.', 'vulomail'));
			})
			.catch((e) => {
				setPayload((current) => (current ? { ...current, routing: previousRouting } : current));
				notify('error', errorMessage(e));
			});
	};

	/** Switches a connection on or off, without opening the edit form. */
	const toggleEnabled = (connection: Connection) => {
		apiPost<ConnectionsPayload>('connections', { id: connection.id, enabled: !connection.enabled })
			.then((next) => {
				setPayload(next);
				notify('success', connection.enabled ? __('Connection disabled.', 'vulomail') : __('Connection enabled.', 'vulomail'));
			})
			.catch((e) => notify('error', errorMessage(e)));
	};

	const renderChannel = (channel: (typeof CHANNELS)[number]) => {
		const connections = payload.connections.filter((item) => item.channel === channel.id);
		const primaryId = payload.routing[`${channel.id}_primary` as keyof Routing];
		const backupId = payload.routing[`${channel.id}_backup` as keyof Routing];
		const isEmail = 'email' === channel.id;

		const rows = connections.map((item) => {
			const isPrimary = primaryId === item.id;
			const isBackup = backupId === item.id;
			const incomplete = item.missing.length > 0;

			return {
				icon: `${channel.icon} ${isPrimary ? 'green' : 'blue'}`,
				title: (
					<span className="vulomail-row-title">
						{item.label}
						{isPrimary && <BadgeComponent color="green" text={__('Primary', 'vulomail')} />}
						{isBackup && <BadgeComponent color="blue" text={__('Backup', 'vulomail')} />}
						{!item.enabled && <BadgeComponent color="yellow" text={__('Disabled', 'vulomail')} />}
						{incomplete && <BadgeComponent color="red" text={__('Incomplete', 'vulomail')} />}
					</span>
				),
				desc: incomplete
					? `${item.provider_label} · ${sprintf(
							/* translators: %s: comma-separated field names. */
							__('Missing: %s', 'vulomail'),
							item.missing.join(', ')
					  )}`
					: [item.provider_label, item.settings.account_email].filter(Boolean).join(' · '),
				control: (
					<ButtonInput
						buttons={[
							...(!isPrimary && !incomplete && item.enabled
								? [
										{
											text: __('Set as primary', 'vulomail'),
											color: 'purple',
											onClick: () => setSlot(channel.id, 'primary', item.id),
										},
								  ]
								: []),
							...(!isPrimary && !isBackup && !incomplete && item.enabled && primaryId
								? [
										{
											text: __('Set as backup', 'vulomail'),
											color: 'purple',
											onClick: () => setSlot(channel.id, 'backup', item.id),
										},
								  ]
								: []),
							...(isBackup
								? [
										{
											text: __('Remove as backup', 'vulomail'),
											color: 'purple',
											onClick: () => setSlot(channel.id, 'backup', ''),
										},
								  ]
								: []),
							{
								text: item.enabled ? __('Disable', 'vulomail') : __('Enable', 'vulomail'),
								icon: item.enabled ? 'cross' : 'check',
								color: 'purple',
								onClick: () => toggleEnabled(item),
							},
							{
								text: __('Test', 'vulomail'),
								icon: 'send',
								color: 'purple',
								disabled: incomplete,
								onClick: () => {
									window.location.hash = `&tab=tools&connection=${item.id}`;
								},
							},
							{
								text: __('Edit', 'vulomail'),
								icon: 'edit',
								color: 'purple',
								onClick: () => setEditing({ channel: channel.id, connection: item }),
							},
							{
								text: __('Delete', 'vulomail'),
								icon: 'delete',
								color: 'border-red',
								onClick: () => setPendingDelete(item),
							},
						]}
					/>
				),
			};
		});

		// Email always has WordPress's own mailer to fall back on; it is the default until a
		// connection is made primary.
		if (isEmail) {
			rows.unshift({
				icon: `wordpress ${primaryId ? 'blue' : 'green'}`,
				title: (
					<span className="vulomail-row-title">
						{__('WordPress default mailer', 'vulomail')}
						{primaryId ? (
							<BadgeComponent color="blue" text={__('Built in', 'vulomail')} />
						) : (
							<BadgeComponent color="green" text={__('Primary', 'vulomail')} />
						)}
					</span>
				),
				desc: primaryId
					? __('Built into WordPress. Used only as a last resort, if that is switched on under Email.', 'vulomail')
					: __('Built into WordPress. Sends your email until you set one of your connections as primary.', 'vulomail'),
				control: primaryId ? (
					<ButtonInput
						buttons={{
							text: __('Set as primary', 'vulomail'),
							color: 'purple',
							onClick: () => setSlot('email', 'primary', ''),
						}}
					/>
				) : (
					<></>
				),
			});
		}

		return (
			<div className="settings-section-group" key={channel.id}>
				<div className="settings-left-section">
					<SectionComponent icon={channel.icon} title={channel.title} desc={channel.desc} />
				</div>
				<div className="settings-right-section">
					<FormGroupWrapperComponent>
						<FormGroupComponent>
							<div className="vulomail-inline vulomail-connections-add">
								<ButtonInput
									buttons={{
										text: isEmail
											? __('Add email connection', 'vulomail')
											: __('Add SMS connection', 'vulomail'),
										icon: 'plus',
										onClick: () => setEditing({ channel: channel.id }),
									}}
								/>
							</div>
							{rows.length > 0 ? (
								<SettingRowComponent rows={rows} />
							) : (
								<NoticeComponent displayPosition="inline-notice" type="info" message={channel.empty} />
							)}
							{connections.length > 0 && isEmail && !primaryId && (
								<NoticeComponent
									displayPosition="inline-notice"
									type="info"
									message={
										connections.some((item) => item.enabled && 0 === item.missing.length)
											? __('Your connection is saved but not in use yet. Choose "Set as primary" to start sending email through it.', 'vulomail')
											: __('Your connection is saved but switched off or missing a field. Fix or enable it below, then choose "Set as primary".', 'vulomail')
									}
								/>
							)}
						</FormGroupComponent>
					</FormGroupWrapperComponent>
				</div>
			</div>
		);
	};

	return (
		<>
			{CHANNELS.map(renderChannel)}
			<PopupComponent
				open={Boolean(editing)}
				onClose={() => setEditing(null)}
				width={44}
				height="auto"
				position="lightbox"
				className="vulomail-connection-popup"
				header={{
					icon: 'sms' === editing?.channel ? 'send' : 'mail',
					title: editing?.connection
						? __('Edit connection', 'vulomail')
						: 'sms' === editing?.channel
						? __('Add SMS connection', 'vulomail')
						: __('Add email connection', 'vulomail'),
					description:
						'sms' === editing?.channel
							? __('Connect the SMS gateway your text messages are sent through.', 'vulomail')
							: __('Connect the email service your site\'s email is sent through.', 'vulomail'),
				}}
			>
				{editing && (
					<ConnectionForm
						// Remount per connection so the form never shows another connection's values.
						key={editing.connection?.id ?? `new-${editing.channel}`}
						channel={editing.channel}
						connection={editing.connection}
						onCancel={() => setEditing(null)}
						onSaved={(next) => {
							setPayload(next);
							setEditing(null);
						}}
					/>
				)}
			</PopupComponent>
			<PopupComponent
				open={Boolean(pendingDelete)}
				onClose={() => setPendingDelete(null)}
				width={28}
				height="auto"
				position="lightbox"
				header={{ icon: 'delete', title: __('Delete this connection?', 'vulomail') }}
			>
				<div className="vulomail-popup-body">
					<p>
						{sprintf(
							/* translators: %s: connection name. */
							__(
								'"%s" and its saved credentials will be removed. Messages will stop going through it straight away.',
								'vulomail'
							),
							pendingDelete?.label ?? ''
						)}
					</p>
					<div className="vulomail-form-footer">
						<ButtonInput
							buttons={[
								{
									text: __('Keep connection', 'vulomail'),
									color: 'purple',
									onClick: () => setPendingDelete(null),
								},
								{
									text: __('Delete connection', 'vulomail'),
									icon: 'delete',
									color: 'border-red',
									onClick: confirmDelete,
								},
							]}
						/>
					</div>
				</div>
			</PopupComponent>
		</>
	);
};

export default Connections;
