/* global vulopilotAppLocalizer */
import React, { useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { NoticeManager } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { EmptyState, Segmented, Skeleton } from '../../components/ui';
import { useApiList } from '../../services/useApiList';
import { formatWpDate } from '../../services/formatWpDate';
import { getCategoryTabHash } from '../../services/getCategoryTabLink';
import { formatAffected } from '../../components/Issues/issuesTypes';
import type { FindingGroup } from '../../components/Issues/issuesTypes';

export type StepFilter = 'all' | 'urgent' | 'ai' | 'approvals';

interface ActionRunRow {
	id: number;
	action_id: string;
	created_at: string;
}

/** Severity as words: shown as a label above the issue, never as a button-like chip beside the action. */
const SEVERITY: Record<string, string> = {
	critical: __('Critical', 'vulopilot'),
	high: __('High priority', 'vulopilot'),
	medium: __('Medium priority', 'vulopilot'),
	low: __('Low priority', 'vulopilot'),
	info: __('Info', 'vulopilot'),
};

/** `write-meta-title` → "Write meta title". */
const humanize = (id: string): string => {
	const words = id.replace(/[-_]+/g, ' ').trim();

	return words.charAt(0).toUpperCase() + words.slice(1);
};

/** First sentence of a finding's description, capped. */
const summarize = (text?: string | null): string => {
	const first = (text ?? '').split(/(?<=[.!?])\s/)[0].trim();

	return first.length > 120 ? `${first.slice(0, 117)}…` : first;
};

const isUrgent = (group: FindingGroup) => 'critical' === group.severity || 'high' === group.severity;

/**
 * "Next steps": one queue of everything waiting on the user, most urgent first - AI changes held for approval, then
 * open issues worst-severity first (`GET /findings/groups` already orders them). Each row says what is wrong, how
 * far it reaches, and offers the one action that resolves it.
 */
const NextSteps: React.FC<{
	id: string;
	filter: StepFilter;
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature.
	onFilterChange: (next: StepFilter) => void;
	openTotal: number;
	onChanged: () => void;
}> = ({ id, filter, onFilterChange, openTotal, onChanged }) => {
	const groups = useApiList<FindingGroup>('findings/groups', { status: 'open', per_page: 25 });
	const approvals = useApiList<ActionRunRow>('ai-action-runs', { status: 'pending_approval', per_page: 10 });
	const [busyId, setBusyId] = useState<number | null>(null);

	const decide = (row: ActionRunRow, decision: 'approve' | 'reject') => {
		if (busyId === row.id) {
			return;
		}

		setBusyId(row.id);
		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, `ai-action-runs/${row.id}/${decision}`), {})
			.then((response) => {
				NoticeManager.add({
					uniqueKey: `ai-action-${decision}-${row.id}`,
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? 'approve' === decision
							? __('Approved. The change has been applied.', 'vulopilot')
							: __('Rejected. Nothing was changed.', 'vulopilot')
						: __('Could not complete this action. Please try again.', 'vulopilot'),
				});

				if (response) {
					approvals.refetch();
					onChanged();
				}
			})
			.finally(() => setBusyId(null));
	};

	const urgent = groups.data.filter(isUrgent);
	const aiFixable = groups.data.filter((group) => Boolean(group.fix_action_id));

	const showApprovals = 'all' === filter || 'approvals' === filter;
	let issues: FindingGroup[] = [];

	if ('all' === filter) {
		issues = groups.data;
	} else if ('urgent' === filter) {
		issues = urgent;
	} else if ('ai' === filter) {
		issues = aiFixable;
	}

	const LIMIT = 6;
	const shownApprovals = showApprovals ? approvals.data : [];
	const shownIssues = issues.slice(0, Math.max(0, LIMIT - shownApprovals.length));
	const hiddenCount = issues.length - shownIssues.length;
	const isLoading = groups.isLoading || approvals.isLoading;
	const isEmpty = !isLoading && 0 === shownApprovals.length && 0 === shownIssues.length;
	const countOf = (label: string, count: number) => (count > 0 ? `${label} ${count}` : label);

	return (
		<section className="vp-card vp-steps" id={id}>
			<header className="vp-steps-head">
				<div>
					<h3>{__('Next steps', 'vulopilot')}</h3>
					<p>
						{openTotal > 0
							? sprintf(
									/* translators: %d: number of open issues. */
									_n(
										'Most urgent first. %d open issue across your site.',
										'Most urgent first. %d open issues across your site.',
										openTotal,
										'vulopilot'
									),
									openTotal
							  )
							: __('Most urgent first.', 'vulopilot')}
					</p>
				</div>
				<Segmented
					label={__('Show', 'vulopilot')}
					size="sm"
					value={filter}
					onChange={(next) => onFilterChange(next as StepFilter)}
					options={[
						{ value: 'all', label: __('All', 'vulopilot') },
						{ value: 'urgent', label: countOf(__('Urgent', 'vulopilot'), urgent.length) },
						// Only Pro's One-Click Fix maps issues to an AI fix, so the filter shows only when one exists.
						...(aiFixable.length > 0 || 'ai' === filter
							? [{ value: 'ai', label: countOf(__('AI can fix', 'vulopilot'), aiFixable.length) }]
							: []),
						{ value: 'approvals', label: countOf(__('Approvals', 'vulopilot'), approvals.data.length) },
					]}
				/>
			</header>

			{isLoading && (
				<div className="vp-steps-body">
					<Skeleton />
					<Skeleton />
					<Skeleton />
				</div>
			)}

			{isEmpty && (
				<div className="vp-steps-body">
					<EmptyState
						icon="check"
						tone="green"
						title={
							'approvals' === filter
								? __('Nothing waiting for your approval', 'vulopilot')
								: __("You're all caught up", 'vulopilot')
						}
						text={
							'approvals' === filter
								? __('When an AI change needs your OK before it runs, it shows up here.', 'vulopilot')
								: __('Nothing here needs you right now. Run a scan any time to check again.', 'vulopilot')
						}
					/>
				</div>
			)}

			{!isLoading && !isEmpty && (
				<ol className="vp-step-list">
					{shownApprovals.map((row) => (
						<li key={`approval-${row.id}`} className="vp-step is-approval">
							<span className="vp-step-mark" aria-hidden="true">
								<i className="adminfont-approval" />
							</span>
							<div className="vp-step-main">
								<em className="vp-step-sev">{__('Needs your approval', 'vulopilot')}</em>
								<strong>{humanize(row.action_id)}</strong>
								<span>
									{sprintf(
										/* translators: %s: date the AI asked for approval. */
										__('AI change waiting for your OK · asked %s', 'vulopilot'),
										formatWpDate(row.created_at)
									)}
								</span>
							</div>
							<div className="vp-step-actions">
								<ButtonInput
									buttons={[
										{
											text: __('Reject', 'vulopilot'),
											color: 'purple',
											disabled: busyId === row.id,
											onClick: () => decide(row, 'reject'),
										},
										{
											text: __('Approve', 'vulopilot'),
											color: 'purple-bg',
											disabled: busyId === row.id,
											onClick: () => decide(row, 'approve'),
										},
									]}
								/>
							</div>
						</li>
					))}

					{shownIssues.map((group) => {
						const severity = SEVERITY[group.severity] ?? SEVERITY.info;
						const href = `?page=vulopilot${getCategoryTabHash(group.category)}`;
						const detail = summarize(group.sample?.description);

						return (
							<li key={`${group.scanner_id}-${group.category}`} className={`vp-step is-${group.severity}`}>
								<span className="vp-step-mark" aria-hidden="true">
									<i className={`adminfont-${isUrgent(group) ? 'error' : 'info'}`} />
								</span>
								<a className="vp-step-main" href={href}>
									<em className="vp-step-sev">{severity}</em>
									<strong>{group.label}</strong>
									<span>
										<b>{formatAffected(group.count, group.object_type)}</b>
										{detail && ` · ${detail}`}
									</span>
								</a>
								<div className="vp-step-actions">
									<a className={`vp-step-cta${group.fix_action_id ? ' is-ai' : ''}`} href={href}>
										{group.fix_action_id ? (
											<>
												<i className="adminfont-ai" aria-hidden="true" />
												{__('Fix with AI', 'vulopilot')}
											</>
										) : (
											<>
												{__('Review', 'vulopilot')}
												<i className="adminfont-arrow-right" aria-hidden="true" />
											</>
										)}
									</a>
								</div>
							</li>
						);
					})}
				</ol>
			)}

			{!isLoading && (hiddenCount > 0 || openTotal > shownIssues.length) && (
				<footer className="vp-steps-foot">
					<span>
						{hiddenCount > 0 &&
							sprintf(
								/* translators: %d: number of further steps not shown. */
								_n('%d more step', '%d more steps', hiddenCount, 'vulopilot'),
								hiddenCount
							)}
					</span>
					<a className="vp-card-link" href="?page=vulopilot#&tab=reports">
						{__('See every issue', 'vulopilot')}
						<i className="adminfont-arrow-right" aria-hidden="true" />
					</a>
				</footer>
			)}
		</section>
	);
};

export default NextSteps;
