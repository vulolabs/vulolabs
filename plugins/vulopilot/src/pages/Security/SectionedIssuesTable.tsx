/* global vulopilotAppLocalizer */
import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, scrollToId } from '@zyra/core';
import {
	ColumnComponent,
	ContainerComponent,
	ModuleGuardComponent,
	SectionComponent,
	TabsComponent
} from '@zyra/components';
import { TableCard } from '@zyra/table';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import { CATEGORY_LABELS, formatAffected, groupKey, issueIconFor } from '../../components/Issues/issuesTypes';
import IssuesSummaryCards, { Priority } from '../../components/Issues/IssuesSummaryCards';
import IssueDetailPanel from '../../components/Issues/IssueDetailPanel';
import ProLockedCard from '../../components/ProLockedCard';
import { Card, EmptyState } from '../../components/ui';
import type { FindingsSection } from './SectionedFindingsTab';
import './ProtectMySite.scss';
import { columns, tableRows } from '../../services/tableColumns';
import type { QueryProps } from '@zyra/table';

const nonceHeaders = { headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } };

const PER_PAGE = 10;

/** Real sum of `.count` across every group whose scanner_id is in `scannerIds`. */
const sumGroupCounts = (groups: FindingGroup[], scannerIds: string[]): number =>
	groups
		.filter((group) => scannerIds.includes(group.scanner_id))
		.reduce((total, group) => total + group.count, 0);

/** Worst-severity-first, ties broken by real affected count. */
const SEVERITY_RANK: Record<FindingGroup['severity'], number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
	info: 4,
};

/** Same 3-tier critical→high/info→low fold Findings.php's own `PRIORITY_SEVERITY_RANKS` uses for `GET /findings/groups`' `priority` param. */
const PRIORITY_SEVERITIES: Record<Exclude<Priority, 'all'>, FindingGroup['severity'][]> = {
	high: ['critical', 'high'],
	medium: ['medium'],
	low: ['low', 'info'],
};

/** Truncates a real finding's own `sample.description` to `maxLength` characters. */
const truncateDescription = (text: string, maxLength = 50): string => {
	if (!text || text.length <= maxLength) {
		return text;
	}

	const sliced = text.slice(0, maxLength);
	const lastSpace = sliced.lastIndexOf(' ');

	// Only cut at the last space if it's reasonably close to the end.
	const cut = lastSpace > maxLength * 0.6 ? sliced.slice(0, lastSpace) : sliced;

	return `${cut.trimEnd()}…`;
};


export type SectionedIssuesTab = 'all' | 'important' | string;

interface SectionedIssuesTableProps {
	/** DOM anchor id for the whole merged table. */
	id: string;
	/** Card title, e.g. "All Security Issues". */
	title: string;
	sections: FindingsSection[];
	/** The full real scope of "All", when it's wider than the union of `sections`' own scanner ids. */
	allScannerIds?: string[];
	activeTab: SectionedIssuesTab;
	// eslint-disable-next-line no-unused-vars
	onTabChange: (tab: SectionedIssuesTab) => void;
}

