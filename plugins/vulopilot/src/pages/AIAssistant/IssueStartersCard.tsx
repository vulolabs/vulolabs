import React from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { Skeleton } from '../../components/ui';
import { useApiList } from '../../services/useApiList';
import { formatAffected } from '../../components/Issues/issuesTypes';
import type { FindingGroup } from '../../components/Issues/issuesTypes';

const SEVERITY: Record<string, string> = {
	critical: __('Critical', 'vulopilot'),
	high: __('High', 'vulopilot'),
	medium: __('Medium', 'vulopilot'),
	low: __('Low', 'vulopilot'),
	info: __('Info', 'vulopilot'),
};

/** The question an "Ask" button sends for an issue. */
export const askAboutIssue = (group: FindingGroup): string =>
	sprintf(
		/* translators: 1: issue name such as "Weak Password Detection", 2: how far it reaches, e.g. "2 pages". */
		__('How do I fix "%1$s" on my site? It affects %2$s.', 'vulopilot'),
		group.label,
		formatAffected(group.count, group.object_type)
	);

/**
 * "Start from an issue": the worst open issues (`GET /findings/groups` orders them by severity), each one click
 * away from a question in the chat. The row itself opens the issue's details in the Issues section below.
 */
const IssueStartersCard: React.FC<{
	disabled: boolean;
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature.
	onAsk: (group: FindingGroup) => void;
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature.
	onShow: (group?: FindingGroup) => void;
}> = ({ disabled, onAsk, onShow }) => {
	const { data, total, isLoading } = useApiList<FindingGroup>('findings/groups', { status: 'open', per_page: 4 });

	return (
		<section className="vp-card vp-rail-card">
			<header className="vp-rail-head">
				<div>
					<h3>{__('Start from an issue', 'vulopilot')}</h3>
					<p>{__('Most urgent first. Ask the AI how to fix one.', 'vulopilot')}</p>
				</div>
			</header>

			{isLoading && <Skeleton />}
			{!isLoading && 0 === data.length && (
				<p className="vp-rail-note">{__('No open issues. Run a scan any time to check again.', 'vulopilot')}</p>
			)}

			{data.length > 0 && (
				<ul className="vp-list vp-starters">
					{data.map((group) => (
						<li key={`${group.scanner_id}-${group.category}`} className={`is-${group.severity}`}>
							<span className="vp-starter-mark" aria-hidden="true" />
							<button type="button" className="vp-list-main" onClick={() => onShow(group)}>
								<strong>{group.label}</strong>
								<span>
									{SEVERITY[group.severity] ?? SEVERITY.info} · {formatAffected(group.count, group.object_type)}
								</span>
							</button>
							<button
								type="button"
								className="vp-ask"
								disabled={disabled}
								onClick={() => onAsk(group)}
								aria-label={sprintf(
									/* translators: %s: issue name. */
									__('Ask AI about %s', 'vulopilot'),
									group.label
								)}
							>
								<i className="adminfont-ai" aria-hidden="true" />
								{__('Ask', 'vulopilot')}
							</button>
						</li>
					))}
				</ul>
			)}

			{total > data.length && (
				<button type="button" className="vp-card-link vp-rail-more" onClick={() => onShow()}>
					{sprintf(
						/* translators: %d: number of open issues. */
						_n('See %d open issue', 'See all %d open issues', total, 'vulopilot'),
						total
					)}
					<i className="adminfont-arrow-right" aria-hidden="true" />
				</button>
			)}
		</section>
	);
};

export default IssueStartersCard;
