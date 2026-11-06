/* global vulopilotAppLocalizer */
import React, { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { applyFilters } from '@wordpress/hooks';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import {
	AnalyticsComponent,
	CardComponent,
	ColumnComponent,
	FormGroupComponent,
	FormGroupWrapperComponent,
	InformationItemComponent,
	ListComponent,
	ModuleGuardComponent,
	NoticeManager,
	PopupComponent,
	TypographyComponent,
	ContainerComponent
} from '@zyra/components';
import { ButtonInput, SelectInput, TextInput } from '@zyra/inputs';
import { TableCard } from '@zyra/table';
import { Finding } from '../../services/useFindingsTable';
import { formatWpDate } from '../../services/formatWpDate';
import ShowProPopup from '../../components/Popup/Popup';
import './SeoVisibility.scss';

const nonceHeaders = { headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } };

interface BrokenLinkFixParams {
	post_id: number;
	old_url: string;
	new_url: string;
	is_image?: boolean;
	old_text?: string;
	new_text?: string;
}

interface BrokenLinkFixOutcome {
	success: boolean;
	message: string;
}

/** Resolves a fix outcome, or null when no fix handler is registered. */
const getBrokenLinkFixHandler = () =>
	applyFilters('vulopilot_broken_link_fix_handler', null);

/** This tab's two data sources. */
const BROKEN_SCANNER_IDS = ['broken-links', 'broken-images'];

/** A row from `GET /findings`. */
interface BrokenLinkFinding extends Finding {
	meta?: string;
	scanner_id?: string;
	object_ref?: string;
	last_seen_at?: string;
}

interface RunStats {
	pages_scanned: number;
	links_checked: number;
	healthy_count: number;
	checked_at: number | null;
}

/** Most recent finished run of either scanner. */
interface LastRunStats {
	duration_ms: number;
	finished_at: number;
}

interface BrokenLinksStatsResponse {
	links: RunStats;
	images: RunStats;
	last_run: LastRunStats | null;
}

interface BrokenFindingsSummary {
	brokenLinks: number;
	brokenImages: number;
	couldntVerify: number;
	ignored: number;
}

const EMPTY_SUMMARY: BrokenFindingsSummary = {
	brokenLinks: 0,
	brokenImages: 0,
	couldntVerify: 0,
	ignored: 0,
};

/** Same module-gate check used elsewhere (SeoTab.tsx, CrawlerTrafficTab.tsx). */
const isSeoModuleActive = () =>
	vulopilotAppLocalizer.active_modules?.includes('technical-seo') ?? false;

/** Parses the finding's free-form `meta` JSON. */
const getFindingMeta = (
	finding: Pick<BrokenLinkFinding, 'meta'>
): {
	url?: string;
	reason?: string;
	text?: string;
	context_before?: string;
	context_after?: string;
} => {
	try {
		return JSON.parse(finding.meta || '{}');
	} catch {
		return {};
	}
};

/** Visible anchor text, for the "Link Text" column. */
const getLinkText = (finding: BrokenLinkFinding): string => {
	const { text } = getFindingMeta(finding);

	if (undefined === text) {
		return __('-', 'vulopilot');
	}

	return text || __('(no visible text)', 'vulopilot');
};

/** Raw anchor text, `''` when none (no display placeholder). */
const getRawLinkText = (finding: BrokenLinkFinding): string =>
	getFindingMeta(finding).text ?? '';

const getBrokenUrl = (finding: BrokenLinkFinding): string =>
	getFindingMeta(finding).url || '';

/** Shortens text for compact row display. */
const truncateText = (text: string, maxLength = 15): string =>
	text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;


const decodeHtmlEntities = (text: string | null | undefined): string => {
	if (!text || -1 === text.indexOf('&')) {
		return text || '';
	}

	const el = document.createElement('textarea');

	el.innerHTML = text;

	return el.value;
};

/** Resolves a broken URL to a path a redirect rule can match. */
const deriveSourcePath = (url: string): string | null => {
	if (!url) {
		return null;
	}

	try {
		const target = new URL(url, vulopilotAppLocalizer.site_url);
		const site = new URL(vulopilotAppLocalizer.site_url);

		if (target.origin !== site.origin) {
			return null;
		}

		return target.pathname || '/';
	} catch {
		return null;
	}
};

/** True when the broken URL points off-site. */
const isExternalFinding = (finding: BrokenLinkFinding): boolean =>
	!deriveSourcePath(getBrokenUrl(finding));

