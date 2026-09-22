/* global appLocalizer */
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { applyFilters } from '@wordpress/hooks';
import type { ComponentType } from 'react';
import { BadgeComponent, CardComponent, ColumnComponent, ModuleGuardComponent } from '@zyra/components';
import { TableCard, TableRow } from '@zyra/table';
import { useApiList } from '../../services/useApiList';
import CrawlerAnalyticsSection from './CrawlerAnalyticsSection';
import { useCrawlerAnalytics } from './useCrawlerAnalytics';

/**
 * vulopilot-pro's AiCrawlerAnalytics module's own cards — "Historical Crawl
 * Trends", "AI Visibility Correlation", and "AI Crawler Alerts"
 * (AI-CRAWLER-ANALYTICS-MODULE.md). Same "register a source, don't modify
 * the host" slot pattern BrandVisibility.tsx's own Pro card slots already
 * use — null (nothing rendered) until vulopilot-pro's module registers a
 * component into these filters.
 */
const HistoricalCrawlTrendsCard = applyFilters(
	'vulopilot_crawler_historical_trends_card',
	null
) as ComponentType | null;

const CrawlerVisibilityCorrelationCard = applyFilters(
	'vulopilot_crawler_visibility_correlation_card',
	null
) as ComponentType | null;

const CrawlerAlertsCard = applyFilters(
	'vulopilot_crawler_alerts_card',
	null
) as ComponentType | null;

interface CrawlerVisitRow extends TableRow {
	id: number;
	bot_name: string;
	requested_url: string;
	created_at: string;
	/** Real `is_404` column (`wp_vulopilot_crawler_visits`) — whether WordPress resolved this exact request to a 404 at the time it was logged (CrawlerVisitRepository::log()'s own docblock). wpdb returns this as a numeric string over REST (e.g. `"1"`), not a real boolean. */
	is_404: string | number | boolean;
}

/**
 * "Overview" inner section of the merged "Crawl & URLs" tab — was this
 * whole tab's own content before the merge split it (direct instruction:
 * "Broken Links + Redirects + Crawler Traffic are fragmented... one main
 * tab: Crawl & URLs [with] Overview | Broken Links | Redirects | 404s |
 * Robots & Sitemap"): a real health/stat row, a real trend chart + "by AI
 * lab" breakdown, real Top Crawlers/Most Crawled Pages tables (all from
 * CrawlerAnalyticsSection.tsx, backed by `crawler-traffic/analytics`,
 * including its own real Crawl Health Checklist), vulopilot-pro's 3 Pro
 * card slots, and the pre-existing paginated raw visit log (useApiList +
 * TableCard, same shape ActivityLogs.php already uses).
 *
 * Used to also render a separate "Last seen" tiles card
 * (CrawlerSummaryCard.tsx) right here — removed per direct instruction
 * ("merge top crawlers and last seen section, add a column in top crawlers
 * last seen"): that same real per-bot timestamp is now its own "Last seen"
 * column on CrawlerAnalyticsSection.tsx's own Top Crawlers table instead
 * (see that file's own docblock). CrawlerSummaryCard.tsx was deleted, not
 * kept as dead code — this was its only real consumer.
 *
 * The 3 real findings tables this tab used to also render here — "Blocked
 * pages"/"Robots.txt Issues"/"XML Sitemap Issues" — moved to
 * CrawlRobotsSitemapSection.tsx (this same merge's own "Robots & Sitemap"
 * inner tab): those are drill-down findings about crawl DIRECTIVES
 * specifically, a distinct concern from this section's own real-time
 * traffic analytics, and the requested structure gives them their own
 * tab rather than bundling everything crawler-related into one
 * "Overview."
 */
/** Same real 7/30/90-day trio `SeoProgressCard.tsx`'s/`GeoScoreSection.tsx`'s own identical period toggles already use — `crawler-traffic/analytics`'s own `days` param already accepts any real value (`CrawlerTraffic.php::get_analytics()`, defaults to 30), so this is a real, already-working range, not a new backend capability. */
type PeriodDays = '7' | '30' | '90';
const PERIOD_OPTIONS = [
	{ key: '7', value: '7', label: __('7D', 'vulopilot') },
	{ key: '30', value: '30', label: __('30D', 'vulopilot') },
	{ key: '90', value: '90', label: __('90D', 'vulopilot') },
];

