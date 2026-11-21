/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import {
	AnalyticsComponent,
	CardComponent,
	ChartComponent,
	ColumnComponent,
	ContainerComponent,
	ModuleGuardComponent,
} from '@zyra/components';
import { ToggleInput } from '@zyra/inputs';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import type { CrawlerAnalytics } from './useCrawlerAnalytics';
import ScoreBreakdown from '../../components/ScoreBreakdown/ScoreBreakdown';
import ScoreTrendArea, { TrendHead } from '../../components/ScoreTrendArea/ScoreTrendArea';
import { formatWpDate } from '../../services/formatWpDate';

const PIE_COLORS = ['#7C3AED', '#2563EB', '#0D9488', '#EA580C', '#DB2777', '#65A30D'];

/** Same 3-tier 0-100 band this codebase's other real score rings. */
const getRating = (score: number): string => {
	if (score >= 70) {
		return __('Good', 'vulopilot');
	}
	if (score >= 40) {
		return __('Needs Work', 'vulopilot');
	}
	return __('At Risk', 'vulopilot');
};

/** Same 3-tier band as `getRating()` above, as one of zyra's own `$color-palette` names. */
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

/** Real "Robots.txt is accessible" / "XML sitemap is accessible" / "No critical AI-bot blocks" checklist. */
const CHECKLIST_ITEMS: { key: string; scannerIds: string[]; label: string; goodText: string }[] = [
	{
		key: 'robots',
		scannerIds: ['robots-txt'],
		label: __('robots.txt', 'vulopilot'),
		goodText: __('Reachable and readable by crawlers', 'vulopilot'),
	},
	{
		key: 'sitemap',
		scannerIds: ['sitemap', 'sitemap-validation'],
		label: __('XML sitemap', 'vulopilot'),
		goodText: __('Found and valid', 'vulopilot'),
	},
	{
		key: 'ai-blocks',
		scannerIds: ['ai-crawler-blocked-pages'],
		label: __('AI crawler access', 'vulopilot'),
		goodText: __('No important AI bots are blocked', 'vulopilot'),
	},
];

const isSeoModuleActive = () =>
	vulopilotAppLocalizer.active_modules?.includes('technical-seo') ?? false;

interface CrawlerAnalyticsSectionProps {
	analytics: CrawlerAnalytics | null;
	isLoading: boolean;
	/** CrawlOverviewSection.tsx's own real period state. */
	period: string;
	periodOptions: { key: string; value: string; label: string }[];
	// eslint-disable-next-line no-unused-vars
	onPeriodChange: (value: string) => void;
}

/** The restyled Crawler Traffic tab's real analytics section. */
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
			getApiLink(vulopilotAppLocalizer, 'findings/groups?per_page=200'),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
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
							<ModuleGuardComponent
								icon="error"
								title={__('Technical SEO module is turned off', 'vulopilot')}
								desc={__(
									'Turn the Technical SEO module back on from Settings → Modules to see robots.txt/sitemap crawl-health checks here.',
									'vulopilot'
								)}
								buttonText={__('Go to Settings → Modules', 'vulopilot')}
								buttonLink={`${vulopilotAppLocalizer.admin_url}#&tab=settings&subtab=modules&module=technical-seo`}
							/>
						) : (
							<>
								<ScoreBreakdown
									score={analytics.crawl_health_score}
									ratingLabel={getRating(analytics.crawl_health_score)}
									summary={__('How many robots.txt, sitemap and AI-access checks currently pass.', 'vulopilot')}
									rows={checklist.map((item) => ({
										key: item.key,
										icon: { robots: 'document', sitemap: 'url', 'ai-blocks': 'ai' }[item.key] ?? 'check',
										title: item.label,
										sub: item.isGood
											? item.goodText
											: null === item.isGood
												? undefined
												: sprintf(
														/* translators: %d: number of open findings. */
														_n('%d issue', '%d issues', openCount(item.scannerIds), 'vulopilot'),
														openCount(item.scannerIds)
													),
										score: null,
										status: (
											<span className={`vp-check-pill is-${null === item.isGood ? 'wait' : item.isGood ? 'good' : 'bad'}`}>
												{null === item.isGood
													? __('Checking…', 'vulopilot')
													: item.isGood
														? __('Pass', 'vulopilot')
														: __('Fix', 'vulopilot')}
											</span>
										),
									}))}
								/>
								{/* * Same "bottom stat tile row" shape * SeoTab.tsx's own "SEO Health" card * closes with, kept on `variant="dashboard"` *. */}
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
								
							/>
						}
					>
						<TrendHead
							points={analytics.daily_volume.map((day) => ({ date: day.date, score: day.total }))}
							days={Number(period)}
							suffix={__(' requests', 'vulopilot')}
						/>
						<ScoreTrendArea
							points={analytics.daily_volume.map((day) => ({ date: day.date, score: day.total }))}
							height={240}
							scale="count"
							label={__('Requests', 'vulopilot')}
						/>
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
														: '-'}
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
