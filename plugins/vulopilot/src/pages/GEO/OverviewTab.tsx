/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import type { PeriodDays } from './types';
import {
	CardComponent,
	ColumnComponent,
	ContainerComponent,
	ListComponent,
} from '@zyra/components';
import { ToggleInput } from '@zyra/inputs';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import { useVisibilityScore } from './useVisibilityScore';
import type { VisibilityScoreResponse } from './useVisibilityScore';
import type { CrawlUrlsSectionId } from './CrawlUrlsTab';
import GeoFixTheseFirstCard from './GeoFixTheseFirstCard';
import VisibilityBySourceCard from './VisibilityBySourceCard';
import ScoreTrendArea, { TrendHead } from '../../components/ScoreTrendArea/ScoreTrendArea';
import ScoreBreakdown from '../../components/ScoreBreakdown/ScoreBreakdown';
import './SeoVisibility.scss';

interface OverviewTabProps {
	onNavigateTab: (
		// eslint-disable-next-line no-unused-vars
		tab: string,
		// eslint-disable-next-line no-unused-vars
		crawlUrlsSection?: CrawlUrlsSectionId,
		// eslint-disable-next-line no-unused-vars
		scannerId?: string
	) => void;
}

const getRating = (score: number): string => {
	if (score >= 70) {
		return __('Good', 'vulopilot');
	}
	if (score >= 40) {
		return __('Needs Work', 'vulopilot');
	}
	return __('At Risk', 'vulopilot');
};

/** Dynamic caption under the ring's own "Overall Score" label. */
const getRatingSummary = (score: number): string => {
	if (score >= 70) {
		return __('Your visibility is in good shape across the board.', 'vulopilot');
	}
	if (score >= 40) {
		return __('Your visibility could use some improvement.', 'vulopilot');
	}
	return __('Your visibility needs attention in several areas.', 'vulopilot');
};

/** Real per-area tab id `QUICK_LINKS` below already uses for the same 4 areas. */
const AREA_TABS: Record<keyof VisibilityScoreResponse['areas'], string> = {
	brand: 'brand-visibility',
	seo: 'seo',
	geo: 'geo',
	crawl: 'crawl-urls',
};

const AREA_TILES: Record<
	keyof VisibilityScoreResponse['areas'],
	{ title: string; icon: string }
> = {
	brand: { title: __('Brand Visibility Score', 'vulopilot'), icon: 'person' },
	seo: { title: __('SEO Health Score', 'vulopilot'), icon: 'search' },
	geo: { title: __('GEO Visibility Score', 'vulopilot'), icon: 'search-discovery' },
	crawl: { title: __('Crawl & URLs Score', 'vulopilot'), icon: 'url' },
};

// Same real `key` field `GeoScoreSection.tsx`'s own identical `ToggleInput` usage already includes.
const PERIOD_OPTIONS = [
	{ key: '7', value: '7', label: __('7D', 'vulopilot') },
	{ key: '30', value: '30', label: __('30D', 'vulopilot') },
	{ key: '90', value: '90', label: __('90D', 'vulopilot') },
];

interface ProgressResponse {
	days: number;
	trend: { date: string; score: number }[];
}

/** Real `FindingGroup.category` values → the real SEO & Visibility subtab that owns that category's findings. */
const CATEGORY_TO_TAB: Record<string, string> = {
	geo: 'geo',
	brand: 'brand-visibility',
	schema: 'schema-knowledge',
	links: 'crawl-urls',
};
const categoryToTab = (category: string): string => CATEGORY_TO_TAB[category] ?? 'seo';