/** HTTP reason phrases for the status codes these scanners see. */
const HTTP_STATUS_PHRASES: Record<string, string> = {
	'400': __('Bad Request', 'vulopilot'),
	'401': __('Unauthorized', 'vulopilot'),
	'403': __('Forbidden', 'vulopilot'),
	'404': __('Not Found', 'vulopilot'),
	'410': __('Gone', 'vulopilot'),
	'429': __('Too Many Requests', 'vulopilot'),
	'500': __('Internal Server Error', 'vulopilot'),
	'502': __('Bad Gateway', 'vulopilot'),
	'503': __('Service Unavailable', 'vulopilot'),
	'504': __('Gateway Timeout', 'vulopilot'),
};

/** Short status key derived from `meta.reason` + `description`. */
const deriveStatusKey = (finding: BrokenLinkFinding): string => {
	const { reason } = getFindingMeta(finding);
	const description = finding.description || '';

	if ('broken' === reason) {
		const match = description.match(/HTTP (\d+)/);
		return match ? match[1] : 'broken';
	}

	if (/resolv/i.test(description)) {
		return 'dns';
	}

	if (/timed out/i.test(description)) {
		return 'timeout';
	}

	return 'unverified';
};

/** Human label for a deriveStatusKey() result. */
const statusKeyLabel = (key: string): string => {
	switch (key) {
		case 'broken':
			return __('Broken', 'vulopilot');
		case 'dns':
			return __('DNS', 'vulopilot');
		case 'timeout':
			return __('Timeout', 'vulopilot');
		case 'unverified':
			return __('Unverified', 'vulopilot');
		default:
			return HTTP_STATUS_PHRASES[key]
				? `${key} ${HTTP_STATUS_PHRASES[key]}`
				: key; // a real numeric HTTP status code with no known phrase
	}
};


/** Builds a client-side CSV from the currently filtered findings. */
const downloadBrokenLinksCsv = (rows: BrokenLinkFinding[]) => {
	const header = [
		__('Source page', 'vulopilot'),
		__('Target URL', 'vulopilot'),
		__('Link Text', 'vulopilot'),
		__('Type', 'vulopilot'),
		__('Link type', 'vulopilot'),
		__('Status', 'vulopilot'),
		__('Finding status', 'vulopilot'),
		__('First found', 'vulopilot'),
		__('Last checked', 'vulopilot'),
	];
	const lines = rows.map((row) =>
		[
			row.page ?? '',
			getBrokenUrl(row),
			getLinkText(row),
			'broken-images' === row.scanner_id
				? __('Image', 'vulopilot')
				: __('Link', 'vulopilot'),
			isExternalFinding(row)
				? __('External', 'vulopilot')
				: __('Internal', 'vulopilot'),
			statusKeyLabel(deriveStatusKey(row)),
			row.status,
			row.created_at,
			row.last_seen_at ?? row.created_at,
		]
			.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
			.join(',')
	);
	const csv = [header.join(','), ...lines].join('\n');
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	link.href = url;
	link.download = 'broken-links.csv';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
};

const FINDINGS_PAGE_SIZE = 100;
/** Safety ceiling for the pagination loop below. */
const MAX_FINDINGS = 500;
/** Client-side page size; TableCard's page-size selector just slices the already-fetched rows. */
const DEFAULT_PER_PAGE = 10;

/** Fetches every broken-link/broken-image finding, any status. */
const fetchAllBrokenFindings = async (): Promise<BrokenLinkFinding[]> => {
	const scannerParam = BROKEN_SCANNER_IDS.join(',');
	let page = 1;
	let all: BrokenLinkFinding[] = [];

	while (true) {
		const response = await getApiResponse<{
			data: BrokenLinkFinding[];
			total: number;
		}>(
			getApiLink(
				vulopilotAppLocalizer,
				`findings?scanner_id=${scannerParam}&status=all&per_page=${FINDINGS_PAGE_SIZE}&page=${page}&orderby=id&order=desc`
			),
			nonceHeaders
		);

		if (!response) {
			throw new Error('findings fetch failed');
		}

		all = all.concat(response.data ?? []);

		const gotFullPage = (response.data ?? []).length === FINDINGS_PAGE_SIZE;
		const moreRemain = all.length < (response.total ?? 0);

		if (!gotFullPage || !moreRemain || all.length >= MAX_FINDINGS) {
			break;
		}

		page += 1;
	}

	return all;
};

