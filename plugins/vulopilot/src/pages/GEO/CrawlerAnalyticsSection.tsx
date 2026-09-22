/* global appLocalizer */
import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { COLOR_PALETTE, getApiLink, getApiResponse } from '@zyra/core';
import {
	AnalyticsComponent,
	CardComponent,
	ChartComponent,
	ColumnComponent,
	ContainerComponent,
	BadgeComponent,
	ListComponent,
	ModuleGuardComponent,
	TypographyComponent,
} from '@zyra/components';
import { ToggleInput } from '@zyra/inputs';
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import type { CrawlerAnalytics } from './useCrawlerAnalytics';
import { formatWpDate, formatWpDay } from '../../services/formatWpDate';

const PIE_COLORS = ['#7C3AED', '#2563EB', '#0D9488', '#EA580C', '#DB2777', '#65A30D'];

/** Same 3-tier 0-100 band this codebase's other real score rings (GeoScoreSection.tsx, GeoVisibilitySummaryCard.tsx) already use. */
const getRating = (score: number): string => {
	if (score >= 70) {
		return __('Good', 'vulopilot');
	}
	if (score >= 40) {
		return __('Needs Work', 'vulopilot');
	}
	return __('At Risk', 'vulopilot');
};

/** Same 3-tier band as `getRating()` above, as one of zyra's own `$color-palette` names — for the ring's own `COLOR_PALETTE`-resolved segment color, same convention SeoTab.tsx's own identical ring already established (`seoRating.ts`'s own `ratingColor()`). */
const ratingColor = (score: number): string => {
	if (score >= 70) {
		return 'green';
	}
	if (score >= 40) {
		return 'yellow';
	}
	return 'red';
};

const pctChange = (current: number, previous: number): number | null => {
	if (0 === previous) {
		return null;
	}
	return Math.round(((current - previous) / previous) * 100);
};

