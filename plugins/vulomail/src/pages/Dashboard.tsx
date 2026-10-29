import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import {
	AnalyticsComponent,
	BadgeComponent,
	CardComponent,
	ColumnComponent,
	ContainerComponent,
	ListComponent,
	ModuleGuardComponent,
	NavigatorHeaderComponent,
	NoticeComponent,
} from '@zyra/components';
import { ButtonInput, ToggleInput } from '@zyra/inputs';
import { apiGet } from '../services/api';
import { errorMessage } from '../services/notify';
import { providerLabel } from '../services/types';
import { errorHelp } from '../services/errorHelp';
import type { Failure } from '../services/errorHelp';

interface ChannelState {
	sent: number;
	failed: number;
	enabled: boolean;
	ready: boolean;
	primary: string;
	backup: string;
}

interface Overview {
	days: number;
	email: ChannelState;
	sms: ChannelState;
	logging: boolean;
	sms_alerts: { enabled: number; available: number };
	recent_failures: {
		id: number;
		channel: string;
		provider: string;
		recipients: string;
		subject: string;
		error_message: string;
		/** The failure to explain: the connection's, when WordPress's own mailer only ran after it. */
		cause: Failure;
		created_at: string;
		created_at_display?: string;
		created_at_time?: string;
		created_at_day?: string;
	}[];
}

type FailureRow = Overview['recent_failures'][number];

/**
 * Recent failures as a day-grouped timeline: a time rail, an icon tile, the message with its channel
 * badge and error, and a link to the full log entry. Same pattern as VuloPilot's "Recent activity".
 */
