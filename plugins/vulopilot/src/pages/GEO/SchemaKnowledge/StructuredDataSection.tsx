import { useEffect, useMemo, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { scrollToId } from '@zyra/core';
import {
	CardComponent,
	ColumnComponent,
	ModuleGuardComponent,
	BadgeComponent,
	ListComponent,
} from '@zyra/components';
import { TableCard } from '@zyra/table';
import { fetchOpenFindingsFor, buildEditLink } from '../seoIssuesShared';
import { SEO_ISSUE_QUERY_PARAM, getEditorTargetForScanner } from '../../../services/seoIssueEditorTarget';
import type { RawFinding } from '../seoIssuesShared';
import type {
	SchemaCoverageRow,
	SchemaCoveragePage,
	SchemaCoverageSnapshot,
} from './useSchemaCoverage';

interface StructuredDataSectionProps {
	coverage: {
		snapshot: SchemaCoverageSnapshot | null;
		isLoading: boolean;
	};
}

/**
 * Per real schema.org @type icon - purely cosmetic, every value here is a
 * real, already-used-elsewhere-in-this-codebase adminfont- icon class
 * (confirmed live: search/attachment/error/check/product/location/
 * category/shield/link), not a guessed/invented icon name. Falls back to
 * the same generic 'attachment' icon the rest of this codebase already
 * uses for "content/document" schema types when a @type has no more
 * specific real-world icon (a theme/plugin can emit a @type not in this
 * list at all - the fallback keeps that row rendering, not blank).
 */
/** Same 5 schema-related scanners IssuesSection.tsx's own "Schema Problems" table reads - these are the real open problems shown per type below. */
const SCHEMA_ISSUE_SCANNER_IDS = [
	'schema',
	'structured-data',
	'sitewide-structured-data',
	'organization-schema',
	'author-schema',
];

/** Where a row's click goes: that page's editor (with the scanner's own field highlighted when one is mapped), or the live page for the homepage. */
const getIssueLink = (page: SchemaCoveragePage, finding: RawFinding): string => {
	if (!page.id) {
		return page.url;
	}
	const editLink = buildEditLink(page.id);
	return getEditorTargetForScanner(finding.scanner_id)
		? `${editLink}&${SEO_ISSUE_QUERY_PARAM}=${encodeURIComponent(finding.scanner_id)}`
		: editLink;
};

const normalizeUrl = (url: string): string => url.replace(/\/+$/, '');

const TYPE_ICONS: Record<string, string> = {
	Organization: 'shield',
	WebSite: 'link',
	Product: 'product',
	LocalBusiness: 'location',
	BreadcrumbList: 'category',
};
const getTypeIcon = (type: string): string => TYPE_ICONS[type] ?? 'attachment';

/**
 * Real 3-tier status per row, computed from the same two real numbers the
 * table already shows (`found_on`, `problems` - SchemaCoverageAnalyzer's
 * own honest proportional estimate, see this file's own docblock) - no
 * new/fabricated signal. 0 problems is unambiguous ("Good"); otherwise
 * the tier is the real share of sampled pages of this type the estimate
 * says are affected: under half → "Check", half or more → "Problems".
 */
type CoverageStatus = 'good' | 'check' | 'problems';

const getRowStatus = (row: SchemaCoverageRow): CoverageStatus => {
	if (0 === row.problems) {
		return 'good';
	}
	const affectedShare = row.found_on > 0 ? row.problems / row.found_on : 1;
	return affectedShare >= 0.5 ? 'problems' : 'check';
};

const STATUS_CONFIG: Record<
	CoverageStatus,
	{ color: string; icon: string; label: string }
> = {
	good: { color: 'green', icon: 'check', label: __('Good', 'vulopilot') },
	check: { color: 'yellow', icon: 'alarm', label: __('Check', 'vulopilot') },
	problems: { color: 'red', icon: 'error', label: __('Problems', 'vulopilot') },
};

/**
 * Maps this table's own 3-tier status to the real `badge-{severity}` CSS
 * classes zyra's Table.scss actually defines - 'good'/'check'/'problems'
 * aren't themselves real severity values anywhere else in this codebase,
 * so a literal `badge-good` class would render unstyled. In zyra's
 * Table.scss `badge-resolved` is the green bucket (used for "Good"),
 * `badge-medium` orange and `badge-critical` dark red - `badge-high` is
 * red there, not green, so it isn't used for "Good". The row's own real
 * label text (`STATUS_CONFIG` above) still reads "Good"/"Check"/"Problems"
 * - only the *color* is borrowed.
 */
const STATUS_SEVERITY_CLASS: Record<CoverageStatus, string> = {
	good: 'resolved',
	check: 'medium',
	problems: 'critical',
};

/**
 * "Structured Data" section of the merged "Schema & Knowledge" tab - the
 * real "Schema Coverage" table moved here unchanged from the standalone
 * Schema tab (`GET`/`POST /schema/coverage`, SchemaCoverageAnalyzer, Free):
 * samples up to 15 recently-modified real pages (plus the real homepage),
 * fetches each one's actual rendered HTML, and extracts real `@type`
 * values from whatever `application/ld+json` blocks are actually there -
 * no AI, no fabricated types or counts. The per-type "problems" figure is
 * an honest proportional estimate (this plugin's own finding data is
 * scoped per-post, not per-schema-@type - see
 * SchemaCoverageAnalyzer::analyze()'s own docblock), labelled as such
 * rather than presented as an exact count.
 *
 * "Inspect a specific page"/Developer Tools moved out to InspectorSection.tsx
 * (now real, see that file's own docblock) rather than staying here as
 * "not built yet" stubs.
 *
 * Schema Coverage's own row "View" action shows real detail - exactly
 * which real sampled page(s)/the homepage carried that row's specific
 * @type (SchemaCoverageAnalyzer::analyze() records `pages` per row, not
 * just a count) - in a persistent side panel (grid 8/4, table left / detail
 * right) rather than a popup lightbox, per direct instruction ("the action
 * i want like above table when click inside details show but look intact
 * in Schema Coverage table" - "above table" being IssuesSection.tsx's own
 * table+`IssueDetailPanel` split immediately above this section on the
 * page): the table itself stays fully visible/unscrolled while a row's
 * detail is open, same real interaction shape, instead of a modal
 * overlaying everything. The first real row is auto-selected once a
 * snapshot loads, same "always something in the detail panel, not empty
 * until a first click" convention IssuesSection.tsx's own
 * `selectedGroup` already establishes.
 */
const StructuredDataSection = ({ coverage }: StructuredDataSectionProps) => {
	const { snapshot, isLoading } = coverage;
	// The real row the side detail panel is showing - SchemaCoverageAnalyzer
	// records exactly which sampled post(s)/the homepage actually carried
	// each @type (`row.pages`), so the panel shows a real list scoped to
	// that specific type, not a generic, undifferentiated redirect.
	const [selectedRow, setSelectedRow] = useState<SchemaCoverageRow | null>(
		null
	);

	// Auto-selects the first real row once a snapshot loads (or after a
	// re-analyze), so the detail panel always has something real to show
	// rather than sitting empty until a first click - same convention
	// IssuesSection.tsx's own `selectedGroup` effect already establishes.
	// Only runs when the currently-selected type is no longer present
	// (a fresh snapshot, or the selected type disappeared) - a plain click
	// selection is left alone across re-renders.
	useEffect(() => {
		if (!snapshot) {
			return;
		}
		setSelectedRow((current) => {
			if (
				current &&
				snapshot.coverage.some((row) => row.type === current.type)
			) {
				return (
					snapshot.coverage.find((row) => row.type === current.type) ??
					current
				);
			}
			return snapshot.coverage[0] ?? null;
		});
	}, [snapshot]);

	/** Shared by the row click and the action cell's own "More Details"/"Showing" button - same real toggle the other issues tables in this plugin already use, scrolling the detail panel into view on every select. */
	const handleSelectRow = (row: SchemaCoverageRow) => {
		setSelectedRow(row);
		scrollToId('structured-data-detail-panel');
	};

	// Real open schema findings, fetched once - matched to each selected
	// type's own pages below (a finding is scoped to a page, not a @type).
	const [schemaFindings, setSchemaFindings] = useState<RawFinding[]>([]);
	useEffect(() => {
		fetchOpenFindingsFor(SCHEMA_ISSUE_SCANNER_IDS)
			.then(setSchemaFindings)
			.catch(() => setSchemaFindings([]));
	}, [snapshot]);

	const selectedIssues = useMemo(() => {
		if (!selectedRow) {
			return [];
		}
		return selectedRow.pages.flatMap((page) =>
			schemaFindings
				.filter(
					(finding) =>
						finding.object_ref === String(page.id) ||
						normalizeUrl(finding.object_ref) === normalizeUrl(page.url)
				)
				.map((finding) => ({ finding, page }))
		);
	}, [selectedRow, schemaFindings]);

	return (
		<>
			<ColumnComponent grid={8}>
				<CardComponent
					title={__('Schema Coverage', 'vulopilot')}
					titleIcon="attachment"
					id="schema-knowledge-structured-data"
					desc={__(
						'VuloPilot checked how your website describes its pages, products, articles and business to search engines - see what structured information is there and where something is missing or incorrect, a real sample from its own live pages.',
						'vulopilot'
					)}
					isLoading={isLoading}
				>
					{!isLoading && !snapshot && (
						<ModuleGuardComponent
							icon="info"
							title={__('Not analyzed yet', 'vulopilot')}
							desc={__(
								'Run a scan (the “Run scan” button at the top of the page) and this table fills in with what structured data your real pages output.',
								'vulopilot'
							)}
						/>
					)}

					{snapshot && (
						<>
							{0 === snapshot.coverage.length ? (
								<div className="desc">
									{__(
										'No structured data (JSON-LD) was found on any sampled page.',
										'vulopilot'
									)}
								</div>
							) : (
								<TableCard
									showMenu={false}
									hideHeader={true}
									variant="transparent"
									headers={{
										type: {
											key: 'type',
											type: 'info',
											label: __('Schema type', 'vulopilot'),
											width: '65%',
											iconKey: 'typeIcon',
											descriptionKey: 'meaning',
											badgesKey: 'statusBadges',
										},
										found_on: {
											label: __('Found on', 'vulopilot'),
											render: (row: SchemaCoverageRow) =>
												sprintf(
													/* translators: %d is how many of the real sampled pages carried this schema type. */
													__('%d pages', 'vulopilot'),
													row.found_on
												),
										},
										action: {
											label: __('Action', 'vulopilot'),
											// `type: 'more-action'` no longer exists in
											// @zyra/table - `type: 'action'` now covers
											// that same single-toggle-button case via a
											// `type: 'button'` action whose label/icon
											// are functions of `row` (see that type's
											// own docblock, TableRowActions.tsx).
											type: 'action',
											actions: [
												{
													type: 'button',
													label: (row: SchemaCoverageRow) =>
														row.type === selectedRow?.type
															? __('Showing', 'vulopilot')
															: __('More Details', 'vulopilot'),
													color: (row: SchemaCoverageRow) =>
														row.type === selectedRow?.type
															? 'text-green'
															: 'text-purple',
													icon: (row: SchemaCoverageRow) =>
														row.type === selectedRow?.type
															? 'eye'
															: 'pagination-next-arrow',
													// The panel is never closed - clicking the
													// row already showing just keeps it open.
													// Scrolls the panel into view on every click
													// (`scrollToId`, same real helper
													// IssuesList.tsx's own identical toggle
													// uses) - harmless when it's already open,
													// necessary when it isn't yet visible.
													onClick: handleSelectRow,
												},
											],
										},
									}}
									rows={snapshot.coverage.map((row) => ({
										...row,
										typeIcon: getTypeIcon(row.type),
										statusBadges: [
											{
												text: STATUS_CONFIG[getRowStatus(row)].label,
												color: `badge-${STATUS_SEVERITY_CLASS[getRowStatus(row)]}`,
											},
										],
									}))}
									ids={snapshot.coverage.map((row) => row.type)}
									totalRows={snapshot.coverage.length}
									isLoading={isLoading}
									activeRowId={selectedRow?.type}
									// A click anywhere on the row now opens the
									// detail panel too, not just the action
									// cell's own small "More Details" button.
									onRowClick={(row: Record<string, unknown>) =>
										handleSelectRow(row as unknown as SchemaCoverageRow)
									}
									emptyMessage={__(
										'No structured data (JSON-LD) was found on any sampled page.',
										'vulopilot'
									)}
								/>
							)}

						</>
					)}
				</CardComponent>
			</ColumnComponent>

			<ColumnComponent grid={4}>
				<div id="structured-data-detail-panel">
				{selectedRow && (
					<CardComponent
						title={selectedRow.type}
						titleIcon={getTypeIcon(selectedRow.type)}
						desc={selectedRow.meaning}
					>
						<div className="schema-detail-stats">
							<BadgeComponent
								color={STATUS_CONFIG[getRowStatus(selectedRow)].color}
								icon={STATUS_CONFIG[getRowStatus(selectedRow)].icon}
								text={STATUS_CONFIG[getRowStatus(selectedRow)].label}
							/>
							<span className="desc">
								{sprintf(
									/* translators: 1: how many of the real sampled pages carried this schema type, 2: how many of those had a real problem. */
									__('Found on %1$d pages · %2$d problems', 'vulopilot'),
									selectedRow.found_on,
									selectedRow.problems
								)}
							</span>
						</div>

						<div className="schema-detail-pages-heading">
							{sprintf(
								/* translators: %s is a real schema.org @type, e.g. "Product". */
								__('Pages with %s schema', 'vulopilot'),
								selectedRow.type
							)}
						</div>

						{0 === selectedRow.pages.length ? (
							<div className="desc">
								{__(
									'No individual pages recorded for this type.',
									'vulopilot'
								)}
							</div>
						) : (
							<ListComponent
								className="mini-card report"
								items={selectedRow.pages.map((page: SchemaCoveragePage) => ({
									id: String(page.id),
									title: page.title,
									tags: (
										<div className="schema-view-pages-actions">
											<a href={page.url} target="_blank" rel="noreferrer">
												{__('View', 'vulopilot')}
											</a>
											{page.edit_url && (
												<a
													href={page.edit_url}
													target="_blank"
													rel="noreferrer"
												>
													{__('Edit', 'vulopilot')}
												</a>
											)}
										</div>
									),
								}))}
							/>
						)}

						<div className="schema-detail-pages-heading">
							{__('Issues on these pages', 'vulopilot')}
						</div>

						{0 === selectedIssues.length ? (
							<div className="desc">
								{__(
									'No open schema issues on the pages carrying this type.',
									'vulopilot'
								)}
							</div>
						) : (
							<ListComponent
								className="mini-card report"
								items={selectedIssues.map(({ finding, page }) => ({
									id: String(finding.id),
									title: finding.title,
									desc: page.title,
									// Same "click the row → open that page's editor" behaviour as
									// the GEO/AEO issue tables; the homepage isn't a post, so it
									// opens the live page instead.
									action: () => {
										window.location.href = getIssueLink(page, finding);
									},
									tags: (
										<>
											<BadgeComponent
												color={`badge-${finding.severity}`}
												text={finding.severity}
											/>
											<i className="adminfont-pagination-right-arrow ai-copilot-row-arrow" />
										</>
									),
								}))}
							/>
						)}
					</CardComponent>
				)}
				</div>
			</ColumnComponent>
		</>
	);
};

export default StructuredDataSection;
