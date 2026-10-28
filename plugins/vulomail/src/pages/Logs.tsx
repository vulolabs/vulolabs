/* global vulomailAppLocalizer */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { __, _n, sprintf } from '@wordpress/i18n';
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
import { ButtonInput, ToggleInput } from '@zyra/inputs';
import { TableCard } from '@zyra/table';
import { apiDelete, apiGet, apiPost } from '../services/api';
import { errorMessage, notify } from '../services/notify';
import { displayDate, providerLabel, settingsUrl } from '../services/types';
import { errorNoticeHtml } from '../services/errorHelp';
import type { Attempt } from '../services/types';

interface LogRow {
	id: number;
	channel: 'email' | 'sms';
	status: 'sent' | 'failed';
	provider: string;
	used_fallback: string | number;
	recipients: string;
	subject: string;
	attachments: string | number;
	source: string;
	error_message: string | null;
	created_at: string;
	created_at_display?: string;
	opened: Engagement;
	clicked: Engagement;
	[key: string]: unknown;
}

/** Whether an email was opened or clicked; 'not_tracked' when tracking didn't apply to it. */
type Engagement = 'yes' | 'no' | 'not_tracked';

interface TrackedLink {
	url: string;
	click_count: number;
	first_clicked_at: string;
	last_clicked_at: string;
}

interface Tracking {
	open_count: number;
	first_opened_at: string;
	last_opened_at: string;
	click_count: number;
	first_clicked_at: string;
	last_clicked_at: string;
	links: TrackedLink[];
}

interface LogDetail extends LogRow {
	body: string | null;
	has_body: boolean;
	can_resend: boolean;
	message_id: string;
	error_code: string;
	attempts: Attempt[];
	headers: Record<string, string>;
	tracking: Tracking;
}

interface LogList {
	data: LogRow[];
	total: number;
	status_counts: { sent: number; failed: number };
}

interface TableQuery {
	paged?: number | string;
	per_page?: number | string;
	searchValue?: string;
	categoryFilter?: string;
	filter?: { date?: { startDate?: Date | string; endDate?: Date | string } };
	orderby?: string;
	order?: string;
}

const CHANNELS = [
	{ key: 'all', value: 'all', label: __('All', 'vulomail') },
	{ key: 'email', value: 'email', label: __('Email', 'vulomail') },
	{ key: 'sms', value: 'sms', label: __('SMS', 'vulomail') },
];

/**
 * One end of the date-range filter as the calendar day that was picked (`YYYY-MM-DD`). The server
 * reads it in the site's timezone, so the range lines up with the dates the table shows.
 */
const pickedDay = (value: Date | string | undefined): string | undefined => {
	if (!value) {
		return undefined;
	}

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return undefined;
	}

	const pad = (part: number) => String(part).padStart(2, '0');

	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const statusBadge = (row: Pick<LogRow, 'status' | 'used_fallback'>) => {
	if ('failed' === row.status) {
		return <BadgeComponent color="red" text={__('Failed', 'vulomail')} />;
	}

	return Number(row.used_fallback) ? (
		<BadgeComponent color="yellow" text={__('Sent via backup', 'vulomail')} />
	) : (
		<BadgeComponent color="green" text={__('Sent', 'vulomail')} />
	);
};

const engagementBadge = (value: Engagement) =>
	'not_tracked' === value ? (
		<span className="vulomail-log-secondary">{__('Not tracked', 'vulomail')}</span>
	) : (
		<BadgeComponent color={'yes' === value ? 'green' : 'gray'} text={'yes' === value ? __('Yes', 'vulomail') : __('No', 'vulomail')} />
	);

/** "First – last" for a pair of display dates, or a dash when nothing was observed. */
const observedRange = (first: string, last: string): string => {
	if (!first) {
		return '—';
	}

	return first === last ? first : `${first} – ${last}`;
};

