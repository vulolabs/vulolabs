/* global vulomailAppLocalizer */
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink } from '@zyra/core';
import {
	ContainerComponent,
	ModuleGuardComponent,
	NoticeManager,
} from '@zyra/components';
import {
	EmailTemplateEditorPopup,
	emailBlocksToLegacyEmailBlocks,
	legacyEmailBlocksToEmailBlocks,
	renderBlocksToHTML,
	htmlToBlocks,
	type Block,
	type EmailBlock,
	type EmailTemplate,
	type LegacyEmailBlock,
} from '@zyra/builders';
import type { EmailSource } from '../global';
import { errorMessage } from '../services/notify';
import { SelectInput, TextInput } from '@zyra/inputs';
import { apiGet, apiPost } from '../services/api';

interface Recipient {
	id: number;
	type: string;
	label: string;
	enabled: boolean;
	canDelete: boolean;
}

interface EmailTemplateRow {
	id: number;
	event: string;
	description: string;
	category: string;
	tag: string;
	recipients: Recipient[];
	channels: { mail?: boolean; sms?: boolean; system?: boolean };
	email_subject: string | null;
	// Which registered source this row came from — not part of the
	// plugin's own REST response, stamped on after fetching.
	__source: EmailSource;
	// Set for a template from the registry (`vulomail_email_templates`): its `plugin/name`.
	__name?: string;
	// The section it is listed under, and who receives it.
	__group?: string;
	__audience?: Audience[];
}

// Every registered plugin's own REST namespace lives on the same site as
// vulomail's, just under a different namespace segment — `getApiLink`'s
// `namespace` override builds that URL. The owning plugin's own
// `wp_verify_nonce( ..., 'wp_rest' )` permission check still runs though
// (e.g. `multivendorx_permissions_check`), so every call needs the same
// `X-WP-Nonce` header vulomail's own `services/api.ts` already sends for
// its own REST calls — a shared `wp_rest` nonce works across plugins on
// one site, it's just never attached automatically for a cross-namespace
// call the way axios's default config is for vulomail's own.
const sourceGet = <T,>(source: EmailSource, endpoint: string) =>
	axios
		.get<T>(getApiLink(vulomailAppLocalizer, endpoint, source.rest_namespace), {
			headers: { 'X-WP-Nonce': vulomailAppLocalizer.nonce },
		})
		.then((res) => res.data);

const sourcePost = <T,>(source: EmailSource, endpoint: string, data: unknown) =>
	axios
		.post<T>(getApiLink(vulomailAppLocalizer, endpoint, source.rest_namespace), data, {
			headers: { 'X-WP-Nonce': vulomailAppLocalizer.nonce },
		})
		.then((res) => res.data);

// Every registered plugin's own REST shape (see each plugin's
// `email-templates` route — e.g. multivendorx's
// `classes/RestAPI/Controllers/Notifications.php`).
const fetchSourceTemplates = (source: EmailSource) =>
	sourceGet<Omit<EmailTemplateRow, '__source'>[]>(source, 'email-templates').then(
		(rows) => rows.map((row) => ({ ...row, __source: source }))
	);

type Audience = 'store' | 'customer' | 'admin';

interface RegistryItem {
	name: string;
	title: string;
	description: string;
	category: string;
	category_label: string;
	subject: string;
	group: string;
	recipients: Audience[];
	enabled: boolean;
}

// The templates plugins register with `vulomail_email_templates`, as table rows.
const fetchRegistryTemplates = () =>
	apiGet<{ templates: RegistryItem[] }>('templates').then(({ templates }) =>
		templates.map(
			(item, index): EmailTemplateRow => ({
				id: -1 - index,
				event: item.title,
				description: item.description,
				category: item.category,
				tag: item.category_label,
				recipients: [],
				channels: { mail: item.enabled },
				email_subject: item.subject,
				__source: { plugin: item.category, label: item.category_label, rest_namespace: '' },
				__name: item.name,
				__group: item.group,
				__audience: item.recipients,
			})
		)
	);

