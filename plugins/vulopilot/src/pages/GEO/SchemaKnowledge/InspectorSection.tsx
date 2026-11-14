/* global vulopilotAppLocalizer */
import { __, sprintf } from '@wordpress/i18n';
import {
	CardComponent,
	ClipboardComponent,
	ColumnComponent,
	ModuleGuardComponent,
	NoticeComponent,
	FormGroupWrapperComponent,
	FormGroupComponent
} from '@zyra/components';
import { ButtonInput, ToggleInput } from '@zyra/inputs';
import { TableCard } from '@zyra/table';
import { getApiLink, getApiResponse, scrollToId } from '@zyra/core';
import { useEffect, useState } from 'react';
import { useSchemaInspector } from './useSchemaInspector';
import type { SchemaCoverageSnapshot, SchemaPageFilter } from './useSchemaCoverage';
import { RobotsTxtEditor } from '../CrawlRobotsSitemapSection';

/**
 * Real per-`type` color + icon - the exact same 3 real post types `GET /schema/inspectable-pages`
 * ever actually queries (Schema.php's own `list_inspectable_pages()`: `post_type => ['post',
 * 'page', 'product']`).
 */
const TYPE_COLOR: Record<string, string> = {
	post: 'blue',
	page: 'indigo',
	product: 'purple',
	homepage: 'green',
};
const TYPE_ICON: Record<string, string> = {
	post: 'blog blue',
	page: 'document indigo',
	product: 'product purple',
	homepage: 'home green',
};

interface InspectablePage {
	id: number;
	title: string;
	type: string;
	type_label: string;
	url: string;
}