/** Collapses duplicate findings for the same URL/page/scanner/status to the newest one. */
const dedupeBrokenFindings = (
	findings: BrokenLinkFinding[]
): BrokenLinkFinding[] => {
	const seen = new Set<string>();

	return findings.filter((finding) => {
		const key = [
			finding.scanner_id,
			finding.object_ref,
			getBrokenUrl(finding),
			finding.status,
		].join('::');

		if (seen.has(key)) {
			return false;
		}

		seen.add(key);
		return true;
	});
};

const summarizeBrokenFindings = (
	findings: BrokenLinkFinding[]
): BrokenFindingsSummary => {
	const summary = { ...EMPTY_SUMMARY };

	findings.forEach((finding) => {
		if ('ignored' === finding.status) {
			summary.ignored += 1;
			return;
		}

		if ('open' !== finding.status) {
			return; // Resolved/snoozed don't count toward "Need attention".
		}

		if ('unverified' === getFindingMeta(finding).reason) {
			summary.couldntVerify += 1;
			return;
		}

		if ('broken-images' === finding.scanner_id) {
			summary.brokenImages += 1;
		} else {
			summary.brokenLinks += 1;
		}
	});

	return summary;
};

type IssueFilter = 'all' | 'broken-links' | 'broken-images' | 'unverified';
type LinkTypeFilter = 'all' | 'internal' | 'external';
type StatusFilter = 'all' | 'open' | 'resolved' | 'ignored' | 'snoozed';

