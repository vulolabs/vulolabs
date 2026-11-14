/* global vuloformAppLocalizer */
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink } from '@zyra/core';
import {
	AnalyticsComponent,
	BadgeComponent,
	CardComponent,
	ColumnComponent,
	ContainerComponent,
	ModuleGuardComponent,
	NavigatorHeaderComponent,
	NoticeComponent,
	PopupComponent,
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { TableCard } from '@zyra/table';
import { apiDelete, apiGet, apiPost } from '../services/api';
import { errorMessage, notify } from '../services/notify';

interface Row {
	id: number;
	status: 'unread' | 'read' | 'spam';
	created_at_display: string;
	preview: { label: string; text: string }[];
	// Only set when "All forms" is selected, since every row can be a different form there.
	form_title?: string;
	[key: string]: unknown;
}

interface List {
	data: Row[];
	total: number;
	status_counts: { unread: number; read: number; spam: number };
}

interface Detail {
	id: number;
	status: Row['status'];
	created_at_display: string;
	page_url: string;
	ip: string;
	// `label`, `status_label` and `color` let an extension describe an event type the core does not know.
	events: { type: string; name: string; status: string; detail: string; label?: string; status_label?: string; color?: string }[];
	fields: { key: string; label: string; type: string; text: string; files: { name: string; size: string; index: number }[] }[];
}

interface TableQuery {
	paged?: number | string;
	per_page?: number | string;
	searchValue?: string;
	categoryFilter?: string;
	filter?: { date?: { startDate?: Date | string; endDate?: Date | string }; status?: string };
}

// The icon the builder shows for each kind of field.
const FIELD_ICONS: Record<string, string> = {
	text: 'form-textbox',
	textarea: 'form-textarea',
	email: 'form-email',
	phone: 'form-phone',
	number: 'arrow-down-up',
	url: 'form-url',
	select: 'form-dropdown',
	radio: 'form-radio',
	checkboxes: 'form-checkboxes',
	consent: 'check',
	date: 'calendar',
	time: 'clock',
	file: 'form-attachment',
	name: 'profile',
	address: 'form-address',
	hidden: 'eye-blocked',
	calculation: 'commission',
	signature: 'edit',
};

/** One answer, shown the way its kind deserves: an address you can click, a yes or no, or plain text. */
const answer = (type: string, text: string) => {
	const value = text.trim();

	if ('' === value) {
		return <span className="vuloform-answer-none">{__('Not answered', 'vuloform')}</span>;
	}

	if ('email' === type && /^[^\s@]+@[^\s@]+$/.test(value)) {
		return <a href={`mailto:${value}`}>{value}</a>;
	}

	if ('phone' === type) {
		return <a href={`tel:${value.replace(/[^\d+]/g, '')}`}>{value}</a>;
	}

	if ('url' === type && /^https?:\/\//i.test(value)) {
		return (
			<a href={value} target="_blank" rel="noreferrer noopener">
				{value}
			</a>
		);
	}

	if ('consent' === type) {
		return <BadgeComponent color="green" text={value} />;
	}

	return value;
};

const EVENT_COLORS: Record<string, string> = { handed_off: 'green', delivered: 'green', failed: 'red', retry: 'yellow', skipped: 'yellow' };

const EVENT_LABELS: Record<string, string> = {
	handed_off: __('Handed off', 'vuloform'),
	delivered: __('Delivered', 'vuloform'),
	failed: __('Failed', 'vuloform'),
	retry: __('Will retry', 'vuloform'),
	skipped: __('Skipped', 'vuloform'),
};

const EVENT_TYPES: Record<string, string> = {
	email: __('Email', 'vuloform'),
	sms: __('SMS', 'vuloform'),
	webhook: __('Webhook', 'vuloform'),
};

const pickedDay = (value: Date | string | undefined): string | undefined => {
	const date = value ? new Date(value) : null;

	if (!date || Number.isNaN(date.getTime())) {
		return undefined;
	}

	const pad = (part: number) => String(part).padStart(2, '0');

	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Fetches a private file or export with the admin's nonce and hands it to the browser as a download. */
const download = (endpoint: string, params: Record<string, string | number | undefined>, fallbackName: string) => {
	const base = getApiLink(vuloformAppLocalizer, endpoint);
	const query = Object.entries(params)
		.filter(([, value]) => value !== undefined && value !== '')
		.map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
		.join('&');

	fetch(base + (query ? (base.includes('?') ? '&' : '?') + query : ''), { headers: { 'X-WP-Nonce': vuloformAppLocalizer.nonce } })
		.then((response) => {
			if (!response.ok) {
				throw new Error(__('The download failed.', 'vuloform'));
			}

			const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;

			return response.blob().then((blob) => ({ blob, name }));
		})
		.then(({ blob, name }) => {
			const link = document.createElement('a');

			link.href = URL.createObjectURL(blob);
			link.download = name;
			link.click();
			URL.revokeObjectURL(link.href);
		})
		.catch((e) => notify('error', errorMessage(e)));
};

/**
 * Submissions: pick a form, then search, filter, read, mark, export and delete what people sent.
 */
const Submissions = () => {
	const linkedForm = Number(new URLSearchParams(useLocation().hash).get('form')) || 0;
	const [forms, setForms] = useState<{ id: number; title: string; submissions?: number }[] | null>(null);
	const startForm = linkedForm ? String(linkedForm) : 'all';
	const startQuery: TableQuery = { paged: 1, per_page: 10, categoryFilter: startForm };
	const [query, setQuery] = useState<TableQuery>(startQuery);
	// The form pills are the table's categories, so the picked form lives in the table's own query.
	const formId = query.categoryFilter && 'all' !== query.categoryFilter ? Number(query.categoryFilter) : 0;
	const status = query.filter?.status && 'inbox' !== query.filter.status ? query.filter.status : 'inbox';
	const [list, setList] = useState<List>({ data: [], total: 0, status_counts: { unread: 0, read: 0, spam: 0 } });
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState('');
	const [reload, setReload] = useState(0);
	const [detail, setDetail] = useState<Detail | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	// Bumped to remount TableCard (its `key` below) and drop its own internal filter/search/paging
	// state back to defaults — there's no other way to clear it from outside.
	const [resetCount, setResetCount] = useState(0);

	const onQueryUpdate = useCallback((next: TableQuery) => setQuery(next), []);

	const hasActiveFilter = Boolean(query.filter?.date || query.searchValue || (query.filter?.status && 'inbox' !== query.filter.status));

	const resetFilters = () => {
		setQuery(startQuery);
		setResetCount((n) => n + 1);
	};

	useEffect(() => {
		apiGet<{ data: { id: number; title: string; submissions?: number }[] }>('forms', { per_page: 100 })
			.then((result) => setForms(result.data))
			.catch((e) => setError(errorMessage(e)));
	}, []);

	const filters = {
		form_id: formId,
		status,
		search: query.searchValue || undefined,
		after: pickedDay(query.filter?.date?.startDate),
		before: pickedDay(query.filter?.date?.endDate),
	};

	useEffect(() => {
		// formId 0 is "All forms", a real, fetchable state — only wait for the forms list itself.
		if (!forms) {
			return undefined;
		}

		let cancelled = false;

		setIsLoading(true);

		apiGet<List>('submissions', { ...filters, page: query.paged, per_page: query.per_page })
			.then((data) => {
				if (!cancelled) {
					setList(data);
					setError('');
				}
			})
			.catch((e) => !cancelled && setError(errorMessage(e)))
			.finally(() => !cancelled && setIsLoading(false));

		return () => {
			cancelled = true;
		};
	}, [forms, formId, query, reload]);

	const refresh = () => setReload((n) => n + 1);

	const openDetail = (id: number) => {
		apiGet<Detail>(`submissions/${id}`)
			.then((data) => {
				setDetail(data);
				// Opening a submission marks it read; the list should show that.
				refresh();
			})
			.catch((e) => notify('error', errorMessage(e)));
	};

	const setStatus = (status: Row['status']) => {
		if (!detail) {
			return;
		}

		apiPost('submissions/status', { ids: [detail.id], status })
			.then(() => {
				setDetail(null);
				refresh();
			})
			.catch((e) => notify('error', errorMessage(e)));
	};

	const remove = () => {
		if (!detail) {
			return;
		}

		apiDelete('submissions', { ids: [detail.id] })
			.then(() => {
				notify('success', __('Submission deleted.', 'vuloform'));
				setDetail(null);
				setConfirmDelete(false);
				refresh();
			})
			.catch((e) => notify('error', errorMessage(e)));
	};

	const counts = list.status_counts;

	return (
		<>
			<NavigatorHeaderComponent
				headerIcon="mail"
				headerTitle={__('Submissions', 'vuloform')}
				headerDescription={__('What people have sent through your forms. Only administrators can see this.', 'vuloform')}
				headerCustomContent={
					forms && forms.length > 0 ? (
						<div className="vuloform-inline">
							<ButtonInput
								buttons={{
									text: __('Export CSV', 'vuloform'),
									icon: 'export',
									color: 'white',
									disabled: 0 === list.total,
									tooltip: 0 === list.total ? __('There is nothing to export.', 'vuloform') : undefined,
									onClick: () => download('submissions/export', filters, 'submissions.csv'),
								}}
							/>
						</div>
					) : undefined
				}
			/>
			<ContainerComponent general>
				{!error && forms && forms.length > 0 && (
					<ColumnComponent>
						<AnalyticsComponent
							variant="trend-stat"
							cols={3}
							data={[
								{ icon: 'mail', number: counts.unread, text: __('New', 'vuloform'), desc: __('Not opened yet', 'vuloform') },
								{ icon: 'check', number: counts.read, text: __('Read', 'vuloform'), desc: __('Already opened', 'vuloform') },
								{ icon: 'error', number: counts.spam, text: __('Spam', 'vuloform'), desc: __('Caught by spam protection', 'vuloform') },
							]}
						/>
					</ColumnComponent>
				)}
				<ColumnComponent>
				<CardComponent>
					{error && <ModuleGuardComponent icon="error" title={__('Could not load submissions', 'vuloform')} desc={error} />}
					{!error && forms && 0 === forms.length && (
						<ModuleGuardComponent
							icon="form"
							title={__('No forms yet', 'vuloform')}
							desc={__('Create and publish a form, and what people send will appear here.', 'vuloform')}
							buttonText={__('Go to forms', 'vuloform')}
							onButtonClick={() => {
								window.location.hash = '&tab=forms';
							}}
						/>
					)}
					{!error && forms && forms.length > 0 && (
						<TableCard
							key={resetCount}
							search={{ placeholder: __('Search submissions…', 'vuloform') }}
							showMenu={false}
							filters={[
								{ key: 'date', type: 'date', label: __('Date range', 'vuloform') },
								{
									key: 'status',
									type: 'select',
									label: __('Status', 'vuloform'),
									size: 9,
									options: [
										{ value: 'inbox', label: __('Inbox', 'vuloform') },
										{ value: 'unread', label: __('New', 'vuloform') },
										{ value: 'read', label: __('Read', 'vuloform') },
										{ value: 'spam', label: __('Spam', 'vuloform') },
									],
								},
							]}
							filtersBeforeSearch
							buttonActions={
								hasActiveFilter
									? [{ label: __('Reset filters', 'vuloform'), icon: 'refresh', color: 'red', onClick: resetFilters }]
									: undefined
							}
							format={vuloformAppLocalizer.date_format_js}
							headers={{
								preview: {
									label: __('Submission', 'vuloform'),
									render: (row: Row) => {
										const [first, ...rest] = row.preview;
										const isNew = 'unread' === row.status;

										return (
											<button type="button" className={`vuloform-sub${isNew ? ' is-new' : ''}`} onClick={() => openDetail(row.id)}>
												<span className="vuloform-sub-avatar" aria-hidden="true">
													{first ? first.text.trim().charAt(0).toUpperCase() : '?'}
												</span>
												<span className="vuloform-sub-text">
													<span className="vuloform-sub-title">
														{first ? first.text : __('(empty)', 'vuloform')}
														{isNew && <span className="vuloform-sub-dot" aria-hidden="true" />}
													</span>
													{rest.length > 0 && (
														<span className="vuloform-sub-line">
															{rest.map((item) => (
																<span key={item.label}>
																	<em>{item.label}</em> {item.text}
																</span>
															))}
														</span>
													)}
													<span className="vuloform-sub-meta">
														{0 === formId && row.form_title ? `${row.form_title} · ` : ''}#{row.id}
													</span>
												</span>
											</button>
										);
									},
								},
								created_at_display: { label: __('Received', 'vuloform') },
								status: {
									label: __('Status', 'vuloform'),
									render: (row: Row) => {
										if ('spam' === row.status) {
											return <BadgeComponent color="red" text={__('Spam', 'vuloform')} />;
										}

										return 'unread' === row.status ? (
											<BadgeComponent color="blue" text={__('New', 'vuloform')} />
										) : (
											<BadgeComponent color="green" text={__('Read', 'vuloform')} />
										);
									},
								},
								id: {
									label: '',
									render: (row: Row) => (
										<ButtonInput buttons={{ text: __('View', 'vuloform'), icon: 'eye', color: 'purple', onClick: () => openDetail(row.id) }} />
									),
								},
							}}
							rows={list.data}
							ids={list.data.map((row) => row.id)}
							totalRows={list.total}
							activeCategory={startForm}
							categoryCounts={[
								{ value: 'all', label: __('All forms', 'vuloform'), count: forms.reduce((sum, form) => sum + (form.submissions ?? 0), 0) },
								...forms.map((form) => ({ value: String(form.id), label: form.title, count: form.submissions ?? 0 })),
							]}
							isLoading={isLoading}
							onQueryUpdate={onQueryUpdate}
							emptyMessage={__('Nothing here yet.', 'vuloform')}
						/>
					)}
				</CardComponent>
				</ColumnComponent>
			</ContainerComponent>
			<PopupComponent
				open={Boolean(detail) && !confirmDelete}
				onClose={() => setDetail(null)}
				width={44}
				height="auto"
				position="lightbox"
				header={{
					icon: 'mail',
					title: sprintf(
						/* translators: %d: submission number. */
						__('Submission #%d', 'vuloform'),
						detail?.id ?? 0
					),
					description: detail?.created_at_display,
				}}
			>
				{detail && (
					<div className="vuloform-popup-body">
						<div className="vuloform-answers">
							{detail.fields.map((field) => {
								const isEmpty = 0 === field.files.length && '' === field.text.trim();
								const isLong = ['textarea', 'address', 'checkboxes'].includes(field.type) || field.text.length > 80 || field.text.includes('\n');

								return (
									<div key={field.key} className={`vuloform-answer${isLong ? ' is-long' : ''}${isEmpty ? ' is-empty' : ''}`}>
										<span className="vuloform-answer-label">
											<i className={`adminfont-${FIELD_ICONS[field.type] ?? 'form-textbox'}`} aria-hidden="true" />
											{field.label}
										</span>
										<span className="vuloform-answer-value">
											{field.files.length > 0 &&
												field.files.map((file) => (
													<button
														type="button"
														key={file.index}
														className="vuloform-answer-file"
														onClick={() => download(`submissions/${detail.id}/file`, { key: field.key, index: file.index }, file.name)}
													>
														<i className="adminfont-export" aria-hidden="true" />
														{file.name}
														<small>{file.size}</small>
													</button>
												))}
											{0 === field.files.length && answer(field.type, field.text)}
										</span>
									</div>
								);
							})}
						</div>
						{(detail.page_url || detail.ip) && (
							<dl className="vuloform-answer-meta">
								{detail.page_url && (
									<div>
										<dt>{__('Sent from', 'vuloform')}</dt>
										<dd>
											<a href={detail.page_url} target="_blank" rel="noreferrer noopener">
												{detail.page_url}
											</a>
										</dd>
									</div>
								)}
								{detail.ip && (
									<div>
										<dt>{__('IP address', 'vuloform')}</dt>
										<dd>{detail.ip}</dd>
									</div>
								)}
							</dl>
						)}
						{detail.events.map((event, index) => (
							<NoticeComponent
								key={index}
								displayPosition="inline-notice"
								type={'failed' === event.status ? 'error' : 'info'}
								message={`${event.label ?? EVENT_TYPES[event.type] ?? event.type} "${event.name}": ${event.detail}`}
							>
								<BadgeComponent
									color={event.color ?? EVENT_COLORS[event.status] ?? 'blue'}
									text={event.status_label ?? EVENT_LABELS[event.status] ?? event.status}
								/>
							</NoticeComponent>
						))}
						<div className="vuloform-form-footer">
							<ButtonInput
								buttons={[
									{ text: __('Delete', 'vuloform'), icon: 'delete', color: 'border-red', onClick: () => setConfirmDelete(true) },
									'spam' === detail.status
										? { text: __('Not spam', 'vuloform'), color: 'purple', onClick: () => setStatus('read') }
										: { text: __('Mark as spam', 'vuloform'), color: 'purple', onClick: () => setStatus('spam') },
									...('spam' === detail.status ? [] : [{ text: __('Mark as new', 'vuloform'), color: 'purple', onClick: () => setStatus('unread') }]),
								]}
							/>
						</div>
					</div>
				)}
			</PopupComponent>
			<PopupComponent
				open={confirmDelete}
				onClose={() => setConfirmDelete(false)}
				width={28}
				height="auto"
				position="lightbox"
				header={{ icon: 'delete', title: __('Delete this submission?', 'vuloform') }}
			>
				<div className="vuloform-popup-body">
					<p>{__('The submission and any files uploaded with it will be permanently deleted.', 'vuloform')}</p>
					<div className="vuloform-form-footer">
						<ButtonInput
							buttons={[
								{ text: __('Keep', 'vuloform'), color: 'purple', onClick: () => setConfirmDelete(false) },
								{ text: __('Delete submission', 'vuloform'), icon: 'delete', color: 'border-red', onClick: remove },
							]}
						/>
					</div>
				</div>
			</PopupComponent>
		</>
	);
};

export default Submissions;