/** One real, unified issues table. */
const SectionedIssuesTable = ({
	id,
	sections,
	allScannerIds: allScannerIdsProp,
	activeTab,
	onTabChange,
}: SectionedIssuesTableProps) => {
	const [fetchedGroups, setFetchedGroups] = useState<FindingGroup[]>([]);
	// Fixed issues whose fix can still be undone, so they stay listed after a reload.
	const [fixedGroups, setFixedGroups] = useState<FindingGroup[]>([]);
	// Groups fixed this session: kept listed as Fixed after the refetch drops them.
	const [keptGroups, setKeptGroups] = useState<FindingGroup[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [reloadToken, setReloadToken] = useState(0);
	const [activePriority, setActivePriority] = useState<Priority>('all');
	const [paged, setPaged] = useState(1);
	const [selectedGroup, setSelectedGroup] = useState<FindingGroup | null>(
		null
	);
	const [searchValue, setSearchValue] = useState('');
	const [resourceFilterValue, setResourceFilterValue] = useState('');
	// Real "Show ignored" toggle - off (default) fetches only real open groups, same as before.
	const [showIgnored] = useState(false);

	useEffect(() => {
		setIsLoading(true);
		Promise.all([
			getApiResponse<{ data: FindingGroup[] }>(
				getApiLink(
					vulopilotAppLocalizer,
					`findings/groups?per_page=200${showIgnored ? '&status=all' : ''}`
				),
				nonceHeaders
			),
			// Skip this route when the feature isn't unlocked, instead of a guaranteed 404.
			vulopilotAppLocalizer.khali_dabba
				? getApiResponse<{ data: FindingGroup[] }>(
						getApiLink(vulopilotAppLocalizer, 'findings/fixed-groups'),
						nonceHeaders
					).catch(() => null)
				: Promise.resolve(null),
		])
			.then(([open, fixed]) => {
				setFetchedGroups(open?.data ?? []);
				setFixedGroups(fixed?.data ?? []);
			})
			.finally(() => setIsLoading(false));
	}, [reloadToken, showIgnored]);

	const groups = useMemo(
		() => {
			const listed = new Set(fetchedGroups.map((group) => group.scanner_id));
			const fixedOnly = fixedGroups.filter((group) => !listed.has(group.scanner_id));
			fixedOnly.forEach((group) => listed.add(group.scanner_id));

			return [
				...fetchedGroups,
				...fixedOnly,
				...keptGroups.filter((kept) => !listed.has(kept.scanner_id)),
			];
		},
		[fetchedGroups, fixedGroups, keptGroups]
	);

	const refetch = () => setReloadToken((current) => current + 1);

	// Resets the priority filter/pagination/selection whenever the active tab changes.
	useEffect(() => {
		setActivePriority('all');
		setPaged(1);
		setSelectedGroup(null);
		setKeptGroups([]);
	}, [activeTab]);

	const allScannerIds =
		allScannerIdsProp ??
		Array.from(new Set(sections.flatMap((section) => section.scannerIds)));

	const importantScannerIds = groups
		.filter(
			(group) =>
				allScannerIds.includes(group.scanner_id) &&
				('critical' === group.severity || 'high' === group.severity)
		)
		.map((group) => group.scanner_id);

	const tabs: {
		id: SectionedIssuesTab;
		label: string;
		description: string;
		icon?: string;
		count: number;
	}[] = [
		{
			id: 'all',
			label: __('All', 'vulopilot'),
			description: __(
				'Every open finding across every category below.',
				'vulopilot'
			),
			icon: 'security',
			count: sumGroupCounts(groups, allScannerIds),
		},
		{
			id: 'important',
			label: __('Important', 'vulopilot'),
			description: __(
				'Critical and high-severity findings that need attention first.',
				'vulopilot'
			),
			icon: 'error',
			count: sumGroupCounts(groups, importantScannerIds),
		},
		...sections.map((section) => ({
			id: section.key,
			label: section.title,
			description: section.description,
			icon: section.icon,
			count: sumGroupCounts(groups, section.scannerIds),
		})),
	];


	const scannerIdsForTab: Record<string, string[]> = {
		all: allScannerIds,
		important: importantScannerIds,
	};
	sections.forEach((section) => {
		scannerIdsForTab[section.key] = section.scannerIds;
	});

	// This component's own real section a given scanner_id belongs to.
	const findSectionIdForScanner = (scannerId: string): SectionedIssuesTab =>
		sections.find((section) => section.scannerIds.includes(scannerId))
			?.key ?? 'all';

	const activeSection = sections.find((section) => section.key === activeTab);
	const isActiveSectionLocked = Boolean(
		activeSection?.locked && activeSection?.proModule
	);
	const activeScannerIds = scannerIdsForTab[activeTab] ?? allScannerIds;
	const tabGroups = groups.filter((group) =>
		activeScannerIds.includes(group.scanner_id)
	);

	// Real "Search by title or source page…" / "All resources" (object_type) filters.
	const searchFilteredGroups = tabGroups.filter((group: FindingGroup) => {
		if (resourceFilterValue && group.object_type !== resourceFilterValue) {
			return false;
		}
		if (
			searchValue &&
			!group.label.toLowerCase().includes(searchValue.toLowerCase())
		) {
			return false;
		}
		return true;
	});

	const countByPriority = (priority: Exclude<Priority, 'all'>): number =>
		searchFilteredGroups
			.filter((group) => PRIORITY_SEVERITIES[priority].includes(group.severity))
			.reduce((total, group) => total + group.count, 0);

	const priorityCounts = {
		high: countByPriority('high'),
		medium: countByPriority('medium'),
		low: countByPriority('low'),
	};

	const priorityFilteredGroups =
		'all' === activePriority
			? searchFilteredGroups
			: searchFilteredGroups.filter((group) =>
					PRIORITY_SEVERITIES[activePriority].includes(group.severity)
				);

	// Real, already-present resource-type values in this tab's own current group list.
	const resourceFilterOptions = Array.from(
		new Set(
			tabGroups
				.map((group) => group.object_type)
				.filter((type): type is string => null !== type)
		)
	).map((type) => ({ label: type, value: type }));

	const sortedGroups = [...priorityFilteredGroups].sort((a, b) => {
		const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];

		return 0 !== severityDiff ? severityDiff : b.count - a.count;
	});

	const pageRows = sortedGroups.slice(
		(paged - 1) * PER_PAGE,
		paged * PER_PAGE
	);

	// Keep the current selection if still on screen, else fall back to the first visible row.
	useEffect(() => {
		setSelectedGroup((current) => {
			if (
				current &&
				pageRows.some((group) => groupKey(group) === groupKey(current))
			) {
				return (
					pageRows.find(
						(group) => groupKey(group) === groupKey(current)
					) ?? current
				);
			}

			return pageRows[0] ?? null;
		});
	}, [groups, activeTab, activePriority, searchValue, resourceFilterValue, paged]);

	const handlePriorityChange = (priority: Priority) => {
		setActivePriority(priority);
		setPaged(1);
	};

	/** Shared by the row click and the action cell's own "More Details"/ "Showing" button below. */
	const handleSelectGroup = (group: FindingGroup) => {
		const isDeselecting =
			selectedGroup !== null && groupKey(group) === groupKey(selectedGroup);

		setSelectedGroup(isDeselecting ? null : group);

		if (!isDeselecting) {
			scrollToId(`${id}-detail-panel`);
		}
	};

	const handleActionComplete = (event?: { group: FindingGroup; fixed: boolean }) => {
		refetch();

		if (!event) {
			setSelectedGroup(null);
			return;
		}

		// A fix keeps the group listed as Fixed; an undo drops that marker so it shows as open again.
		setKeptGroups((current) => {
			const others = current.filter((group) => group.scanner_id !== event.group.scanner_id);

			return event.fixed ? [...others, { ...event.group, fixed: true }] : others;
		});
	};

	// Shared across every tab - TabsComponent only ever renders `tabs[activeIndex].content`.
	const sectionContent = (
		<>
			<ColumnComponent grid={8}>
				{isActiveSectionLocked ? (
					<ProLockedCard
						moduleName={activeSection!.proModule as string}
					/>
				) : (
					<>
						<IssuesSummaryCards
							priorityCounts={priorityCounts}
							isLoading={isLoading}
							activePriority={activePriority}
							onSelectPriority={handlePriorityChange}
						/>

						{!isLoading && 0 === sortedGroups.length ? (
							<ModuleGuardComponent
								icon="check"
								title={__('Nothing here right now', 'vulopilot')}
								desc={
									activeSection?.emptyMessage ||
									__(
										'No findings here yet - nothing to report.',
										'vulopilot'
									)
								}
							/>
						) : (
							<TableCard
								showMenu={false}
								hideHeader={true}
								variant="transparent"
								// Real "All resources" filter rendered in the table's own action row, before the search field.
								filtersBeforeSearch
								search={{
									placeholder: __(
										'Search by title or source page…',
										'vulopilot'
									),
								}}
								filters={[
									{
										key: 'object_type',
										label: __('All resources', 'vulopilot'),
										type: 'select',
										size: 10,
										options: resourceFilterOptions,
									},
								]}
								activeRowId={selectedGroup ? groupKey(selectedGroup) : undefined}
								// Same toggle the action cell's own "More Details"/"Showing" button already does.
								onRowClick={(row: Record<string, unknown>) => {
									handleSelectGroup(row as unknown as FindingGroup);
								}}
								headers={columns({
									issue: {
										key: 'label',
										type: 'info',
										label: __('Issue', 'vulopilot'),
										width: '65%',
										descriptionKey: 'descriptionText',
										badgesKey: 'issueBadges',
										// Per-row `category` icon, from the same `CATEGORY_ICONS` map as IssuesList.tsx.
										iconKey: 'issueIcon',
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
										label: __('Action', 'vulopilot'),
										type: 'action',
										actions: [
											{
												type: 'button',
												label: (row) =>
													(row as unknown as FindingGroup).fixed
														? __('Fixed', 'vulopilot')
														: selectedGroup &&
															groupKey(row as unknown as FindingGroup) ===
																groupKey(selectedGroup)
															? __('Showing', 'vulopilot')
															: __('More Details', 'vulopilot'),
												color: (row) =>
													selectedGroup &&
													groupKey(row as unknown as FindingGroup) ===
														groupKey(selectedGroup)
														? 'text-green'
														: 'text-purple',
												icon: (row) =>
													selectedGroup &&
													groupKey(row as unknown as FindingGroup) ===
														groupKey(selectedGroup)
														? 'eye'
														: 'pagination-next-arrow',
												onClick: (row) => {
													handleSelectGroup(row as unknown as FindingGroup);
												},
											},
										],
									},
								})}
								rows={tableRows(pageRows.map((row) => ({
									...row,
									// Bounded to 50 chars so a long `sample.description` doesn't stretch the Issue column past its own 65% width.
									descriptionText: truncateDescription(
										row.sample?.description || '',
										80
									),
									// Real per-row icon - `SCANNER_ICONS[scanner_id]` first.
									issueIcon: issueIconFor(
										row.category,
										row.scanner_id
									),
									issueBadges: [
										{
											text: CATEGORY_LABELS[row.category] ?? row.category,
											color: 'blue',
											// Real, working "filter by clicking a badge".
											onClick: (event: MouseEvent<HTMLSpanElement>) => {
												event.stopPropagation();
												onTabChange(
													findSectionIdForScanner(row.scanner_id)
												);
											},
										},
										{ text: row.severity, color: `badge-${row.severity}` },
									],
								})))}
								ids={pageRows.map((row) => groupKey(row))}
								totalRows={sortedGroups.length}
								isLoading={isLoading}
								onQueryUpdate={(query: QueryProps) => {
									setPaged(Number(query.paged) || 1);
									setSearchValue(query.searchValue ?? '');
									setResourceFilterValue(
										// A single-choice filter: one string.
										(query.filter?.object_type as string) ?? ''
									);
								}}
								emptyMessage={
									activeSection?.emptyMessage ||
									__(
										'No findings here yet - nothing to report.',
										'vulopilot'
									)
								}
							/>
						)}
					</>
				)}
			</ColumnComponent>

			{/* No right-side detail panel at all while there's genuinely nothing to show detail for (a locked section, or a real empty tab). */}
			{!isActiveSectionLocked && (isLoading || sortedGroups.length > 0) && (
				<ColumnComponent grid={4}>
					<div id={`${id}-detail-panel`}>
					<IssueDetailPanel
						group={selectedGroup}
						onActionComplete={handleActionComplete}
					/>
					</div>
				</ColumnComponent>
			)}
		</>
	);

	// Nothing open anywhere and no section waiting on Pro: one "all clear" card, not a row of "(0)" tabs, three
	// zero-count priority tiles and an empty table.
	const isAllClear =
		!isLoading &&
		0 === groups.filter((group) => allScannerIds.includes(group.scanner_id)).length &&
		!sections.some((section) => section.locked && section.proModule);

	if (isAllClear) {
		return (
			<ContainerComponent id={id}>
				<ColumnComponent>
					<Card
						title={__('Issues', 'vulopilot')}
						icon="error"
						desc={__('Findings from your most recent scans, grouped by check.', 'vulopilot')}
					>
						<EmptyState
							compact
							icon="check"
							tone="green"
							title={__('No open issues', 'vulopilot')}
							text={__(
								'Every check passed on the last scan. Anything a new scan finds will be listed here, most important first.',
								'vulopilot'
							)}
						/>
					</Card>
				</ColumnComponent>
			</ContainerComponent>
		);
	}

	return (
		<ContainerComponent id={id}>
			<ColumnComponent>
				<SectionComponent
					wrapperClass="without-settings"
					title={__('Issues', 'vulopilot')}
					desc={__('Findings from your most recent scans, grouped by check.', 'vulopilot')}
				/>
				<TabsComponent
					className="seo-issues-filter-tabs"
					activeIndex={Math.max(
						tabs.findIndex((tab) => tab.id === activeTab),
						0
					)}
					onTabChange={(index: number) => onTabChange(tabs[index].id)}
					tabs={tabs.map((tab) => ({
						label: sprintf('%1$s (%2$d)', tab.label, tab.count),
					}))}
				/>
			</ColumnComponent>
			{sectionContent}
		</ContainerComponent>
	);
};

export default SectionedIssuesTable;