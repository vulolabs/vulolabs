/* global vulopilotAppLocalizer */
import React, { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse, scrollToId } from '@zyra/core';
import { ColumnComponent, ModuleGuardComponent } from '@zyra/components';
import { TableCard } from '@zyra/table';
import './AICopilot.scss';
import IssuesSummaryCards, { Priority } from '../../components/Issues/IssuesSummaryCards';
import IssueDetailPanel from '../../components/Issues/IssueDetailPanel';
import {
	CATEGORY_LABELS,
	CATEGORY_TABS,
	FindingGroup,
	findTabIdForCategory,
	formatAffected,
	issueIconFor,
} from '../../components/Issues/issuesTypes';

interface GroupsResponse {
	data: FindingGroup[];
	total: number;
	priority_counts: { high: number; medium: number; low: number };
	category_counts: Record<string, number>;
}

interface IssuesListProps {
	/** A real scanner_id/category from NeedsAttentionCard.tsx's own group rows - presets the matching tab and auto-selects that group once loaded. */
	initialScannerId?: string;
	initialCategory?: string;
}

/**
 * AI Copilot's Issues table - every open finding grouped by issue type
 * (`GET /findings/groups`, FindingRepository::get_finding_groups()), not
 * one row per individual finding: "8 images are missing alt text" is one
 * row for 8 real findings sharing the same scanner_id, matching the
 * mockup's own row shape. Stat cards + category tabs above the table and
 * a real detail panel to the side (IssuesSummaryCards.tsx/
 * IssueDetailPanel.tsx) are real, all backed by this same endpoint - the
 * stat tiles double as a real High/Medium/Low filter (same 3-tier bucket
 * FindingRepository::get_priority_counts() already uses for their own
 * counts), alongside the category tabs, both scoped server-side so the
 * table's own pagination footer always matches what's actually filtered.
 */
