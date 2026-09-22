/* global appLocalizer */
import { useEffect, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
import { COLOR_PALETTE, getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import {
	CardComponent,
	ChartComponent,
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
import { TableCard, TableRow } from '@zyra/table';
import { formatWpDate } from '../../services/formatWpDate';
import ShowProPopup from '../../components/Popup/Popup';
import './SeoVisibility.scss';

interface RedirectRow extends TableRow {
	id: number;
	source_path: string;
	target_url: string;
	redirect_type: 301 | 302 | 307;
	hit_count: number;
	is_active: 0 | 1;
	created_at: string;
	last_accessed_at: string | null;
}

interface RedirectHealthResult {
	broken: boolean;
	status: number | string;
}

interface RedirectHealthResponse {
	checked_at: number;
	results: Record<number, RedirectHealthResult>;
}

const nonceHeaders = { headers: { 'X-WP-Nonce': appLocalizer.nonce } };

const FETCH_PAGE_SIZE = 100;
/** Safety ceiling for the fetch-everything loop below — a real site's user-managed redirect list is small by nature (each one is manually added or converted from a 404), unlike scanner findings. */
const MAX_REDIRECTS = 1000;
const DEFAULT_PER_PAGE = 10;

/** Real HEAD-check cadence — Controllers/Redirects.php's own `HEALTH_CACHE_SECONDS` (an hour); kept in sync so the "Recheck in ~Xm" line here reflects the same real cache window the backend actually enforces, not a guess. */
const HEALTH_CACHE_SECONDS = 60 * 60;

/**
 * Real per-type badge color for the "From" column's own type badge (301
 * green/302 yellow/307 purple — 307 gets its own color rather than
 * reusing 302's, since it's a genuinely distinct HTTP status a visitor's
 * browser treats differently; redirect_type is real, never fabricated —
 * Controllers/Redirects.php only ever persists 301/302/307), as one of
 * zyra's own real `BadgeComponent.scss` semantic classes instead of a raw
 * palette name — that stylesheet has no `badge-green`/`badge-yellow`/
 * `badge-purple` classes by color name, only status-word classes that
 * happen to resolve to those colors (`badge-active` → green,
 * `badge-pending` → yellow, `badge-locked` → purple), so this maps to the
 * real classes rather than inventing unstyled ones.
 */
const TYPE_BADGE_CLASS: Record<number, string> = {
	301: 'badge-active',
	302: 'badge-pending',
	307: 'badge-locked',
};

/** Same real 3-tier 0-100 band SeoTab.tsx's own `getRating()`/`ratingColor()` already establish — duplicated locally per this codebase's own "duplicate small per-file logic" convention. Used for the "Redirect Health" ring's own real `activeCount/totalCount` percentage below. */
const getRating = (score: number): string => {
	if (score >= 70) {
		return __('Good', 'vulopilot');
	}
	if (score >= 40) {
		return __('Needs Work', 'vulopilot');
	}
	return __('At Risk', 'vulopilot');
};

const ratingColor = (score: number): string => {
	if (score >= 70) {
		return 'green';
	}
	if (score >= 40) {
		return 'yellow';
	}
	return 'red';
};

/**
 * `$wpdb`'s own raw row shape — every numeric column comes back as a PHP
 * string once JSON-encoded (confirmed live: `redirect_type: "307"`, not
 * `307`), so this normalizes the fields this file actually compares
 * (`===`) or does arithmetic on into real JS numbers right at the fetch
 * boundary — the one place that needs to happen, rather than every
 * comparison site remembering to `Number()` it.
 */
const normalizeRedirectRow = (row: RedirectRow): RedirectRow => ({
	...row,
	id: Number(row.id),
	redirect_type: Number(row.redirect_type) as 301 | 302 | 307,
	hit_count: Number(row.hit_count),
	is_active: Number(row.is_active) as 0 | 1,
});

const fetchAllRedirects = async (): Promise<RedirectRow[]> => {
	let page = 1;
	let all: RedirectRow[] = [];

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const response = await getApiResponse<{ data: RedirectRow[]; total: number }>(
			getApiLink(appLocalizer, `redirects?per_page=${FETCH_PAGE_SIZE}&page=${page}&orderby=id&order=desc`),
			nonceHeaders
		);

		if (!response) {
			throw new Error('redirects fetch failed');
		}

		all = all.concat((response.data ?? []).map(normalizeRedirectRow));

		const gotFullPage = (response.data ?? []).length === FETCH_PAGE_SIZE;
		const moreRemain = all.length < (response.total ?? 0);

		if (!gotFullPage || !moreRemain || all.length >= MAX_REDIRECTS) {
			break;
		}

		page += 1;
	}

	return all;
};

/**
 * A redirect's `target_url` resolved down to a real, comparable path —
 * same-origin check as BrokenLinksSection.tsx's own `deriveSourcePath()` —
 * null for a target pointing at a different site entirely, which can
 * never chain into another row of THIS site's own redirect table.
 */
const resolveTargetPath = (targetUrl: string): string | null => {
	try {
		const target = new URL(targetUrl, appLocalizer.site_url);
		const site = new URL(appLocalizer.site_url);

		if (target.origin !== site.origin) {
			return null;
		}

		const path = target.pathname || '/';
		return '/' !== path ? path.replace(/\/$/, '') : path;
	} catch {
		return null;
	}
};

/**
 * Real chain detection over the actual `vulopilot_redirects` rows — a
 * redirect "chains" when its own `target_url` resolves to a path that is
 * itself another redirect's `source_path`: a visitor following it hits a
 * SECOND redirect before reaching a final destination. Nothing here is
 * simulated/estimated — it's a plain lookup across the same rows the
 * table already renders. Returns a `Map<redirectId, nextHopRow>` for
 * every redirect that chains into another one.
 */
const detectChains = (rows: RedirectRow[]): Map<number, RedirectRow> => {
	const bySourcePath = new Map<string, RedirectRow>();
	rows.forEach((row) => bySourcePath.set(row.source_path, row));

	const chains = new Map<number, RedirectRow>();

	rows.forEach((row) => {
		const targetPath = resolveTargetPath(row.target_url);

		if (!targetPath || targetPath === row.source_path) {
			return;
		}

		const nextHop = bySourcePath.get(targetPath);

		if (nextHop) {
			chains.set(row.id, nextHop);
		}
	});

	return chains;
};

type TypeFilter = 'all' | 301 | 302 | 307;
type StatusFilter = 'all' | 'active' | 'inactive' | 'broken';

/**
 * "Redirects" inner section of the "Crawl & URLs" tab. Real 301/302/307
 * redirect manager (`vulopilot_redirects`) — rebuilt to match the
 * reference mockup wherever the data genuinely supports it:
 *   - 5 real stat tiles: Total/Active (existing `is_active_counts`-shaped
 *     data), Redirect Chains (detectChains() above, a real computation
 *     over the actual rows — no scanner needed), Broken Redirects (a new
 *     real `GET /redirects/health` HEAD-check of each active redirect's
 *     own `target_url`, added alongside this pass since nothing
 *     previously checked that), and Last Checked (that same endpoint's
 *     real `checked_at`, plus the real cache-expiry time as an honest
 *     "next automatic check" — not a fabricated schedule).
 *   - A real 301/302/307 legend and type filter. A 4th "Meta Refresh"
 *     legend entry from the mockup is deliberately NOT reproduced: that's
 *     an HTML-level `<meta http-equiv="refresh">` mechanism, unrelated to
 *     this HTTP-redirect table, and nothing in this codebase implements
 *     it — adding a legend entry with no real rows behind it would be a
 *     decoration, not a filter.
 *   - No "All groups" filter: there is no group/category/label concept
 *     anywhere on a redirect row (confirmed against `Install.php`'s own
 *     schema and `RedirectRepository`) — the mockup's grouping has no
 *     real data behind it here.
 *   - Flat table, one row per redirect, matching the mockup's own
 *     From/To/Type/Hits/Created/Last Accessed/Status/Actions columns.
 */
const RedirectsSection = () => {
	const [allRedirects, setAllRedirects] = useState<RedirectRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [health, setHealth] = useState<RedirectHealthResponse | null>(null);
	const [isCheckingHealth, setIsCheckingHealth] = useState(false);

	const [searchTerm, setSearchTerm] = useState('');
	const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
	const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
	const [paged, setPaged] = useState(1);
	const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

	const [isFormOpen, setIsFormOpen] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [sourcePath, setSourcePath] = useState('');
	const [targetUrl, setTargetUrl] = useState('');
	const [redirectType, setRedirectType] = useState<string>('301');
	const [isSaving, setIsSaving] = useState(false);
	/** Row pending deletion, shown via the `confirmMode` popup below instead of `window.confirm()`. */
	const [deleteTarget, setDeleteTarget] = useState<RedirectRow | null>(null);

	const loadRedirects = () => {
		setIsLoading(true);

		fetchAllRedirects()
			.then((rows) => {
				setAllRedirects(rows);
				setError(null);
			})
			.catch(() =>
				setError(
					__(
						'Something went wrong fetching this data. Please try again.',
						'vulopilot'
					)
				)
			)
			.finally(() => setIsLoading(false));
	};

	const loadHealth = (force = false) => {
		setIsCheckingHealth(true);

		getApiResponse<RedirectHealthResponse>(
			getApiLink(appLocalizer, `redirects/health${force ? '?force=1' : ''}`),
			nonceHeaders
		)
			.then((response) => response && setHealth(response))
			.finally(() => setIsCheckingHealth(false));
	};

	useEffect(() => {
		loadRedirects();
		loadHealth();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		setPaged(1);
	}, [searchTerm, typeFilter, statusFilter]);

	const chains = detectChains(allRedirects);

	const isBroken = (row: RedirectRow): boolean =>
		!!health?.results?.[row.id]?.broken;

	const totalCount = allRedirects.length;
	const activeCount = allRedirects.filter((row) => 1 === row.is_active).length;
	const brokenCount = allRedirects.filter(isBroken).length;
	const chainCount = chains.size;

	const resetForm = () => {
		setEditingId(null);
		setSourcePath('');
		setTargetUrl('');
		setRedirectType('301');
	};

	const openAddForm = () => {
		resetForm();
		setIsFormOpen(true);
	};

	const openEditForm = (row: RedirectRow) => {
		setEditingId(row.id);
		setSourcePath(row.source_path);
		setTargetUrl(row.target_url);
		setRedirectType(String(row.redirect_type));
		setIsFormOpen(true);
	};

	const handleSaveRedirect = () => {
		setIsSaving(true);

		const endpoint = editingId ? `redirects/${editingId}` : 'redirects';

		sendApiResponse(appLocalizer, getApiLink(appLocalizer, endpoint), {
			...(editingId ? {} : { source_path: sourcePath }),
			target_url: targetUrl,
			redirect_type: Number(redirectType),
		})
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-redirect-save',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('Redirect saved.', 'vulopilot')
						: __(
							'Could not save this redirect — check the path and URL and try again.',
							'vulopilot'
						),
				});

				if (response) {
					setIsFormOpen(false);
					resetForm();
					loadRedirects();
				}
			})
			.finally(() => setIsSaving(false));
	};

	const handleToggleActive = (row: RedirectRow) => {
		sendApiResponse(
			appLocalizer,
			getApiLink(appLocalizer, `redirects/${row.id}`),
			{ is_active: row.is_active ? 0 : 1 }
		).then((response) => {
			if (response) {
				loadRedirects();
			}
		});
	};

	/** Opens the `confirmMode` popup — the actual delete runs from `handleConfirmDeleteRedirect` once the user confirms there. */
	const handleDeleteRedirect = (row: RedirectRow) => {
		setDeleteTarget(row);
	};

	const handleConfirmDeleteRedirect = () => {
		if (!deleteTarget) {
			return;
		}

		const row = deleteTarget;
		setDeleteTarget(null);

		sendApiResponse(
			appLocalizer,
			getApiLink(appLocalizer, `redirects/${row.id}/delete`),
			{}
		).then((response) => {
			NoticeManager.add({
				uniqueKey: 'vulopilot-redirect-delete',
				type: response ? 'success' : 'error',
				position: 'float',
				message: response
					? __('Redirect deleted.', 'vulopilot')
					: __('Could not delete this redirect.', 'vulopilot'),
			});

			if (response) {
				loadRedirects();
			}
		});
	};

	const visibleRedirects = allRedirects
		.filter((row) => 'all' === typeFilter || row.redirect_type === typeFilter)
		.filter((row) => {
			if ('all' === statusFilter) {
				return true;
			}
			if ('broken' === statusFilter) {
				return isBroken(row);
			}
			return 'active' === statusFilter ? 1 === row.is_active : 0 === row.is_active;
		})
		.filter((row) => {
			if ('' === searchTerm.trim()) {
				return true;
			}
			const term = searchTerm.trim().toLowerCase();
			return (
				row.source_path.toLowerCase().includes(term) ||
				row.target_url.toLowerCase().includes(term)
			);
		});

	const pageRows = visibleRedirects.slice(
		(paged - 1) * perPage,
		paged * perPage
	);

	const handleExportCsv = () => {
		if (!visibleRedirects.length) {
			NoticeManager.add({
				uniqueKey: 'redirect-export-empty',
				type: 'error',
				position: 'float',
				message: __('Nothing to export.', 'vulopilot'),
			});
			return;
		}

		const header = [
			__('From', 'vulopilot'),
			__('To', 'vulopilot'),
			__('Type', 'vulopilot'),
			__('Hits', 'vulopilot'),
			__('Created', 'vulopilot'),
			__('Last accessed', 'vulopilot'),
			__('Status', 'vulopilot'),
		];
		const lines = visibleRedirects.map((row) =>
			[
				row.source_path,
				row.target_url,
				row.redirect_type,
				row.hit_count,
				row.created_at,
				row.last_accessed_at ?? '',
				row.is_active ? __('Active', 'vulopilot') : __('Inactive', 'vulopilot'),
			]
				.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
				.join(',')
		);
		const csv = [header.join(','), ...lines].join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');

		link.href = url;
		link.download = 'redirects.csv';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	const headers = {
		// Same real `InformationItemComponent` "title + badges" shape
		// BrokenLinksSection.tsx's own row cell already uses — folds the
		// old separate "Type"/"Status" columns into this one row's own
		// real badges (redirect_type/is_active/isBroken(), all real
		// values already read elsewhere on this row) instead of 2 extra
		// columns.
		source_path: {
			label: __('From (Old URL)', 'vulopilot'),
			width: "65%",
			render: (row: RedirectRow) => {
				const pageUrl = `${appLocalizer.site_url}${row.source_path}`;

				return (
					<InformationItemComponent
						title={row.source_path}
						titleLink={pageUrl}
						badges={[
							{
								text: String(row.redirect_type),
								className: TYPE_BADGE_CLASS[row.redirect_type] ?? 'badge-info',
							},
							isBroken(row)
								? { text: __('Broken', 'vulopilot'), className: 'badge-failed' }
								: {
									text: row.is_active
										? __('Active', 'vulopilot')
										: __('Inactive', 'vulopilot'),
									className: row.is_active ? 'badge-active' : 'badge-inactive',
								},
							{
								text: sprintf(
									__('%1$s · %2$s', 'vulopilot'),
									sprintf(
										_n('%d Hit', '%d Hits', row.hit_count, 'vulopilot'),
										row.hit_count
									),
									row.last_accessed_at
										? formatWpDate(row.last_accessed_at)
										: __('Never', 'vulopilot')
								),
								className: 'blue',
							},

						]}
						descriptions={[
							{
								icon: 'link',
								label: __('New URL', 'vulopilot'),
								value: row.target_url,
							},
						]}
					/>
				);
			},
		},
		created_at: {
			label: __('Created', 'vulopilot'),
			render: (row: RedirectRow) => (
				<>
					{__('Created', 'vulopilot')} {formatWpDate(row.created_at)}
				</>
			),
		},
		actions: {
			label: __('Actions', 'vulopilot'),
			type: 'action',
			actions: [
				{
					label: __('Edit', 'vulopilot'),
					icon: 'edit',
					type: 'button',
					color: 'text-blue',
					onClick: (row: Record<string, unknown>) => {
						openEditForm(row as unknown as RedirectRow);
					},
				},
				{
					label: __('Delete', 'vulopilot'),
					icon: 'delete',
					type: 'button',
					color: 'text-red',
					onClick: (row: Record<string, unknown>) => {
						handleDeleteRedirect(row as unknown as RedirectRow);
					},
				},
				{
					label: (row: Record<string, unknown>) =>
						(row as unknown as RedirectRow).is_active
							? __('Deactivate', 'vulopilot')
							: __('Activate', 'vulopilot'),
					color: (row: Record<string, unknown>) =>
						(row as unknown as RedirectRow).is_active
							? __('text-pink', 'vulopilot')
							: __('text-green', 'vulopilot'),
					icon: 'toggle',
					type: 'button',
					onClick: (row: Record<string, unknown>) => {
						handleToggleActive(row as unknown as RedirectRow);
					},
				},
			],
		},
	};

	const headerAction = (
		<ButtonInput
			buttons={{
				text: __('Add redirect', 'vulopilot'),
				icon: 'plus',
				onClick: openAddForm,
			}}
		/>
	);

	if (error) {
		return (
			<ColumnComponent>
				<CardComponent
					title={__('Redirects', 'vulopilot')}
					titleIcon="link"
					desc={__('Every redirect rule you\'ve set up.', 'vulopilot')}
					action={headerAction}
				>
					<ModuleGuardComponent
						icon="error"
						title={__('Could not load redirects', 'vulopilot')}
						desc={error}
						buttonText={__('Retry', 'vulopilot')}
						onButtonClick={loadRedirects}
					/>
				</CardComponent>
			</ColumnComponent>
		);
	}

	const nextCheckLabel = health
		? formatWpDate(
			new Date((health.checked_at + HEALTH_CACHE_SECONDS) * 1000).toISOString()
		)
		: null;

	// Real percentage of redirects that are active — the one real 0-100
	// figure these 5 stats naturally produce (the other 4 are plain counts
	// or a date), so it's the only honest candidate for this card's own
	// ring; matching SeoTab.tsx's/GeoScoreSection.tsx's real ring shape
	// rather than fabricating a synthetic "redirect score" no real
	// weighting exists for.
	const activePercent = totalCount
		? Math.round((activeCount / totalCount) * 100)
		: 0;

	return (
		<ContainerComponent>
			<ColumnComponent grid={6}>
				<CardComponent
					title={__('Redirect Health', 'vulopilot')}
					titleIcon="link"
					desc={__('How many of your redirects are active and working.', 'vulopilot')}
					// Grid-wide, not per-tile — same real "both real fetches start
					// together" reasoning the old `MetricTileComponent`'s own
					// combined `isLoading` docblock already gave; unchanged by
					// this restructure.
					isLoading={isLoading || isCheckingHealth}
				>
					<div className="overall-score-wrapper">
						<div className="overall-score-summary">
								<ChartComponent
									type="ring"
									height={200}
									// Top-level `color` — `type="ring"` only ever
									// paints its stroke from this prop, never from
									// `data[].color` below (see SeoTab.tsx's own
									// identical fix) — without it the ring stayed
									// `ChartComponent`'s default brand purple
									// regardless of the real active-redirect
									// percentage.
									color={
										COLOR_PALETTE[
											ratingColor(activePercent) as keyof typeof COLOR_PALETTE
										]
									}
									centerLabel={
										<>
											<TypographyComponent
												variant={'h1'}
												color={ratingColor(activePercent)}
											>
												{activePercent}
											</TypographyComponent>
											<TypographyComponent variant={'h4'}>
												{getRating(activePercent)}
											</TypographyComponent>
										</>
									}
									data={[
										{
											label: __('Active', 'vulopilot'),
											value: activePercent,
											color: COLOR_PALETTE[
												ratingColor(activePercent) as keyof typeof COLOR_PALETTE
											],
										},
										{
											label: __('Remaining', 'vulopilot'),
											value: 100 - activePercent,
											color: '#e5e7eb',
										},
									]}
								/>
								<TypographyComponent variant={'h3'} color="text-green">
									{__('Redirect Health', 'vulopilot')}
								</TypographyComponent>
								<div className="desc">
									{__('How many of your redirects are active and working.', 'vulopilot')}
								</div>
						</div>
						{/*
					 * Same real `ListComponent` "mini-card report" row
					 * shape SeoTab.tsx's/BrokenLinksSection.tsx's own
					 * stat rows already use — these 5 real values (a
					 * count, a count, a count, a count, and a date)
					 * don't each have their own 0-100 score the way
					 * SEO's/GEO's category rows do, so each row's own
					 * trailing value is just its real number/date, not a
					 * fabricated "/100".
					 */}
					 <div className="overall-score-summary">
						<ListComponent
							className="mini-card report hover seo-health-score-category-list"
							loading={isLoading || isCheckingHealth}
							items={[
								{
									id: 'total',
									icon: 'plus red',
									title: __('Total Redirects', 'vulopilot'),
									// desc: __('All redirects found', 'vulopilot'),
									tags: (
										<TypographyComponent
											variant="h5"
											weight="bold"
											className="seo-health-score-row-value"
										>
											{totalCount}
										</TypographyComponent>
									),
								},
								{
									id: 'active',
									icon: 'check green',
									title: __('Active', 'vulopilot'),
									// desc: sprintf(
									// 	/* translators: %d: percentage of redirects that are active. */
									// 	__('Working correctly · %d%% of total', 'vulopilot'),
									// 	activePercent
									// ),
									tags: (
										<TypographyComponent
											variant="h5"
											weight="bold"
											color="green"
											className="seo-health-score-row-value"
										>
											{activeCount}
										</TypographyComponent>
									),
								},
								{
									id: 'chains',
									icon: 'link yellow',
									title: __('Redirect Chains', 'vulopilot'),
									// desc: chainCount
									// 	? sprintf(
									// 		/* translators: %d: number of chains detected. */
									// 		_n('%d chain detected — needs review', '%d chains detected — needs review', chainCount, 'vulopilot'),
									// 		chainCount
									// 	)
									// 	: __('No chains detected', 'vulopilot'),
									tags: (
										<TypographyComponent
											variant="h5"
											weight="bold"
											color="yellow"
											className="seo-health-score-row-value"
										>
											{chainCount}
										</TypographyComponent>
									),
								},
								{
									id: 'broken',
									icon: 'error pink',
									title: __('Broken Redirects', 'vulopilot'),
									// desc: sprintf(
									// 	/* translators: %d: percentage of redirects that are broken. */
									// 	__('Needs attention · %d%% of total', 'vulopilot'),
									// 	totalCount ? Math.round((brokenCount / totalCount) * 100) : 0
									// ),
									tags: (
										<TypographyComponent
											variant="h5"
											weight="bold"
											color="red"
											className="seo-health-score-row-value"
										>
											{brokenCount}
										</TypographyComponent>
									),
								},
								{
									id: 'last-checked',
									icon: 'calendar blue',
									title: __('Last Checked', 'vulopilot'),
									// desc: nextCheckLabel
									// 	? sprintf(
									// 		/* translators: %s: formatted date/time of the next automatic health check. */
									// 		__('Next automatic check: %s', 'vulopilot'),
									// 		nextCheckLabel
									// 	)
									// 	: __('Broken-redirect check has not run yet.', 'vulopilot'),
									tags: (
										<TypographyComponent
											as="span"
											variant="body-md"
											weight="bold"
											className="seo-health-score-row-value"
										>
											{health
												? formatWpDate(new Date(health.checked_at * 1000).toISOString())
												: __('Never', 'vulopilot')}
										</TypographyComponent>
									),
								},
							]}
						/>
						</div>
					</div>
				</CardComponent>
			</ColumnComponent>
			<ColumnComponent>
				<CardComponent
					title={__('Redirects', 'vulopilot')}
					titleIcon="link"
					desc={__('Every real redirect rule you\'ve set up, searchable and filterable.', 'vulopilot')}
				>
					<TableCard
						showMenu={false}
						variant="transparent"
						className="redirect-table"
						hideHeader={true}
						headers={headers}
						rows={pageRows}
						ids={pageRows.map((row) => row.id)}
						totalRows={visibleRedirects.length}
						isLoading={isLoading}
						search={{
							placeholder: __('Search by URL or redirect…', 'vulopilot'),
						}}
						filters={[
							{
								key: 'type',
								label: __('Type', 'vulopilot'),
								type: 'select',
								size: 9,
								options: [
									{ label: __('All types', 'vulopilot'), value: 'all' },
									{ label: '301', value: '301' },
									{ label: '302', value: '302' },
									{ label: '307', value: '307' },
								],
							},
							{
								key: 'status',
								label: __('Status', 'vulopilot'),
								type: 'select',
								size: 9,
								options: [
									{ label: __('All status', 'vulopilot'), value: 'all' },
									{ label: __('Active', 'vulopilot'), value: 'active' },
									{ label: __('Inactive', 'vulopilot'), value: 'inactive' },
									{ label: __('Broken', 'vulopilot'), value: 'broken' },
								],
							},
						]}
						buttonActions={[
							{
								label: __('Export CSV', 'vulopilot'),
								icon: 'export',
								color: 'border-purple',
								onClick: handleExportCsv,
							},
							{
								label: __('Add redirect', 'vulopilot'),
								icon: 'plus',
								onClick: openAddForm,
							},
						]}
						headerHide={true}
						onQueryUpdate={(query: {
							paged?: number | string;
							per_page?: number | string;
							searchValue?: string;
							filter?: Record<string, string>;
						}) => {
							setPaged(Number(query.paged) || 1);
							setPerPage(Number(query.per_page) || DEFAULT_PER_PAGE);
							setSearchTerm(query.searchValue ?? '');
							const typeValue = query.filter?.type;
							setTypeFilter(
								!typeValue || 'all' === typeValue
									? 'all'
									: (Number(typeValue) as TypeFilter)
							);
							setStatusFilter(
								(query.filter?.status as StatusFilter) ?? 'all'
							);
						}}
						emptyMessage={__(
							'No redirects yet — add one, or convert an entry from the 404s tab.',
							'vulopilot'
						)}
					/>
				</CardComponent>

				<PopupComponent
					open={isFormOpen}
					onClose={() => {
						setIsFormOpen(false);
						resetForm();
					}}
					width={28}
					header={{
						title: editingId
							? __('Edit redirect', 'vulopilot')
							: __('Add redirect', 'vulopilot'),
					}}
					footer={
						<ButtonInput
							buttons={{
								text: isSaving ? __('Saving…', 'vulopilot') : __('Save', 'vulopilot'),
								onClick: handleSaveRedirect,
								disabled: isSaving,
							}}
						/>
					}
				>
					<FormGroupWrapperComponent>
						<FormGroupComponent label={__('Old page url', 'vulopilot')}>
							<TextInput
								name="source_path"
								inputLabel={__('From (path)', 'vulopilot')}
								placeholder={__('/old-page/', 'vulopilot')}
								value={sourcePath}
								disabled={!!editingId}
								onChange={(newValue) => setSourcePath(newValue as string)}
							/>
						</FormGroupComponent>
						<FormGroupComponent label={__('New page url', 'vulopilot')}>
							<TextInput
								name="target_url"
								inputLabel={__('To', 'vulopilot')}
								placeholder={__('https://example.com/new-page/', 'vulopilot')}
								value={targetUrl}
								onChange={(newValue) => setTargetUrl(newValue as string)}
							/>
						</FormGroupComponent>
						<FormGroupComponent label={__('Type', 'vulopilot')}>
							<SelectInput
								name="redirect_type"
								inputLabel={__('Type', 'vulopilot')}
								value={redirectType}
								options={[
									{ label: '301 (Permanent)', value: '301' },
									{ label: '302 (Temporary)', value: '302' },
									{ label: '307 (Temporary, method-preserving)', value: '307' },
								]}
								onChange={(newValue) => setRedirectType(newValue as string)}
								size="16rem"
							/>
						</FormGroupComponent>
					</FormGroupWrapperComponent>
				</PopupComponent>

				<PopupComponent
					position="lightbox"
					open={!!deleteTarget}
					onClose={() => setDeleteTarget(null)}
					width={31.25}
					height="auto"
				>
					<ShowProPopup
						confirmMode
						title={__('Delete Redirect', 'vulopilot')}
						confirmMessage={__('Delete this redirect? This cannot be undone.', 'vulopilot')}
						confirmYesText={__('Delete', 'vulopilot')}
						confirmNoText={__('Cancel', 'vulopilot')}
						onConfirm={handleConfirmDeleteRedirect}
						onCancel={() => setDeleteTarget(null)}
					/>
				</PopupComponent>
			</ColumnComponent>
		</ContainerComponent>
	);
};

export default RedirectsSection;