const FailureTimeline = ({ rows }: { rows: FailureRow[] }) => {
	// Rows arrive newest first; consecutive rows on the same day share one heading.
	const days: { label: string; rows: FailureRow[] }[] = [];

	rows.forEach((row) => {
		const label = row.created_at_day || '';
		const last = days[days.length - 1];

		if (last && last.label === label) {
			last.rows.push(row);
		} else {
			days.push({ label, rows: [row] });
		}
	});

	const open = (row: FailureRow) => {
		window.location.hash = `&tab=logs&log=${row.id}`;
	};

	return (
		<div className="vulomail-timeline">
			{days.map((day) => (
				<div className="vulomail-timeline-day" key={`${day.label}-${day.rows[0].id}`}>
					{day.label && <div className="vulomail-timeline-heading">{day.label}</div>}
					{day.rows.map((row) => {
						const isSms = 'sms' === row.channel;
						const help = errorHelp(row.cause, row.channel);

						return (
							<div
								className="vulomail-timeline-row"
								key={row.id}
								role="button"
								tabIndex={0}
								onClick={() => open(row)}
								onKeyDown={(event) => {
									if ('Enter' === event.key || ' ' === event.key) {
										event.preventDefault();
										open(row);
									}
								}}
							>
								<span className="vulomail-timeline-time">{row.created_at_time}</span>
								<div className="vulomail-timeline-details">
									<i
										className={`vulomail-timeline-icon adminfont-${isSms ? 'send' : 'mail'}`}
										aria-hidden="true"
									/>
									<div className="vulomail-timeline-text">
										<div className="vulomail-timeline-title">
											<span>
												{isSms
													? __('Text message', 'vulomail')
													: row.subject || __('(no subject)', 'vulomail')}
											</span>
											<BadgeComponent
												color="blue"
												text={isSms ? __('SMS', 'vulomail') : __('Email', 'vulomail')}
											/>
										</div>
										<div className="desc">{row.cause.error_message}</div>
										{help && (
											<div className="desc vulomail-error-help">
												{help.short}{' '}
												<a
													className="vulomail-error-help-link"
													href={help.href}
													onClick={(event) => event.stopPropagation()}
												>
													{help.linkLabel}
												</a>
											</div>
										)}
									</div>
									<span className="vulomail-timeline-meta">
										{[row.recipients, providerLabel(row.provider)].filter(Boolean).join(' · ')}
									</span>
									<span className="vulomail-timeline-action" onClick={(event) => event.stopPropagation()}>
										<ButtonInput
											buttons={{
												text: __('More Details', 'vulomail'),
												rightIcon: 'pagination-next-arrow',
												color: 'text-purple',
												onClick: () => open(row),
											}}
										/>
									</span>
								</div>
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
};

const PERIODS = [
	{ key: '7', value: '7', label: __('7D', 'vulomail') },
	{ key: '30', value: '30', label: __('30D', 'vulomail') },
	{ key: '90', value: '90', label: __('90D', 'vulomail') },
];

const goTo = (tab: string) => {
	window.location.hash = `&tab=${tab}`;
};

const arrow = <i className="adminfont-arrow-right" />;

const QUICK_ACTIONS = [
	{
		id: 'send-test',
		icon: 'send blue',
		title: __('Send a test', 'vulomail'),
		desc: __('Check that email and SMS are going out.', 'vulomail'),
		tab: 'tools',
	},
	{
		id: 'view-logs',
		icon: 'clock orange',
		title: __('View the delivery log', 'vulomail'),
		desc: __('Every message this site has tried to send.', 'vulomail'),
		tab: 'logs',
	},
];

// What the SMS Alerts screen offers, shown on its dashboard card.
const SMS_ALERT_HIGHLIGHTS = [
	{
		id: 'store',
		icon: 'cart purple',
		title: __('Never miss a sale or a problem', 'vulomail'),
		desc: __('New orders, failed payments, refunds and low stock, sent to your phone.', 'vulomail'),
	},
	{
		id: 'customers',
		icon: 'profile blue',
		title: __('Keep customers informed', 'vulomail'),
		desc: __('Order confirmed, completed, refunded, plus your own notes such as a tracking number.', 'vulomail'),
	},
	{
		id: 'site',
		icon: 'security green',
		title: __('Watch your site', 'vulomail'),
		desc: __('Administrator logins, new users and comments, and a text when an email fails to send.', 'vulomail'),
	},
];

const percent = (sent: number, failed: number): string =>
	0 === sent + failed ? '—' : `${Math.round((sent / (sent + failed)) * 100)}%`;

const Dashboard = () => {
	const [days, setDays] = useState('7');
	const [overview, setOverview] = useState<Overview | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;

		apiGet<Overview>('overview', { days })
			.then((data) => {
				if (!cancelled) {
					setOverview(data);
					setError('');
				}
			})
			.catch((e) => !cancelled && setError(errorMessage(e)));

		return () => {
			cancelled = true;
		};
	}, [days]);

	const channelItem = (id: string, title: string, icon: string, state: ChannelState, idleText: string) => {
		let badge = <BadgeComponent color="green" text={__('Active', 'vulomail')} />;
		let desc = state.backup
			? sprintf(
					/* translators: 1: primary connection name, 2: backup connection name. */
					__('Sending through %1$s, with %2$s as backup.', 'vulomail'),
					state.primary,
					state.backup
			  )
			: sprintf(
					/* translators: %s: connection name. */
					__('Sending through %s. No backup connection is set.', 'vulomail'),
					state.primary
			  );

		if (!state.enabled) {
			badge = <BadgeComponent color="yellow" text={__('Switched off', 'vulomail')} />;
			desc = idleText;
		} else if (!state.ready) {
			badge = <BadgeComponent color="red" text={__('Not set up', 'vulomail')} />;
			desc = idleText;
		}

		return {
			id,
			icon,
			title,
			titleTag: badge,
			desc,
			tags: arrow,
			action: () => goTo('settings&subtab=connections'),
		};
	};

	const header = (
		<NavigatorHeaderComponent
			headerIcon="analytics"
			headerTitle={__('Dashboard', 'vulomail')}
			headerDescription={__('How email and SMS from this site are being delivered.', 'vulomail')}
			headerCustomContent={
				<ButtonInput
					buttons={[
						{
							text: __('Send a test', 'vulomail'),
							icon: 'send',
							color: 'purple',
							onClick: () => goTo('tools'),
						},
						{
							text: __('Manage connections', 'vulomail'),
							icon: 'setting',
							onClick: () => goTo('settings&subtab=connections'),
						},
					]}
				/>
			}
		/>
	);

	if (error) {
		return (
			<>
				{header}
				<ContainerComponent general>
					<CardComponent title={__('Dashboard', 'vulomail')} titleIcon="error">
						<ModuleGuardComponent
							icon="error"
							title={__('Could not load the dashboard', 'vulomail')}
							desc={error}
						/>
					</CardComponent>
				</ContainerComponent>
			</>
		);
	}

	if (!overview) {
		return (
			<>
				{header}
				<ContainerComponent general>
					<ColumnComponent grid={8}>
						<CardComponent title={__('Delivery', 'vulomail')} titleIcon="analytics" isLoading />
						<CardComponent title={__('Recent failures', 'vulomail')} titleIcon="error" isLoading />
					</ColumnComponent>
					<ColumnComponent grid={4}>
						<CardComponent title={__('Channels & quick actions', 'vulomail')} titleIcon="link" isLoading />
						<CardComponent title={__('SMS alerts', 'vulomail')} titleIcon="notification" isLoading />
					</ColumnComponent>
				</ContainerComponent>
			</>
		);
	}

	const { email, sms } = overview;

	return (
		<>
			{header}
			<ContainerComponent general>
				{((!email.ready && email.enabled) || !overview.logging) && (
					<ColumnComponent>
						{!email.ready && email.enabled && (
							<NoticeComponent
								displayPosition="inline-notice"
								type="warning"
								title={__('Email is still using the WordPress default mailer', 'vulomail')}
								message={__(
									'Add an email connection so messages are sent through a provider you control. Until then nothing about how this site sends email has changed.',
									'vulomail'
								)}
								actionLabel={__('Add a connection', 'vulomail')}
								onAction={() => goTo('settings&subtab=connections')}
							/>
						)}
						{!overview.logging && (
							<NoticeComponent
								displayPosition="inline-notice"
								type="info"
								message={__('Logging is switched off, so the totals below stay at zero.', 'vulomail')}
							/>
						)}
					</ColumnComponent>
				)}
				<ColumnComponent grid={8}>
					<CardComponent
						id="dashboard-delivery-card"
						title={__('Delivery', 'vulomail')}
						titleIcon="analytics"
						desc={sprintf(
							/* translators: 1: email delivery rate, 2: SMS delivery rate. */
							__('Delivered: %1$s of emails, %2$s of text messages.', 'vulomail'),
							percent(email.sent, email.failed),
							percent(sms.sent, sms.failed)
						)}
						action={
							<ToggleInput
								options={PERIODS}
								value={days}
								onChange={(value) => setDays(value as string)}
								modules={[]}
								variant="pill"
							/>
						}
					>
						<AnalyticsComponent
							variant="small"
							cols={4}
							data={[
								{ icon: 'mail green', number: email.sent, text: __('Emails sent', 'vulomail') },
								{ icon: 'error red', number: email.failed, text: __('Emails failed', 'vulomail') },
								{ icon: 'send blue', number: sms.sent, text: __('SMS sent', 'vulomail') },
								{ icon: 'error red', number: sms.failed, text: __('SMS failed', 'vulomail') },
							]}
						/>
					</CardComponent>
					<CardComponent
						id="dashboard-recent-failures-card"
						title={__('Recent failures', 'vulomail')}
						titleIcon="error"
						desc={__('The latest messages that could not be delivered.', 'vulomail')}
						action={
							<ButtonInput
								buttons={{
									text: __('View all logs', 'vulomail'),
									rightIcon: 'arrow-right',
									color: 'text-purple',
									onClick: () => goTo('logs'),
								}}
							/>
						}
					>
						{0 === overview.recent_failures.length ? (
							<ModuleGuardComponent
								icon="check"
								title={__('No failed messages', 'vulomail')}
								desc={__('Nothing has failed to send.', 'vulomail')}
							/>
						) : (
							<FailureTimeline rows={overview.recent_failures} />
						)}
					</CardComponent>
				</ColumnComponent>
				<ColumnComponent grid={4}>
					<CardComponent
						id="dashboard-channels-card"
						title={__('Channels & quick actions', 'vulomail')}
						titleIcon="link"
						desc={__('Which connection each channel is sending through, and the most common tasks.', 'vulomail')}
					>
						<ListComponent
							className="mini-card report without-border"
							border
							items={[
								channelItem(
									'email',
									__('Email', 'vulomail'),
									'mail green',
									email,
									__('WordPress is sending email with its default mailer.', 'vulomail')
								),
								channelItem(
									'sms',
									__('SMS', 'vulomail'),
									'send blue',
									sms,
									__('No text messages are being sent.', 'vulomail')
								),
								...QUICK_ACTIONS.map(({ tab, ...item }) => ({
									...item,
									tags: arrow,
									action: () => goTo(tab),
								})),
							]}
						/>
					</CardComponent>
					<CardComponent
						id="dashboard-sms-alerts-card"
						title={__('SMS alerts', 'vulomail')}
						titleIcon="notification"
						desc={__('Get a text message the moment something happens, written in your own words.', 'vulomail')}
						action={
							<BadgeComponent
								color={overview.sms_alerts.enabled > 0 ? 'green' : 'yellow'}
								text={sprintf(
									/* translators: 1: alerts switched on, 2: alerts available. */
									__('%1$d of %2$d on', 'vulomail'),
									overview.sms_alerts.enabled,
									overview.sms_alerts.available
								)}
							/>
						}
					>
						<ListComponent className="mini-card report without-border" border items={SMS_ALERT_HIGHLIGHTS} />
						{!sms.ready && (
							<NoticeComponent
								displayPosition="inline-notice"
								type="info"
								message={__('Alerts are sent once an SMS connection is set as primary.', 'vulomail')}
							/>
						)}
						<div className="vulomail-form-footer">
							<ButtonInput
								buttons={{
									text:
										overview.sms_alerts.enabled > 0
											? __('Manage SMS alerts', 'vulomail')
											: __('Set up SMS alerts', 'vulomail'),
									icon: 'notification',
									onClick: () => goTo('sms-alerts'),
								}}
							/>
						</div>
					</CardComponent>
				</ColumnComponent>
			</ContainerComponent>
		</>
	);
};

export default Dashboard;
