/* global vulopilotAppLocalizer */
import React from 'react';
import { __ } from '@wordpress/i18n';
import { Skeleton } from '../../components/ui';
import { useApiList } from '../../services/useApiList';
import { formatWpDate } from '../../services/formatWpDate';
import type { HistoryRow } from '../../services/historyTypes';

const LOOK: Record<HistoryRow['category'], { icon: string; label: string }> = {
	scan: { icon: 'scan', label: __('Scan', 'vulopilot') },
	change: { icon: 'edit', label: __('Change', 'vulopilot') },
	conversation: { icon: 'ai', label: __('AI', 'vulopilot') },
};

/** "What changed": the newest rows of `GET /history`, the same feed Reports → History shows, one line each. */
const ActivityFeed: React.FC = () => {
	const { data, isLoading } = useApiList<HistoryRow>('history', { per_page: 5 });
	const historyUrl = (id?: HistoryRow['id']) =>
		`${vulopilotAppLocalizer.admin_url}#&tab=reports&subtab=history${undefined === id ? '' : `&vulopilot_history_id=${id}`}`;

	return (
		<section className="vp-card vp-rail-card">
			<header className="vp-rail-head">
				<div>
					<h3>{__('What changed', 'vulopilot')}</h3>
					<p>{__('Scans, fixes and AI actions, newest first.', 'vulopilot')}</p>
				</div>
				<a className="vp-card-link" href={historyUrl()}>
					{__('History', 'vulopilot')}
					<i className="adminfont-arrow-right" aria-hidden="true" />
				</a>
			</header>

			{isLoading && <Skeleton />}
			{!isLoading && 0 === data.length && (
				<p className="vp-rail-note">{__('Nothing yet. Scans, fixes and AI actions show up here as they happen.', 'vulopilot')}</p>
			)}

			{data.length > 0 && (
				<ol className="vp-feed">
					{data.map((row) => {
						const look = LOOK[row.category] ?? LOOK.scan;
						const flagged = 'critical' === row.severity || 'high' === row.severity;

						return (
							<li key={row.id} className={flagged ? 'is-flagged' : ''}>
								<span className="vp-feed-dot" aria-hidden="true">
									<i className={`adminfont-${look.icon}`} />
								</span>
								<a href={historyUrl(row.id)}>
									<strong>{row.message}</strong>
									<span>
										{look.label} · {formatWpDate(row.created_at)}
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

export default ActivityFeed;
