/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse, scrollToId } from '@zyra/core';
import { ColumnComponent, ModuleGuardComponent } from '@zyra/components';
import { TableCard } from '@zyra/table';
import type { FindingGroup } from '../../../components/Issues/issuesTypes';
import { CATEGORY_LABELS, formatAffected } from '../../../components/Issues/issuesTypes';
import { Priority } from '../../../components/Issues/IssuesSummaryCards';
import IssueDetailPanel from '../../../components/Issues/IssueDetailPanel';

/**
 * Real scanner ids behind every schema/entity-adjacent finding this
 * codebase already produces - `schema` (category `schema`),
 * `structured-data`/`sitewide-structured-data` (category `seo`),
 * `organization-schema`/`author-schema` (category `brand`). Sent as
 * `GET /findings/groups`' own `scanner_id` param (comma-separated, same
 * `parse_comma_separated_list()` handling GET /findings' `scanner_id`
 * already uses) rather than a `category` filter: these 5 scanners don't
 * share one category, and every category they DO belong to (`seo`/`brand`)
 * also holds many unrelated scanners (thin-content, broken-links, brand
 * visibility, …) a `category` filter would incorrectly pull in too.
 */
const SCHEMA_ISSUE_SCANNER_IDS = [
	'schema',
	'structured-data',
	'sitewide-structured-data',
	'organization-schema',
	'author-schema',
];

interface GroupsResponse {
	data: FindingGroup[];
	total: number;
	priority_counts: { high: number; medium: number; low: number };
}

const IssuesSection = () => {
	const [activePriority] = useState<Priority>('all');
	const [paged, setPaged] = useState(1);
	const [perPage, setPerPage] = useState(10);

	const [data, setData] = useState<FindingGroup[]>([]);
	const [total, setTotal] = useState(0);
	const [, setPriorityCounts] = useState({
		high: 0,
		medium: 0,
		low: 0,
	});
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [reloadToken, setReloadToken] = useState(0);
	const [selectedGroup, setSelectedGroup] = useState<FindingGroup | null>(
		null
	);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setError(null);

		const params = new URLSearchParams();
		params.set('scanner_id', SCHEMA_ISSUE_SCANNER_IDS.join(','));
		params.set('page', String(paged));
		params.set('per_page', String(perPage));

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
	}, [activePriority, paged, perPage, reloadToken]);

	const refetch = () => setReloadToken((n) => n + 1);


	/** Shared by the row click and the action cell's own "More Details"/"Showing" button below - same real toggle IssuesList.tsx's own identical `selectGroup` already establishes, now also scrolling the detail panel into view (`scrollToId`, not `window.scrollTo` - WP admin's own scrollable wrapper isn't the document) on a real select, never on deselect. */
	const handleSelectGroup = (group: FindingGroup) => {
		const isDeselecting = group.scanner_id === selectedGroup?.scanner_id;

		setSelectedGroup(isDeselecting ? null : group);

		if (!isDeselecting) {
			scrollToId('schema-knowledge-issue-detail-panel');
		}
	};

	if (error) {
		return (
			<ModuleGuardComponent
				icon="error"
				title={__('Could not load findings', 'vulopilot')}
				desc={error}
			/>
		);
	}

	return (
		<>
			{/* Real scroll target for "View all issues"/"Review" elsewhere
			on this page (`scrollToId('schema-knowledge-issues')`) - kept
			INSIDE this grid={8} column rather than as a wrapping element
			around both of this component's own columns, since a wrapping
			`<div>` there would put the grid={8}/grid={4} pair inside ITS
			OWN box instead of the page's shared `.container-wrapper` flex
			row they're meant to sit side by side in (SchemaKnowledgeTab.tsx
			used to wrap this whole component in exactly such a div, which
			broke that side-by-side layout - fixed by moving the id here
			instead). */}
			<ColumnComponent grid={8}>
				<div id="schema-knowledge-issues">
					{/* <IssuesSummaryCards
						total={total}
						priorityCounts={priorityCounts}
						isLoading={isLoading}
						activePriority={activePriority}
						onSelectPriority={handlePriorityChange}
					/> */}

					{!isLoading && data.length === 0 ? (
						<ModuleGuardComponent
							icon="check"
							title={__('No schema issues right now', 'vulopilot')}
							desc={__(
								'No schema/structured-data findings yet - run a scan to check.',
								'vulopilot'
							)}
						/>
					) : (
						<TableCard
							showMenu={false}
							hideHeader={true}
							variant="transparent"
							// Highlights the row whose details are showing in
							// the side panel - same real `activeRowId`/action-
							// toggle pairing IssuesList.tsx's own Issue/Affected/
							// Action table already uses.
							activeRowId={selectedGroup?.scanner_id}
							// Same toggle the action cell's own "More
							// Details"/"Showing" button already does - a
							// click anywhere on the row now opens/closes the
							// details panel too, not just that one small
							// button.
							onRowClick={(row: Record<string, unknown>) => {
								handleSelectGroup(row as unknown as FindingGroup);
							}}
							headers={{
								issue: {
									// `type: 'info'`'s own `key` is the row field
									// that becomes the title (@zyra/table's
									// TableUtils.tsx) - `descriptionKey`/`badgesKey`
									// name the row fields that feed the rest, so
									// `tableRows` below precomputes both onto each
									// row rather than this column needing its own
									// per-row `render()` (same real
									// InformationItemComponent output as before,
									// just built by the shared column type now).
									key: 'label',
									type: 'info',
									label: __('Issue', 'vulopilot'),
									width: '65%',
									descriptionKey: 'descriptionText',
									badgesKey: 'issueBadges',
								},
								affected: {
									label: __('Affected', 'vulopilot'),
									render: (row: FindingGroup) =>
										formatAffected(row.count, row.object_type),
								},
								action: {
									label: __('Action', 'vulopilot'),
									// `type: 'more-action'` no longer exists in
									// @zyra/table - `type: 'action'` now covers
									// that same single-toggle-button case via a
									// `type: 'button'` action whose label/icon
									// are functions of `row` (see that type's
									// own docblock, TableRowActions.tsx) - same
									// real "Showing"/"More Details" toggle
									// IssuesList.tsx's own Issues table already
									// uses.
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
												handleSelectGroup(row as unknown as FindingGroup);
											},
										},
									],
								},
							}}
							rows={data.map((row) => ({
								...row,
								descriptionText: row.sample?.description || '',
								issueBadges: [
									{
										text: CATEGORY_LABELS[row.category] ?? row.category,
										color: `badge-${row.category}`,
									},
									{
										text: row.severity,
										color: `badge-${row.severity}`,
									},
								],
							}))}
							ids={data.map((row) => row.scanner_id)}
							totalRows={total}
							isLoading={isLoading}
							onQueryUpdate={(query: {
								paged?: number | string;
								per_page?: number | string;
							}) => {
								setPaged(Number(query.paged) || 1);
								setPerPage(Number(query.per_page) || 10);
							}}
							emptyMessage={__(
								'No schema/structured-data findings yet - run a scan to check.',
								'vulopilot'
							)}
						/>
					)}
				</div>
			</ColumnComponent>

			{/* No right-side detail panel at all while there's genuinely
			nothing to show detail for - not even the empty "Select an
			issue" placeholder - same real `isLoading || data.length > 0`
			check the left column's own "No schema issues right now"
			branch above already uses, so both columns agree on whether
			there's real data. */}
			{(isLoading || data.length > 0) && (
				<ColumnComponent grid={4}>
					<div id="schema-knowledge-issue-detail-panel">
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

export default IssuesSection;
