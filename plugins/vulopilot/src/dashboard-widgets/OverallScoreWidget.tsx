import React from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { COLOR_PALETTE } from '@zyra/core';
import {
	AnalyticsComponent,
	ChartComponent,
	TypographyComponent,
	ListComponent,
	IconComponent,
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import DashboardWidget from './DashboardWidget';
import { useLastScanTime } from '../services/useLastScanTime';
import { formatWpDate } from '../services/formatWpDate';
import { WidgetProps } from './types';
import { useApiList } from '../services/useApiList';
import { SEO_SECTIONS } from '../pages/GEO/seoSections';
import { ALL_AEO_SCANNER_IDS } from '../pages/GEO/AeoTab';
import VuloPilotActivityWidget from './VuloPilotActivityWidget';

type GlanceRow = {
	key: 'seo' | 'geo' | 'aeo';
	label: string;
	subtab: string;
	/** `scanner_id`/`category` REST params to count real open findings with — see each row's own definition below for why GEO uses `category` while SEO/AEO use an explicit `scanner_id` list. */
	params: Record<string, string>;
};
const SEO_SCANNER_IDS = SEO_SECTIONS.flatMap((section) => section.scannerIds);

/** Same 3 real "Issues at a glance" rows KeyPagesWidget.tsx used — GEO filters by `category`, SEO/AEO by an explicit `scanner_id` allowlist (see KeyPagesWidget.tsx's own docblock for why). */
const GLANCE_ROWS: GlanceRow[] = [
	{
		key: 'seo',
		label: __('SEO', 'vulopilot'),
		subtab: 'seo',
		params: { scanner_id: SEO_SCANNER_IDS.join(',') },
	},
	{
		key: 'geo',
		label: __('GEO', 'vulopilot'),
		subtab: 'geo',
		params: { category: 'geo' },
	},
	{
		key: 'aeo',
		label: __('AEO', 'vulopilot'),
		subtab: 'aeo',
		params: { scanner_id: ALL_AEO_SCANNER_IDS.join(',') },
	},
];

/**
 * "Vital Pulse" — the Dashboard's hero status ring: one real 0-100
 * `overall_score`, colored by its own real rating band via
 * `ratingColorFor()`, with a real "Last scanned" timestamp
 * (`useLastScanTime()`'s own most-recently-completed scan, called with no
 * category filter since this score is a sitewide rollup) below it — per a
 * newer reference mockup.
 *
 * The critical-findings badge that used to sit here ("No critical issues" /
 * "N critical issues") was removed per direct instruction — that count is
 * real findings data, not a Vital Pulse-specific rollup, so it's now a
 * plain link straight to NeedsAttentionWidget's own "Needs your attention"
 * card instead of being duplicated here as a second badge.
 *
 * Now also includes the category score breakdown list (previously
 * ScoreBreakdownWidget.tsx) and a "View full report ›" header link.
 *
 * Renders `VuloPilotActivityWidget` ("Health timeline") as a sibling card
 * right after its own `<DashboardWidget>`, both inside the same `<>...</>`
 * this component returns — registry.ts's own `overall-score` entry is the
 * only one DashboardGrid.tsx wraps in a `ColumnComponent` for either, per
 * direct instruction to put them in the same column instead of two
 * separately-registered, independently-draggable cells (`vulopilot-activity`
 * removed from registry.ts's own `MOCKUP_WIDGETS` accordingly). Each keeps
 * its own full `<DashboardWidget>` card chrome — genuine siblings, not one
 * nested inside the other's card body.
 */
export const getRating = (score: number): string => {
	if (score >= 90) {
		return __('Excellent', 'vulopilot');
	}
	if (score >= 70) {
		return __('Good', 'vulopilot');
	}
	if (score >= 50) {
		return __('Fair', 'vulopilot');
	}
	return __('Needs work', 'vulopilot');
};

/** Same real 4-tier `getRating()` bands above, mapped to real palette color names — feeds the ring's own stroke color and each row's own score number color. */
export const ratingColorFor = (score: number): string => {
	if (score >= 90) {
		return 'green';
	}
	if (score >= 70) {
		return 'blue';
	}
	if (score >= 50) {
		return 'yellow';
	}
	return 'red';
};

const getRatingSummary = (score: number): string => {
	if (score >= 90) {
		return __('Your site is in excellent shape.', 'vulopilot');
	}
	if (score >= 70) {
		return __(
			'Your site is healthy and needs minimal work.',
			'vulopilot'
		);
	}
	if (score >= 50) {
		return __('Your site could use some improvement.', 'vulopilot');
	}
	return __('Your site needs attention in several areas.', 'vulopilot');
};

/** Average helper for grouping category scores into buckets. */
const average = (nums: number[]): number =>
	Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length);

