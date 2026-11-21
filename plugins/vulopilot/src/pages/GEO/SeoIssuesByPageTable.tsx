import React from 'react';
import { useEffect, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
import { CardComponent, ChartComponent, ContainerComponent, InformationItemComponent, ModuleGuardComponent, SectionComponent } from '@zyra/components';
import { TableCard } from '@zyra/table';
import { SEO_ISSUE_QUERY_PARAM, FINDING_ID_QUERY_PARAM, getEditorTargetForScanner } from '../../services/seoIssueEditorTarget';
import { formatWpDate } from '../../services/formatWpDate';
import { ratingColor } from './seoRating';
import {
	FindingSeverity,
	PRIORITY_SEVERITIES,
	Priority,
	PageRow,
	RawFinding,
	VisibilityCell,
} from './seoIssuesShared';
import { columns, tableRows } from '../../services/tableColumns';

/** One inline sub-row under a page's row. */
interface FindingRow {
	id: number;
	isFinding: true;
	title: string;
	severity: FindingSeverity;
	status: FindingSeverity;
	scanner_id: string;
	scannerLabel: string;
	editLink: string;
	fixWithAiLink: string;
	viewLink: string | null;
}

type TableRow = PageRow | FindingRow;

const isFindingRow = (row: TableRow): row is FindingRow => true === row.isFinding;

/**
 * The fields of zyra TableCard's own internal query state this table reads back out of its `onQueryUpdate` callback.
 */
interface TableCardQuery {
	searchValue?: string;
	orderby?: string;
	order?: string;
}

/** Same navigate-and-highlight deep link `post-editor/index.tsx` reads. */
const buildFixWithAiLink = (editLink: string, finding: RawFinding): string =>
	// Scanner ids with no `SEO_ISSUE_EDITOR_TARGETS` entry fall back to the finding's own id so the editor's Page Analysis tab can still highlight it.
	getEditorTargetForScanner(finding.scanner_id)
		? `${editLink}&${SEO_ISSUE_QUERY_PARAM}=${encodeURIComponent(finding.scanner_id)}`
		: `${editLink}&${FINDING_ID_QUERY_PARAM}=${finding.id}`;

/**
 * Same real "no real number, no arrow" honesty `PagesNeedingAttentionTable.tsx`'s own identical cell already established.
 */
const ChangeCell = ({ change }: { change: number }) => {
	if (0 === change) {
		return <span className="fix-first-change is-steady">{__('No change', 'vulopilot')}</span>;
	}

	const improved = change > 0;

	return (
		<span className={`fix-first-change ${improved ? 'is-good' : 'is-attention'}`}>
			<i className={`adminfont-arrow-${improved ? 'up' : 'down'}`} />
			{Math.abs(change)}
		</span>
	);
};

/** Zyra `Table.tsx`'s own expand/collapse state (`expandedRows`) is fully internal. */
const toggleRowExpansion = (event: React.MouseEvent<HTMLElement>) => {
	const rowEl = event.currentTarget.closest('tr.admin-row');
	const expandIcon = rowEl?.querySelector<HTMLElement>(':scope > td.admin-column.expand > i');
	expandIcon?.click();
};

/**
 * Same Title Case formatting the old standalone "Status" column used for both a page's own `status` and a finding's `severity`.
 */
const formatStatusLabel = (value: string): string =>
	String(value)
		.toLowerCase()
		.split(/[-_]/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');

interface SeoIssuesByPageTableProps {
	rows: PageRow[];
	activeScannerIds: 'all' | string[];
	/** IssuesSection.tsx's own real `IssuesSummaryCards` priority tile. */
	activePriority: Priority;
	scannerLabelMap: Map<string, string>;
	isLoading: boolean;
	hasError: boolean;
	/** "SEO Issues" by default - IssuesSection.tsx's own AEO/GEO callers pass "AEO Issues"/"GEO Issues" so this column reads correctly for whichever real check set is showing. */
	issuesColumnLabel?: string;
	/** Only set when `IssuesSection.tsx` itself got a `pageAnalysis` prop. */
	visibilityColumnLabel?: string;
	/** Only set alongside `visibilityColumnLabel`. */
	onExportCsv?: () => void;
	/** Only set by SeoTab.tsx's own SEO usage. */
	// eslint-disable-next-line no-unused-vars
	onAnalyze?: (postId: number) => void;
	/** SeoTab.tsx's own `analyzingPostId` - which row's panel (if any) is currently open. */
	activePostId?: number | null;
	/** Called with the ids of the pages the list shows (after its tab, priority and search filters) whenever they change. */
	// eslint-disable-next-line no-unused-vars
	onVisibleRowsChange?: (ids: number[]) => void;
	/** Only set by SeoTab.tsx's own SEO usage (`IssuesSection.tsx`'s own `pageScore` prop). */
	showScoreChange?: boolean;
	/** Only set by `IssuesSection.tsx`'s own `content` mode. */
	showContentScore?: boolean;
	/** Only set by `IssuesSection.tsx`'s own `content.toolbarFilters` mode. */
	hideSearch?: boolean;
	/** Only set by `IssuesSection.tsx`'s own `content` mode (`RecentContentCard.tsx`). */
	// eslint-disable-next-line no-unused-vars
	onDelete?: (row: PageRow) => void;
	/** Only set alongside `onDelete` - which row's real delete request is currently in flight. */
	deletingId?: number | null;
}

/** Page/post-wise table. */
const SeoIssuesByPageTable = ({
	rows,
	activeScannerIds,
	activePriority,
	scannerLabelMap,
	isLoading,
	hasError,
	issuesColumnLabel = __('SEO Issues', 'vulopilot'),
	visibilityColumnLabel,
	onExportCsv,
	onAnalyze,
	activePostId,
	onVisibleRowsChange,
	showScoreChange,
	showContentScore,
	hideSearch,
	onDelete,
	deletingId,
}: SeoIssuesByPageTableProps) => {
	/** This table's OWN "Search pages…" box. */
	const [searchValue, setSearchValue] = useState('');
	/** This table's OWN sort state, read back out of TableCard's `onQueryUpdate`. */
	const [sortBy, setSortBy] = useState<string | null>(null);
	const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

	/** The category tab bar/priority stat cards narrow which PAGES appear. */
	const isAnyFilterActive = 'all' !== activeScannerIds || 'all' !== activePriority;

	const findingMatchesActiveFilters = (finding: PageRow['findings'][number]): boolean =>
		('all' === activeScannerIds || activeScannerIds.includes(finding.scanner_id)) &&
		('all' === activePriority || PRIORITY_SEVERITIES[activePriority].includes(finding.severity));

	const getRowFindings = (row: PageRow) =>
		isAnyFilterActive ? row.findings.filter(findingMatchesActiveFilters) : row.findings;

	const buildVariationRows = (row: PageRow): FindingRow[] =>
		getRowFindings(row).map((finding) => ({
			id: finding.id,
			isFinding: true,
			title: finding.title,
			severity: finding.severity,
			status: finding.severity,
			scanner_id: finding.scanner_id,
			scannerLabel: scannerLabelMap.get(finding.scanner_id) || finding.scanner_id,
			editLink: row.editLink,
			fixWithAiLink: buildFixWithAiLink(row.editLink, finding),
			viewLink: row.viewLink,
		}));

	const rowMatchesFilter = (row: PageRow): boolean =>
		!isAnyFilterActive || getRowFindings(row).length > 0;

	const rowMatchesSearch = (row: PageRow): boolean =>
		'' === searchValue.trim() ||
		row.title.toLowerCase().includes(searchValue.trim().toLowerCase());

	/** `Table.tsx` does not re-sort `rows`. */
	const sortRowsByVisibility = (unsorted: PageRow[]): PageRow[] => {
		if ('visibility_score' !== sortBy) {
			return unsorted;
		}

		const direction = 'asc' === sortOrder ? 1 : -1;

		return [...unsorted].sort((a, b) => {
			const scoreA = a.visibilityScore;
			const scoreB = b.visibilityScore;

			if (null == scoreA && null == scoreB) {
				return 0;
			}
			if (null == scoreA) {
				return 1;
			}
			if (null == scoreB) {
				return -1;
			}

			return (scoreA - scoreB) * direction;
		});
	};

	const visibleRows = sortRowsByVisibility(
		rows.filter((row) => rowMatchesFilter(row) && rowMatchesSearch(row))
	);

	const isEmptyForTab = !isLoading && 0 === visibleRows.length && '' === searchValue.trim();

	// Tells the parent which pages are on screen, so its detail panel can follow the list.
	const visibleKey = isLoading ? '' : visibleRows.map((row) => row.id).join(',');

	useEffect(() => {
		if (!isLoading) {
			onVisibleRowsChange?.(visibleRows.map((row) => row.id));
		}
		// `onVisibleRowsChange` is a fresh function every render; re-run only when the shown pages change.
	}, [visibleKey, isLoading]);

	if (hasError) {
		return (
			<CardComponent
				title={__('Pages & Posts', 'vulopilot')}
				titleIcon="error"
				desc={__('SEO issues broken down by the page or post they were found on.', 'vulopilot')}
			>
				<ModuleGuardComponent
					icon="error"
					title={__('Could not load these issues', 'vulopilot')}
					desc={__(
						'Something went wrong fetching this data. Please try again.',
						'vulopilot'
					)}
				/>
			</CardComponent>
		);
	}

	return (
		<ContainerComponent>
			<SectionComponent
				title={__('Pages & Posts', 'vulopilot')}
				desc={__('Findings from your most recent scans, grouped by check.', 'vulopilot')}
			/>
			{/* * The "nice work, nothing to fix" empty state only replaces the * whole card when there's truly nothing to show *and* no active * search. */}
			{isEmptyForTab ? (
				<ModuleGuardComponent
					icon="check"
					title={__('Nothing here right now', 'vulopilot')}
					desc={
						!isAnyFilterActive
							? sprintf(
									/* translators: %s: e.g. "SEO", "AEO", "GEO" - issuesColumnLabel with " Issues" stripped off. */
									__(
										'No open %s issues on any page or post right now - nice work.',
										'vulopilot'
									),
									issuesColumnLabel.replace(/ Issues$/, '')
								)
							: __(
									'No pages or posts currently have this specific issue.',
									'vulopilot'
								)
					}
				/>
			) : (
				<TableCard
					showMenu={false}
					hideHeader
					variant="transparent"
					activeRowId={activePostId ?? undefined}
					search={hideSearch ? undefined : { placeholder: __('Search pages…', 'vulopilot') }}
					buttonActions={
						onExportCsv
							? [
									{
										label: __('Export CSV', 'vulopilot'),
										icon: 'download',
										onClick: onExportCsv,
									},
								]
							: undefined
					}
					onQueryUpdate={(query: TableCardQuery) => {
						setSearchValue(query.searchValue ?? '');
						setSortBy(query.orderby || null);
						setSortOrder('asc' === query.order ? 'asc' : 'desc');
					}}
					headers={columns({
						title: {
							label: __('Page', 'vulopilot'),
							width: '65%',
							/** Status and Issues used to be their own columns. */
							render: (row: TableRow) =>
								isFindingRow(row) ? (
									<div className="seo-issues-finding-title">
										<span className="seo-issues-finding-arrow">
											↳
										</span>
										<InformationItemComponent
											title={row.title}
											badges={[
												{
													text: formatStatusLabel(row.severity),
													className: `badge-${row.severity}`,
												},
												{
													text: row.scannerLabel,
													className: 'badge-info',
												},
											]}
										/>
									</div>
								) : (
									<div
										className="seo-issues-row-expand-trigger"
										onClick={toggleRowExpansion}
									>
										<InformationItemComponent
											title={row.title || __('(no title)', 'vulopilot')}
											titleLink={row.editLink}
											badges={[
												{
													text: formatStatusLabel(row.status),
													className: `badge-${String(row.status).toLowerCase()}`,
												},
												{
													text: formatWpDate(row.date),
													className: `yellow`,
												},
												...(row.categoryLabel
													? [{ text: row.categoryLabel, className: 'badge-info' }]
													: []),
											]}
											descriptions={[
												...(undefined !== row.wordCount
													? [
															{
																icon: 'text-fields',
																label: __('Words', 'vulopilot'),
																value: row.wordCount.toLocaleString(),
															},
														]
													: []),
												// Which real checks actually flagged this page.
												...(getRowFindings(row).length > 0
													? [
															{
																value: ((): string => {
																	const total = getRowFindings(row).length;
																	const labels = Array.from(
																		new Set(
																			getRowFindings(row).map(
																				(finding) => finding.scanner_id
																			)
																		)
																	).map(
																		(scannerId) =>
																			scannerLabelMap.get(scannerId) || scannerId
																	);
																	const shown = labels.slice(0, 2).join(', ');
																	const remaining = labels.length - 2;
																	const labelsText =
																		remaining > 0
																			? sprintf(
																					/* translators: 1: first 2 real scanner labels that flagged this page, comma-joined; 2: how many more real ones beyond those. */
																					__('%1$s +%2$d', 'vulopilot'),
																					shown,
																					remaining
																				)
																			: shown;

																	return sprintf(
																		/* translators: 1: real total number of open findings on this page; 2: real scanner labels (capped, "+N" suffixed) that flagged them. */
																		_n(
																			'%1$d issue: %2$s',
																			'%1$d issues: %2$s',
																			total,
																			'vulopilot'
																		),
																		total,
																		labelsText
																	);
																})(),
															},
														]
													: []),
											]}
										/>
									</div>
								),
						},
						...(visibilityColumnLabel
							? {
									visibility_score: {
										label: visibilityColumnLabel,
										width: '3rem',
										isSortable: true,
										// Same real ring `showScoreChange`'s own `seo_score` column below renders.
										render: (row: TableRow) =>
											isFindingRow(row) ? null : (
												<span
													className="seo-issues-row-expand-trigger"
													onClick={toggleRowExpansion}
												>
													{null === row.visibilityScore ||
													undefined === row.visibilityScore ? (
														<VisibilityCell
															score={row.visibilityScore}
														/>
													) : (
														<ChartComponent
															type="ring"
															height={40}
															color={ratingColor(row.visibilityScore)}
															dataKey="score"
															data={[{ score: row.visibilityScore }]}
															centerLabel={row.visibilityScore}
														/>
													)}
												</span>
											),
									},
								}
							: {}),
						// Real per-page SEO score/week-over-week change.
						...(showScoreChange
							? {
									seo_score: {
										label: __('SEO Score', 'vulopilot'),
										render: (row: TableRow) =>
											isFindingRow(row) ||
											undefined === row.seoScore ? null : (
												<span
													className="seo-issues-row-expand-trigger"
													onClick={toggleRowExpansion}
												>
													<ChartComponent
														type="ring"
														height={40}
														color={ratingColor(row.seoScore)}
														dataKey="score"
														data={[{ score: row.seoScore }]}
														centerLabel={row.seoScore}
													/>
												</span>
											),
									},
									seo_score_change: {
										label: __('Change', 'vulopilot'),
										render: (row: TableRow) =>
											isFindingRow(row) ||
											undefined === row.seoScoreChange ? null : (
												<span
													className="seo-issues-row-expand-trigger"
													onClick={toggleRowExpansion}
												>
													<ChangeCell change={row.seoScoreChange} />
												</span>
											),
									},
								}
							: {}),
						// `content` mode's own real per-page readability score.
						...(showContentScore
							? {
									content_quality_score: {
										label: __('Score', 'vulopilot'),
										render: (row: TableRow) =>
											isFindingRow(row) ||
											undefined === row.contentQualityScore ? null : (
												<span
													className="seo-issues-row-expand-trigger"
													onClick={toggleRowExpansion}
												>
													<ChartComponent
														type="ring"
														height={40}
														color={ratingColor(row.contentQualityScore)}
														dataKey="score"
														data={[{ score: row.contentQualityScore }]}
														centerLabel={row.contentQualityScore}
													/>
												</span>
											),
									},
								}
							: {}),
						action: {
							label: __('Action', 'vulopilot'),
							type: 'action',
							actions: [
								{
									type: 'button',
									// Same "More Details"/"Showing" toggle wording as the other issues tables.
									label: (row) =>
										(row as unknown as PageRow).id === activePostId
											? __('Showing', 'vulopilot')
											: __('More Details', 'vulopilot'),
									color: (row) =>
										(row as unknown as PageRow).id === activePostId
											? 'text-green'
											: 'text-purple',
									icon: (row) =>
										(row as unknown as PageRow).id === activePostId
											? 'eye'
											: 'pagination-next-arrow',
									hidden: (row) =>
										!onAnalyze ||
										isFindingRow(row as unknown as TableRow),
									onClick: (row) =>
										onAnalyze?.(
											(row as unknown as PageRow).id
										),
								},
								{
									type: 'button',
									label: (row) =>
										deletingId === (row as unknown as PageRow).id
											? __('Deleting…', 'vulopilot')
											: __('Delete', 'vulopilot'),
									color: 'text-red',
									icon: 'delete',
									hidden: (row) =>
										!onDelete || isFindingRow(row as unknown as TableRow),
									onClick: (row) => {
										const pageRow = row as unknown as PageRow;

										if (deletingId === pageRow.id) {
											return;
										}

										onDelete?.(pageRow);
									},
								},
							],
						},
					})}
					rows={tableRows(visibleRows.map((row) => ({
						...row,
						variation: buildVariationRows(row),
					})))}
					ids={visibleRows.map((row) => row.id)}
					totalRows={visibleRows.length}
					isLoading={isLoading}
					emptyMessage={
						'' !== searchValue.trim()
							? sprintf(
									/* translators: %s: the search text typed into the "Search pages…" box above. */
									__('No pages or posts match "%s".', 'vulopilot'),
									searchValue.trim()
								)
							: __('No pages or posts match this filter.', 'vulopilot')
					}
				/>
			)}
		</ContainerComponent>
	);
};

export default SeoIssuesByPageTable;
