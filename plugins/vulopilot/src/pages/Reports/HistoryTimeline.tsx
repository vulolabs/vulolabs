import { useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { IconTile } from '../../components/ui';
import type { Tone } from '../../components/ui';
import { HistoryRow, dayLabel, rowStatusBadge, rowTime, rowTitle } from '../../services/historyTypes';

interface HistoryTimelineProps {
	rows: HistoryRow[];
	total: number;
	selectedRow: HistoryRow | null;
	// eslint-disable-next-line no-unused-vars
	onSelectRow: (row: HistoryRow) => void;
	isLoadingMore: boolean;
	onLoadMore: () => void;
}

/** One scan run: every check that ran together, the newest result per check. */
interface ScanRun {
	kind: 'run';
	key: string;
	at: string;
	checks: HistoryRow[];
}

interface Single {
	kind: 'row';
	key: string;
	at: string;
	row: HistoryRow;
}

type Item = ScanRun | Single;

/** Checks logged within this many minutes of each other belong to the same scan. */
const RUN_WINDOW_MS = 5 * 60 * 1000;

const time = (iso: string) => new Date(iso.replace(' ', 'T')).getTime();

/**
 * Folds the newest-first rows into items: neighbouring scan rows become one scan run (repeats of a check inside it
 * keep only the newest), everything else stays a row of its own.
 */
const toItems = (rows: HistoryRow[]): Item[] => {
	const items: Item[] = [];

	rows.forEach((row) => {
		const last = items[items.length - 1];

		if ('scan' === row.category && row.scan) {
			if (last?.kind === 'run' && Math.abs(time(last.at) - time(row.created_at)) <= RUN_WINDOW_MS) {
				if (!last.checks.some((check) => check.scan?.scanner_id === row.scan?.scanner_id)) {
					last.checks.push(row);
				}
				return;
			}

			items.push({ kind: 'run', key: `run-${row.id}`, at: row.created_at, checks: [row] });
			return;
		}

		items.push({ kind: 'row', key: String(row.id), at: row.created_at, row });
	});

	// A "run" of one check reads better as a plain row.
	return items.map(
		(item): Item =>
			item.kind === 'run' && 1 === item.checks.length
				? { kind: 'row', key: String(item.checks[0].id), at: item.at, row: item.checks[0] }
				: item
	);
};

const byDay = (items: Item[]): { label: string; items: Item[] }[] => {
	const days: { label: string; items: Item[] }[] = [];

	items.forEach((item) => {
		const label = dayLabel(item.at);
		const current = days[days.length - 1];

		if (current?.label === label) {
			current.items.push(item);
		} else {
			days.push({ label, items: [item] });
		}
	});

	return days;
};

const LOOK: Record<string, { icon: string; tone: Tone }> = {
	scan: { icon: 'scan', tone: 'blue' },
	conversation: { icon: 'live-chat', tone: 'violet' },
	change: { icon: 'edit', tone: 'green' },
	automation: { icon: 'automation', tone: 'amber' },
};

const lookFor = (row: HistoryRow) => (row.event_type.startsWith('automation.') ? LOOK.automation : (LOOK[row.category] ?? LOOK.change));

const STATUS_TONE: Record<string, string> = { green: 'good', red: 'bad', yellow: 'warn', grey: 'off' };

/** "2 issues" or "Clear" for one check. */
const checkResult = (row: HistoryRow): { text: string; found: boolean } => {
	const found = row.scan?.total ?? 0;

	return found
		? {
				text: sprintf(
					/* translators: %d: number of issues. */
					_n('%d issue', '%d issues', found, 'vulopilot'),
					found
				),
				found: true,
		  }
		: { text: __('Clear', 'vulopilot'), found: false };
};

/**
 * Reports → History: newest first, by day. A scan is one row - its checks, how many found something, the ones that
 * did - and opens to every check; conversations, changes and automation runs are a row each. Any row opens its
 * details beside the list.
 */
const HistoryTimeline = ({ rows, total, selectedRow, onSelectRow, isLoadingMore, onLoadMore }: HistoryTimelineProps) => {
	// A scan opens by itself while it holds the selected check; a click opens or closes it either way.
	const [toggled, setToggled] = useState<Record<string, boolean>>({});
	const days = byDay(toItems(rows));

	const [showClear, setShowClear] = useState<string[]>([]);
	const toggleRun = (key: string, isOpen: boolean) => setToggled((current) => ({ ...current, [key]: !isOpen }));

	const renderRow = (row: HistoryRow) => {
		const look = lookFor(row);
		const status = rowStatusBadge(row);
		const title = rowTitle(row);
		const detail =
			row.change?.after && row.change.after.length <= 80
				? sprintf(
						/* translators: %s: the new value. */
						__('Now: %s', 'vulopilot'),
						row.change.after
				  )
				: row.message !== title
				? row.message
				: '';
		const isSelected = String(selectedRow?.id) === String(row.id);

		return (
			<button
				type="button"
				id={`vulopilot-history-row-${row.id}`}
				className={`vp-hist-row${isSelected ? ' is-selected' : ''}`}
				aria-pressed={isSelected}
				onClick={() => onSelectRow(row)}
			>
				<span className="vp-hist-time">{rowTime(row.created_at)}</span>
				<IconTile icon={look.icon} tone={look.tone} size="sm" />
				<span className="vp-hist-main">
					<strong>{title}</strong>
					{detail && <span>{detail}</span>}
				</span>
				{status && <span className={`vp-pill is-${STATUS_TONE[status.className] ?? 'off'}`}>{status.text}</span>}
				{row.scan && (
					<span className={`vp-hist-result${row.scan.total ? ' is-found' : ''}`}>{checkResult(row).text}</span>
				)}
				<i className="adminfont-arrow-right vp-hist-go" aria-hidden="true" />
			</button>
		);
	};

	const renderRun = (run: ScanRun) => {
		const withIssues = run.checks.filter((check) => (check.scan?.total ?? 0) > 0);
		const issues = withIssues.reduce((sum, check) => sum + (check.scan?.total ?? 0), 0);
		const holdsSelected = run.checks.some((check) => String(check.id) === String(selectedRow?.id));
		const isOpen = toggled[run.key] ?? holdsSelected;

		return (
			<div className={`vp-hist-run${isOpen ? ' is-open' : ''}${holdsSelected ? ' has-selected' : ''}`}>
				<button type="button" className="vp-hist-row is-run" aria-expanded={isOpen} onClick={() => toggleRun(run.key, isOpen)}>
					<span className="vp-hist-time">{rowTime(run.at)}</span>
					<IconTile icon="scan" tone="blue" size="sm" />
					<span className="vp-hist-main">
						<strong>
							{sprintf(
								/* translators: %d: number of checks in the scan. */
								_n('Scan · %d check', 'Scan · %d checks', run.checks.length, 'vulopilot'),
								run.checks.length
							)}
						</strong>
						<span>
							{withIssues.length
								? sprintf(
										/* translators: 1: issues found, 2: checks that found them. */
										__('%1$d issues found by %2$d checks', 'vulopilot'),
										issues,
										withIssues.length
								  )
								: __('Every check came back clear', 'vulopilot')}
						</span>
						{withIssues.length > 0 && (
							<span className="vp-hist-chips">
								{withIssues.slice(0, 4).map((check) => (
									<em key={check.id}>
										{rowTitle(check)} <b>{check.scan?.total}</b>
									</em>
								))}
								{withIssues.length > 4 && (
									<em className="is-more">
										{sprintf(
											/* translators: %d: more checks. */
											__('+%d more', 'vulopilot'),
											withIssues.length - 4
										)}
									</em>
								)}
							</span>
						)}
					</span>
					<span className="vp-hist-toggle">
						{isOpen ? __('Hide checks', 'vulopilot') : __('All checks', 'vulopilot')}
						<i className="vp-hist-caret adminfont-keyboard-arrow-down" aria-hidden="true" />
					</span>
				</button>

				{isOpen && (
					<ul className="vp-hist-checks">
						{[...run.checks]
							.sort((a, b) => (b.scan?.total ?? 0) - (a.scan?.total ?? 0))
							// Clear checks stay folded (unless one is selected) - the ones that found something come first.
							.filter(
								(check) =>
									(check.scan?.total ?? 0) > 0 ||
									showClear.includes(run.key) ||
									String(check.id) === String(selectedRow?.id)
							)
							.map((check) => {
								const result = checkResult(check);
								const isSelected = String(selectedRow?.id) === String(check.id);

								return (
									<li key={check.id}>
										<button
											type="button"
											id={`vulopilot-history-row-${check.id}`}
											className={isSelected ? 'is-selected' : ''}
											aria-pressed={isSelected}
											onClick={() => onSelectRow(check)}
										>
											<i className={`adminfont-${result.found ? 'error' : 'check'}`} aria-hidden="true" />
											<span>{rowTitle(check)}</span>
											<em className={result.found ? 'is-found' : ''}>{result.text}</em>
										</button>
									</li>
								);
							})}
						{run.checks.length > withIssues.length && !showClear.includes(run.key) && (
							<li className="vp-hist-checks-more">
								<button type="button" onClick={() => setShowClear((current) => [...current, run.key])}>
									{sprintf(
										/* translators: %d: number of checks that found nothing. */
										_n('Show %d clear check', 'Show %d clear checks', run.checks.length - withIssues.length, 'vulopilot'),
										run.checks.length - withIssues.length
									)}
								</button>
							</li>
						)}
					</ul>
				)}
			</div>
		);
	};

	return (
		<div className="vp-hist">
			{days.map((day) => (
				<section key={day.label} className="vp-hist-day">
					<h4>{day.label}</h4>
					<ul>
						{day.items.map((item) => (
							<li key={item.key}>{'run' === item.kind ? renderRun(item) : renderRow(item.row)}</li>
						))}
					</ul>
				</section>
			))}

			{rows.length < total && (
				<button type="button" className="vp-hist-more" onClick={onLoadMore} disabled={isLoadingMore}>
					{isLoadingMore ? __('Loading…', 'vulopilot') : __('Show older', 'vulopilot')}
				</button>
			)}
		</div>
	);
};

export default HistoryTimeline;