const OverallScoreWidget: React.FC<WidgetProps> = ({
	summary,
	isLoading,
	onHide,
	isCustomizing,
	onRefreshSummary,
}) => {
	// Real most-recent completed scan across every category — same real
	// `useLastScanTime()` hook CrawlRobotsSitemapSection.tsx's own "Last
	// Checked" tile already uses, called here with no category filter
	// since this widget's own score is a sitewide rollup, not scoped to
	// one category.
	const { lastScanAt } = useLastScanTime();

	// Fixed cardinality (always exactly 3 rows), so one real `useApiList`
	// call each rather than a loop — `per_page: 1` since only `total` is used.
	const seoFindings = useApiList<{ id: number }>('findings', {
		...GLANCE_ROWS[0].params,
		status: 'open',
		per_page: 1,
	});
	const geoFindings = useApiList<{ id: number }>('findings', {
		...GLANCE_ROWS[1].params,
		status: 'open',
		per_page: 1,
	});
	const aeoFindings = useApiList<{ id: number }>('findings', {
		...GLANCE_ROWS[2].params,
		status: 'open',
		per_page: 1,
	});
	const totals: Record<GlanceRow['key'], number> = {
		seo: seoFindings.total,
		geo: geoFindings.total,
		aeo: aeoFindings.total,
	};

	// --- Category score breakdown data (from ScoreBreakdownWidget) ---
	const cs = summary.category_scores;
	const visibility = average([cs.seo, cs.geo, cs.content, cs.brand]);
	const health = average([cs.security, cs.accessibility]);
	const commerce = cs.woocommerce ?? 0;
	const performance = cs.performance;

	// Real week-over-week deltas per bucket, diffed against
	// category_scores_7d_ago.
	const cs7 = summary.category_scores_7d_ago;
	const visibility7d = average([cs7.seo, cs7.geo, cs7.content, cs7.brand]);
	const health7d = average([cs7.security, cs7.accessibility]);
	const commerce7d = cs7.woocommerce ?? 0;
	const performance7d = cs7.performance;

	const scoreRows = [
		{
			key: 'visibility',
			label: __('Visibility Score', 'vulopilot'),
			score: visibility,
			delta: visibility - visibility7d,
			icon: 'tax-compliance',
		},
		{
			key: 'health',
			label: __('Health Score', 'vulopilot'),
			score: health,
			delta: health - health7d,
			icon: 'order',
		},
		{
			key: 'commerce',
			label: __('Commerce Score', 'vulopilot'),
			score: commerce,
			delta: commerce - commerce7d,
			icon: 'shipping',
		},
		{
			key: 'performance',
			label: __('Performance Score', 'vulopilot'),
			score: performance,
			delta: performance - performance7d,
			icon: 'shipping',
		},
		{
			key: 'content',
			label: __('Content Score', 'vulopilot'),
			score: cs.content,
			delta: cs.content - cs7.content,
			icon: 'text-fields',
		},
		{
			key: 'brand',
			label: __('Brand Score', 'vulopilot'),
			score: cs.brand,
			delta: cs.brand - cs7.brand,
			icon: 'person',
		},
	];

	return (
		<>
		<DashboardWidget
			title={__('Website Health Scores', 'vulopilot')}
			desc={__('Your overall score across visibility, health, commerce, performance, content, and brand.', 'vulopilot')}
			icon="analytics"
			isLoading={isLoading}
			onHide={onHide}
			isCustomizing={isCustomizing}
			headerAction={
				<ButtonInput
					buttons={{
						text: __('View full report', 'vulopilot'),
						rightIcon: 'pagination-right-arrow',
						color: 'text-purple',
						onClick: () => {
							window.location.href = '?page=vulopilot#&tab=reports';
						},
					}}
				/>
			}
		>
			<div className="overall-score-wrapper">
				<div className="overall-score-summary chart">
					<ChartComponent
						type="ring"
						isLoading={isLoading}
						height={240}
						color={
							COLOR_PALETTE[
							ratingColorFor(
								summary.overall_score
							) as keyof typeof COLOR_PALETTE
							]
						}
						centerLabel={
							<>
								<TypographyComponent
									variant={'h1'}
									color={ratingColorFor(summary.overall_score)}
								>
									{summary.overall_score}
								</TypographyComponent>
								<TypographyComponent variant={'h4'}>
									{getRating(summary.overall_score)}
								</TypographyComponent>
							</>
						}
						data={[
							{
								label: __('Score', 'vulopilot'),
								value: summary.overall_score,
							},
						]}
					/>

					<TypographyComponent variant={'h3'} color="text-green">
						{__('Overall Score', 'vulopilot')}
					</TypographyComponent>
					<div className="desc">
						{getRatingSummary(summary.overall_score)}
					</div>
				</div>
				{/* Category score breakdown list, moved here from ScoreBreakdownWidget.tsx */}
				<div className='overall-score-summary'>
					<ListComponent
						className="mini-card report seo-health-score-category-list"
						loading={isLoading}
						items={scoreRows.map((row) => ({
							id: row.key,
							icon: row.icon,
							title: row.label,
							tags: (
								<>
									<TypographyComponent
										variant="h5"
										weight="bold"
										color={ratingColorFor(row.score)}
										className="seo-health-score-row-value"
									>
										{row.score}
										<TypographyComponent
											as="span"
											variant="body-md"
											className="seo-health-score-row-suffix"
										>
											/100
										</TypographyComponent>
									</TypographyComponent>
									<TypographyComponent
										as="span"
										variant="body-md"
										weight="bold"
										color={row.delta >= 0 ? 'green' : 'red'}
										className="seo-health-score-row-delta"
									>
										<IconComponent
											name={
												row.delta >= 0
													? 'arrow-up'
													: 'arrow-down'
											}
										/>
										{Math.abs(row.delta)}
									</TypographyComponent>
								</>
							),
						}))}
					/>
				</div>
			</div>
			<AnalyticsComponent
				variant="background-color"
				cols={3}
				data={GLANCE_ROWS.map((row, index) => ({
					colorClass: `admin-bg-color${index + 2}`,
					number: totals[row.key],
					text: sprintf(
						/* translators: %s: sub-tab name, e.g. "SEO". */
						__('%s issues', 'vulopilot'),
						row.label
					),
					link: `?page=vulopilot#&tab=seo-visibility&subtab=${row.subtab}`,
				}))}
			/>
		</DashboardWidget>
		<VuloPilotActivityWidget
			summary={summary}
			isLoading={isLoading}
			onHide={onHide}
			isCustomizing={isCustomizing}
			onRefreshSummary={onRefreshSummary}
		/>
		</>
	);
};

export default OverallScoreWidget;