const downloadJson = (filename: string, content: string) => {
	const blob = new Blob([content], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
};

const prettyPrint = (raw: string): string => {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
};

/** The real path portion of a real, already-known-good site URL. */
const pathOf = (url: string): string => {
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
};

/** "Inspector" section of the merged "Schema & Knowledge" tab. */
interface InspectorSectionProps {
	/** Latest schema coverage sample. */
	snapshot: SchemaCoverageSnapshot | null;
	pageFilter: SchemaPageFilter;
	// eslint-disable-next-line no-unused-vars
	onPageFilterChange: (filter: SchemaPageFilter) => void;
}

const normalizeUrl = (url: string): string => url.replace(/\/+$/, '');

const InspectorSection = ({
	snapshot,
	pageFilter,
	onPageFilterChange,
}: InspectorSectionProps) => {
	const [pages, setPages] = useState<InspectablePage[]>([]);
	const [isLoadingPages, setIsLoadingPages] = useState(true);
	const [selectedUrl, setSelectedUrl] = useState('');
	const { result, isInspecting, error, inspect } = useSchemaInspector();

	useEffect(() => {
		getApiResponse<InspectablePage[]>(
			getApiLink(vulopilotAppLocalizer, 'schema/inspectable-pages'),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				const list = response ?? [];
				setPages(list);

				// Opens the first real row by default rather than leaving the result panel on its "Select a page" placeholder.
				if (list.length > 0) {
					handleSelectPage(list[0].url);
				}
			})
			.finally(() => setIsLoadingPages(false));
	}, []);

	// Pages the last coverage sample found schema on.
	const schemaByUrl = new Map(
		(snapshot?.pages ?? []).map((page) => [
			normalizeUrl(page.url),
			page.types.length > 0,
		])
	);
	const visiblePages = pages.filter((page) => {
		if ('all' === pageFilter) {
			return true;
		}
		const hasSchema = schemaByUrl.get(normalizeUrl(page.url));
		return 'valid' === pageFilter ? true === hasSchema : false === hasSchema;
	});
	const validCount = [...schemaByUrl.values()].filter(Boolean).length;
	const filterOptions = [
		{
			key: 'all',
			value: 'all',
			/* translators: %d: real total number of pages. */
			label: sprintf(__('All (%d)', 'vulopilot'), pages.length),
		},
		{
			key: 'valid',
			value: 'valid',
			/* translators: %d: real number of pages with schema. */
			label: sprintf(__('With schema (%d)', 'vulopilot'), validCount),
		},
		{
			key: 'attention',
			value: 'attention',
			label: sprintf(
				/* translators: %d: real number of pages missing schema. */
				__('Need attention (%d)', 'vulopilot'),
				schemaByUrl.size - validCount
			),
		},
	];

	// Real page title - falls back to the URL path only if the selected page somehow isn't in that list, same as `pathOf()`'s own fallback on an unparseable URL.
	const selectedPage = pages.find((page) => page.url === selectedUrl);

	const handleSelectPage = (url: string) => {
		setSelectedUrl(url);
		inspect(url);
	};

	const handleExport = () => {
		if (!result) {
			return;
		}
		downloadJson(
			'schema-inspection.json',
			JSON.stringify(result.blocks, null, 2)
		);
	};

	const openRichResultsTest = () =>
		window.open(
			`https://search.google.com/test/rich-results?url=${encodeURIComponent(result ? result.url : vulopilotAppLocalizer.site_url)}`,
			'_blank',
			'noreferrer'
		);

	return (
		<>
			<ColumnComponent grid={8}>
				<CardComponent
					id="schema-knowledge-inspector"
					title={__('Inspect a specific page', 'vulopilot')}
					titleIcon="search"
					desc={__(
						'See exactly what structured information search engines receive from any page or product.',
						'vulopilot'
					)}
				>
					{snapshot?.pages && (
						<ToggleInput
							options={filterOptions}
							value={pageFilter}
							onChange={(value) =>
								onPageFilterChange(value as SchemaPageFilter)
							}
							modules={[]}
							
						/>
					)}
					<TableCard
						showMenu={false}
						hideHeader={true}
						variant="transparent"
						// Highlights the row whose inspection result is showing in the side panel.
						activeRowId={selectedUrl}
						onRowClick={(row: Record<string, unknown>) =>
							handleSelectPage((row as unknown as InspectablePage).url)
						}
						headers={{
							page: {
								key: 'title',
								type: 'info',
								label: __('Page', 'vulopilot'),
								width: '70%',
								iconKey: 'typeIcon',
								badgesKey: 'typeBadges',
								// Real URL path under the title - the one honest per-row detail already available here.
								descriptionKey: 'pageDesc',
							},
							action: {
								label: __('Action', 'vulopilot'),
								type: 'action',
								actions: [
									{
										type: 'button',
										label: (row) =>
											(row as unknown as InspectablePage).url ===
												selectedUrl
												? __('Inspecting', 'vulopilot')
												: __('Inspect', 'vulopilot'),
										color: (row) =>
											(row as unknown as InspectablePage).url ===
												selectedUrl
												? 'text-green'
												: 'text-purple',
										icon: (row) =>
											(row as unknown as InspectablePage).url ===
												selectedUrl
												? 'eye'
												: 'pagination-next-arrow',
										onClick: (row) =>
											handleSelectPage(
												(row as unknown as InspectablePage).url
											),
									},
								],
							},
						}}
						rows={visiblePages.map((page) => ({
							...page,
							id: page.url,
							// Real page/post/product type this row's own real `type_label` already carries.
							typeBadges: [
								{
									text: page.type_label,
									color: TYPE_COLOR[page.type] ?? '',
								},
							],
							typeIcon: TYPE_ICON[page.type] ?? 'document',
							// Real URL path - the info column's own description line under the title.
							pageDesc: pathOf(page.url),
						}))}
						ids={visiblePages.map((page) => page.url)}
						totalRows={visiblePages.length}
						isLoading={isLoadingPages}
						emptyMessage={__(
							'No inspectable pages/products found on this site yet.',
							'vulopilot'
						)}
					/>
				</CardComponent>
			</ColumnComponent>

			<ColumnComponent grid={4}>
				{!selectedUrl ? (
					<CardComponent
						title={__('Inspection result', 'vulopilot')}
						titleIcon="search"
						desc={__(
							'More detail on the page you select from the table.',
							'vulopilot'
						)}
					>
						<ModuleGuardComponent
							icon="search"
							title={__('Select a page', 'vulopilot')}
							desc={__(
								'Choose a row from the table to inspect its real structured data here.',
								'vulopilot'
							)}
						/>
					</CardComponent>
				) : (
					<CardComponent
						title={selectedPage?.title ?? pathOf(selectedUrl)}
						titleIcon="search"
						desc={__(
							'What search engines actually receive from this page.',
							'vulopilot'
						)}
						isLoading={isInspecting}
					>
						{error && (
							<NoticeComponent
								uniqueKey="vulopilot-schema-inspect-error"
								type="error"
								displayPosition="inline-notice"
								message={error}
							/>
						)}

						{!result && !isInspecting && (
							<div className="schema-inspector-validator-hint">
								<span className="desc">
									{__(
										'Or check this site’s homepage right now, without picking a page:',
										'vulopilot'
									)}
								</span>
								<ButtonInput
									position="left"
									buttons={{
										text: __(
											'Validate homepage with Google ',
											'vulopilot'
										),
										icon: 'external',
										color: 'text-purple',
										onClick: openRichResultsTest,
									}}
								/>
							</div>
						)}

						{result && (
							<FormGroupWrapperComponent>
								<FormGroupComponent row label={__('Detected schema', 'vulopilot')}>
									{0 === result.types.length ? (
										<div className="desc">
											{__(
												'No structured data (JSON-LD) was found on this page.',
												'vulopilot'
											)}
										</div>
									) : (
										<ul className="schema-inspector-check-list">
											{result.types.map((type) => (
												<li key={type}>
													<i className="adminfont-check schema-inspector-check-icon--good" />
													<span>{type}</span>
												</li>
											))}
										</ul>
									)}
								</FormGroupComponent>

								<FormGroupComponent
									label={sprintf(
										/* translators: %d is how many real problems were found in this page's structured data. */
										__('Problems found (%d)', 'vulopilot'),
										result.problems.length
									)}
								>
									{0 === result.problems.length ? (
										<div className="desc">
											{__(
												'No missing-field problems detected in this page’s structured data.',
												'vulopilot'
											)}
										</div>
									) : (
										<ul className="schema-inspector-check-list">
											{result.problems.map((problem, index) => (
												<li key={index}>
													<i className="adminfont-alarm schema-inspector-check-icon--warn" />
													<span>{problem.message}</span>
												</li>
											))}
										</ul>
									)}

									{result.problems.length > 0 && (
										<button
											type="button"
											className="schema-view-pages-link schema-inspector-view-problems"
											onClick={() => scrollToId('schema-knowledge-issues')}
										>
											{__('View problems', 'vulopilot')}
											<i className="adminfont-arrow-right" />
										</button>
									)}
								</FormGroupComponent>

								<FormGroupComponent
									label={sprintf(
										/* translators: %d is how many real duplicate/conflicting schema blocks were found on this page. */
										__('Conflicts detected (%d)', 'vulopilot'),
										result.conflicts.length
									)}
								>
									{0 === result.conflicts.length ? (
										<div className="desc">
											{__(
												'No duplicate or conflicting schema output detected on this page.',
												'vulopilot'
											)}
										</div>
									) : (
										<ul className="schema-inspector-check-list">
											{result.conflicts.map((conflict) => (
												<li key={conflict.type}>
													<i className="adminfont-error schema-inspector-check-icon--bad" />
													<span>
														{sprintf(
															/* translators: 1: schema.org @type, e.g. "Product", 2: number of JSON-LD blocks on this page sharing that type. */
															__(
																'%1$d separate "%2$s" blocks were found on this page - search engines may only use one.',
																'vulopilot'
															),
															conflict.block_indexes.length,
															conflict.type
														)}
													</span>
												</li>
											))}
										</ul>
									)}
								</FormGroupComponent>

								{result.preview && (
									<FormGroupComponent label={__('Quick preview', 'vulopilot')}>
										<div className="schema-inspector-preview">
											<div className="schema-inspector-preview-title">
												{result.preview.title ||
													__(
														'Not found in this page’s structured data',
														'vulopilot'
													)}
											</div>
											<div className="desc">{result.url}</div>
											{null !== result.preview.rating && (
												<div className="desc">
													{sprintf(
														/* translators: 1: star rating out of 5, 2: number of ratings. */
														__('Rating: %1$s (%2$d)', 'vulopilot'),
														result.preview.rating,
														result.preview.rating_count ?? 0
													)}
												</div>
											)}
											<div className="desc">
												{sprintf(
													/* translators: %s is either the real detected availability value, or a "not found" note. */
													__('Availability: %s', 'vulopilot'),
													result.preview.availability ||
													__(
														'Not found in this page’s structured data',
														'vulopilot'
													)
												)}
											</div>
											{result.preview.description && (
												<div className="desc">
													{result.preview.description}
												</div>
											)}
										</div>
									</FormGroupComponent>
								)}

								{result.blocks.length > 0 && (
									<FormGroupComponent label={__('JSON-LD', 'vulopilot')}>
										{/* Same "solid action button sitting right above the code
										block it acts on" shape CrawlRobotsSitemapSection.tsx's own
										"Test robots.txt" button already establishes for its robots.txt
										editor - these two act on the JSON-LD below, not the page as a
										whole, so they sit here rather than in the page-level footer
										actions below. Copy is a real `ClipboardComponent` (`variant="button"`)
										instead of a plain `ButtonInput` + hand-rolled notice - it shows its
										own "Copied!" state on the button itself, no separate notice needed.
										Only rendered when there's a real block - with none, Copy has
										nothing to copy (silent no-op on an empty string) and Export would
										just download an empty "[]", neither of which reads as "working" next
										to "No structured data was found" above. */}
										<div className="schema-inspector-jsonld-actions">
											<ClipboardComponent
												variant="button"
												copyButtonLabel={__('Copy', 'vulopilot')}
												copiedLabel={__('Copied!', 'vulopilot')}
												onCopy={() =>
													result.blocks
														.map((block) => prettyPrint(block.raw))
														.join('\n\n')
												}
											/>
											<ButtonInput
												buttons={{
													text: __('Export', 'vulopilot'),
													icon: 'export',
													onClick: handleExport,
												}}
											/>
										</div>

										{result.blocks.map((block) => (
											<div key={block.index} className="schema-inspector-jsonld-block">
												<RobotsTxtEditor
													value={prettyPrint(block.raw)}
													readOnly
												/>
											</div>
										))}
									</FormGroupComponent>
								)}

								{/* Page-level actions (not JSON-LD-specific) - real full-width
								stacked buttons at the bottom of the card, same shape
								IssueDetailPanel.tsx's own "Ignore all"/"Resolve all" footer
								already establishes (`ButtonInput position="full-width"`,
								one array of button configs). */}
								<ButtonInput
									position="full-width"
									buttons={[
										{
											text: __('Open page', 'vulopilot'),
											icon: 'external',
											color: 'border-purple',
											onClick: () =>
												window.open(result.url, '_blank', 'noreferrer'),
										},
										{
											text: __('Validate with Google', 'vulopilot'),
											icon: 'external',
											color: 'purple-bg',
											onClick: openRichResultsTest,
										},
									]}
								/>
							</FormGroupWrapperComponent>
						)}
					</CardComponent>
				)}
			</ColumnComponent>
		</>
	);
};

export default InspectorSection;