interface StarterTemplates {
	email_body?: string;
	legacy_blocks?: LegacyEmailBlock[];
	templates?: { id: string; name: string; previewText?: string; blocks?: LegacyEmailBlock[]; email_body?: string }[];
}

const EmailTemplates = () => {
	const sources = vulomailAppLocalizer.email_sources || [];
	const [rows, setRows] = useState<EmailTemplateRow[] | null>(null);
	// `TableCard`'s category pills only drive their own highlight/count
	// UI and report the selected value via `onQueryUpdate` — filtering
	// the actual row list for that category is the caller's own job.
	const [categoryFilter, setCategoryFilter] = useState('all');
	const [error, setError] = useState('');
	const [editing, setEditing] = useState<{
		row: EmailTemplateRow;
		blocks: EmailBlock[];
		// Starter templates the owning plugin offers, for the editor's Templates tab.
		templates: EmailTemplate[];
		activeTemplateId?: string;
	} | null>(null);

	const loadAll = useCallback(() => {
		Promise.all([fetchRegistryTemplates(), ...sources.map(fetchSourceTemplates)])
			.then((lists) => setRows(lists.flat()))
			.catch((e) => setError(errorMessage(e)));
	}, [sources]);

	useEffect(loadAll, [loadAll]);

	// `#&tab=email-templates&source=multivendorx&template=12` opens that template's editor, so a plugin's
	// own screen can send people straight to the email they clicked.
	const [deepLinked, setDeepLinked] = useState(false);

	useEffect(() => {
		if (deepLinked || !rows) {
			return;
		}

		const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
		const source = hash.get('source');
		const template = hash.get('template');

		setDeepLinked(true);

		if (null === template) {
			return;
		}

		// `#&tab=email-templates&template=multivendorx/store-pending-approval` opens a registered template.
		const registered = rows.find((r: EmailTemplateRow) => r.__name === template);

		if (registered) {
			openEditor(registered);
			return;
		}

		if (!source) {
			return;
		}

		// `&source=catalogx&template=12`: an email a plugin serves from its own REST route.
		const found = rows.find((r: EmailTemplateRow) => r.__source.plugin === source && String(r.id) === template);
		const owner = sources.find((candidate) => candidate.plugin === source);
		const row =
			found ||
			(owner && /^\d+$/.test(template)
				? ({
						id: Number(template),
						event: '',
						description: '',
						category: '',
						tag: '',
						recipients: [],
						channels: {},
						email_subject: null,
						__source: owner,
				  } as EmailTemplateRow)
				: null);

		if (row) {
			openEditor(row);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [rows]);

	const categoryCounts = useMemo(() => {
		if (!rows) {
			return [];
		}
		const counts = [{ value: 'all', label: __('All', 'vulomail'), count: rows.length }];
		const seen = new Map<string, { label: string; count: number }>();

		rows.forEach((r: EmailTemplateRow) => {
			const entry = seen.get(r.__source.plugin) || { label: r.__source.label, count: 0 };

			seen.set(r.__source.plugin, { ...entry, count: entry.count + 1 });
		});
		seen.forEach((entry, value) => counts.push({ value, label: entry.label, count: entry.count }));
		return counts;
	}, [rows]);

	const visibleRows = useMemo(() => {
		if (!rows) {
			return [];
		}
		if ('all' === categoryFilter) {
			return rows;
		}
		return rows.filter((r: EmailTemplateRow) => r.__source.plugin === categoryFilter);
	}, [rows, categoryFilter]);

	const toggleMail = (row: EmailTemplateRow) => {
		const nextChannels = { ...row.channels, mail: !row.channels.mail };
		setRows(
			(prev: EmailTemplateRow[] | null) =>
				prev?.map((r: EmailTemplateRow) =>
					r.id === row.id && r.__source.plugin === row.__source.plugin
						? { ...r, channels: nextChannels }
						: r
				) ?? null
		);
		sourcePost(row.__source, `email-templates/${row.id}`, {
			notifications: [
				{
					id: row.id,
					channels: nextChannels,
					recipients: row.recipients,
				},
			],
		});
	};

	const openRegistered = (row: EmailTemplateRow) => {
		apiGet<{
			subject?: string;
			content?: string;
			blocks?: LegacyEmailBlock[];
			starters?: { id: string; name: string; previewText?: string; blocks?: LegacyEmailBlock[] | null; email_body?: string | null }[];
		}>('templates/item', { name: row.__name })
			.then((full) => {
				const toBlocks = (blocks?: LegacyEmailBlock[] | null, html?: string | null) =>
					legacyEmailBlocksToEmailBlocks(
						blocks && blocks.length
							? blocks
							: (htmlToBlocks(html || '') as unknown as LegacyEmailBlock[])
					);

				setEditing({
					row: { ...row, email_subject: full.subject ?? row.email_subject },
					blocks: toBlocks(full.blocks, full.content),
					templates: (full.starters || []).map((starter) => ({
						id: starter.id,
						name: starter.name,
						previewText: starter.previewText,
						blocks: toBlocks(starter.blocks, starter.email_body),
					})),
				});
			})
			.catch((e) =>
				NoticeManager.add({
					title: __('Could not open editor', 'vulomail'),
					message: errorMessage(e),
					type: 'error',
					position: 'float',
				})
			);
	};

	const openEditor = (row: EmailTemplateRow) => {
		if (row.__name) {
			openRegistered(row);
			return;
		}

		sourceGet<
			| StarterTemplates
			| StarterTemplates[]
		>(row.__source, `email-templates/${row.id}`)
			.then((data) => {
				const full = Array.isArray(data) ? data[0] : data;
				setEditing({
					// An event opened by id has no name until its data arrives.
					row: row.event
						? row
						: {
								...row,
								event: (full as { event?: string; event_name?: string })?.event || (full as { event_name?: string })?.event_name || row.event,
								email_subject: (full as { email_subject?: string | null })?.email_subject ?? row.email_subject,
						  },
					templates: (full?.templates || []).map((template) => ({
						id: template.id,
						name: template.name,
						previewText: template.previewText,
						// A template is either ready-made blocks, or an event's default email as HTML.
						blocks: legacyEmailBlocksToEmailBlocks(
							template.blocks ||
								(htmlToBlocks(template.email_body || '') as unknown as LegacyEmailBlock[])
						),
					})),
					// id 0 is the standalone "Email Template Customizer"
					// row (see multivendorx's `get_template_customizer_row`)
					// — it stores raw legacy blocks (one saved template),
					// not rendered HTML like every real event row does.
					blocks:
						row.id === 0
							? legacyEmailBlocksToEmailBlocks(full?.legacy_blocks || [])
							: legacyEmailBlocksToEmailBlocks(
								htmlToBlocks(full?.email_body || '') as unknown as LegacyEmailBlock[]
					  ),
				});
			})
			.catch((e) => {
				// A per-row failure here used to call the same `setError`
				// the initial full-list load uses, which replaces the
				// *entire* table with an error card — one row's editor
				// failing to open shouldn't take the whole list down with
				// it, so this reports it as a float notice instead.
				NoticeManager.add({
					title: __('Could not open editor', 'vulomail'),
					message: errorMessage(e),
					type: 'error',
					position: 'float',
				});
			});
	};

	const persist = (blocks: EmailBlock[]) => {
		if (!editing) {
			return;
		}
		const legacyBlocks = emailBlocksToLegacyEmailBlocks(blocks);

		if (editing.row.__name) {
			apiPost('templates/item', {
				name: editing.row.__name,
				subject: editing.row.email_subject ?? '',
				content: renderBlocksToHTML(legacyBlocks as unknown as Block[]),
				blocks: legacyBlocks,
			}).catch((e) =>
				NoticeManager.add({
					title: __('Could not save the email', 'vulomail'),
					message: errorMessage(e),
					type: 'error',
					position: 'float',
				})
			);
			return;
		}

		sourcePost(editing.row.__source, `email-templates/${editing.row.id}`, {
			formData:
				editing.row.id === 0
					? { id: 0, legacy_blocks: legacyBlocks }
					: {
							id: editing.row.id,
							email_subject: editing.row.email_subject,
							email_body: renderBlocksToHTML(legacyBlocks as unknown as Block[]),
						},
		});
	};

	const saveEditor = (blocks: EmailBlock[]) => {
		persist(blocks);
		setEditing((current) => (current ? { ...current, blocks } : current));
	};

	// Who an email is mostly for, for the one pill each row shows: you (admin), then customers, then stores.
	const primaryAudience = (row: EmailTemplateRow): Audience => {
		const audience: Audience[] =
			row.__audience ||
			row.recipients
				.filter((r) => r.enabled)
				.map((r) => r.label.toLowerCase())
				.filter((label): label is Audience => ['store', 'customer', 'admin'].includes(label));

		return audience.includes('admin') ? 'admin' : audience.includes('customer') ? 'customer' : 'store';
	};
	const audienceLabel: Record<Audience, string> = {
		store: __('Store', 'vulomail'),
		customer: __('Customer', 'vulomail'),
		admin: __('Admin', 'vulomail'),
	};

	const [search, setSearch] = useState('');
	const [audienceFilter, setAudienceFilter] = useState<'any' | Audience>('any');

	const setEnabled = (targets: EmailTemplateRow[], enabled: boolean) => {
		const keyOf = (r: EmailTemplateRow) => `${r.__source.plugin}:${r.id}`;
		const keys = new Set(targets.map(keyOf));

		setRows((prev: EmailTemplateRow[] | null) =>
			prev?.map((r: EmailTemplateRow) =>
				keys.has(keyOf(r)) ? { ...r, channels: { ...r.channels, mail: enabled } } : r
			) ?? null
		);

		const registered = targets.filter((r) => r.__name).map((r) => r.__name as string);

		if (registered.length) {
			apiPost('templates/enabled', { names: registered, enabled }).catch((e) =>
				NoticeManager.add({
					title: __('Could not switch the email', 'vulomail'),
					message: errorMessage(e),
					type: 'error',
					position: 'float',
				})
			);
		}

		// An email a plugin serves from its own REST route is switched through that route.
		targets
			.filter((r) => !r.__name && !!r.channels.mail !== enabled)
			.forEach((r) => toggleMail(r));
	};

	const shown = useMemo(() => {
		const query = search.trim().toLowerCase();

		return visibleRows.filter(
			(r: EmailTemplateRow) =>
				('any' === audienceFilter || primaryAudience(r) === audienceFilter) &&
				(!query || `${r.event} ${r.description}`.toLowerCase().includes(query))
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visibleRows, search, audienceFilter]);

	const sections = useMemo(() => {
		const map = new Map<string, EmailTemplateRow[]>();

		shown.forEach((r: EmailTemplateRow) => {
			const key = r.__group || __('General', 'vulomail');

			map.set(key, [...(map.get(key) || []), r]);
		});

		// General first, then the rest as they come.
		return [...map.entries()].sort(([a], [b]) => (a === __('General', 'vulomail') ? -1 : b === __('General', 'vulomail') ? 1 : 0));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [shown]);

	const totals = useMemo(() => {
		const all = rows || [];

		return {
			on: all.filter((r: EmailTemplateRow) => r.channels.mail).length,
			total: all.length,
			store: all.filter((r: EmailTemplateRow) => primaryAudience(r) === 'store').length,
			customer: all.filter((r: EmailTemplateRow) => primaryAudience(r) === 'customer').length,
			admin: all.filter((r: EmailTemplateRow) => primaryAudience(r) === 'admin').length,
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [rows]);

	let content = <p className="vulomail-emails-note">{__('Loading…', 'vulomail')}</p>;

	if (error) {
		content = (
			<ModuleGuardComponent
				icon="error"
				title={__('Could not load email templates', 'vulomail')}
				desc={error}
			/>
		);
	} else if (rows) {
		content = (
			<div className="vulomail-emails">
				<h2 className="vulomail-emails-title">{__('Email notifications', 'vulomail')}</h2>
				<p className="vulomail-emails-lead">
					{__('Every email your marketplace sends. Turn one on or off, or open it to change the design and wording.', 'vulomail')}
				</p>
				<p className="vulomail-emails-stats">
					<span>
						<b>{totals.on}</b> {sprintf(__('of %d on', 'vulomail'), totals.total)}
					</span>
					<span className="is-store">
						<b>{totals.store}</b> {__('to stores', 'vulomail')}
					</span>
					<span className="is-customer">
						<b>{totals.customer}</b> {__('to customers', 'vulomail')}
					</span>
					<span className="is-admin">
						<b>{totals.admin}</b> {__('to you', 'vulomail')}
					</span>
				</p>

				<div className="vulomail-emails-toolbar">
					<div className="vulomail-emails-tabs" role="tablist">
						{categoryCounts.map((tab: { value: string; label: string; count: number }) => (
							<button
								type="button"
								role="tab"
								aria-selected={categoryFilter === tab.value}
								key={tab.value}
								className={categoryFilter === tab.value ? 'is-active' : ''}
								onClick={() => setCategoryFilter(tab.value)}
							>
								{tab.label} <span>{tab.count}</span>
							</button>
						))}
					</div>
					<div className="vulomail-emails-select">
						<SelectInput
							name="sent_to"
							type="single-select"
							value={audienceFilter}
							options={[
								{ value: 'any', label: __('Sent to anyone', 'vulomail') },
								{ value: 'store', label: __('Sent to stores', 'vulomail') },
								{ value: 'customer', label: __('Sent to customers', 'vulomail') },
								{ value: 'admin', label: __('Sent to you', 'vulomail') },
							]}
							onChange={(value) => setAudienceFilter((Array.isArray(value) ? value[0] : value) as 'any' | Audience)}
						/>
					</div>
				</div>

				{0 === sections.length && (
					<p className="vulomail-emails-note">
						{__('No emails match. Plugins add their emails with the vulomail_email_templates filter.', 'vulomail')}
					</p>
				)}

				{sections.map(([group, items]) => {
					const onCount = items.filter((r: EmailTemplateRow) => r.channels.mail).length;

					return (
						<section className="vulomail-emails-section" key={group}>
							<header>
								<h3>
									{group} <span>{sprintf(__('%1$d of %2$d on', 'vulomail'), onCount, items.length)}</span>
								</h3>
								<button type="button" onClick={() => setEnabled(items, 0 === onCount)}>
									{0 === onCount ? __('Turn all on', 'vulomail') : __('Turn all off', 'vulomail')}
								</button>
							</header>
							<ul>
								{items.map((row: EmailTemplateRow) => {
									const audience = primaryAudience(row);

									return (
										<li key={`${row.__source.plugin}:${row.id}`}>
											<label className="vulomail-switch">
												<input
													type="checkbox"
													checked={!!row.channels.mail}
													onChange={() => setEnabled([row], !row.channels.mail)}
													aria-label={sprintf(__('Send %s', 'vulomail'), row.event)}
												/>
												<span className="vulomail-switch-track" />
											</label>
											<div className="vulomail-emails-text">
												<strong>
													{row.event}
													{'vulomail' === row.__source.plugin && <em>{row.__source.label}</em>}
												</strong>
												<span>{row.description}</span>
											</div>
											<span className={`vulomail-emails-pill is-${audience}`}>{audienceLabel[audience]}</span>
											<button type="button" className="vulomail-emails-edit" onClick={() => openEditor(row)}>
												{__('Customise', 'vulomail')}
											</button>
										</li>
									);
								})}
							</ul>
						</section>
					);
				})}
			</div>
		);
	}

	return (
		<>
			<ContainerComponent general>{content}</ContainerComponent>
			{editing && (
				<EmailTemplateEditorPopup
					open
					onClose={() => setEditing(null)}
					title={`${editing.row.event} - ${editing.row.__source.label}`}
					value={editing.blocks}
					onChange={saveEditor}
					templates={editing.templates.length ? editing.templates : undefined}
					activeTemplateId={editing.activeTemplateId}
					onTemplateSelect={(id) => {
						const template = editing.templates.find((t) => t.id === id);

						if (template) {
							// The editor swaps its canvas when the active template changes; saving keeps it.
							setEditing({ ...editing, blocks: template.blocks, activeTemplateId: id });
							persist(template.blocks);
						}
					}}
				/>
			)}
		</>
	);
};

export default EmailTemplates;
