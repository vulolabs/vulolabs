/* global vulomailAppLocalizer */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { __, _n, sprintf } from '@wordpress/i18n';
import {
	BadgeComponent,
	CardComponent,
	ColumnComponent,
	ContainerComponent,
	FormGroupComponent,
	FormGroupWrapperComponent,
	ModuleGuardComponent,
	NavigatorHeaderComponent,
	NoticeComponent,
} from '@zyra/components';
import { ButtonInput, SelectInput, TextInput } from '@zyra/inputs';
import { apiGet, apiPost } from '../services/api';
import { errorNoticeHtml } from '../services/errorHelp';
import { errorMessage } from '../services/notify';
import { escapeHtml, providerLabel } from '../services/types';
import type { Connection, ConnectionsPayload, TestResult } from '../services/types';

interface Check {
	id: string;
	label: string;
	status: 'good' | 'warning' | 'error' | 'info';
	message: string;
	/** What to do about it; empty when nothing needs doing. */
	fix?: string;
	/** Where to do it: a VuloMail tab, or another admin URL. */
	action?: { label: string; tab?: string; url?: string } | null;
}

const GROUP_TITLE: Record<Check['status'], string> = {
	error: __('Fix these first', 'vulomail'),
	warning: __('Needs attention', 'vulomail'),
	info: __('For your information', 'vulomail'),
	good: __('Passed', 'vulomail'),
};

interface TestCardProps {
	channel: 'email' | 'sms';
	connections: Connection[];
	preselected: string;
}

// react-select shows its placeholder for an empty value, so "Live routing" needs a real one.
const LIVE = 'live';

const STATUS: Record<Check['status'], { color: string; icon: string; text: string }> = {
	good: { color: 'green', icon: 'check', text: __('OK', 'vulomail') },
	warning: { color: 'yellow', icon: 'error', text: __('Needs attention', 'vulomail') },
	// 'close' (an X) tells a problem apart from a warning triangle at a glance.
	error: { color: 'red', icon: 'close', text: __('Problem', 'vulomail') },
	info: { color: 'blue', icon: 'info', text: __('Info', 'vulomail') },
};

const follow = (action: Check['action']) => {
	if (action?.tab) {
		window.location.hash = `&tab=${action.tab}`;
	} else if (action?.url) {
		window.location.href = action.url;
	}
};

/** How long ago `checked` was, for the "Last checked …" stamp. */
const checkedStamp = (checked: number) => {
	const minutes = Math.round((Date.now() - checked) / 60000);

	if (minutes < 1) {
		return __('Last checked just now', 'vulomail');
	}

	/* translators: %d: minutes since the last diagnostics run. */
	return sprintf(_n('Last checked %d minute ago', 'Last checked %d minutes ago', minutes, 'vulomail'), minutes);
};

/** One "Fix these first" / "Needs attention" card: icon tile, title row with its action, description, "what to do". */
const IssueCard = ({ check }: { check: Check }) => (
	<div className={`vulomail-diag-card is-${check.status}`}>
		<span className="vulomail-diag-ico">
			<i className={`adminfont-${STATUS[check.status].icon}`} aria-hidden="true" />
		</span>
		<div className="vulomail-diag-body">
			<div className="vulomail-diag-row">
				<span className="vulomail-diag-title">
					<strong>{escapeHtml(check.label)}</strong>
					<BadgeComponent color={STATUS[check.status].color} text={STATUS[check.status].text} />
				</span>
				{check.action && (
					<ButtonInput
						buttons={{
							text: check.action.label,
							color: 'error' === check.status ? 'purple' : 'border-purple',
							onClick: () => follow(check.action),
						}}
					/>
				)}
			</div>
			<p className="vulomail-diag-desc">{check.message}</p>
			{check.fix && (
				<div className="vulomail-diag-fix">
					<i className="adminfont-lightbulb" aria-hidden="true" />
					<p>
						<strong>{__('What to do: ', 'vulomail')}</strong>
						{check.fix}
					</p>
				</div>
			)}
		</div>
	</div>
);

