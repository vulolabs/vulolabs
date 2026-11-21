/* global vulopilotAppLocalizer */
import { __, _n, sprintf } from '@wordpress/i18n';
import { Skeleton } from '../../components/ui';
import { useApiList } from '../../services/useApiList';
import { dayLabel, rowTime, rowTitle, toHistoryRow } from '../../services/historyTypes';

interface ActivityLogRow {
	id: number;
	message: string;
	created_at: string;
	event_type: string;
}

const EVENT_TYPES = ['scan.completed.security', 'security.alert', 'security.new_user'].join(',');

/** Event types Reports → History lists, so a row can open there. */
const IN_HISTORY = ['scan.completed', 'scan.completed.security'];

/** "Found 2 issues" / "Nothing found" for a scan row; the message itself for anything else. */
const outcome = (row: ActivityLogRow): { text: string; flagged: boolean } => {
	const found = /with (\d+) finding/.exec(row.message);

	if (!found) {
		return { text: row.message, flagged: 'security.alert' === row.event_type };
	}

	const count = Number(found[1]);

	return {
		text: count
			? sprintf(
					/* translators: %d: number of findings. */
					_n('Found %d issue', 'Found %d issues', count, 'vulopilot'),
					count
			  )
			: __('Nothing found', 'vulopilot'),
		flagged: count > 0,
	};
};

/** The latest security events (`GET /activity-logs`): checks that ran and alerts, newest first. */
const RecentActivityCard = () => {
	const { data, isLoading } = useApiList<ActivityLogRow>('activity-logs', {
		event_type: EVENT_TYPES,
		per_page: 6,
	});
	const historyUrl = (id?: number) =>
		`${vulopilotAppLocalizer.admin_url}#&tab=reports&subtab=history${undefined === id ? '' : `&vulopilot_history_id=${id}`}`;

	return (
		<section className="vp-card vp-rail-card" id="security-recent-activity-card">
			<header className="vp-rail-head">
				<div>
					<h3>{__('Recent activity', 'vulopilot')}</h3>
					<p>{__('Security checks and alerts, newest first.', 'vulopilot')}</p>
				</div>
				<a className="vp-card-link" href={historyUrl()}>
					{__('History', 'vulopilot')}
					<i className="adminfont-arrow-right" aria-hidden="true" />
				</a>
			</header>

			{isLoading && <Skeleton />}
			{!isLoading && 0 === data.length && (
				<p className="vp-rail-note">{__('Nothing yet. Security checks and alerts show up here as they happen.', 'vulopilot')}</p>
			)}

			{data.length > 0 && (
				<ol className="vp-feed">
					{data.map((row) => {
						const result = outcome(row);
						const isScan = row.event_type.startsWith('scan.');

						return (
							<li key={row.id} className={result.flagged ? 'is-flagged' : ''}>
								<span className="vp-feed-dot" aria-hidden="true">
									<i className={`adminfont-${isScan ? 'scan' : 'security'}`} />
								</span>
								<a href={historyUrl(IN_HISTORY.includes(row.event_type) ? row.id : undefined)}>
									<strong>{isScan ? rowTitle(toHistoryRow(row)) : row.message}</strong>
									<span>
										{isScan ? `${result.text} · ` : ''}
										{dayLabel(row.created_at)}, {rowTime(row.created_at)}
									</span>
								</a>
							</li>
						);
					})}
				</ol>
			)}
		</section>
	);
};

export default RecentActivityCard;
