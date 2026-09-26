/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
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
import { CATEGORY_LABELS, formatAffected, issueIconFor } from '../../components/Issues/issuesTypes';
import IssuesSummaryCards, { Priority } from '../../components/Issues/IssuesSummaryCards';
import IssueDetailPanel from '../../components/Issues/IssueDetailPanel';
import ProLockedCard from '../../components/ProLockedCard';
import type { FindingsSection } from './SectionedFindingsTab';
import './ProtectMySite.scss';

const nonceHeaders = { headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } };

const PER_PAGE = 10;

/** Real sum of `.count` across every group whose scanner_id is in `scannerIds` - same technique Commerce/CommerceIssuesTable.tsx's own `sumGroupCounts()` already established. */
const sumGroupCounts = (groups: FindingGroup[], scannerIds: string[]): number =>
	groups
		.filter((group) => scannerIds.includes(group.scanner_id))
		.reduce((total, group) => total + group.count, 0);

/** Worst-severity-first, ties broken by real affected count - same ORDER BY FindingRepository::get_finding_groups() itself uses server-side, reproduced client-side since this component paginates the already-fetched group list rather than re-querying per page. */
const SEVERITY_RANK: Record<FindingGroup['severity'], number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
	info: 4,
};

/** Same 3-tier critical→high/info→low fold Findings.php's own `PRIORITY_SEVERITY_RANKS` uses for `GET /findings/groups`' `priority` param - reproduced client-side since this component filters/counts an already-fetched group list rather than re-querying per priority tier. */
const PRIORITY_SEVERITIES: Record<Exclude<Priority, 'all'>, FindingGroup['severity'][]> = {
	high: ['critical', 'high'],
	medium: ['medium'],
	low: ['low', 'info'],
};

/**
 * Truncates a real finding's own `sample.description` to `maxLength`
 * characters, cutting on the nearest word boundary so the string doesn't
 * end mid-word - same real "don't truncate mid-word" reading a plain
 * `slice()` would produce, just without leaving a dangling partial word.
 * Appends a single-character ellipsis (`…`, not `...`) when the input was
 * longer than `maxLength`, so the caller can tell a truncated string from
 * one that happened to be exactly `maxLength`.
 */
const truncateDescription = (text: string, maxLength = 50): string => {
	if (!text || text.length <= maxLength) {
		return text;
	}

	const sliced = text.slice(0, maxLength);
	const lastSpace = sliced.lastIndexOf(' ');

	// Only cut at the last space if it's reasonably close to the end -
	// otherwise a single very long word would truncate to nothing.
	const cut = lastSpace > maxLength * 0.6 ? sliced.slice(0, lastSpace) : sliced;

	return `${cut.trimEnd()}…`;
};


export type SectionedIssuesTab = 'all' | 'important' | string;

interface SectionedIssuesTableProps {
	/** DOM anchor id for the whole merged table - what a "Review Issues"-style button elsewhere on the tab scrolls to. */
	id: string;
	/** Card title, e.g. "All Security Issues". */
	title: string;
	sections: FindingsSection[];
	/**
	 * The full real scope of "All", when it's wider than the union of
	 * `sections`' own scanner ids - Security's own 4 named sections
	 * (Login & Accounts/Website Exposure/Browser Protection/SSL & Secure
	 * Connection) don't cover every scanner SecurityTab.tsx's own
	 * `SECURITY_FINDINGS_SCANNER_IDS` counts (e.g. `core-file-integrity`
	 * has no dedicated section of its own, same reason this tab's old
	 * catch-all "Security Findings" section used to exist). Omit when `sections`' own union
	 * genuinely already is everything (Site Health/Accessibility, whose
	 * hero cards already compute their own totals the same union way -
	 * see SiteHealthTab.tsx's own `ALL_SCANNER_IDS`).
	 */
	allScannerIds?: string[];
	activeTab: SectionedIssuesTab;
	onTabChange: (tab: SectionedIssuesTab) => void;
}