/** Scanner id → the SEO & Visibility subtab that actually surfaces that scanner's findings. */
const SCANNER_TAB_OVERRIDES: Record<string, string> = {
	'geo-trust-signals': 'brand-visibility',
	'geo-eeat-signals': 'brand-visibility',
	'geo-author-info': 'brand-visibility',
	'geo-entity-naming-consistency': 'brand-visibility',
	'about-page-analysis': 'brand-visibility',
	'author-schema': 'brand-visibility',
	'organization-schema': 'brand-visibility',
	'aeo-schema': 'aeo',
	'geo-summary-block': 'aeo',
	'geo-faq-opportunity': 'aeo',
	'geo-chunking': 'geo',
	'geo-semantic-structure': 'geo',
	// Crawl & URLs' own Robots/Sitemap/AI-crawler and Broken Links sections.
	sitemap: 'crawl-urls',
	'sitemap-validation': 'crawl-urls',
	'robots-txt': 'crawl-urls',
	'ai-crawler-blocked-pages': 'crawl-urls',
	'broken-links': 'crawl-urls',
	'not-found': 'crawl-urls',
	'redirect-analysis': 'crawl-urls',
	// Business Identity & Schema's own issues list.
	schema: 'schema-knowledge',
	'structured-data': 'schema-knowledge',
	'sitewide-structured-data': 'schema-knowledge',
};
/** Which Crawl & URLs inner tab owns each of those scanners. */
const CRAWL_SECTION_BY_SCANNER: Record<string, CrawlUrlsSectionId> = {
	sitemap: 'robots-sitemap',
	'sitemap-validation': 'robots-sitemap',
	'robots-txt': 'robots-sitemap',
	'ai-crawler-blocked-pages': 'robots-sitemap',
	'broken-links': 'broken-links',
	'not-found': '404s',
	'redirect-analysis': 'redirects',
};
const groupToTab = (group: FindingGroup): string =>
	SCANNER_TAB_OVERRIDES[group.scanner_id] ?? categoryToTab(group.category);

// Same real "icon name" + trailing color modifier convention `SeoTab.tsx`'s own `CATEGORY_CARDS` already establishes.
const QUICK_LINKS: { tab: string; icon: string; title: string; desc: string }[] = [
	{
		tab: 'brand-visibility',
		icon: 'person purple',
		title: __('Brand Visibility', 'vulopilot'),
		desc: __('Check how AI understands your brand.', 'vulopilot'),
	},
	{
		tab: 'seo',
		icon: 'search blue',
		title: __('SEO', 'vulopilot'),
		desc: __('Optimize for search engines.', 'vulopilot'),
	},
	{
		tab: 'geo',
		icon: 'search-discovery green',
		title: __('GEO (AI Visibility)', 'vulopilot'),
		desc: __('Improve visibility in AI answers.', 'vulopilot'),
	},
	{
		tab: 'aeo',
		icon: 'ai orange',
		title: __('AEO', 'vulopilot'),
		desc: __('Answer-engine readiness checks.', 'vulopilot'),
	},
	{
		tab: 'keywords',
		icon: 'vpn-key yellow',
		title: __('Keywords', 'vulopilot'),
		desc: __('Track your keyword rankings.', 'vulopilot'),
	},
	{
		tab: 'crawl-urls',
		icon: 'url teal',
		title: __('Crawl & URLs', 'vulopilot'),
		desc: __('robots.txt, sitemaps, redirects & more.', 'vulopilot'),
	},
	{
		tab: 'schema-knowledge',
		icon: 'identity-verification red',
		title: __('Business Identity & Schema', 'vulopilot'),
		desc: __('Manage structured data & entities.', 'vulopilot'),
	},
];

