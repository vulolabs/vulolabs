/* global appLocalizer */
import { useEffect, useMemo, useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, COLOR_PALETTE } from '@zyra/core';
import {
	AnalyticsComponent,
	CardComponent,
	ChartComponent,
	ColumnComponent,
	ContainerComponent,
	FormGroupComponent,
	FormGroupWrapperComponent,
	ListComponent,
	ModuleGuardComponent,
	NoticeComponent,
	TooltipComponent,
	TypographyComponent,
} from '@zyra/components';
import { SelectInput, ToggleInput } from '@zyra/inputs';
import { TableCard } from '@zyra/table';
import { formatWpDate } from '../../services/formatWpDate';
import RecommendedFixesCard from './RecommendedFixesCard';
import './Performance.scss';

/** `id: 'connections'` (Settings/GetStarted/Connections.ts) — where the real PageSpeed Insights API key field this notice's own "no PSI connected" message used to describe in text actually lives (merged in from the old standalone `pagespeed-insights` tab per direct instruction). */
const PERFORMANCE_SETTINGS_URL = '?page=vulopilot#&tab=settings&subtab=connections';

interface PageSpeedRow {
	id: number;
	url: string;
	title: string;
	page_type: string;
	load_time_ms: number | null;
	score: number | null;
	status: 'slow' | 'needs_improvement' | 'good' | null;
	mobile_score: number | null;
	desktop_score: number | null;
	main_issue: string | null;
	page_size_bytes: number | null;
	requests_count: number | null;
	lcp_ms: number | null;
	lcp_rating: string | null;
	inp_ms: number | null;
	inp_rating: string | null;
	cls_thousandths: number | null;
	cls_rating: string | null;
	scanned_at: string;
}

interface PageSpeedSummary {
	total: number;
	slow: number;
	very_slow: number;
	needs_improvement: number;
	good: number;
	avg_score: number | null;
	avg_mobile_score: number | null;
	avg_load_time_ms: number | null;
	last_scanned_at: string | null;
}

interface PageSpeedIssue {
	issue: string;
	affected_pages: number;
}

interface PageSpeedResponse {
	summary: PageSpeedSummary;
	status_counts: Record<string, number>;
	top_issues: PageSpeedIssue[];
	data: PageSpeedRow[];
	total: number;
}

interface ScoreSnapshot {
	snapshot_date: string;
	performance_score: number;
}

const TREND_DAY_OPTIONS = [
	{ label: __('7D', 'vulopilot'), value: '7' },
	{ label: __('30D', 'vulopilot'), value: '30' },
	{ label: __('90D', 'vulopilot'), value: '90' },
];

const PAGE_TYPE_ICONS: Record<string, string> = {
	homepage: 'home',
	page: 'document',
	post: 'web-page-website',
	shop: 'storefront',
	cart: 'cart',
	checkout: 'credit-card',
	product: 'product',
	category: 'category',
};

const PAGE_TYPE_LABELS: Record<string, string> = {
	homepage: __('Homepage', 'vulopilot'),
	page: __('Page', 'vulopilot'),
	post: __('Post', 'vulopilot'),
	shop: __('Shop Page', 'vulopilot'),
	cart: __('Cart Page', 'vulopilot'),
	checkout: __('Checkout Page', 'vulopilot'),
	product: __('Product Page', 'vulopilot'),
	category: __('Category Page', 'vulopilot'),
};

/** Same real 80/50/25 score bands `PageSpeedRepository::get_summary()` itself uses (`SCORE_GOOD`/`SCORE_NEEDS_IMPROVEMENT`/`SCORE_VERY_SLOW`) — a real, score-tier summary line for the average-score ring, not a fixed "in good shape" sentence regardless of score (same convention OverallScoreWidget.tsx's own `getRatingSummary()` establishes). */
const avgScoreSummary = (score: number | null): string => {
	if (null === score) {
		return __('Not enough scanned pages yet to compute an average score.', 'vulopilot');
	}
	if (score >= 90) {
		return __('Your pages are loading excellently.', 'vulopilot');
	}
	if (score >= 80) {
		return __('Your pages are loading well, but there are still a few pages that can be improved.', 'vulopilot');
	}
	if (score >= 50) {
		return __('Several pages could use performance improvements.', 'vulopilot');
	}
	return __('Many of your pages need performance attention.', 'vulopilot');
};

const ratingFor = (score: number | null): { label: string; className: 'good' | 'needs-improvement' | 'poor' | 'unknown' } => {
	if (null === score) {
		return { label: __('Not scored yet', 'vulopilot'), className: 'unknown' };
	}

	if (score >= 80) {
		return { label: __('Good', 'vulopilot'), className: 'good' };
	}

	if (score >= 50) {
		return { label: __('Needs Work', 'vulopilot'), className: 'needs-improvement' };
	}

	return { label: __('At Risk', 'vulopilot'), className: 'poor' };
};

