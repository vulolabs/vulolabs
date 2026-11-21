/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { addFilter } from '@wordpress/hooks';
import { getApiLink, getApiResponse } from '@zyra/core';
import { Skeleton } from '../../components/ui';
import { formatWpTime, isWpToday } from '../../services/formatWpDate';
import BuiltinAutomationCard from './BuiltinAutomationCard';
import { REPORT_TRIGGER, SCAN_TRIGGER } from './automationsTypes';
import type { AutomationRow } from './automationsTypes';
import './Automations.scss';

const nonce = () => ({ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } });

/** "Today, 09:00", "Yesterday, 09:00" or "Nov 19, 09:00". */
const shortWhen = (iso: string): string => {
	const day = new Date(iso.replace(' ', 'T'));
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);

	let label: string;
	if (isWpToday(iso)) {
		label = __('Today', 'vulopilot');
	} else if (day.toDateString() === yesterday.toDateString()) {
		label = __('Yesterday', 'vulopilot');
	} else {
		label = day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	return sprintf(
		/* translators: 1: day, 2: time. */
		__('%1$s, %2$s', 'vulopilot'),
		label,
		formatWpTime(iso)
	);
};

export interface BuiltinAutomationsProps {
	/** Bump to reload the two rows (Pro does after its own changes). */
	refetchSignal?: number;
	/** The one-line status above the cards; Pro has its own summary for every automation. */
	showSummary?: boolean;
}

/**
 * The two automations every VuloPilot install has (Automations\BuiltinAutomationSeeder): a website scan and a
 * visibility report, each with its switch, schedule and "run now". Free's Automations page is built around them, and
 * Pro's page shows the same section through the `vulopilot_builtin_automations` filter, so they look and behave the
 * same with or without Pro.
 */
const BuiltinAutomations = ({ refetchSignal = 0, showSummary = true }: BuiltinAutomationsProps) => {
	const [rows, setRows] = useState<AutomationRow[]>([]);
	const [failedRuns, setFailedRuns] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [ownSignal, setOwnSignal] = useState(0);

	useEffect(() => {
		let cancelled = false;

		Promise.all([
			getApiResponse<{ data?: AutomationRow[] } | AutomationRow[]>(
				`${getApiLink(vulopilotAppLocalizer, 'automations')}?per_page=100`,
				nonce()
			),
			showSummary
				? getApiResponse<{ failed?: number }>(
						`${getApiLink(vulopilotAppLocalizer, 'automation-dashboard-stats')}?period=month`,
						nonce()
				  )
				: Promise.resolve(null),
		])
			.then(([list, stats]) => {
				if (cancelled) {
					return;
				}

				setRows(Array.isArray(list) ? list : (list?.data ?? []));
				setFailedRuns(stats?.failed ?? 0);
			})
			.finally(() => !cancelled && setIsLoading(false));

		return () => {
			cancelled = true;
		};
	}, [refetchSignal, ownSignal, showSummary]);

	const refetch = () => setOwnSignal((n) => n + 1);

	const scan = rows.find((row) => SCAN_TRIGGER === row.trigger_type);
	const report = rows.find((row) => REPORT_TRIGGER === row.trigger_type);
	const builtins = [scan, report].filter((row): row is AutomationRow => Boolean(row));
	const on = builtins.filter((row) => 'enabled' === row.status);
	const nameOf = (row: AutomationRow) =>
		SCAN_TRIGGER === row.trigger_type ? __('Website scan', 'vulopilot') : __('Visibility report', 'vulopilot');
	const latest = [...builtins]
		.filter((row) => row.last_run_finished_at)
		.sort((a, b) => String(b.last_run_finished_at).localeCompare(String(a.last_run_finished_at)))[0];
	const failing = on.filter((row) => 'failed' === row.last_run_status);

	if (isLoading && 0 === builtins.length) {
		return (
			<div className="vp-auto-grid">
				<Skeleton size="tall" />
				<Skeleton size="tall" />
			</div>
		);
	}

	if (0 === builtins.length) {
		return null;
	}

	return (
		<div className="vp-auto-builtins">
			{showSummary && (
				<ul className="vp-auto-summary" aria-label={__('Automation summary', 'vulopilot')}>
					<li className="vp-auto-sum">
						<span className="vp-auto-sum-icon" aria-hidden="true">
							<i className="adminfont-automation" />
						</span>
						<span className="vp-auto-sum-text">
							<strong className="vp-auto-sum-value">
								{sprintf(
									/* translators: 1: automations switched on, 2: all automations. */
									__('%1$d of %2$d on', 'vulopilot'),
									on.length,
									builtins.length
								)}
							</strong>
							{__('Automations', 'vulopilot')}
						</span>
					</li>
					<li className="vp-auto-sum">
						<span className="vp-auto-sum-icon" aria-hidden="true">
							<i className="adminfont-clock" />
						</span>
						<span className="vp-auto-sum-text">
							<strong className="vp-auto-sum-value">{latest?.last_run_finished_at ? shortWhen(latest.last_run_finished_at) : __('Not yet', 'vulopilot')}</strong>
							{latest
								? sprintf(
										/* translators: %s: automation name. */
										__('Last run · %s', 'vulopilot'),
										nameOf(latest)
								  )
								: __('Last run', 'vulopilot')}
						</span>
					</li>
					<li className={`vp-auto-sum ${failedRuns > 0 ? 'is-bad' : 'is-good'}`}>
						<span className="vp-auto-sum-icon" aria-hidden="true">
							<i className={`adminfont-${failedRuns > 0 ? 'error' : 'check'}`} />
						</span>
						<span className="vp-auto-sum-text">
							<strong className="vp-auto-sum-value">
								{failedRuns > 0
									? sprintf(
											/* translators: %d: failed runs. */
											__('%d failed', 'vulopilot'),
											failedRuns
									  )
									: __('All runs OK', 'vulopilot')}
							</strong>
							{__('Last 30 days', 'vulopilot')}
						</span>
					</li>
				</ul>
			)}

			{failing.length > 0 && (
				<div className="vp-auto-alert" role="status">
					<i className="adminfont-error" aria-hidden="true" />
					<ul>
						{failing.map((row) => (
							<li key={row.id}>
								{sprintf(
									/* translators: %s: automation name. */
									__('%s failed its last run. Run it again from its card below.', 'vulopilot'),
									nameOf(row)
								)}
							</li>
						))}
					</ul>
				</div>
			)}

			<div className="vp-auto-grid">
				{scan && <BuiltinAutomationCard row={scan} kind="scan" onChanged={refetch} />}
				{report && <BuiltinAutomationCard row={report} kind="report" onChanged={refetch} />}
			</div>
		</div>
	);
};

// Pro's Automations page replaces this one and shows this same section through the filter.
addFilter('vulopilot_builtin_automations', 'vulopilot/automations', () => BuiltinAutomations);

export default BuiltinAutomations;