/** "SEO & Visibility" Overview tab. */
const OverviewTab = ({ onNavigateTab }: OverviewTabProps) => {
	const { score, isLoading } = useVisibilityScore();
	const [period, setPeriod] = useState<PeriodDays>('30');
	const [progress, setProgress] = useState<ProgressResponse | null>(null);
	const [isLoadingProgress, setIsLoadingProgress] = useState(true);
	const [opportunityGroups, setOpportunityGroups] = useState<FindingGroup[]>([]);
	const [opportunityTotal, setOpportunityTotal] = useState(0);
	const [isLoadingOpportunities, setIsLoadingOpportunities] = useState(true);

	useEffect(() => {
		setIsLoadingProgress(true);
		getApiResponse<ProgressResponse>(
			getApiLink(vulopilotAppLocalizer, `visibility/progress?days=${period}`),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => response && setProgress(response))
			.finally(() => setIsLoadingProgress(false));
	}, [period]);

	useEffect(() => {
		getApiResponse<{ data: FindingGroup[]; total: number }>(
			getApiLink(
				vulopilotAppLocalizer,
				// Same real category grouping issuesTypes.ts's own CATEGORY_TABS already establishes for "SEO & Visibility" + "AI Visibility".
				'findings/groups?per_page=5&status=open&category=seo,images,schema,links,geo,brand'
			),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				if (response) {
					setOpportunityGroups(response.data);
					setOpportunityTotal(response.total);
				}
			})
			.finally(() => setIsLoadingOpportunities(false));
	}, []);

	const areas = score?.areas;

	return (
		<ContainerComponent>
			<ColumnComponent grid={6} fullHeight>
				{/* * Same real ring + `ListComponent` "mini-card report" row * shape `SeoTab.tsx`'s own "SEO Health" card already uses. */}
				<CardComponent
					title={__('Visibility Score', 'vulopilot')}
					titleIcon="bar-chart"
					desc={__('Your real, combined score across Brand, SEO, GEO, and Crawl & URLs.', 'vulopilot')}
					isLoading={isLoading || undefined}
				>
					{score && (
						<ScoreBreakdown
							score={score.visibility_score}
							ratingLabel={getRating(score.visibility_score)}
							summary={getRatingSummary(score.visibility_score)}
							rows={(Object.keys(AREA_TILES) as (keyof VisibilityScoreResponse['areas'])[]).map((key) => ({
								key,
								icon: AREA_TILES[key].icon,
								title: AREA_TILES[key].title,
								score: areas?.[key]?.score ?? null,
								change: areas?.[key]?.change ?? null,
								status: '–',
								onClick: () => onNavigateTab(AREA_TABS[key]),
							}))}
						/>
					)}
				</CardComponent>
			</ColumnComponent>
			<ColumnComponent grid={6} fullHeight>
				<CardComponent
					title={__('Visibility Trend', 'vulopilot')}
					titleIcon='security'
					desc={__('Combined score across Brand, SEO, GEO, and Crawl & URLs.', 'vulopilot')}
					isLoading={isLoadingProgress || undefined}
					action={
						<ToggleInput
							options={PERIOD_OPTIONS}
							value={period}
							onChange={(value) => setPeriod(value as PeriodDays)}
							modules={[]}
							
						/>
					}
				>
					{progress && (
						<div className="vp-vis-trend">
							<TrendHead points={progress.trend} days={progress.days ?? Number(period)} />
							<ScoreTrendArea
								points={progress.trend}
								height={230}
								label={__('Visibility', 'vulopilot')}
							/>
						</div>
					)}
				</CardComponent>
			</ColumnComponent>

			<ColumnComponent grid={8} fullHeight>
				<VisibilityBySourceCard />
				<GeoFixTheseFirstCard
					title={__('Top Opportunities', 'vulopilot')}
					emptyMessage={__('No open findings right now - nothing to fix.', 'vulopilot')}
					groups={opportunityGroups}
					total={opportunityTotal}
					isLoading={isLoadingOpportunities}
					onViewAll={() =>
						opportunityGroups.length
							? onNavigateTab(
									groupToTab(opportunityGroups[0]),
									CRAWL_SECTION_BY_SCANNER[opportunityGroups[0].scanner_id],
									opportunityGroups[0].scanner_id
								)
							: onNavigateTab('seo')
					}
					onSelectScanner={(scannerId) => {
						const group = opportunityGroups.find((g) => g.scanner_id === scannerId);
						onNavigateTab(group ? groupToTab(group) : 'seo', CRAWL_SECTION_BY_SCANNER[scannerId], scannerId);
					}}
				/>
			</ColumnComponent>
			<ColumnComponent grid={4}>
				<CardComponent
					title={__('Quick Links', 'vulopilot')}
					titleIcon="link"
					desc={__('Jump straight to any SEO & Visibility section.', 'vulopilot')}
				>
					{/* Same real `mini-card report hover` row shape the "SEO Health"/"Visibility Score" cards above already use. */}
					<ListComponent
						className="mini-card report hover"
						items={QUICK_LINKS.map((link) => ({
							id: link.tab,
							icon: link.icon,
							title: link.title,
							desc: link.desc,
							tags: (
								<i className="adminfont-pagination-right-arrow ai-copilot-row-arrow" />
							),
							action: () => onNavigateTab(link.tab),
						}))}
					/>
				</CardComponent>
			</ColumnComponent>
		</ContainerComponent>
	);
};

export default OverviewTab;