/** Real zyra palette hex (`@zyra/core`'s `COLOR_PALETTE`) — same `ratingFor()`-keyed map PerformanceScoreCard.tsx's own `RATING_COLOR` already uses for its ring tiles, reused here so this table's per-row score ring and that card's own score rings agree on what "good"/"poor" look like. */
const RATING_RING_COLOR: Record<'good' | 'needs-improvement' | 'poor' | 'unknown', string> = {
	good: COLOR_PALETTE.green,
	'needs-improvement': COLOR_PALETTE.orange,
	poor: COLOR_PALETTE.red,
	unknown: COLOR_PALETTE.gray,
};

const ScorePill = ({ score }: { score: number | null }) => {
	const rating = ratingFor(score);

	return (
		<ChartComponent
			type="ring"
			height={40}
			color={RATING_RING_COLOR[rating.className]}
			data={[{ value: score ?? 0 }]}
			centerLabel={
				<span className={`page-speed-score-ring-value ${rating.className}`}>
					{null === score ? '—' : score}
				</span>
			}
		/>
	);
};

/** Real byte count → a human string, same MB/KB thresholds browser devtools use. */
const formatBytes = (bytes: number | null): string => {
	if (null === bytes) {
		return '—';
	}

	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	if (bytes >= 1024) {
		return `${(bytes / 1024).toFixed(0)} KB`;
	}

	return `${bytes} B`;
};

/**
 * Google's own real CrUX field-data category ('FAST'/'AVERAGE'/'SLOW') for
 * one Core Web Vital, passed through verbatim from PageSpeedScanner — this
 * just maps that real verdict onto this file's own good/needs-improvement/
 * poor dot palette, `unknown` (gray) when CrUX had no real field data for
 * this URL+metric (a real "not enough traffic" case, not fabricated).
 */
const CWV_DOT_CLASS: Record<string, string> = {
	FAST: 'good',
	AVERAGE: 'needs-improvement',
	SLOW: 'poor',
};

/** `ratingFor()`'s own className → the closest `admin-badge` color name — same `BadgeComponent`'s own `color` contract (a real admin-badge modifier) the summary `ListComponent` row tags below use, not a raw hex, unlike the fixed `$vulopilot-rating-*` hex values the old summary tiles painted directly. No badge color exists for "very poor" specifically, so it shares 'red' with "poor". */
const RATING_BADGE_COLOR: Record<string, string> = {
	good: 'green',
	'needs-improvement': 'orange',
	poor: 'red',
	'very-poor': 'red',
	unknown: '',
};

const CWV_METRICS = [
	{ key: 'lcp', label: 'LCP', ratingKey: 'lcp_rating' as const },
	{ key: 'inp', label: 'INP', ratingKey: 'inp_rating' as const },
	{ key: 'cls', label: 'CLS', ratingKey: 'cls_rating' as const },
];

/**
 * Real Google CrUX field-data dots — one per metric, gray/"unknown" when
 * that metric has no real field data for this page (common for low-traffic
 * pages; CrUX only reports once enough real visits exist). Never a
 * fabricated color.
 */
const CoreWebVitalsDots = ({ row }: { row: PageSpeedRow }) => (
	<div className="page-speed-cwv-dots">
		{CWV_METRICS.map((metric) => {
			const rating = row[metric.ratingKey];
			const dotClass = rating ? (CWV_DOT_CLASS[rating] ?? 'unknown') : 'unknown';

			return (
				<span
					key={metric.key}
					className="page-speed-cwv-item"
					title={
						rating
							? `${metric.label}: ${rating}`
							: `${metric.label}: ${__('No field data yet', 'vulopilot')}`
					}
				>
					<span className={`page-speed-cwv-dot ${dotClass}`} />
					<span className="page-speed-cwv-label">{metric.label}</span>
				</span>
			);
		})}
	</div>
);

const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;

/**
 * "Slow Pages" tab of "Performance" — real per-page speed data from
 * `GET /page-speed` (Repositories\PageSpeedRepository, populated in the
 * background by Services\PageSpeedScanner). Fetched once per mount/scan
 * (this plugin's own page counts are bounded — see PageSpeedScanner's own
 * MAX_PER_TYPE — so client-side filter/search/sort is simpler than wiring
 * up TableCard, whose fixed header `type`s (text/currency/date/badge/
 * action/id/content/status) can't render this page's colored score pill +
 * Core Web Vitals dots per cell).
 *
 * Mobile/Desktop score columns, Page Size/Requests, and the Core Web
 * Vitals dots all only appear once at least one real row has that data —
 * i.e. once a `psi_api_key` is configured (Settings → Scanning →
 * Performance) and the background scan has reached that row — otherwise a
 * single real "Score" column is shown and the PSI-only columns are
 * dropped entirely, same PSI-key-gated fallback PerformanceScoreCard.tsx's
 * own Overall Speed Score card already uses; never a fabricated split or
 * placeholder numbers.
 *
 * The "Performance Trend" tile + sparkline reuses the real, already-dated
 * `GET /performance-score-snapshots` history (SpeedHistoryCard.tsx's own
 * data source, one row per real day) rather than inventing a per-page
 * load-time trend — this table itself has none (`replace_for_url()` keeps
 * only each page's latest scan, never a history). That snapshot is a
 * sitewide 0-100 performance score, not a Slow-Pages-specific or literal
 * seconds figure, so the tile is honestly labeled "pts" and "Performance
 * trend", not a fabricated "-1.4s" claim.
 */