const IssuesList: React.FC<IssuesListProps> = ({
	initialScannerId,
	initialCategory,
}) => {
	const [activeTabId, setActiveTabId] = useState(
		initialCategory ? findTabIdForCategory(initialCategory) : 'all'
	);
	const [activePriority, setActivePriority] = useState<Priority>('all');
	// Matches TableCard's own initial `{ paged: 1, per_page: 10 }` state
	// (same reasoning useApiList.ts's own comment gives) - its first
	// mount-time onQueryUpdate call corrects this to whatever its page-size
	// selector actually shows, so the fetched row count and the "Showing X
	// to Y of Z" footer it renders always agree.
	const [paged, setPaged] = useState(1);
	const [perPage, setPerPage] = useState(10);

	const [data, setData] = useState<FindingGroup[]>([]);
	const [total, setTotal] = useState(0);
	const [priorityCounts, setPriorityCounts] = useState({
		high: 0,
		medium: 0,
		low: 0,
	});
	const [categoryCounts, setCategoryCounts] = useState<
		Record<string, number>
	>({});
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [reloadToken, setReloadToken] = useState(0);
	const [selectedGroup, setSelectedGroup] = useState<FindingGroup | null>(
		null
	);

	const activeTab = CATEGORY_TABS.find((tab) => tab.id === activeTabId);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setError(null);

		const params = new URLSearchParams();
		params.set('page', String(paged));
		params.set('per_page', String(perPage));

		if (activeTab) {
			params.set('category', activeTab.categories.join(','));
		}

		if ('all' !== activePriority) {
			params.set('priority', activePriority);
		}

		const baseUrl = getApiLink(vulopilotAppLocalizer, 'findings/groups');
		const separator = baseUrl.includes('?') ? '&' : '?';
		const url = `${baseUrl}${separator}${params.toString()}`;

		getApiResponse<GroupsResponse>(url, {
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		})
			.then((response) => {
				if (cancelled) {
					return;
				}

				if (!response) {
					setError(
						__(
							'Something went wrong while loading issues.',
							'vulopilot'
						)
					);
					setData([]);
					setTotal(0);
					return;
				}

				setData(response.data ?? []);
				setTotal(response.total ?? 0);
				setPriorityCounts(
					response.priority_counts ?? { high: 0, medium: 0, low: 0 }
				);
				setCategoryCounts(response.category_counts ?? {});

				setSelectedGroup((current) => {
					if (
						current &&
						response.data.some(
							(group) => group.scanner_id === current.scanner_id
						)
					) {
						return (
							response.data.find(
								(group) =>
									group.scanner_id === current.scanner_id
							) ?? current
						);
					}

					if (initialScannerId) {
						const match = response.data.find(
							(group) => group.scanner_id === initialScannerId
						);

						if (match) {
							return match;
						}
					}

					return response.data[0] ?? null;
				});
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeTabId, activePriority, paged, perPage, reloadToken]);

	const refetch = () => setReloadToken((n) => n + 1);

	/**
	 * Same toggle both "More Details" triggers below already did (row click,
	 * action-cell button) - now also scrolls to the detail panel itself
	 * (`scrollToId`, the same real scroll-into-view helper
	 * NeedsAttentionCard.tsx's own `scrollToId('ai-copilot-issues-section')`
	 * already uses) when a group is actually selected, so the panel opens
	 * fully visible regardless of which ancestor is actually the scrollable
	 * one - a plain `window.scrollTo()` only moves the document, not WP
	 * admin's own scrollable wrapper. No scroll on deselect (closing the
	 * panel shouldn't jump the page).
	 */
	const selectGroup = (group: FindingGroup) => {
		setSelectedGroup((current) => {
			if (group.scanner_id === current?.scanner_id) {
				return null;
			}

			scrollToId('ai-copilot-issue-detail-panel');
			return group;
		});
	};

	const handlePriorityChange = (priority: Priority) => {
		setActivePriority(priority);
		setPaged(1);
	};

	if (error) {
		return (
			<ModuleGuardComponent
				icon="error"
				title={__('Could not load issues', 'vulopilot')}
				desc={error}
			/>
		);
	}
	const tableCategoryCounts = [
		{
			value: 'all',
			label: __('All', 'vulopilot'),
			count: Object.values(categoryCounts).reduce(
				(sum, count) => sum + count,
				0
			),
		},
		...CATEGORY_TABS.map((tab) => ({
			value: tab.id,
			label: tab.label,
			count: tab.categories.reduce(
				(sum, category) =>
					sum + (categoryCounts[category] ?? 0),
				0
			),
		})),
	];

	return (
		<>
			{/* Real scroll target for AIAssistant.tsx's own "View all issues"/
			group-row clicks (NeedsAttentionCard.tsx →
			`scrollToId('ai-copilot-issues-section')`) - kept INSIDE this
			grid={8} column rather than as a wrapping element around both of
			this component's own columns, since a wrapping `<div>` there
			would put the grid={8}/grid={4} pair inside ITS OWN box instead
			of the page's shared flex row they're meant to sit side by side
			in (same real layout bug already fixed once for
			SchemaKnowledge/IssuesSection.tsx - see that file's own
			docblock). */}
			<ColumnComponent grid={8}>
				<div id="ai-copilot-issues-section">
					<IssuesSummaryCards
						priorityCounts={priorityCounts}
						isLoading={isLoading}
						activePriority={activePriority}
						onSelectPriority={handlePriorityChange}
					/>

					{!isLoading && data.length === 0 ? (
						<ModuleGuardComponent
							icon="check"
							title={__('Nothing to suggest right now', 'vulopilot')}
							desc={__(
								'AI suggestions appear here once a scan finds something worth fixing.',
								'vulopilot'
							)}
						/>
					) : (
						<TableCard
							showMenu={false}
							hideHeader={true}
							categoryCounts={tableCategoryCounts}
							activeCategory={activeTabId}
							activeRowId={selectedGroup?.scanner_id}
							// Same toggle the action cell's own "More
							// Details"/"Showing" button already does - a
							// click anywhere on the row now opens/closes the
							// details panel too, not just that one small
							// button (zyra's own `onRowClick`, which already
							// skips the action cell itself via
							// `stopPropagation`, so this doesn't double-fire
							// alongside a real button click).
							onRowClick={(row: Record<string, unknown>) => {
								selectGroup(row as unknown as FindingGroup);
							}}
							headers={{
								issue: {
									key: 'label',
									type: 'info',
									label: __('Issue', 'vulopilot'),
									width: '60%',
									iconKey: 'categoryIcon',
									descriptionKey: 'descriptionText',
									badgesKey: 'issueBadges',
								},
								affected: {
									label: __('Affected', 'vulopilot'),
									render: (row: FindingGroup) =>
										formatAffected(
											row.count,
											row.object_type
										),
								},
								action: {
									label: __('Affected', 'vulopilot'),
									type: 'action',
									actions: [
										{
											type: 'button',
											label: (row) =>
												(row as unknown as FindingGroup)
													.scanner_id ===
													selectedGroup?.scanner_id
													? __('Showing', 'vulopilot')
													: __('More Details', 'vulopilot'),
											color: (row) =>
												(row as unknown as FindingGroup)
													.scanner_id ===
													selectedGroup?.scanner_id
													? 'text-green'
													: 'text-purple',
											icon: (row) =>
												(row as unknown as FindingGroup)
													.scanner_id ===
													selectedGroup?.scanner_id
													? 'eye'
													: 'pagination-next-arrow',
											onClick: (row) => {
												selectGroup(row as unknown as FindingGroup);
											},
										},
									],
								},
							}}
							rows={data.map((row) => ({
								...row,
								// Real `SCANNER_ICONS[scanner_id]` first, so
								// e.g. Performance's own CDN/JavaScript/CSS
								// Optimization/Cache Issues rows (all real
								// `category: 'performance'`) each get their
								// own real distinct icon instead of every
								// row in that category sharing one identical
								// glyph - `CATEGORY_ICONS[category]` stays
								// the fallback for any scanner_id not
								// explicitly listed (issuesTypes.ts's own
								// `issueIconFor()` docblock).
								categoryIcon: issueIconFor(
									row.category,
									row.scanner_id
								),
								descriptionText:
									(row.sample?.description?.length ?? 0) > 80
										? `${row.sample?.description?.slice(0, 80)}...`
										: row.sample?.description || '',
								issueBadges: [
									{
										text: CATEGORY_LABELS[row.category] ?? row.category,
										color: `badge-${row.category}`,
									},
									{ text: row.severity, color: `badge-${row.severity}` },
								],
							}))}
							ids={data.map((row) => row.scanner_id)}
							totalRows={total}
							isLoading={isLoading}
							onQueryUpdate={(query: {
								paged?: number | string;
								per_page?: number | string;
								categoryFilter?: string;
							}) => {
								setPaged(Number(query.paged) || 1);
								setPerPage(Number(query.per_page) || 10);
								if (
									query.categoryFilter &&
									query.categoryFilter !== activeTabId
								) {
									setActiveTabId(query.categoryFilter);
								}
							}}
							emptyMessage={__(
								'AI suggestions appear here once a scan finds something worth fixing.',
								'vulopilot'
							)}
						/>
					)}
				</div>
			</ColumnComponent>

			{/* No right-side detail panel at all while there's genuinely
			nothing to show detail for - not even the empty "Select an
			issue" placeholder - same real `isLoading || data.length > 0`
			check the left column's own "Nothing to suggest right now"
			branch above already uses, so both columns agree on whether
			there's real data. */}
			{(isLoading || data.length > 0) && (
				<ColumnComponent grid={4}>
					<div id="ai-copilot-issue-detail-panel">
						<IssueDetailPanel
							group={selectedGroup}
							onActionComplete={refetch}
							onClose={() => setSelectedGroup(null)}
						/>
					</div>
				</ColumnComponent>
			)}
		</>
	);
};

export default IssuesList;