const CrawlOverviewSection = () => {
	const botNameOptions = [
		{ label: __('GPTBot (OpenAI)', 'vulopilot'), value: 'GPTBot (OpenAI)' },
		{
			label: __('ChatGPT-User (OpenAI)', 'vulopilot'),
			value: 'ChatGPT-User (OpenAI)',
		},
		{
			label: __('ClaudeBot (Anthropic)', 'vulopilot'),
			value: 'ClaudeBot (Anthropic)',
		},
		{
			label: __('anthropic-ai (Anthropic)', 'vulopilot'),
			value: 'anthropic-ai (Anthropic)',
		},
		{
			label: __('PerplexityBot (Perplexity)', 'vulopilot'),
			value: 'PerplexityBot (Perplexity)',
		},
		{
			label: __('Bytespider (ByteDance)', 'vulopilot'),
			value: 'Bytespider (ByteDance)',
		},
		{
			label: __('CCBot (Common Crawl)', 'vulopilot'),
			value: 'CCBot (Common Crawl)',
		},
		{
			label: __(
				'Google-CloudVertexBot (Google AI training)',
				'vulopilot'
			),
			value: 'Google-CloudVertexBot (Google AI training)',
		},
		{ label: __('Amazonbot (Amazon)', 'vulopilot'), value: 'Amazonbot (Amazon)' },
	];

	const {
		data,
		total,
		categoryCounts,
		isLoading,
		error,
		refetch,
		onQueryUpdate,
	} = useApiList<CrawlerVisitRow>(
		'crawler-traffic',
		{},
		{ key: 'bot_name', options: botNameOptions }
	);
	const [period, setPeriod] = useState<PeriodDays>('30');
	const { analytics, isLoading: isLoadingAnalytics } = useCrawlerAnalytics(
		Number(period)
	);

	return (
		<ColumnComponent>
			{error ? (
				<CardComponent
					title={__('Crawler Traffic', 'vulopilot')}
					titleIcon="error"
					desc={__('Real crawler visits to your site, over time.', 'vulopilot')}
				>
					<ModuleGuardComponent
						icon="error"
						title={__(
							'Could not load crawler traffic',
							'vulopilot'
						)}
						desc={error}
						buttonText={__('Retry', 'vulopilot')}
						onButtonClick={refetch}
					/>
				</CardComponent>
			) : (
				<>
					<CrawlerAnalyticsSection
						analytics={analytics}
						isLoading={isLoadingAnalytics}
						period={period}
						periodOptions={PERIOD_OPTIONS}
						onPeriodChange={(value) => setPeriod(value as PeriodDays)}
					/>

					{CrawlerAlertsCard && <CrawlerAlertsCard />}
					{HistoricalCrawlTrendsCard && (
						<HistoricalCrawlTrendsCard />
					)}
					{CrawlerVisibilityCorrelationCard && (
						<CrawlerVisibilityCorrelationCard />
					)}

					<div id="recent-crawl-requests">
						<CardComponent
							title={__('Recent Crawl Requests', 'vulopilot')}
							titleIcon="search-discovery"
							desc={__('Every real crawler visit to your site, searchable and filterable.', 'vulopilot')}
						>
							<TableCard
								search={{
									placeholder: __(
										'Search requested URLs…',
										'vulopilot'
									),
								}}
								showMenu={false}
								hideHeader={true}
								format={appLocalizer.date_format_js}
								headers={{
									bot_name: {
										label: __('Bot', 'vulopilot'),
									},
									requested_url: {
										label: __('Requested URL', 'vulopilot'),
									},
									is_404: {
										label: __('Status', 'vulopilot'),
										render: (row: CrawlerVisitRow) =>
											Number(row.is_404) ? (
												<BadgeComponent color="red" text={__('Not Found', 'vulopilot')} />
											) : (
												<BadgeComponent color="green" text={__('Success', 'vulopilot')} />
											),
									},
									created_at: {
										label: __('When', 'vulopilot'),
										type: 'date',
										isSortable: true,
										defaultSort: true,
										defaultOrder: 'desc',
									},
								}}
								rows={data}
								ids={data.map((row) => row.id)}
								totalRows={total}
								categoryCounts={categoryCounts}
								isLoading={isLoading}
								onQueryUpdate={onQueryUpdate}
								emptyMessage={__(
									'No AI crawler visits detected yet.',
									'vulopilot'
								)}
							/>
						</CardComponent>
					</div>
				</>
			)}
		</ColumnComponent>
	);
};

export default CrawlOverviewSection;