/**
 * One real, unified issues table - same design as AI Copilot's own
 * "Issues" tab (src/pages/AIAssistant/IssuesList.tsx), adapted here per
 * direct instruction: real `GET /findings/groups` rows (one row per issue
 * *type* - "8 images are missing alt text" is one row for 8 real
 * findings, not 8 rows), a real Total/High/Medium/Low priority filter
 * (IssuesSummaryCards.tsx, reused as-is - fully generic, no AI-Assistant-
 * specific coupling), and a real side detail panel (IssueDetailPanel.tsx,
 * also reused as-is) with "Fix with AI"/"Resolve all"/"Ignore all" bulk
 * actions scoped to the selected group, instead of FindingsTable's own
 * one-row-per-individual-finding grid with inline per-row Fix/Resolve/
 * Ignore/Reopen/Snooze actions. That per-row/bulk-select functionality is
 * intentionally traded away here for design parity with the reference
 * page - per-group bulk actions in the side panel already cover the same
 * ground (act on every open finding in a group at once).
 *
 * The scanner_id-based category scope (All/Important/one per `sections`
 * entry) is a real `TabsComponent` bar above the table (`seo-issues-filter-tabs`
 * - the same class name, and the same global NavigatorComponent.scss
 * tab-bar/underline/active-state styling, IssuesSection.tsx's own filter
 * tabs already use, so the two read as one consistent pattern rather than
 * inventing a second tab-bar look). This briefly lived as an "All issues"
 * `select` filter inside the table instead (per an earlier direct
 * instruction) - reverted back to a visible tab bar per direct
 * instruction, since a silent dropdown gave no visual confirmation that a
 * badge/tile click elsewhere on the page (e.g. MetricsGrid.tsx's per-tile
 * badges) had actually filtered anything. `activeTab`/`onTabChange` stay
 * controlled props either way (needed anyway for cross-component
 * deep-links like VulnerabilitiesFoundCard's row clicks).
 *
 * Deliberately fetches `GET /findings/groups` once, with no `category`
 * filter, and does every category/priority/pagination slice client-side
 * against that one result - several of Security's own scanners have a raw
 * `category` column that isn't literally `security` (RestApiScanner is
 * `rest-api`, SslMonitoringScanner is `ssl`), and the real total group
 * count site-wide (~40) is small enough that one broad fetch plus
 * client-side slicing is simpler and cheaper than real server-side paging
 * across every possible category/priority/scanner_id combination.
 */