/** One "For your information" card: no urgency, so no action is forced on it. */
const InfoCard = ({ check }: { check: Check }) => (
	<div className="vulomail-diag-info">
		<div className="vulomail-diag-info-head">
			<span className="vulomail-diag-ico is-info">
				<i className="adminfont-info" aria-hidden="true" />
			</span>
			<strong>{escapeHtml(check.label)}</strong>
			<BadgeComponent color="blue" text={__('Info', 'vulomail')} />
		</div>
		<p className="vulomail-diag-desc">{check.message}</p>
		{check.fix && <p className="vulomail-diag-note">{check.fix}</p>}
		{check.action && (
			<ButtonInput
				buttons={{ text: check.action.label, color: 'border-purple', onClick: () => follow(check.action) }}
			/>
		)}
	</div>
);

const TestCard = ({ channel, connections, preselected }: TestCardProps) => {
	const isEmail = 'email' === channel;
	const cardId = isEmail ? 'tools-test-email-card' : 'tools-test-sms-card';
	// Whether the "Test" button on Connections sent the visitor here for this card's channel.
	const isTarget = '' !== preselected && connections.some((item) => item.id === preselected);
	const [to, setTo] = useState('');
	const [connectionId, setConnectionId] = useState(
		connections.some((item) => item.id === preselected) ? preselected : LIVE
	);
	const [isSending, setIsSending] = useState(false);
	const [result, setResult] = useState<TestResult | null>(null);
	const [isHighlighted, setIsHighlighted] = useState(isTarget);

	// Scrolls to and briefly highlights this card so it's obvious which one was preselected,
	// since both the email and SMS cards are already on screen without any tab to switch to.
	useEffect(() => {
		if (!isTarget) {
			return;
		}

		setIsHighlighted(true);
		document.getElementById(cardId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

		const timeout = setTimeout(() => setIsHighlighted(false), 2000);

		return () => clearTimeout(timeout);
	}, [cardId, isTarget, preselected]);

	const send = () => {
		setIsSending(true);
		setResult(null);

		apiPost<TestResult>(`tools/test-${channel}`, {
			to,
			connection_id: LIVE === connectionId ? '' : connectionId,
		})
			.then(setResult)
			.catch((error) =>
				setResult({ success: false, provider: '', message: errorMessage(error), attempts: [] })
			)
			.finally(() => setIsSending(false));
	};

	return (
		<CardComponent
			id={cardId}
			className={isHighlighted ? 'vulomail-highlight' : undefined}
			title={isEmail ? __('Send a test email', 'vulomail') : __('Send a test SMS', 'vulomail')}
			titleIcon={isEmail ? 'mail' : 'send'}
			desc={
				isEmail
					? __('Confirms that email leaves this site and reaches an inbox.', 'vulomail')
					: __('Confirms that your gateway accepts and delivers a text message. Your provider may charge for it.', 'vulomail')
			}
		>
			<FormGroupWrapperComponent>
				<FormGroupComponent
					row
					label={isEmail ? __('Send to', 'vulomail') : __('Phone number', 'vulomail')}
					desc={isEmail ? undefined : __('International format, for example +14155550123.', 'vulomail')}
				>
					<TextInput
						name={`test-${channel}-to`}
						type={isEmail ? 'email' : 'text'}
						placeholder={isEmail ? vulomailAppLocalizer.admin_email : '+14155550123'}
						value={to}
						onChange={(value) => setTo(String(value))}
					/>
				</FormGroupComponent>
				<FormGroupComponent
					row
					label={__('Send through', 'vulomail')}
					desc={__('"Live routing" follows the same path as every other message, including failover.', 'vulomail')}
				>
					<SelectInput
						type="single-select"
						name={`test-${channel}-connection`}
						options={[
							{ value: LIVE, label: __('Live routing', 'vulomail') },
							...connections.map((item) => ({ value: item.id, label: item.label })),
						]}
						value={connectionId}
						isClearable={false}
						onChange={(value) => setConnectionId(value as string)}
					/>
				</FormGroupComponent>
			</FormGroupWrapperComponent>
			{result && (
				<NoticeComponent
					displayPosition="inline-notice"
					type={result.success ? 'success' : 'error'}
					title={
						result.success
							? sprintf(
									/* translators: %s: provider name. */
									__('Accepted by %s', 'vulomail'),
									providerLabel(result.provider)
							  )
							: __('The test was not sent', 'vulomail')
					}
					message={(() => {
						const failedAttempts = result.attempts.filter(
							(attempt) => !attempt.success && result.attempts.length > 1
						);

						// NoticeComponent's array form is the auto-rotating, closable banner UI and
						// renders plain text; only the single-line case below can carry the HTML help link.
						if (failedAttempts.length > 0) {
							return [
								result.message,
								...failedAttempts.map(
									(attempt) => `${providerLabel(attempt.provider)}: ${attempt.error_message}`
								),
							];
						}

						return result.success
							? result.message
							: errorNoticeHtml({ provider: result.provider, error_message: result.message, is_cause: true }, channel);
					})()}
				/>
			)}
			<div className="vulomail-form-footer">
				<ButtonInput
					buttons={{
						text: isSending ? __('Sending…', 'vulomail') : __('Send test', 'vulomail'),
						icon: 'send',
						disabled: isSending || '' === to.trim(),
						onClick: send,
					}}
				/>
			</div>
		</CardComponent>
	);
};

const Tools = () => {
	const preselected = new URLSearchParams(useLocation().hash).get('connection') ?? '';
	const [connections, setConnections] = useState<Connection[] | null>(null);
	const [checks, setChecks] = useState<Check[] | null>(null);
	const [lastChecked, setLastChecked] = useState<number | null>(null);
	const [error, setError] = useState('');

	const runDiagnostics = () => {
		setChecks(null);

		apiGet<Check[]>('tools/diagnostics')
			.then((data) => {
				setChecks(data);
				setLastChecked(Date.now());
			})
			.catch((e) => setError(errorMessage(e)));
	};

	useEffect(() => {
		apiGet<ConnectionsPayload>('connections')
			.then((payload) => setConnections(payload.connections))
			.catch((e) => setError(errorMessage(e)));

		runDiagnostics();
	}, []);

	const header = (
		<NavigatorHeaderComponent
			headerIcon="tools"
			headerTitle={__('Tools', 'vulomail')}
			headerDescription={__('Check that messages are going out, and find out why if they are not.', 'vulomail')}
			headerCustomContent={
				<div className="vulomail-inline">
					{checks && lastChecked && <span className="vulomail-diag-stamp">{checkedStamp(lastChecked)}</span>}
					<ButtonInput
						buttons={{
							text: checks ? __('Run diagnostics again', 'vulomail') : __('Running…', 'vulomail'),
							icon: 'refresh',
							color: 'purple',
							disabled: !checks,
							onClick: runDiagnostics,
						}}
					/>
				</div>
			}
		/>
	);

	if (error) {
		return (
			<>
				{header}
				<ContainerComponent general>
					<CardComponent title={__('Tools', 'vulomail')} titleIcon="error">
						<ModuleGuardComponent icon="error" title={__('Could not load the tools', 'vulomail')} desc={error} />
					</CardComponent>
				</ContainerComponent>
			</>
		);
	}

	const bySeverity = (status: Check['status']) => (checks ?? []).filter((check) => status === check.status);
	const problems = bySeverity('error').length;
	const attention = bySeverity('warning').length;
	const passed = bySeverity('good').length;
	const overall: Check['status'] = problems ? 'error' : attention ? 'warning' : 'good';

	const overallLabel = problems
		? __('Messages are not being delivered', 'vulomail')
		: attention
			? __('Delivery needs attention', 'vulomail')
			: __('Everything looks good', 'vulomail');

	const verdict = problems
		? sprintf(
				/* translators: %d: number of failing checks. */
				_n(
					'%d check found a problem stopping messages from going out.',
					'%d checks found problems stopping messages from going out.',
					problems,
					'vulomail'
				),
				problems
		  )
		: attention
			? sprintf(
					/* translators: %d: number of checks needing attention. */
					_n('%d check needs attention.', '%d checks need attention.', attention, 'vulomail'),
					attention
			  )
			: __('Everything checked out - no problems found.', 'vulomail');

	return (
		<>
			{header}
			<ContainerComponent general>
				<ColumnComponent grid={6}>
					{connections ? (
						<>
							<TestCard
								channel="email"
								connections={connections.filter((item) => 'email' === item.channel)}
								preselected={preselected}
							/>
							<TestCard
								channel="sms"
								connections={connections.filter((item) => 'sms' === item.channel)}
								preselected={preselected}
							/>
						</>
					) : (
						<>
							<CardComponent title={__('Send a test email', 'vulomail')} titleIcon="mail" isLoading />
							<CardComponent title={__('Send a test SMS', 'vulomail')} titleIcon="send" isLoading />
						</>
					)}
				</ColumnComponent>
				<ColumnComponent grid={6}>
					<CardComponent
						id="tools-diagnostics-card"
						title={__('Diagnostics', 'vulomail')}
						titleIcon="security"
						desc={__('Checks of this site\'s delivery setup. Nothing here changes any setting.', 'vulomail')}
						isLoading={!checks}
					>
						{checks && (
							<>
								<div className={`vulomail-diag-summary is-${overall}`}>
									<div className="vulomail-diag-summary-text">
										<span className="vulomail-diag-status">
											<i className="vulomail-diag-status-dot" />
											{overallLabel}
										</span>
										<p className="vulomail-diag-verdict">{verdict}</p>
										<div className="vulomail-diag-bar" aria-hidden="true">
											<span className="is-red" style={{ flexGrow: problems }} />
											<span className="is-amber" style={{ flexGrow: attention }} />
											<span className="is-green" style={{ flexGrow: passed }} />
										</div>
									</div>
									<div className="vulomail-diag-stats">
										<div className="vulomail-diag-stat is-red">
											<strong className="vulomail-diag-stat-number">{problems}</strong>
											<span className="vulomail-diag-stat-label">{__('Problems', 'vulomail')}</span>
										</div>
										<div className="vulomail-diag-stat is-amber">
											<strong className="vulomail-diag-stat-number">{attention}</strong>
											<span className="vulomail-diag-stat-label">{__('Need attention', 'vulomail')}</span>
										</div>
										<div className="vulomail-diag-stat is-green">
											<strong className="vulomail-diag-stat-number">{passed}</strong>
											<span className="vulomail-diag-stat-label">{__('Passed', 'vulomail')}</span>
										</div>
									</div>
								</div>

								{bySeverity('error').length > 0 && (
									<div className="vulomail-diag-group">
										<h3 className="vulomail-section-title">{GROUP_TITLE.error}</h3>
										{bySeverity('error').map((check) => (
											<IssueCard key={check.id} check={check} />
										))}
									</div>
								)}

								{bySeverity('warning').length > 0 && (
									<div className="vulomail-diag-group">
										<h3 className="vulomail-section-title">{GROUP_TITLE.warning}</h3>
										{bySeverity('warning').map((check) => (
											<IssueCard key={check.id} check={check} />
										))}
									</div>
								)}

								{bySeverity('info').length > 0 && (
									<div className="vulomail-diag-group">
										<h3 className="vulomail-section-title">{GROUP_TITLE.info}</h3>
										<div className="vulomail-diag-info-grid">
											{bySeverity('info').map((check) => (
												<InfoCard key={check.id} check={check} />
											))}
										</div>
									</div>
								)}

								{bySeverity('good').length > 0 && (
									<div className="vulomail-diag-group">
										<h3 className="vulomail-section-title">{GROUP_TITLE.good}</h3>
										<div className="vulomail-diag-passed">
											{bySeverity('good').map((check) => (
												<div className="vulomail-diag-pass" key={check.id}>
													<span className="vulomail-diag-tick">
														<i className="adminfont-check" aria-hidden="true" />
													</span>
													<div>
														<strong>{escapeHtml(check.label)}</strong>
														<span>{check.message}</span>
													</div>
												</div>
											))}
										</div>
									</div>
								)}
							</>
						)}
					</CardComponent>
				</ColumnComponent>
			</ContainerComponent>
		</>
	);
};

export default Tools;