/** "Broken Links" inner section of the "Crawl & URLs" tab. */
const BrokenLinksSection = () => {
	const [allFindings, setAllFindings] = useState<BrokenLinkFinding[]>([]);
	const [isLoadingFindings, setIsLoadingFindings] = useState(true);
	const [findingsError, setFindingsError] = useState<string | null>(null);
	const [stats, setStats] = useState<BrokenLinksStatsResponse | null>(null);
	const [searchTerm, setSearchTerm] = useState('');
	const [issueFilter, setIssueFilter] = useState<IssueFilter>('all');
	const [linkTypeFilter, setLinkTypeFilter] = useState<LinkTypeFilter>('all');
	const [pageFilter, setPageFilter] = useState('all');
	const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
	const [paged, setPaged] = useState(1);
	const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
	const [redirectFinding, setRedirectFinding] =
		useState<BrokenLinkFinding | null>(null);
	const [redirectSourcePath] = useState('');
	const [redirectTargetUrl, setRedirectTargetUrl] = useState('');
	const [redirectType, setRedirectType] = useState('301');
	/** "Fix" popup state - replaces the broken `href`/`src` with a new URL. */
	const [fixFinding, setFixFinding] = useState<BrokenLinkFinding | null>(null);
	const [fixNewUrl, setFixNewUrl] = useState('');
	/** Editable anchor text alongside the URL (broken-links only; images have none). */
	const [fixNewText, setFixNewText] = useState('');
	const [isSavingFixUrl, setIsSavingFixUrl] = useState(false);
	const [isSavingRedirect, setIsSavingRedirect] = useState(false);
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);

	const loadFindings = () => {
		setIsLoadingFindings(true);

		fetchAllBrokenFindings()
			.then((findings) => {
				setAllFindings(dedupeBrokenFindings(findings));
				setFindingsError(null);
			})
			.catch(() =>
				setFindingsError(
					__(
						'Something went wrong fetching this data. Please try again.',
						'vulopilot'
					)
				)
			)
			.finally(() => setIsLoadingFindings(false));
	};

	const loadStats = () => {
		getApiResponse<BrokenLinksStatsResponse>(
			getApiLink(vulopilotAppLocalizer, 'broken-links/stats'),
			nonceHeaders
		).then((response) => response && setStats(response));
	};

	useEffect(() => {
		loadFindings();
		loadStats();
	}, []);


	// A filter/search change can shrink the result set below the current page.
	useEffect(() => {
		setPaged(1);
	}, [searchTerm, issueFilter, linkTypeFilter, pageFilter, statusFilter]);

	const summary = summarizeBrokenFindings(allFindings);

	/** Same `findings/bulk` endpoint FindingsTable.tsx's bulk Ignore uses. */
	const handleBulkIgnore = (ids: number[]) => {
		sendApiResponse(
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, 'findings/bulk'),
			{ ids, status: 'ignored' }
		).then((response) => {
			NoticeManager.add({
				uniqueKey: 'broken-link-bulk-ignore',
				type: response ? 'success' : 'error',
				position: 'float',
				message: response
					? __('Selected findings ignored.', 'vulopilot')
					: __('Could not update these findings. Please try again.', 'vulopilot'),
			});

			if (response) {
				loadFindings();
			}
		});
	};


	const openFixPopup = (finding: BrokenLinkFinding) => {
		if ('function' !== typeof getBrokenLinkFixHandler()) {
			setIsProPopupOpen(true);
			return;
		}

		setFixFinding(finding);
		setFixNewUrl('');
		// Pre-fills the raw text, not getLinkText()'s display placeholder.
		setFixNewText(getRawLinkText(finding));
	};

	const closeFixPopup = () => setFixFinding(null);

	const handleSaveFixUrl = () => {
		const brokenLinkFixHandler = getBrokenLinkFixHandler();

		if (
			!fixFinding ||
			'' === fixNewUrl.trim() ||
			'function' !== typeof brokenLinkFixHandler
		) {
			return;
		}

		setIsSavingFixUrl(true);

		const isImageFix = 'broken-images' === fixFinding.scanner_id;
		const params: BrokenLinkFixParams = {
			post_id: Number(fixFinding.object_ref),
			old_url: getBrokenUrl(fixFinding),
			new_url: fixNewUrl.trim(),
			is_image: isImageFix,
			// Only meaningful for a broken-links finding, not an image.
			...(isImageFix
				? {}
				: {
						old_text: getRawLinkText(fixFinding),
						new_text: fixNewText.trim(),
					}),
		};

		Promise.resolve(
			brokenLinkFixHandler(params) as Promise<BrokenLinkFixOutcome>
		)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: `broken-link-fix-${fixFinding.id}`,
					type: response?.success ? 'success' : 'error',
					position: 'float',
					message:
						response?.message ||
						(response?.success
							? __('This page has been updated with the new URL.', 'vulopilot')
							: __(
								'Could not update this page. Please try again.',
								'vulopilot'
							)),
				});

				if (response?.success) {
					// The page is fixed now - resolve this finding.
					sendApiResponse(
						vulopilotAppLocalizer,
						getApiLink(vulopilotAppLocalizer, `findings/${fixFinding.id}`),
						{ status: 'resolved' }
					).then(() => loadFindings());

					closeFixPopup();
				}
			})
			.finally(() => setIsSavingFixUrl(false));
	};


	const closeRedirectPopup = () => setRedirectFinding(null);

	const handleCreateRedirect = () => {
		if (!redirectFinding || '' === redirectTargetUrl.trim()) {
			return;
		}

		setIsSavingRedirect(true);

		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'redirects'), {
			source_path: redirectSourcePath,
			target_url: redirectTargetUrl,
			redirect_type: Number(redirectType),
		})
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'broken-link-redirect-save',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('Redirect created.', 'vulopilot')
						: __(
							'Could not create this redirect - a redirect for this path may already exist.',
							'vulopilot'
						),
				});

				if (response && redirectFinding) {
					// A redirect now covers this URL - resolve this finding.
					sendApiResponse(
						vulopilotAppLocalizer,
						getApiLink(vulopilotAppLocalizer, `findings/${redirectFinding.id}`),
						{ status: 'resolved' }
					).then(() => loadFindings());

					closeRedirectPopup();
				}
			})
			.finally(() => setIsSavingRedirect(false));
	};

	// Client-side filters over the one full fetch loadFindings() makes above.
	const visibleFindings = allFindings
		.filter((finding) => 'all' === statusFilter || finding.status === statusFilter)
		.filter((finding) => {
			if ('all' === issueFilter) {
				return true;
			}

			if ('unverified' === issueFilter) {
				return 'unverified' === getFindingMeta(finding).reason;
			}

			return (
				finding.scanner_id === issueFilter &&
				'unverified' !== getFindingMeta(finding).reason
			);
		})
		.filter((finding) => {
			if ('all' === linkTypeFilter) {
				return true;
			}

			return (
				('external' === linkTypeFilter) === isExternalFinding(finding)
			);
		})
		.filter((finding) => 'all' === pageFilter || finding.page === pageFilter)
		.filter((finding) => {
			if ('' === searchTerm.trim()) {
				return true;
			}

			const term = searchTerm.trim().toLowerCase();

			return (
				(finding.page || '').toLowerCase().includes(term) ||
				getBrokenUrl(finding).toLowerCase().includes(term)
			);
		});

	const pageOptions = Array.from(
		new Set(allFindings.map((finding) => finding.page).filter(Boolean))
	) as string[];

	const pageRows = visibleFindings.slice(
		(paged - 1) * perPage,
		paged * perPage
	);

	const firstRowIdsByPage = (() => {
		const seenPages = new Set<string>();
		const firstIds = new Set<number | string>();

		pageRows.forEach((row) => {
			const key = row.page || '';

			if (!seenPages.has(key)) {
				seenPages.add(key);
				firstIds.add(row.id);
			}
		});

		return firstIds;
	})();

	const handleExportCsv = () => {
		if (!visibleFindings.length) {
			NoticeManager.add({
				uniqueKey: 'broken-link-export-empty',
				type: 'error',
				position: 'float',
				message: __('Nothing to export.', 'vulopilot'),
			});
			return;
		}

		downloadBrokenLinksCsv(visibleFindings);
	};

	const headers = {
		// Same InformationItemComponent shape other findings tables use. Title links to the page.
		page: {
			label: __('Source page', 'vulopilot'),
			render: (row: BrokenLinkFinding) => {
				const pageUrl = `${vulopilotAppLocalizer.site_url}${row.page}`;
				const external = isExternalFinding(row);
				const isFirstOfPage = firstRowIdsByPage.has(row.id);

				return (
					<InformationItemComponent
						title={decodeHtmlEntities(row.page_title) || row.page || __('(no title)', 'vulopilot')}
						titleLink={pageUrl}
						avatar={{
							iconClass: 'broken-images' === row.scanner_id ? 'attachment' : 'page',
						}}
						className={isFirstOfPage ? undefined : 'broken-link-continuation-row'}
						badges={[
							{
								text: external
									? __('External link', 'vulopilot')
									: __('Internal link', 'vulopilot'),
								className: external ? 'badge-pending' : 'badge-info',
							},
							{
								text: formatWpDate(row.last_seen_at || row.created_at),
								className: 'badge-info',
							},
						]}
						descriptions={[
							{
								icon: 'text-fields',
								label: __('Anchor text', 'vulopilot'),
								value: truncateText(getLinkText(row)),
							},
							{
								icon: 'link',
								label: __('Target URL', 'vulopilot'),
								value: (
									<a
										className="broken-link-target-url"
										href={getBrokenUrl(row)}
										target="_blank"
										rel="noopener noreferrer"
									>
										{getBrokenUrl(row)}
									</a>
								),
							},
						]}
					/>
				);
			},
		},
		// Same action-header shape SeoIssuesByPageTable.tsx uses.
		action: {
			label: __('Actions', 'vulopilot'),
			type: 'action',
			actions: [
				{
					label: __('Edit page', 'vulopilot'),
					icon: 'edit',
					type: 'button',
					color: 'text-blue',
					onClick: (row: Record<string, unknown>) => {
						const finding = row as unknown as BrokenLinkFinding;

						if (!finding.object_ref) {
							return;
						}

						window.open(
							`${vulopilotAppLocalizer.admin_url}post.php?post=${finding.object_ref}&action=edit`,
							'_blank',
							'noopener,noreferrer'
						);
					},
				},
				{
					label: (row: Record<string, unknown>) =>
						'broken-images' === (row as unknown as BrokenLinkFinding).scanner_id
							? __('View Image', 'vulopilot')
							: __('View Page', 'vulopilot'),
					icon: 'eye',
					type: 'button',
					color: 'text-blue',
					onClick: (row: Record<string, unknown>) =>
						window.open(
							getBrokenUrl(row as unknown as BrokenLinkFinding),
							'_blank',
							'noopener,noreferrer'
						),
				},
				{
					label: __('Fix', 'vulopilot'),
					icon: 'tools',
					color: 'text-yellow',
					type: 'button',
					onClick: (row: Record<string, unknown>) =>
						openFixPopup(row as unknown as BrokenLinkFinding),
				},
			],
		},
	};

	return (
		<>
			<ContainerComponent General>
				{!isSeoModuleActive() ? (
					<CardComponent
						title={__('Broken Links', 'vulopilot')}
						titleIcon="link"
						desc={__('Broken links and images found across your site.', 'vulopilot')}
					>
						<ModuleGuardComponent
							icon="error"
							title={__('SEO module is turned off', 'vulopilot')}
							desc={__(
								'Turn the SEO module back on from Settings → Modules to resume broken-link/image scanning and see findings again here. Findings already found before it was turned off aren’t deleted - they still show up on the Health page, which lists every category.',
								'vulopilot'
							)}
						/>
					</CardComponent>
				) : (
					<>
						{/* * Same real `ListComponent` "mini-card report" row * shape SeoTab.tsx's own "SEO Health" card/ * GeoScoreSection.tsx's own "GEO Score" card rows * use - the real count goes in `tags` (a trailing, * right-aligned `TypographyComponent`), not `value` * (which renders stacked directly under the title * instead of trailing the row, the wrong shape * here). */}
						<ColumnComponent >
							<CardComponent
								title={__('Broken Link Monitoring', 'vulopilot')}
								titleIcon="link"
								desc={__(
									'Real links and images found on your published posts/pages that returned a broken (non-2xx/3xx) response the last time they were checked. Use the "Run scan" button above to check again.',
									'vulopilot'
								)}
							>
								<div className='broken-link-wrapper'>
									<div className='broken-link-section'>
										{stats && (stats.links.checked_at || stats.images.checked_at) && (
											<AnalyticsComponent
												cols={2}
												variant="progress"
												data={[
													{
														icon: 'link',
														iconClass: 'is-good',
														number: `${stats.links.healthy_count}/${stats.links.links_checked}`,
														text: __('Links healthy', 'vulopilot'),
														progress:
															stats.links.links_checked > 0
																? Math.round(
																	(stats.links.healthy_count /
																		stats.links.links_checked) *
																	100
																)
																: 0,
														colorClass: 'zyra-green-color',
													},
													{
														icon: 'attachment',
														iconClass: 'is-primary',
														number: `${stats.images.healthy_count}/${stats.images.links_checked}`,
														text: __('Images healthy', 'vulopilot'),
														progress:
															stats.images.links_checked > 0
																? Math.round(
																	(stats.images.healthy_count /
																		stats.images.links_checked) *
																	100
																)
																: 0,
														colorClass: 'zyra-blue-color',
													},
												]}
											/>
										)}
										<ListComponent
											className="mini-card documentation"
											items={[
												{
													id: 'ux',
													icon: 'check',
													title: __('Better user experience', 'vulopilot'),
													desc: __(
														'Keeps your visitors on track and builds trust.',
														'vulopilot'
													),
												},
												{
													id: 'seo',
													icon: 'check',
													title: __('Improved SEO rankings', 'vulopilot'),
													desc: __(
														'Helps search engines crawl your site effectively.',
														'vulopilot'
													),
												},
												{
													id: 'crawlable',
													icon: 'check',
													title: __('More crawlable pages', 'vulopilot'),
													desc: __(
														'Ensures all important content is indexed.',
														'vulopilot'
													),
												},
											]}
										/>
									</div>
									<div className='broken-link-section'>
										<ListComponent
											className="mini-card report hover seo-health-score-category-list"
											loading={isLoadingFindings}
											items={[
												{
													id: 'broken-links',
													icon: 'link red',
													title: __('Broken Links', 'vulopilot'),
													tags: (
														<TypographyComponent
															variant="h5"
															weight="bold"
															className="seo-health-score-row-value"
														>
															{summary.brokenLinks}
														</TypographyComponent>
													),
												},
												{
													id: 'broken-images',
													icon: 'attachment red',
													title: __('Broken Images', 'vulopilot'),
													tags: (
														<TypographyComponent
															variant="h5"
															weight="bold"
															className="seo-health-score-row-value"
														>
															{summary.brokenImages}
														</TypographyComponent>
													),
												},
												{
													id: 'couldnt-verify',
													icon: 'close-delete yellow',
													title: __("Couldn't Verify", 'vulopilot'),
													tags: (
														<TypographyComponent
															variant="h5"
															weight="bold"
															className="seo-health-score-row-value"
														>
															{summary.couldntVerify}
														</TypographyComponent>
													),
												},
												{
													id: 'ignored',
													icon: 'rejecte lime',
													title: __('Ignored', 'vulopilot'),
													tags: (
														<TypographyComponent
															variant="h5"
															weight="bold"
															className="seo-health-score-row-value"
														>
															{summary.ignored}
														</TypographyComponent>
													),
												},
											]}
										/>
									</div>
									
								</div>
							</CardComponent>
						</ColumnComponent>
						<CardComponent
							title={__('Broken Link Monitoring', 'vulopilot')}
							titleIcon="link"
							desc={__(
								'Real links and images found on your published posts/pages that returned a broken (non-2xx/3xx) response the last time they were checked. Use the "Run scan" button above to check again.',
								'vulopilot'
							)}
						>
							{findingsError ? (
								<ModuleGuardComponent
									icon="error"
									title={__('Could not load findings', 'vulopilot')}
									desc={findingsError}
								/>
							) : (
								<TableCard
									showMenu={false}
									hideHeader={true}
									variant="transparent"
									headers={headers}
									rows={pageRows}
									ids={pageRows.map((row: BrokenLinkFinding) => row.id)}
									totalRows={visibleFindings.length}
									isLoading={isLoadingFindings}
									search={{
										placeholder: __(
											'Search by URL or source page…',
											'vulopilot'
										),
									}}
									filters={[
										{
											key: 'issue',
											label: __('Issue', 'vulopilot'),
											type: 'select',
											size: 10,
											options: [
												{ label: __('All issues', 'vulopilot'), value: 'all' },
												{ label: __('Broken links', 'vulopilot'), value: 'broken-links' },
												{ label: __('Broken images', 'vulopilot'), value: 'broken-images' },
												{ label: __("Couldn't verify", 'vulopilot'), value: 'unverified' },
											],
										},
										{
											key: 'link_type',
											label: __('Link Type', 'vulopilot'),
											type: 'select',
											size: 10,
											options: [
												{ label: __('All link types', 'vulopilot'), value: 'all' },
												{ label: __('Internal', 'vulopilot'), value: 'internal' },
												{ label: __('External', 'vulopilot'), value: 'external' },
											],
										},
										{
											key: 'page',
											label: __('Page', 'vulopilot'),
											type: 'select',
											size: 10,
											options: [
												{ label: __('All pages', 'vulopilot'), value: 'all' },
												...pageOptions.map((page) => ({
													label: page,
													value: page,
												})),
											],
										},
										{
											key: 'status',
											label: __('Status', 'vulopilot'),
											type: 'select',
											size: 10,
											options: [
												{ label: __('All status', 'vulopilot'), value: 'all' },
												{ label: __('Open', 'vulopilot'), value: 'open' },
												{ label: __('Resolved', 'vulopilot'), value: 'resolved' },
												{ label: __('Ignored', 'vulopilot'), value: 'ignored' },
												{ label: __('Snoozed', 'vulopilot'), value: 'snoozed' },
											],
										},
									]}
									buttonActions={[
										{
											label: __('Export CSV', 'vulopilot'),
											icon: 'export',
											onClick: handleExportCsv,
										},
									]}
									bulkActions={[
										{ label: __('Ignore Issue', 'vulopilot'), value: 'ignored' },
									]}
									onBulkActionApply={(action: string, ids: number[]) => {
										if ('ignored' === action) {
											handleBulkIgnore(ids);
										}
									}}
									onQueryUpdate={(query: {
										paged?: number | string;
										per_page?: number | string;
										searchValue?: string;
										filter?: Record<string, string>;
									}) => {
										setPaged(Number(query.paged) || 1);
										setPerPage(Number(query.per_page) || DEFAULT_PER_PAGE);
										setSearchTerm(query.searchValue ?? '');
										setIssueFilter(
											(query.filter?.issue as IssueFilter) ?? 'all'
										);
										setLinkTypeFilter(
											(query.filter?.link_type as LinkTypeFilter) ?? 'all'
										);
										setPageFilter(query.filter?.page ?? 'all');
										setStatusFilter(
											(query.filter?.status as StatusFilter) ?? 'all'
										);
									}}
									emptyMessage={__(
										'No broken links or images found yet. Turn on these checks under Settings > Scanning > SEO and Content > Images . After this "Run a scan" from Dashboard page to find any issues.',
										'vulopilot'
									)}
								/>
							)}
						</CardComponent>
					</>
				)}
			</ContainerComponent>

			<PopupComponent
				open={!!redirectFinding}
				onClose={closeRedirectPopup}
				width={28}
				height="auto"

				header={{ title: __('Create redirect', 'vulopilot') }}
			>
				<div className="broken-link-redirect-form">
					<p className="desc">
						{__(
							'Redirect this broken URL to a working destination.',
							'vulopilot'
						)}
					</p>
					<TextInput
						name="redirect_source_path"
						inputLabel={__('From (path)', 'vulopilot')}
						value={redirectSourcePath}
						disabled
						onChange={() => { }}
					/>
					<p className="desc broken-link-redirect-note">
						{__(
							'Auto-generated from the broken URL. Edit or fine-tune it afterward from the Redirects tab if you need something more specific.',
							'vulopilot'
						)}
					</p>
					<TextInput
						name="redirect_target_url"
						inputLabel={__('To', 'vulopilot')}
						placeholder="https://example.com/new-page/"
						value={redirectTargetUrl}
						onChange={(value) => setRedirectTargetUrl(value as string)}
					/>
					<SelectInput
						name="redirect_type"
						value={redirectType}
						options={[
							{ label: __('301 (Permanent)', 'vulopilot'), value: '301' },
							{ label: __('302 (Temporary)', 'vulopilot'), value: '302' },
						]}
						onChange={(value) => setRedirectType(value as string)}
						size="12rem"
					/>
					<div className="broken-link-redirect-actions">
						<ButtonInput
							buttons={{
								text: __('Cancel', 'vulopilot'),
								icon: 'close',
								color: 'red',
								onClick: closeRedirectPopup,
							}}
						/>
						<ButtonInput
							buttons={{
								text: isSavingRedirect
									? __('Creating…', 'vulopilot')
									: __('Create redirect', 'vulopilot'),
								icon: 'plus',
								onClick: handleCreateRedirect,
								disabled:
									isSavingRedirect || '' === redirectTargetUrl.trim(),
							}}
						/>
					</div>
				</div>
			</PopupComponent>

			<PopupComponent
				open={!!fixFinding}
				onClose={closeFixPopup}
				width={30}
				height="60%"
				icon='tools'
				header={{
					title:
						fixFinding && 'broken-images' === fixFinding.scanner_id
							? __('Fix broken image', 'vulopilot')
							: __('Fix broken link', 'vulopilot'),
				}}
				footer={
					<div className="broken-link-fix-actions">
						<ButtonInput
							buttons={[
								{
									text: __('Cancel', 'vulopilot'),
									icon: 'close',
									color: 'border-red',
									onClick: closeFixPopup,
								},
								{
									text: isSavingFixUrl
										? __('Saving…', 'vulopilot')
										: __('Save', 'vulopilot'),
									icon: 'save',
									onClick: handleSaveFixUrl,
									disabled: isSavingFixUrl || '' === fixNewUrl.trim(),
								},
							]}
						/>
					</div>
				}
			>
				{fixFinding && (
					<div className="broken-link-fix-form">
						<p className="desc">
							{'broken-images' === fixFinding.scanner_id
								? __(
									'Replace this broken image URL with a working one - the source page is updated directly.',
									'vulopilot'
								)
								: __(
									'Replace this broken link URL with a working one - and edit its link text if you want - the source page is updated directly.',
									'vulopilot'
								)}
						</p>
						<FormGroupWrapperComponent>
							{'broken-images' !== fixFinding.scanner_id && (
								<FormGroupComponent label={__('Link Text', 'vulopilot')}>
									<TextInput
										name="fix_new_text"
										placeholder={__('(no visible text)', 'vulopilot')}
										value={fixNewText}
										onChange={(value: unknown) =>
											setFixNewText(value as string)
										}
									/>
								</FormGroupComponent>
							)}
							<FormGroupComponent label={__('Current URL', 'vulopilot')}>
								<p className="broken-link-fix-static-value">
									{getBrokenUrl(fixFinding)}
								</p>
							</FormGroupComponent>
							<FormGroupComponent label={__('New URL', 'vulopilot')}>
								<TextInput
									name="fix_new_url"
									placeholder="https://example.com/new-page/"
									value={fixNewUrl}
									onChange={(value: unknown) => setFixNewUrl(value as string)}
								/>
							</FormGroupComponent>
						</FormGroupWrapperComponent>
					</div>
				)}
			</PopupComponent>

			<PopupComponent
				open={isProPopupOpen}
				onClose={() => setIsProPopupOpen(false)}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				{vulopilotAppLocalizer.khali_dabba ? (
					<ShowProPopup moduleName="one-click-fix" />
				) : (
					<ShowProPopup />
				)}
			</PopupComponent>
		</>
	);
};

export default BrokenLinksSection;