const Logs = () => {
	const [channel, setChannel] = useState('all');
	const [query, setQuery] = useState<TableQuery>({ paged: 1, per_page: 10 });
	const [list, setList] = useState<LogList>({ data: [], total: 0, status_counts: { sent: 0, failed: 0 } });
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState('');
	const [reload, setReload] = useState(0);
	const [detail, setDetail] = useState<LogDetail | null>(null);
	const [confirmClear, setConfirmClear] = useState(false);
	const [isBusy, setIsBusy] = useState(false);

	const onQueryUpdate = useCallback((next: TableQuery) => setQuery(next), []);

	// A link such as `#&tab=logs&log=12` (the Dashboard's "More Details") opens that entry directly.
	const linkedLogId = new URLSearchParams(useLocation().hash).get('log');

	useEffect(() => {
		if (linkedLogId && /^\d+$/.test(linkedLogId)) {
			apiGet<LogDetail>(`logs/${linkedLogId}`)
				.then(setDetail)
				.catch((e) => notify('error', errorMessage(e)));
		}
	}, [linkedLogId]);

	useEffect(() => {
		let cancelled = false;

		setIsLoading(true);

		apiGet<LogList>('logs', {
			channel: 'all' === channel ? undefined : channel,
			status: query.categoryFilter && 'all' !== query.categoryFilter ? query.categoryFilter : undefined,
			search: query.searchValue || undefined,
			after: pickedDay(query.filter?.date?.startDate),
			before: pickedDay(query.filter?.date?.endDate),
			page: query.paged,
			per_page: query.per_page,
			orderby: query.orderby || undefined,
			order: query.order || undefined,
		})
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
	}, [channel, query, reload]);

	const openDetail = (row: LogRow) => {
		apiGet<LogDetail>(`logs/${row.id}`)
			.then(setDetail)
			.catch((e) => notify('error', errorMessage(e)));
	};

	const deleteOne = () => {
		if (!detail) {
			return;
		}

		setIsBusy(true);

		apiDelete('logs', { ids: [detail.id] })
			.then(() => {
				notify('success', __('Log entry deleted.', 'vulomail'));
				setDetail(null);
				setReload((n) => n + 1);
			})
			.catch((e) => notify('error', errorMessage(e)))
			.finally(() => setIsBusy(false));
	};

	const resend = () => {
		if (!detail) {
			return;
		}

		setIsBusy(true);

		apiPost<{ success: boolean; message: string }>(`logs/${detail.id}/resend`)
			.then((result) => {
				notify(result.success ? 'success' : 'error', result.message);
				setDetail(null);
				setReload((n) => n + 1);
			})
			.catch((e) => notify('error', errorMessage(e)))
			.finally(() => setIsBusy(false));
	};

	const clearAll = () => {
		setIsBusy(true);

		apiDelete('logs', { all: true })
			.then(() => {
				notify('success', __('All log entries deleted.', 'vulomail'));
				setReload((n) => n + 1);
			})
			.catch((e) => notify('error', errorMessage(e)))
			.finally(() => {
				setIsBusy(false);
				setConfirmClear(false);
			});
	};

	const { sent, failed } = list.status_counts;

	return (
		<>
			<NavigatorHeaderComponent
				headerIcon="clock"
				headerTitle={__('Logs', 'vulomail')}
				headerDescription={__('Every email and text message this site has tried to send.', 'vulomail')}
				headerCustomContent={
					<div className="vulomail-inline">
						<ToggleInput
							options={CHANNELS}
							value={channel}
							onChange={(value) => setChannel(value as string)}
							modules={[]}
							variant="pill"
						/>
						<ButtonInput
							buttons={{
								text: __('Delete all logs', 'vulomail'),
								icon: 'delete',
								color: 'border-red',
								disabled: 0 === sent + failed,
								onClick: () => setConfirmClear(true),
							}}
						/>
					</div>
				}
			/>
			<ContainerComponent general>
				<ColumnComponent>
					<AnalyticsComponent
						variant="small"
						cols={3}
						data={[
							{ icon: 'check green', number: sent, text: __('Sent', 'vulomail') },
							{ icon: 'error red', number: failed, text: __('Failed', 'vulomail') },
							{
								icon: 'analytics blue',
								number: 0 === sent + failed ? '—' : `${Math.round((sent / (sent + failed)) * 100)}%`,
								text: __('Delivery rate', 'vulomail'),
							},
						]}
					/>
				</ColumnComponent>
				<ColumnComponent>
				<CardComponent id="logs-delivery-log-card" title={__('Delivery log', 'vulomail')} titleIcon="clock">
					{error ? (
						<ModuleGuardComponent icon="error" title={__('Could not load the log', 'vulomail')} desc={error} />
					) : (
						<TableCard
							search={{ placeholder: __('Search recipient or subject…', 'vulomail') }}
							showMenu={false}
							filters={[{ key: 'date', type: 'date', label: __('Date range', 'vulomail') }]}
							// Inline beside the search box, rather than zyra's floating filter bar.
							filtersBeforeSearch
							format={vulomailAppLocalizer.date_format_js}
							headers={{
								subject: {
									label: __('Message', 'vulomail'),
									render: (row: LogRow) => (
										<div className="vulomail-log-cell">
											<span className="vulomail-log-primary">
												<i
													className={`adminfont-${'sms' === row.channel ? 'send' : 'mail'}`}
													aria-hidden="true"
												/>
												{'sms' === row.channel
													? __('Text message', 'vulomail')
													: row.subject || __('(no subject)', 'vulomail')}
											</span>
											<span className="vulomail-log-secondary">
												{sprintf(
													/* translators: %s: recipient addresses or numbers. */
													__('To %s', 'vulomail'),
													row.recipients
												)}
											</span>
										</div>
									),
								},
								created_at: {
									label: __('Sent', 'vulomail'),
									isSortable: true,
									defaultSort: true,
									defaultOrder: 'desc',
									render: (row: LogRow) => (
										<div className="vulomail-log-cell">
											<span className="vulomail-log-primary">{displayDate(row)}</span>
											<span className="vulomail-log-secondary">
												{[
													providerLabel(row.provider) &&
														sprintf(
															/* translators: %s: provider name. */
															__('via %s', 'vulomail'),
															providerLabel(row.provider)
														),
													row.source,
												]
													.filter(Boolean)
													.join(' · ')}
											</span>
										</div>
									),
								},
								status: {
									label: __('Status', 'vulomail'),
									render: (row: LogRow) => statusBadge(row),
								},
								opened: {
									label: __('Opened', 'vulomail'),
									render: (row: LogRow) => engagementBadge(row.opened),
								},
								clicked: {
									label: __('Clicked', 'vulomail'),
									render: (row: LogRow) => engagementBadge(row.clicked),
								},
								id: {
									label: '',
									render: (row: LogRow) => (
										<ButtonInput
											buttons={{
												text: __('View', 'vulomail'),
												icon: 'eye',
												color: 'purple',
												onClick: () => openDetail(row),
											}}
										/>
									),
								},
							}}
							rows={list.data}
							ids={list.data.map((row) => row.id)}
							totalRows={list.total}
							categoryCounts={[
								// 'all' is TableCard's own default active category, so this pill starts selected.
								{
									value: 'all',
									label: __('All', 'vulomail'),
									count: list.status_counts.sent + list.status_counts.failed,
								},
								{ value: 'sent', label: __('Sent', 'vulomail'), count: list.status_counts.sent },
								{ value: 'failed', label: __('Failed', 'vulomail'), count: list.status_counts.failed },
							]}
							isLoading={isLoading}
							onQueryUpdate={onQueryUpdate}
							emptyMessage={__('Nothing has been logged yet.', 'vulomail')}
						/>
					)}
				</CardComponent>
				</ColumnComponent>
			</ContainerComponent>
			<PopupComponent
				open={Boolean(detail)}
				onClose={() => setDetail(null)}
				width={42}
				height="auto"
				position="lightbox"
				header={{
					icon: 'sms' === detail?.channel ? 'send' : 'mail',
					title: 'sms' === detail?.channel ? __('Text message', 'vulomail') : detail?.subject || __('Email', 'vulomail'),
				}}
			>
				{detail && (
					<div className="vulomail-popup-body">
						<dl className="vulomail-detail">
							<dt>{__('Status', 'vulomail')}</dt>
							<dd>{statusBadge(detail)}</dd>
							<dt>{__('Date', 'vulomail')}</dt>
							<dd>{displayDate(detail)}</dd>
							<dt>{__('To', 'vulomail')}</dt>
							<dd>{detail.recipients}</dd>
							{detail.headers.From && (
								<>
									<dt>{__('From', 'vulomail')}</dt>
									<dd>{detail.headers.From}</dd>
								</>
							)}
							<dt>{__('Sent with', 'vulomail')}</dt>
							<dd>{providerLabel(detail.provider) || '—'}</dd>
							{detail.source && (
								<>
									<dt>{__('Sent by', 'vulomail')}</dt>
									<dd>{detail.source}</dd>
								</>
							)}
							{Number(detail.attachments) > 0 && (
								<>
									<dt>{__('Attachments', 'vulomail')}</dt>
									<dd>{Number(detail.attachments)}</dd>
								</>
							)}
							{detail.message_id && (
								<>
									<dt>{__('Provider ID', 'vulomail')}</dt>
									<dd>{detail.message_id}</dd>
								</>
							)}
						</dl>
						{detail.attempts.length > 1 &&
							detail.attempts.map((attempt, index) => (
								<NoticeComponent
									key={`${attempt.connection_id}-${index}`}
									displayPosition="inline-notice"
									type={attempt.success ? 'success' : 'error'}
									message={
										attempt.success
											? sprintf(
													/* translators: 1: attempt number, 2: provider name. */
													__('Attempt %1$d: %2$s accepted the message.', 'vulomail'),
													index + 1,
													providerLabel(attempt.provider)
											  )
											: errorNoticeHtml(
													attempt,
													detail.channel,
													sprintf(
														/* translators: 1: attempt number, 2: provider name. */
														__('Attempt %1$d: %2$s failed.', 'vulomail'),
														index + 1,
														providerLabel(attempt.provider)
													) + ' '
											  )
									}
								/>
							))}
						{('not_tracked' !== detail.opened || 'not_tracked' !== detail.clicked) && (
							<>
								<dl className="vulomail-detail">
									{[
										{
											state: detail.opened,
											label: __('Opened', 'vulomail'),
											countLabel: __('Opens', 'vulomail'),
											count: detail.tracking.open_count,
											first: detail.tracking.first_opened_at,
											last: detail.tracking.last_opened_at,
										},
										{
											state: detail.clicked,
											label: __('Clicked', 'vulomail'),
											countLabel: __('Clicks', 'vulomail'),
											count: detail.tracking.click_count,
											first: detail.tracking.first_clicked_at,
											last: detail.tracking.last_clicked_at,
										},
									].map((item) => (
										<Fragment key={item.label}>
											<dt>{item.label}</dt>
											<dd>{engagementBadge(item.state)}</dd>
											{'not_tracked' !== item.state && (
												<>
													<dt>{item.countLabel}</dt>
													<dd>
														{sprintf(
															/* translators: 1: number of observed opens or clicks, 2: first and last dates. */
															__('%1$d observed · %2$s', 'vulomail'),
															item.count,
															observedRange(item.first, item.last)
														)}
													</dd>
												</>
											)}
										</Fragment>
									))}
									{detail.tracking.links.map((link, index) => (
										<Fragment key={`${link.url}-${index}`}>
											<dt>{0 === index ? __('Clicked links', 'vulomail') : ''}</dt>
											<dd className="vulomail-log-cell">
												<span className="vulomail-log-primary">{link.url}</span>
												<span className="vulomail-log-secondary">
													{sprintf(
														/* translators: 1: number of clicks on this link, 2: first and last click dates. */
														_n('%1$d click · %2$s', '%1$d clicks · %2$s', link.click_count, 'vulomail'),
														link.click_count,
														observedRange(link.first_clicked_at, link.last_clicked_at)
													)}
												</span>
											</dd>
										</Fragment>
									))}
								</dl>
								<NoticeComponent
									displayPosition="inline-notice"
									type="info"
									message={__(
										'Opens and clicks are estimates. Some mail apps block images, so an open can go unseen; others, and security scanners, load images or follow links on their own, so some opens and clicks are not a person.',
										'vulomail'
									)}
								/>
							</>
						)}
						{detail.attempts.length <= 1 && detail.error_message && (
							<NoticeComponent
								displayPosition="inline-notice"
								type="error"
								message={errorNoticeHtml(detail, detail.channel)}
							/>
						)}
						{detail.has_body ? (
							// Shown as text, never rendered as HTML: a logged email body is untrusted content.
							<pre className="vulomail-message-body">{detail.body}</pre>
						) : (
							<NoticeComponent
								displayPosition="inline-notice"
								type="info"
								message={sprintf(
									/* translators: 1: opening link tag to Settings → Logging & Privacy, 2: closing link tag. */
									__(
										'Message content was not stored. Turn on "Store message content" under %1$sSettings → Logging & Privacy%2$s to keep it for new messages and allow resending.',
										'vulomail'
									),
									`<a href="${settingsUrl('logging')}">`,
									'</a>'
								)}
							/>
						)}
						<div className="vulomail-form-footer">
							<ButtonInput
								buttons={[
									{
										text: __('Delete entry', 'vulomail'),
										icon: 'delete',
										color: 'border-red',
										disabled: isBusy,
										onClick: deleteOne,
									},
									{
										text: __('Resend', 'vulomail'),
										icon: 'send',
										disabled: isBusy || !detail.can_resend,
										onClick: resend,
									},
								]}
							/>
						</div>
					</div>
				)}
			</PopupComponent>
			<PopupComponent
				open={confirmClear}
				onClose={() => setConfirmClear(false)}
				width={28}
				height="auto"
				position="lightbox"
				header={{ icon: 'delete', title: __('Delete all logs?', 'vulomail') }}
			>
				<div className="vulomail-popup-body">
					<p>{__('Every email and SMS log entry will be permanently deleted. This can\'t be undone.', 'vulomail')}</p>
					<div className="vulomail-form-footer">
						<ButtonInput
							buttons={[
								{
									text: __('Keep logs', 'vulomail'),
									color: 'purple',
									disabled: isBusy,
									onClick: () => setConfirmClear(false),
								},
								{
									text: __('Delete all logs', 'vulomail'),
									icon: 'delete',
									color: 'border-red',
									disabled: isBusy,
									onClick: clearAll,
								},
							]}
						/>
					</div>
				</div>
			</PopupComponent>
		</>
	);
};

export default Logs;