const SectionedIssuesTable = ({
	id,
	sections,
	allScannerIds: allScannerIdsProp,
	activeTab,
	onTabChange,
}: SectionedIssuesTableProps) => {
	const [groups, setGroups] = useState<FindingGroup[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [reloadToken, setReloadToken] = useState(0);
	const [activePriority, setActivePriority] = useState<Priority>('all');
	const [paged, setPaged] = useState(1);
	const [selectedGroup, setSelectedGroup] = useState<FindingGroup | null>(
		null
	);
	const [searchValue, setSearchValue] = useState('');
	const [resourceFilterValue, setResourceFilterValue] = useState('');
	// Real "Show ignored" toggle - off (default) fetches only real open
	// groups, same as before; on refetches with `status=all`
	// (FindingRepository::get_finding_groups()'s own real escape hatch,
	// added alongside this) so real ignored/resolved/snoozed findings are
	// folded into the same real groups too, not a second, separate list.
	const [showIgnored] = useState(false);

	useEffect(() => {
		setIsLoading(true);
		getApiResponse<{ data: FindingGroup[] }>(
			getApiLink(
				vulopilotAppLocalizer,
				`findings/groups?per_page=200${showIgnored ? '&status=all' : ''}`
			),
			nonceHeaders
		)
			.then((response) => setGroups(response?.data ?? []))
			.finally(() => setIsLoading(false));
	}, [reloadToken, showIgnored]);

	const refetch = () => setReloadToken((current) => current + 1);

	// Resets the priority filter/pagination/selection whenever the active
	// tab changes, regardless of whether it changed via a click on this
	// component's own tab bar or an external deep-link (e.g.
	// AccessibilityChecksGrid.tsx's per-tile "Review" button calling the
	// parent's own setActiveTab directly) - a stale "High" priority filter
	// left over from a previous tab could otherwise silently hide every row
	// of a tab a user just jumped to from elsewhere on the page.
	useEffect(() => {
		setActivePriority('all');
		setPaged(1);
		setSelectedGroup(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
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

	// This component's own real section a given scanner_id belongs to -
	// not the unrelated, page-wide `CATEGORY_TABS` (issuesTypes.ts's own
	// `findTabIdForCategory`), since `sections` here is each caller's own
	// narrower set (e.g. SecurityTab.tsx's 4 named sections, not every
	// real category site-wide). Falls back to 'all' for a scanner_id no
	// named section claims (e.g. `core-file-integrity`, same real gap
	// `allScannerIds`'s own docblock already documents).
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

	// Real "Search by title or source page…" / "All resources" (object_type)
	// filters - composed with the "All issues" section filter above (AND
	// logic, that one already scopes `tabGroups` via `activeTab`/
	// `onTabChange`), same real client-side-slice-of-one-fetch posture this
	// component's own priority/pagination filters already use. "Source
	// page" in the search placeholder is honest about what this actually
	// matches: these rows are one per real issue *type* (scanner_id/
	// category), not one per affected page, so there's no real per-row
	// "source page" field to search here - only each row's own real
	// `label` (e.g. "Weak Password Detection").
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

	// Real, already-present resource-type values in this tab's own current
	// group list - not a hardcoded list, so a section with fewer real
	// resource types never shows an option with nothing behind it.
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

	// Same "keep the current selection if it's still on screen, otherwise
	// fall back to the first visible row" reconciliation IssuesSection.tsx
	// (GEO/SchemaKnowledge) and IssuesList.tsx (AI Copilot) already do
	// inside their own fetch response handlers - replicated here as its own
	// effect instead, since this component derives `pageRows` client-side
	// (one `findings/groups` fetch, filtered/sorted/paged on every render)
	// rather than re-fetching per filter change. Runs whenever anything
	// that can change which rows are visible changes, so the side panel
	// always shows real detail for the first row instead of the empty
	// "Select an issue" placeholder - including right after
	// `handleActionComplete` clears the selection following a fix/ignore
	// action.
	useEffect(() => {
		setSelectedGroup((current) => {
			if (
				current &&
				pageRows.some((group) => group.scanner_id === current.scanner_id)
			) {
				return (
					pageRows.find(
						(group) => group.scanner_id === current.scanner_id
					) ?? current
				);
			}

			return pageRows[0] ?? null;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [groups, activeTab, activePriority, searchValue, resourceFilterValue, paged]);

	const handlePriorityChange = (priority: Priority) => {
		setActivePriority(priority);
		setPaged(1);
	};

	/**
	 * Shared by the row click and the action cell's own "More Details"/
	 * "Showing" button below - same toggle either way, now also scrolling
	 * to the detail panel itself (`scrollToId`, the same real scroll-into-
	 * view helper IssuesList.tsx's own identical `selectGroup` already
	 * uses) on a real select, never on deselect (closing the panel
	 * shouldn't jump the page). A plain `window.scrollTo()` only moves the
	 * document, not WP admin's own scrollable wrapper - `scrollToId`
	 * scrolls whichever ancestor is actually the scrollable one.
	 */
	const handleSelectGroup = (group: FindingGroup) => {
		const isDeselecting = group.scanner_id === selectedGroup?.scanner_id;

		setSelectedGroup(isDeselecting ? null : group);

		if (!isDeselecting) {
			scrollToId(`${id}-detail-panel`);
		}
	};

	const handleActionComplete = () => {
		refetch();
		setSelectedGroup(null);
	};

	// Shared across every tab - TabsComponent only ever renders
	// `tabs[activeIndex].content`, and this same reactive tree (already
	// keyed off `activeTab`/`activeScannerIds` state, not off which tab
	// object it's attached to) is what every tab showed even before this
	// was a real TabsComponent, so it's simply handed to all of them here.
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
								// Real "All resources" filter rendered in the
								// table's own action row, before the search
								// field, per direct instruction - rather than
								// this component's own long-standing default
								// (filters below the table, in its own
								// `filter-wrapper`). The category scope
								// ("All issues") moved back out to the real
								// tab bar above - see this component's own
								// top docblock.
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
								activeRowId={selectedGroup?.scanner_id}
								// Same toggle the action cell's own "More
								// Details"/"Showing" button already does - a
								// click anywhere on the row now opens/closes
								// the details panel too, not just that one
								// small button.
								onRowClick={(row: Record<string, unknown>) => {
									handleSelectGroup(row as unknown as FindingGroup);
								}}
								headers={{
									issue: {
										key: 'label',
										type: 'info',
										label: __('Issue', 'vulopilot'),
										width: '65%',
										descriptionKey: 'descriptionText',
										badgesKey: 'issueBadges',
										// Real, per-row `category` icon -
										// same `CATEGORY_ICONS` map (icon
										// name + palette color class in one
										// string, e.g. "security lime")
										// IssuesList.tsx's own row icons
										// already use, not a single fixed
										// icon for every row.
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
								rows={pageRows.map((row) => ({
									...row,
									// Bounded to 50 chars (word-boundary safe)
									// so a long `sample.description` doesn't
									// stretch the Issue column past its own
									// 65% width - the full real description is
									// still shown in the side detail panel
									// (`IssueDetailPanel`) when the row is
									// selected.
									descriptionText: truncateDescription(
										row.sample?.description || '',
										80
									),
									// Real per-row icon - `SCANNER_ICONS[scanner_id]`
									// first, so e.g. Performance's own CDN/
									// JavaScript/CSS Optimization/Cache Issues
									// rows (all real `category: 'performance'`)
									// each get their own real distinct icon
									// instead of every row in that category
									// sharing one identical glyph (confirmed
									// live) - `CATEGORY_ICONS[category]`
									// (same map IssuesList.tsx's own row icons
									// already use) stays the fallback for any
									// scanner_id not explicitly listed.
									issueIcon: issueIconFor(
										row.category,
										row.scanner_id
									),
									issueBadges: [
										{
											text: CATEGORY_LABELS[row.category] ?? row.category,
											color: 'blue',
											// Real, working "filter by clicking
											// a badge" - jumps to the exact same
											// real section the tab bar above
											// drives (`onTabChange`), so the
											// two stay in sync rather than
											// being two independent
											// mechanisms.
											onClick: (event: MouseEvent<HTMLSpanElement>) => {
												event.stopPropagation();
												onTabChange(
													findSectionIdForScanner(row.scanner_id)
												);
											},
										},
										{ text: row.severity, color: `badge-${row.severity}` },
									],
								}))}
								ids={pageRows.map((row) => row.scanner_id)}
								totalRows={sortedGroups.length}
								isLoading={isLoading}
								onQueryUpdate={(query: {
									paged?: number | string;
									searchValue?: string;
									filter?: Record<string, string>;
								}) => {
									setPaged(Number(query.paged) || 1);
									setSearchValue(query.searchValue ?? '');
									setResourceFilterValue(
										query.filter?.object_type ?? ''
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

			{/* No right-side detail panel at all while there's genuinely
			nothing to show detail for (a locked section, or a real empty
			tab) - not even the empty "Select an issue" placeholder - same
			real `isLoading || sortedGroups.length > 0` check the left
			column's own "Nothing here right now" branch above already
			uses, so both columns agree on whether there's real data. */}
			{!isActiveSectionLocked && (isLoading || sortedGroups.length > 0) && (
				<ColumnComponent grid={4}>
					<div id={`${id}-detail-panel`}>
					<IssueDetailPanel
						group={selectedGroup}
						onActionComplete={handleActionComplete}
						onClose={() => setSelectedGroup(null)}
					/>
					</div>
				</ColumnComponent>
			)}
		</>
	);

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