const SlowPagesTab = () => {
	const [response, setResponse] = useState<PageSpeedResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [statusFilter, setStatusFilter] = useState('all');
	const [pageTypeFilter, setPageTypeFilter] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [detailRow, setDetailRow] = useState<PageSpeedRow | null>(null);
	const [trendDays, setTrendDays] = useState('30');
	// Real "which real PSI device's own scores to show" toggle for the
	// "Slow Pages Score" summary card's header — mobile first, same real
	// "mobile is the default device" convention PageSpeedScanner.php's own
	// docblock already documents for which PSI response feeds every other
	// mobile-first field on this page. Only meaningful once a PSI key is
	// configured (`hasDeviceScores`); nothing reads this otherwise.
	const [scoreDevice, setScoreDevice] = useState<'mobile' | 'desktop'>('mobile');
	const [trend, setTrend] = useState<ScoreSnapshot[]>([]);
	const [isTrendLoading, setIsTrendLoading] = useState(true);
	// This table's own rows are all fetched once (per_page=200) and
	// filtered/searched entirely client-side (see this file's own docblock)
	// — TableCard itself never slices `rows` server-side, it just displays
	// whatever page-worth it's handed and hands page changes back via
	// `onQueryUpdate`, so this table now does that same slicing locally.
	const [paged, setPaged] = useState(1);
	const [perPage, setPerPage] = useState(10);

	const load = () => {
		setIsLoading(true);
		setError(null);

		getApiResponse<PageSpeedResponse>(
			getApiLink(appLocalizer, 'page-speed') + '?per_page=200',
			{ headers: { 'X-WP-Nonce': appLocalizer.nonce } }
		)
			.then((data) => {
				if (data) {
					setResponse(data);
				} else {
					setError(
						__(
							'Could not load Slow Pages.',
							'vulopilot'
						)
					);
				}
			})
			.finally(() => setIsLoading(false));
	};

	useEffect(() => {
		load();
	}, []);

	useEffect(() => {
		let cancelled = false;
		setIsTrendLoading(true);

		getApiResponse<ScoreSnapshot[]>(
			`${getApiLink(appLocalizer, 'performance-score-snapshots')}?days=${trendDays}`,
			{ headers: { 'X-WP-Nonce': appLocalizer.nonce } }
		)
			.then((data) => {
				if (!cancelled) {
					setTrend(
						(data ?? []).map((row) => ({
							snapshot_date: row.snapshot_date,
							performance_score: Number(row.performance_score),
						}))
					);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setIsTrendLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [trendDays]);

	// The "Scan Again" trigger for this real per-page speed scan
	// (`POST /page-speed`) lives in Performance.tsx's own page header now —
	// a real, separate job from the site-wide `categories=['performance']`
	// scan RunScanHeaderExtra's own "Run Speed Test" button already
	// triggers there (PageSpeedScanner isn't registered in ScannerRegistry,
	// so that category scan never runs it) — see Performance.tsx's own
	// `handleSlowPagesScan`.

	const rows = response?.data ?? [];
	const hasDeviceScores = rows.some((row) => null !== row.mobile_score);
	const hasPsiDetail = rows.some((row) => null !== row.page_size_bytes);
	// Real average — `avg_mobile_score` only when a PSI key is configured
	// (per-device split available), `avg_score` otherwise (PageSpeedRepository::get_summary()
	// always computes both from the same real rows; this tile just needs to
	// read the one that matches what the rest of this page is showing).
	// Was previously hardcoded to `avg_mobile_score` alone, so this tile
	// showed "—" even with real, non-empty scanned scores whenever no PSI
	// key was configured — the common case.
	const avgScore = response?.summary
		? (hasDeviceScores
			? response.summary.avg_mobile_score
			: response.summary.avg_score)
		: null;
	const avgLoadTimeMs = response?.summary?.avg_load_time_ms ?? null;

	/**
	 * Real average mobile/desktop PSI scores, computed client-side from this
	 * same `rows` fetch — `PageSpeedRepository::get_summary()` only returns
	 * an aggregate `avg_mobile_score` (no `avg_desktop_score` field exists
	 * server-side), but every row here already carries its own real
	 * `mobile_score`/`desktop_score` (`PageSpeedScanner`'s own real PSI
	 * fetch), so this reduces those same real per-row values the table
	 * itself already renders rather than a second, invented number.
	 */
	const avgDeviceScore = (key: 'mobile_score' | 'desktop_score'): number | null => {
		const scores = rows
			.map((row) => row[key])
			.filter((score): score is number => null !== score);

		return scores.length
			? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
			: null;
	};

	const avgMobileScore = hasDeviceScores ? avgDeviceScore('mobile_score') : null;
	const avgDesktopScore = hasDeviceScores ? avgDeviceScore('desktop_score') : null;

	const trendDelta =
		trend.length >= 2
			? trend[trend.length - 1].performance_score - trend[0].performance_score
			: null;
	const isTrendImproving = null !== trendDelta && trendDelta >= 0;

	const pageTypeOptions = useMemo(() => {
		const present = Array.from(new Set(rows.map((row) => row.page_type)));
		return [
			{ label: __('All Page Types', 'vulopilot'), value: '' },
			...present.map((type) => ({
				label: PAGE_TYPE_LABELS[type] ?? type,
				value: type,
			})),
		];
	}, [rows]);

	const filteredRows = useMemo(() => {
		return rows.filter((row) => {
			if ('all' !== statusFilter && row.status !== statusFilter) {
				return false;
			}

			if (pageTypeFilter && row.page_type !== pageTypeFilter) {
				return false;
			}

			if (
				searchTerm &&
				!row.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
				!row.url.toLowerCase().includes(searchTerm.toLowerCase())
			) {
				return false;
			}

			return true;
		});
	}, [rows, statusFilter, pageTypeFilter, searchTerm]);

	// A stale page 3 left over from a previous filter could otherwise show
	// an empty page once a new filter/search narrows the real result set.
	useEffect(() => {
		setPaged(1);
	}, [statusFilter, pageTypeFilter, searchTerm]);

	// Auto-open the first row's details whenever the filtered set changes
	// and nothing valid is currently selected — "always open 1st table of
	// details" on load, and keeps a real detail panel visible after
	// filters/search narrow or reorder rows, rather than leaving a stale
	// row's panel (or an empty one) on screen.
	useEffect(() => {
		if (0 === filteredRows.length) {
			setDetailRow(null);
			return;
		}

		const stillVisible = filteredRows.some((row) => row.id === detailRow?.id);

		if (!stillVisible) {
			setDetailRow(filteredRows[0]);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filteredRows]);

	const pageRows = filteredRows.slice((paged - 1) * perPage, paged * perPage);

	const statusCounts = response?.status_counts ?? {};
	const summary = response?.summary ?? null;

	/**
	 * The whole "Slow Pages Score" summary card's own real data for
	 * whichever device the header toggle has selected — the ring's score
	 * itself (`avgMobileScore`/`avgDesktopScore` above) plus a real
	 * Slow/Good page count recomputed from this same real per-row
	 * `mobile_score`/`desktop_score` (same `ratingFor()` 80/50 bands the
	 * rest of this page already uses), not the server's own device-agnostic
	 * `summary.slow`/`summary.good` (those count by the real server-response
	 * `score`/`status`, which has no device concept at all). Falls back to
	 * that device-agnostic summary when no PSI key is configured — there's
	 * no real per-device score to switch between yet.
	 */
	const deviceScoreKey = 'mobile' === scoreDevice ? 'mobile_score' : 'desktop_score';
	const displayScore = hasDeviceScores
		? ('mobile' === scoreDevice ? avgMobileScore : avgDesktopScore)
		: avgScore;
	const displayScoreRating = ratingFor(displayScore);

	const deviceScoredRows = hasDeviceScores
		? rows.filter((row) => null !== row[deviceScoreKey])
		: [];
	const deviceSlowCount = hasDeviceScores
		? deviceScoredRows.filter((row) => (row[deviceScoreKey] as number) < 50).length
		: (summary?.slow ?? 0);
	const deviceGoodCount = hasDeviceScores
		? deviceScoredRows.filter((row) => (row[deviceScoreKey] as number) >= 80).length
		: (summary?.good ?? 0);
	const deviceTotalScored = hasDeviceScores
		? deviceScoredRows.length
		: (summary?.total ?? 0);
	const topIssues = response?.top_issues ?? [];


	// Fed to TableCard's own `categoryCounts`/`activeCategory` — same
	// status-filter pills, now rendered by the table itself (`admin-top-filter`)
	// instead of hand-rolled `<button>`s, same convention IssuesList.tsx's own
	// TableCard already uses.
	const statusCategoryCounts = [
		// Same "All" pill shape IssuesList.tsx's own `tableCategoryCounts`
		// already establishes for this same `TableCard`/`categoryCounts`
		// prop — `statusFilter`'s own initial state and filter check
		// (`'all' !== statusFilter`) already treat `'all'` as the real
		// no-filter sentinel; this was just the missing pill for it. Real
		// `rows.length`, not a sum of the 3 named tiers below — a page
		// whose `status` came back `null` (not yet scored) still counts
		// toward the real total here, even though it can't match any of
		// those 3 named filters.
		{ value: 'all', label: __('All', 'vulopilot'), count: rows.length },
		{ value: 'slow', label: __('Slow', 'vulopilot'), count: statusCounts.slow ?? 0 },
		{
			value: 'needs_improvement',
			label: __('Needs Work', 'vulopilot'),
			count: statusCounts.needs_improvement ?? 0,
		},
		{ value: 'good', label: __('Good', 'vulopilot'), count: statusCounts.good ?? 0 },
	];

	const handleExport = () => {
		const headerRow = [
			'Page',
			'URL',
			'Type',
			...(hasDeviceScores ? ['Mobile Score', 'Desktop Score'] : ['Score']),
			'Load Time (ms)',
			...(hasPsiDetail ? ['Page Size (bytes)', 'Requests', 'LCP (ms)', 'LCP Rating', 'INP (ms)', 'INP Rating', 'CLS (thousandths)', 'CLS Rating'] : []),
			'Main Issue',
		];

		const lines = [headerRow.map(csvEscape).join(',')];

		filteredRows.forEach((row) => {
			const cells = [
				row.title,
				row.url,
				PAGE_TYPE_LABELS[row.page_type] ?? row.page_type,
				...(hasDeviceScores ? [row.mobile_score ?? '', row.desktop_score ?? ''] : [row.score ?? '']),
				row.load_time_ms ?? '',
				...(hasPsiDetail
					? [
						row.page_size_bytes ?? '',
						row.requests_count ?? '',
						row.lcp_ms ?? '',
						row.lcp_rating ?? '',
						row.inp_ms ?? '',
						row.inp_rating ?? '',
						row.cls_thousandths ?? '',
						row.cls_rating ?? '',
					]
					: []),
				row.main_issue ?? '',
			];

			lines.push(cells.map((cell) => csvEscape(String(cell))).join(','));
		});

		const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'slow-pages.csv';
		anchor.click();
		URL.revokeObjectURL(url);
	};

	if (error) {
		return (
			<ContainerComponent>
				<ColumnComponent>
					<CardComponent
						title={__('Slow Pages', 'vulopilot')}
						titleIcon="error"
						desc={__('Pages with the slowest real load times.', 'vulopilot')}
					>
						<ModuleGuardComponent
							icon="error"
							title={__('Could not load Slow Pages', 'vulopilot')}
							desc={error}
							buttonText={__('Retry', 'vulopilot')}
							onButtonClick={load}
						/>
					</CardComponent>
				</ColumnComponent>
			</ContainerComponent>
		);
	}

	return (
		<ContainerComponent>
			<ColumnComponent>
				<CardComponent
					isLoading={isLoading || isTrendLoading}
					action={
						hasDeviceScores && (
							<ToggleInput
								value={scoreDevice}
								modules={[]}
								variant="pill"
								options={[
									{ key: 'desktop', value: 'desktop', label: __('Desktop', 'vulopilot') },
									{ key: 'mobile', value: 'mobile', label: __('Mobile', 'vulopilot') },
								]}
								onChange={(value) => setScoreDevice(value as 'mobile' | 'desktop')}
							/>
						)
					}
				>
					<div className="overall-score-wrapper">
						<div className="overall-score-summary">
							<ChartComponent
								type="ring"
								height={200}
								color={RATING_RING_COLOR[displayScoreRating.className]}
								centerLabel={
									<>
										<TypographyComponent
											variant={'h1'}
											color={RATING_BADGE_COLOR[displayScoreRating.className] || 'gray'}
										>
											{null === displayScore ? '—' : displayScore}
										</TypographyComponent>
										<TypographyComponent variant={'h4'}>
											{displayScoreRating.label}
										</TypographyComponent>
									</>
								}
								data={[
									{
										label: __('Score', 'vulopilot'),
										value: displayScore ?? 0,
										color: RATING_RING_COLOR[displayScoreRating.className],
									},
									{
										label: __('Remaining', 'vulopilot'),
										value: 100 - (displayScore ?? 0),
										color: '#e5e7eb',
									},
								]}
							/>
							<TypographyComponent variant={'h3'} color="text-green">
								{__('Slow Pages Score', 'vulopilot')}
							</TypographyComponent>
							<div className="desc">{avgScoreSummary(displayScore)}</div>
						</div>

						<ListComponent
							className="mini-card report list"
							items={[
								{
									id: 'slow-pages',
									icon: 'error red',
									title: __('Slow Pages', 'vulopilot'),
									desc: sprintf(
										/* translators: %d: real PageSpeed score threshold below which a page counts as "slow" (PageSpeedRepository::SCORE_NEEDS_IMPROVEMENT). */
										__('Pages with a performance score below %d', 'vulopilot'),
										50
									),
									tags: (
										<div className="page-speed-summary-row-value">
											<TypographyComponent variant="h5">
												{deviceSlowCount}
											</TypographyComponent>
											<div className="page-speed-summary-row-sub">
												{sprintf(
													/* translators: %d: real total scanned page count. */
													__('of %d pages', 'vulopilot'),
													deviceTotalScored
												)}
											</div>
										</div>
									),
								},
								{
									id: 'average-load-time',
									icon: 'clock orange',
									title: __('Average Load Time', 'vulopilot'),
									desc: __('Across all scanned pages', 'vulopilot'),
									tags: (
										<div className="page-speed-summary-row-value">
											<TypographyComponent variant="h5">
												{avgLoadTimeMs !== null
													? sprintf(__('%s s', 'vulopilot'), (avgLoadTimeMs / 1000).toFixed(1))
													: '—'}
											</TypographyComponent>
											<div className="page-speed-summary-row-sub">
												{null !== displayScore
													? displayScoreRating.label
													: __('Not scored yet', 'vulopilot')}
											</div>
										</div>
									),
								},
								{
									id: 'good-pages',
									icon: 'check green',
									title: __('Good Pages', 'vulopilot'),
									desc: sprintf(
										/* translators: %d: real PageSpeed score threshold at/above which a page counts as "good" (PageSpeedRepository::SCORE_GOOD). */
										__('Pages with a performance score of %d or higher', 'vulopilot'),
										80
									),
									tags: (
										<div className="page-speed-summary-row-value">
											<TypographyComponent variant="h5">
												{deviceGoodCount}
											</TypographyComponent>
											<div className="page-speed-summary-row-sub">
												{sprintf(
													/* translators: %d: real total scanned page count. */
													__('of %d pages', 'vulopilot'),
													deviceTotalScored
												)}
											</div>
										</div>
									),
								},
								{
									id: 'performance-trend',
									icon: 'bar-chart violet',
									title: __('Performance Trend', 'vulopilot'),
									desc: __('Compared to the start of the selected period', 'vulopilot'),
									tags: (
										<div className="page-speed-summary-row-value">
											<TypographyComponent variant="h5">
												{null !== trendDelta
													? `${trendDelta >= 0 ? '+' : ''}${trendDelta} ${__('pts', 'vulopilot')}`
													: '—'}
											</TypographyComponent>
											<div className="page-speed-summary-row-sub">
												{null !== trendDelta ? (
													<span className={isTrendImproving ? 'up' : 'down'}>
														<i
															className={`adminfont-arrow-${isTrendImproving ? 'up' : 'down'}`}
														/>
														{isTrendImproving
															? __('Improving', 'vulopilot')
															: __('Declining', 'vulopilot')}
													</span>
												) : (
													__('Not enough trend data yet', 'vulopilot')
												)}
											</div>
										</div>
									),
								},
							]}
						/>
					</div>
				</CardComponent>
			</ColumnComponent>
			<ColumnComponent grid={8}>

				{0 === filteredRows.length ? (
					<ModuleGuardComponent
						icon="document"
						title={__('No pages found', 'vulopilot')}
						desc={
							0 === rows.length
								? __(
									'No pages scanned yet — click "Run Speed Test" to check your real pages\' load times.',
									'vulopilot'
								)
								: __(
									'No pages match this filter.',
									'vulopilot'
								)
						}
					/>
				) : (
					<TableCard
						showMenu={false}
						hideHeader={true}
						categoryCounts={statusCategoryCounts}
						activeCategory={statusFilter}
						search={{ placeholder: __('Search pages…', 'vulopilot') }}
						filters={[
							{
								key: 'page_type',
								label: __('Page Type', 'vulopilot'),
								type: 'select',
								size: 12,
								options: pageTypeOptions,
							},
						]}
						buttonActions={[
							{
								label: __('Export', 'vulopilot'),
								icon: 'export',
								color: 'border-purple',
								onClick: handleExport,
							},
						]}
						headers={{
							title: {
								key: 'title',
								type: 'info',
								label: __('Page', 'vulopilot'),
								width: '60%',
								iconKey: 'pageTypeIcon',
								titleLinkKey: 'url',
								descriptionKey: 'descriptionText',
								badgesKey: 'pageTypeBadges',
							},
							...(hasDeviceScores
								? {
									mobile_score: {
										label: __('Mobile Score', 'vulopilot'),
										render: (row: PageSpeedRow) => <ScorePill score={row.mobile_score} />,
									},
									desktop_score: {
										label: __('Desktop Score', 'vulopilot'),
										render: (row: PageSpeedRow) => <ScorePill score={row.desktop_score} />,
									},
								}
								: {
									score: {
										label: __('Score', 'vulopilot'),
										render: (row: PageSpeedRow) => <ScorePill score={row.score} />,
									},
								}),
							load_time_ms: {
								label: __('Load Time', 'vulopilot'),
								render: (row: PageSpeedRow) =>
									null !== row.load_time_ms
										? sprintf(__('Load Time: %s s', 'vulopilot'), (row.load_time_ms / 1000).toFixed(1))
										: '—',
							},
							...(hasPsiDetail
								? {
									page_size_bytes: {
										label: (
											<TooltipComponent
												text={__('Total real page weight (Lighthouse total-byte-weight audit)', 'vulopilot')}
											>
												{__('Page Size', 'vulopilot')}
											</TooltipComponent>
										),
										render: (row: PageSpeedRow) => formatBytes(row.page_size_bytes),
									},
									requests_count: {
										label: (
											<TooltipComponent
												text={__('Real network requests observed (Lighthouse network-requests audit)', 'vulopilot')}
											>
												{__('Requests', 'vulopilot')}
											</TooltipComponent>
										),
										render: (row: PageSpeedRow) =>
											null !== row.requests_count ? row.requests_count : '—',
									},
									core_web_vitals: {
										label: (
											<TooltipComponent
												text={__('Real Chrome UX Report field data: Largest Contentful Paint / Interaction to Next Paint / Cumulative Layout Shift', 'vulopilot')}
											>
												{__('Core Web Vitals', 'vulopilot')}
											</TooltipComponent>
										),
										render: (row: PageSpeedRow) => <CoreWebVitalsDots row={row} />,
									},
								}
								: {}),
							action: {
								label: __('Action', 'vulopilot'),
								// `type: 'more-action'` no longer exists in
								// @zyra/table — `type: 'action'` now covers
								// that same single-toggle-button case via a
								// `type: 'button'` action whose label/icon
								// are functions of `row` (see that type's
								// own docblock, TableRowActions.tsx).
								type: 'action',
								actions: [
									{
										type: 'button',
										label: (row) =>
											(row as unknown as PageSpeedRow).id === detailRow?.id
												? __('Showing', 'vulopilot')
												: __('More Details', 'vulopilot'),
										color: (row) =>
											(row as unknown as PageSpeedRow).id === detailRow?.id
												? 'text-green'
												: 'text-purple',
										icon: (row) =>
											(row as unknown as PageSpeedRow).id === detailRow?.id
												? 'eye'
												: 'pagination-next-arrow',
										onClick: (row) => {
											const pageRow = row as unknown as PageSpeedRow;
											setDetailRow(
												pageRow.id === detailRow?.id ? null : pageRow
											);
										},
									},
								],
							},
						}}
						rows={pageRows.map((row) => ({
							...row,
							pageTypeIcon: PAGE_TYPE_ICONS[row.page_type] ?? 'document',
							descriptionText:
								row.main_issue ?? __('No issues detected', 'vulopilot'),
							pageTypeBadges: [
								{
									text: PAGE_TYPE_LABELS[row.page_type] ?? row.page_type,
									color: 'green',
								},
							],
						}))}
						ids={pageRows.map((row) => row.id)}
						totalRows={filteredRows.length}
						activeRowId={detailRow?.id}
						// Same toggle the action cell's own "More
						// Details"/"Showing" button already does — a
						// click anywhere on the row now opens/closes the
						// details panel too, not just that one small
						// button.
						onRowClick={(row: Record<string, unknown>) => {
							const pageRow = row as unknown as PageSpeedRow;
							setDetailRow(
								pageRow.id === detailRow?.id ? null : pageRow
							);
						}}
						onQueryUpdate={(query: {
							paged?: number | string;
							per_page?: number | string;
							categoryFilter?: string;
							searchValue?: string;
							filter?: { page_type?: string };
						}) => {
							setPaged(Number(query.paged) || 1);
							setPerPage(Number(query.per_page) || 10);
							if (
								query.categoryFilter &&
								query.categoryFilter !== statusFilter
							) {
								setStatusFilter(query.categoryFilter);
							}
							setSearchTerm(query.searchValue ?? '');
							setPageTypeFilter(query.filter?.page_type ?? '');
						}}
					/>
				)}
			</ColumnComponent>

			<ColumnComponent grid={4}>
				{/* "Page details" card only renders when there are real rows
				 * to select from — same `filteredRows.length` check the
				 * table's own empty-state (`ModuleGuardComponent`) already
				 * uses on the left, so the two columns agree on when the
				 * table actually has content. Without this, an empty scan
				 * rendered a "Select a page" placeholder pointing at a
				 * table that had nothing to click. The four cards below
				 * stay unconditional — they're still meaningful with zero
				 * rows. */}
				{0 < filteredRows.length && (
					<>
						<CardComponent
							title={detailRow?.title ?? __('Page details', 'vulopilot')}
							titleIcon="info"
							desc={detailRow?.url}
							action={
								detailRow && (
									<i
										className="adminfont-close"
										role="button"
										tabIndex={0}
										aria-label={__('Close', 'vulopilot')}
										onClick={() => setDetailRow(null)}
										onKeyDown={(e) => {
											if ('Enter' === e.key || ' ' === e.key) {
												e.preventDefault();
												setDetailRow(null);
											}
										}}
									/>
								)
							}
						>
							{!detailRow ? (
								<ModuleGuardComponent
									icon="document"
									title={__('Select a page', 'vulopilot')}
									desc={__(
										'Click "More Details" on a row to see it here.',
										'vulopilot'
									)}
								/>
							) : (
								<FormGroupWrapperComponent>
									<FormGroupComponent row label={__('URL', 'vulopilot')}>
										<a href={detailRow.url} target="_blank" rel="noopener noreferrer">
											{detailRow.url}
										</a>
									</FormGroupComponent>
									<FormGroupComponent row label={__('Type', 'vulopilot')}>
										{PAGE_TYPE_LABELS[detailRow.page_type] ?? detailRow.page_type}
									</FormGroupComponent>
									<FormGroupComponent row label={__('Load Time', 'vulopilot')}>
										{null !== detailRow.load_time_ms
											? sprintf(__('%s s', 'vulopilot'), (detailRow.load_time_ms / 1000).toFixed(2))
											: '—'}
									</FormGroupComponent>
									{hasDeviceScores ? (
										<>
											<FormGroupComponent row label={__('Mobile Score', 'vulopilot')}>
												<ScorePill score={detailRow.mobile_score} />
											</FormGroupComponent>
											<FormGroupComponent row label={__('Desktop Score', 'vulopilot')}>
												<ScorePill score={detailRow.desktop_score} />
											</FormGroupComponent>
										</>
									) : (
										<FormGroupComponent row label={__('Score', 'vulopilot')}>
											<ScorePill score={detailRow.score} />
										</FormGroupComponent>
									)}
									{hasPsiDetail && (
										<>
											<FormGroupComponent row label={__('Page Size', 'vulopilot')}>
												{formatBytes(detailRow.page_size_bytes)}
											</FormGroupComponent>
											<FormGroupComponent row label={__('Requests', 'vulopilot')}>
												{null !== detailRow.requests_count ? detailRow.requests_count : '—'}
											</FormGroupComponent>
											<FormGroupComponent row label={__('Core Web Vitals', 'vulopilot')}>
												<CoreWebVitalsDots row={detailRow} />
											</FormGroupComponent>
										</>
									)}
									<FormGroupComponent row label={__('Main Issue', 'vulopilot')}>
										{detailRow.main_issue ?? __('None detected', 'vulopilot')}
									</FormGroupComponent>
									<FormGroupComponent row label={__('Last Scanned', 'vulopilot')}>
										{formatWpDate(detailRow.scanned_at)}
									</FormGroupComponent>
								</FormGroupWrapperComponent>
							)}
						</CardComponent>
						<CardComponent
							id="slow-pages-why-card"
							title={__('Why these pages are slow?', 'vulopilot')}
							titleIcon="info"
							desc={__('The most common issues dragging your pages down.', 'vulopilot')}
						>
							{0 === topIssues.length ? (
								<ModuleGuardComponent
									icon="check"
									title={__('No issues detected', 'vulopilot')}
									desc={__(
										'Run a scan to check your real pages for common slowdown causes.',
										'vulopilot'
									)}
								/>
							) : (
								<ListComponent
									className="mini-card report"
									items={topIssues.slice(0, 5).map((item) => ({
										id: item.issue,
										title: item.issue,
										desc: sprintf(
											/* translators: %d is the number of real pages this real issue affects. */
											_n(
												'%d page affected',
												'%d pages affected',
												item.affected_pages,
												'vulopilot'
											),
											item.affected_pages
										),
									}))}
								/>
							)}
						</CardComponent>
					</>
				)}

				<RecommendedFixesCard topIssues={topIssues} />

				<CardComponent
					title={__("What's considered slow?", 'vulopilot')}
					titleIcon="ai"
					desc={__('How page speed scores map to real performance ratings.', 'vulopilot')}
				>
					<ListComponent
						className="mini-card report without-border"
						items={[
							{
								id: 'very-poor',
								title: __('Very Slow', 'vulopilot'),
								tags: <span className="page-speed-legend-range">0 – 24</span>,
							},
							{
								id: 'poor',
								title: __('Slow', 'vulopilot'),
								tags: <span className="page-speed-legend-range">25 – 49</span>,
							},
							{
								id: 'needs-improvement',
								title: __('Needs Work', 'vulopilot'),
								tags: <span className="page-speed-legend-range">50 – 79</span>,
							},
							{
								id: 'good',
								title: __('Good', 'vulopilot'),
								tags: <span className="page-speed-legend-range">80 – 100</span>,
							},
						]}
					/>
				</CardComponent>
			</ColumnComponent>
		</ContainerComponent>
	);
};

export default SlowPagesTab;