const ChangeBadge = ({ current, previous }: { current: number; previous: number }) => {
	const change = pctChange(current, previous);
	if (null === change) {
		return;
	}
	return (
		<span className={`crawler-change ${change >= 0 ? 'is-up' : 'is-down'}`}>
			{change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
		</span>
	);
};

/**
 * Real "Robots.txt is accessible" / "XML sitemap is accessible" / "No
 * critical AI-bot blocks" checklist — reuses the same real `scanner_id`s
 * SeoTab.tsx's own `robots`/`sitemap` sections already report on, fetched
 * once here rather than duplicating SeoTab's own SectionedFindingsTab
 * fetch. Only shown while the SEO module is active, same gate SeoTab.tsx
 * itself uses for the identical reason (those scanners don't run at all
 * otherwise, so "0 open findings" would be a false "Good", not a real one).
 */
const CHECKLIST_ITEMS: { key: string; scannerIds: string[]; label: string }[] = [
	{
		key: 'robots',
		scannerIds: ['robots-txt'],
		label: __('Robots.txt is not reachable', 'vulopilot'),
	},
	{
		key: 'sitemap',
		scannerIds: ['sitemap', 'sitemap-validation'],
		label: __('No XML sitemap found', 'vulopilot'),
	},
	{
		key: 'ai-blocks',
		scannerIds: ['ai-crawler-blocked-pages'],
		label: __('No critical AI-bot blocks', 'vulopilot'),
	},
];

const isSeoModuleActive = () =>
	appLocalizer.active_modules?.includes('seo') ?? false;

interface CrawlerAnalyticsSectionProps {
	analytics: CrawlerAnalytics | null;
	isLoading: boolean;
	/** CrawlOverviewSection.tsx's own real period state — same real `days` `useCrawlerAnalytics()` already fetches with, now real-selectable via this card's own "Crawl Requests Over Time" toggle instead of hardcoded to 30. */
	period: string;
	periodOptions: { key: string; value: string; label: string }[];
	onPeriodChange: (value: string) => void;
}

/**
 * The restyled Crawler Traffic tab's real analytics section — an "Overall
 * Crawl Health" summary, 4 real stat cards (each with a real %-change
 * against the immediately preceding period), a real trend chart, a real
 * "by AI lab" breakdown (not "search vs AI" — see CrawlerTraffic.php's own
 * `get_analytics()` docblock on why), a real Top Crawlers table (own real
 * "Last seen" column — the separate "Last seen" tiles card
 * (CrawlerSummaryCard.tsx) that used to sit below this section was merged
 * into this table instead, per direct instruction ("merge top crawlers
 * and last seen section, add a column in top crawlers last seen") — same
 * real `MAX(created_at)`-per-bot value, just a column here now instead of
 * its own card; CrawlerSummaryCard.tsx itself was deleted since this was
 * its only real consumer), a real Most Crawled Pages table with real
 * %-change per page, and a real crawl health checklist. Every number here
 * traces back to either `crawler-traffic/analytics`
 * (CrawlerVisitRepository::get_period_comparison(), which now folds
 * get_bot_last_seen()'s own real per-bot timestamp into each `top_crawlers`
 * row) or a real `findings/groups` fetch — nothing here is invented.
 */
const CrawlerAnalyticsSection = ({
	analytics,
	isLoading,
	period,
	periodOptions,
	onPeriodChange,
}: CrawlerAnalyticsSectionProps) => {
	const [checklistGroups, setChecklistGroups] = useState<FindingGroup[] | null>(
		null
	);

	useEffect(() => {
		if (!isSeoModuleActive()) {
			return;
		}
		getApiResponse<{ data: FindingGroup[] }>(
			getApiLink(appLocalizer, 'findings/groups?per_page=200'),
			{ headers: { 'X-WP-Nonce': appLocalizer.nonce } }
		).then((response) => setChecklistGroups(response?.data ?? []));
	}, []);

	if (isLoading || !analytics) {
		return (
			<ContainerComponent>
				<ColumnComponent >
					<CardComponent
						title={__('Overall Crawl Health', 'vulopilot')}
						titleIcon="search-discovery"
						isLoading
					/>
				</ColumnComponent>
			</ContainerComponent>
		);
	}

	const openCount = (scannerIds: string[]): number =>
		(checklistGroups ?? [])
			.filter((group) => scannerIds.includes(group.scanner_id))
			.reduce((sum, group) => sum + group.count, 0);

	const checklist = isSeoModuleActive()
		? CHECKLIST_ITEMS.map((item) => ({
			...item,
			isGood: null === checklistGroups ? null : 0 === openCount(item.scannerIds),
		}))
		: [];

	const statCards = [
		{
			key: 'requests',
			label: __('Total Crawl Requests', 'vulopilot'),
			colorClass: 'green',
			value: analytics.current_total,
			previous: analytics.previous_total,
		},
		{
			key: 'crawlers',
			label: __('Unique Crawlers', 'vulopilot'),
			colorClass: 'sky',
			value: analytics.current_unique_bots,
			previous: analytics.previous_unique_bots,
		},
		{
			key: 'pages',
			label: __('Pages Crawled', 'vulopilot'),
			colorClass: 'lime',
			value: analytics.most_crawled_pages.length,
			previous: analytics.most_crawled_pages.filter(
				(page) => page.previous_total > 0
			).length,
		},
		{
			key: 'blocked',
			label: __('Blocked Pages', 'vulopilot'),
			colorClass: 'indigo',
			value: analytics.blocked_pages_total,
			previous: analytics.blocked_pages_total,
		},
	];

	const vendorEntries = Object.entries(analytics.by_vendor);
	const vendorTotal = vendorEntries.reduce((sum, [, total]) => sum + total, 0);

	return (
		<>
			<ContainerComponent>
				<ColumnComponent grid={6}>
					<CardComponent
						title={__('Overall Crawl Health', 'vulopilot')}
						titleIcon="search-discovery"
						desc={__('How many robots.txt/sitemap crawl-health checks currently pass.', 'vulopilot')}
					>
						{checklist.length === 0 ? (
							<div className="desc">
								{__(
									'Turn on the SEO module to see robots.txt/sitemap crawl-health checks here.',
									'vulopilot'
								)}
							</div>
						) : (
							<>
								<div className="overall-score-wrapper">
									<div className="overall-score-summary">
											<ChartComponent
												type="ring"
												height={200}
												// Top-level `color` — `type="ring"` only ever
												// paints its stroke from this prop, never
												// from `data[].color` below (see SeoTab.tsx's
												// own identical fix) — without it the ring
												// stayed `ChartComponent`'s default brand
												// purple regardless of score.
												color={
													COLOR_PALETTE[
														ratingColor(analytics.crawl_health_score) as keyof typeof COLOR_PALETTE
													]
												}
												centerLabel={
													<>
														<TypographyComponent
															variant={'h1'}
															color={ratingColor(analytics.crawl_health_score)}
														>
															{analytics.crawl_health_score}
														</TypographyComponent>
														<TypographyComponent variant={'h4'}>
															{getRating(analytics.crawl_health_score)}
														</TypographyComponent>
													</>
												}
												data={[
													{
														label: __('Score', 'vulopilot'),
														value: analytics.crawl_health_score,
														// Same real rating color the ring's
														// own "Good"/"Needs Work"/"At Risk"
														// label above already uses
														// (`getRating()`) — resolved through
														// `COLOR_PALETTE` for the real hex
														// `ratingColor()`'s own palette name
														// stands for, same convention
														// SeoTab.tsx's own identical ring
														// already established.
														color: COLOR_PALETTE[
															ratingColor(analytics.crawl_health_score) as keyof typeof COLOR_PALETTE
														],
													},
													{
														label: __('Remaining', 'vulopilot'),
														value: 100 - analytics.crawl_health_score,
														color: '#e5e7eb',
													},
												]}
											/>
											<TypographyComponent variant={'h3'} color="text-green">
												{__('Overall Crawl Health', 'vulopilot')}
											</TypographyComponent>
											<div className="desc">
												{__('How many robots.txt/sitemap crawl-health checks currently pass.', 'vulopilot')}
											</div>
									</div>
									<div className="overall-score-summary">
									<ListComponent
										className="mini-card report hover seo-health-score-category-list"
										items={checklist.map((item) => ({
											id: item.key,
											icon:
												null === item.isGood
													? 'info blue'
													: item.isGood
														? 'check green'
														: 'error yellow',
											title: item.label,
											desc: sprintf(
												/* translators: %d: real number of open findings for this check. */
												__('%d issues', 'vulopilot'),
												openCount(item.scannerIds)
											),
											tags: (
												<BadgeComponent
													color={
														null === item.isGood
															? ''
															: item.isGood
																? 'green'
																: 'yellow'
													}
													text={
														null === item.isGood
															? __('Checking…', 'vulopilot')
															: item.isGood
																? __('Good', 'vulopilot')
																: __('Warning', 'vulopilot')
													}
												/>
											),
										}))}
									/>
									</div>
								</div>
								{/*
								 * Same "bottom stat tile row" shape
								 * SeoTab.tsx's own "SEO Health" card
								 * closes with, kept on `variant="dashboard"`
								 * rather than that card's own
								 * `"with-out-boxshadow"` — `AnalyticsComponent`
								 * only renders an item's own `extra` node
								 * under `variant="dashboard"` (confirmed
								 * reading its own source), and each real
								 * `%-change` `ChangeBadge` here already was
								 * visible before this restructure — silently
								 * dropping it to match SEO's variant name
								 * exactly would lose real, already-shown
								 * data for the sake of a cosmetic match.
								 */}
								<AnalyticsComponent
									variant="dashboard"
									cols={4}
									data={statCards.map((stat) => ({
										number: stat.value,
										text: stat.label,
										colorClass: stat.colorClass,
										extra: (
											<ChangeBadge
												current={stat.value}
												previous={stat.previous}
											/>
										),
									}))}
								/>
							</>
						)}
					</CardComponent>
				</ColumnComponent>
				<ColumnComponent grid={6} fullHeight>
					<CardComponent
						title={__('Crawl Requests Over Time', 'vulopilot')}
						titleIcon="analytics"
						desc={__(
							'Number of requests your site received from AI crawlers.',
							'vulopilot'
						)}
						action={
							<ToggleInput
								options={periodOptions}
								value={period}
								onChange={(value) => onPeriodChange(value as string)}
								modules={[]}
								variant="pill"
							/>
						}
					>
						<div className="dashboard-trend-chart">
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart
									// `date` is a plain calendar day (Y-m-d); pinned to midday so
									// formatWpDate's timezone shift can't roll it to the
									// neighbouring day. Formatted with Settings → General → Date
									// Format like every other date in this plugin.
									data={analytics.daily_volume.map((day) => ({
										...day,
										date: formatWpDate(`${day.date} 12:00:00`),
									}))}
								>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" tickFormatter={formatWpDay} />
									<YAxis allowDecimals={false} />
									<Tooltip labelFormatter={formatWpDay} />
									<Area
										type="monotone"
										dataKey="total"
										stroke="#4B227A"
										fill="#00EED0"
									/>
								</AreaChart>
							</ResponsiveContainer>
						</div>
					</CardComponent>

				</ColumnComponent>

				<ColumnComponent grid={4} fullHeight>
					<CardComponent
						title={__('Crawler Traffic by AI Lab', 'vulopilot')}
						titleIcon="global-community"
						desc={__(
							'Breakdown of AI-crawler requests by the company behind each bot.',
							'vulopilot'
						)}
					>
						{0 === vendorEntries.length ? (
							<ModuleGuardComponent
								icon="info"
								title={__('No AI crawler visits yet', 'vulopilot')}
								desc={__(
									'AI crawler activity will show up here once detected.',
									'vulopilot'
								)}
							/>
						) : (
							<>
								<div className="crawler-vendor-chart">
									<ChartComponent
										type="pie"
										height={160}
										centerLabel={
											<>
												<span className="score-ring-number">
													{vendorTotal.toLocaleString()}
												</span>
												<span className="score-ring-label">
													{__('Total', 'vulopilot')}
												</span>
											</>
										}
										data={vendorEntries.map(([vendor, total], index) => ({
											label: vendor,
											value: total,
											color: PIE_COLORS[index % PIE_COLORS.length],
										}))}
									/>
								</div>
								<div className="crawler-vendor-legend">
									{vendorEntries.map(([vendor, total], index) => (
										<div key={vendor} className="crawler-vendor-legend-row">
											<span
												className="crawler-vendor-dot"
												style={{
													backgroundColor:
														PIE_COLORS[index % PIE_COLORS.length],
												}}
											/>
											<span className="crawler-vendor-name">{vendor}</span>
											<span className="crawler-vendor-count">
												{total.toLocaleString()}{' '}
												{sprintf(
													'(%d%%)',
													vendorTotal
														? Math.round((total / vendorTotal) * 100)
														: 0
												)}
											</span>
										</div>
									))}
								</div>
							</>
						)}
					</CardComponent>
				</ColumnComponent>

				<ColumnComponent grid={4}>
					<CardComponent
						title={__('Top Crawlers', 'vulopilot')}
						titleIcon="search-discovery"
						desc={__('Bots that crawled your site the most.', 'vulopilot')}
					>
						{0 === analytics.top_crawlers.length ? (
							<ModuleGuardComponent
								icon="info"
								title={__('No AI crawler visits yet', 'vulopilot')}
								desc={__(
									'AI crawler activity will show up here once detected.',
									'vulopilot'
								)}
							/>
						) : (
							<>
								<table className="crawler-table">
									<thead>
										<tr>
											<th>{__('Crawler', 'vulopilot')}</th>
											<th>{__('Requests', 'vulopilot')}</th>
											<th>{__('Change', 'vulopilot')}</th>
											<th>{__('Last seen', 'vulopilot')}</th>
										</tr>
									</thead>
									<tbody>
										{analytics.top_crawlers.slice(0, 8).map((crawler) => (
											<tr key={crawler.bot_name}>
												<td>{crawler.bot_name}</td>
												<td>{crawler.total.toLocaleString()}</td>
												<td>
													<ChangeBadge
														current={crawler.total}
														previous={crawler.previous_total}
													/>
												</td>
												<td>
													{crawler.last_seen_at
														? formatWpDate(crawler.last_seen_at)
														: '—'}
												</td>
											</tr>
										))}
									</tbody>
								</table>
								<a
									className="crawler-view-all-link"
									href="#recent-crawl-requests"
									onClick={(event) => {
										event.preventDefault();
										document
											.getElementById('recent-crawl-requests')
											?.scrollIntoView({ behavior: 'smooth' });
									}}
								>
									{sprintf(
										/* translators: %d: real total number of distinct crawlers seen. */
										__('View all (%d total) ›', 'vulopilot'),
										analytics.top_crawlers.length
									)}
								</a>
							</>
						)}
					</CardComponent>
				</ColumnComponent>
				<ColumnComponent grid={4}>
					<CardComponent
						title={__('Most Crawled Pages', 'vulopilot')}
						titleIcon="document"
						desc={__('Pages that crawlers visited most often.', 'vulopilot')}
					>
						{0 === analytics.most_crawled_pages.length ? (
							<ModuleGuardComponent
								icon="info"
								title={__('No AI crawler visits yet', 'vulopilot')}
								desc={__(
									'AI crawler activity will show up here once detected.',
									'vulopilot'
								)}
							/>
						) : (
							<>
								<table className="crawler-table">
									<thead>
										<tr>
											<th>{__('Page', 'vulopilot')}</th>
											<th>{__('Requests', 'vulopilot')}</th>
											<th>{__('Change', 'vulopilot')}</th>
										</tr>
									</thead>
									<tbody>
										{analytics.most_crawled_pages.slice(0, 8).map((page) => (
											<tr key={page.requested_url}>
												<td className="crawler-table-url">
													{page.requested_url}
												</td>
												<td>{page.total.toLocaleString()}</td>
												<td>
													<ChangeBadge
														current={page.total}
														previous={page.previous_total}
													/>
												</td>
											</tr>
										))}
									</tbody>
								</table>
								<a
									className="crawler-view-all-link"
									href="#recent-crawl-requests"
									onClick={(event) => {
										event.preventDefault();
										document
											.getElementById('recent-crawl-requests')
											?.scrollIntoView({ behavior: 'smooth' });
									}}
								>
									{__('View all pages ›', 'vulopilot')}
								</a>
							</>
						)}
					</CardComponent>
				</ColumnComponent>
			</ContainerComponent>
		</>
	);
};

export default CrawlerAnalyticsSection;
