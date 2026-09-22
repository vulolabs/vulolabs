import { __, sprintf } from '@wordpress/i18n';
import { COLOR_PALETTE } from '@zyra/core';
import { AnalyticsComponent, CardComponent, ChartComponent, IconComponent, ListComponent, TypographyComponent } from '@zyra/components';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import type { TrendChange } from './GeoTrendCompactCard';

/**
 * Same real severity-weighted 0-100 formula `Controllers\Seo::calculate_score()`/
 * `Controllers\Geo::calculate_score()` use server-side for their own
 * per-category/per-signal scores — duplicated here client-side (this
 * codebase's own "duplicate small per-file logic" convention) since AEO has
 * no dedicated `/aeo/score` endpoint of its own; `groups` (`GET
 * /findings/groups`, already fetched by AeoTab.tsx for `GeoByTopicGrid`)
 * already carries each group's own real `severity` + `count`, which is all
 * this formula needs.
 */
const calculateScore = (breakdown: {
	critical: number;
	high: number;
	medium: number;
	low: number;
}): number => {
	const score =
		100 -
		breakdown.critical * 15 -
		breakdown.high * 8 -
		breakdown.medium * 3 -
		breakdown.low * 1;

	return Math.max(0, Math.min(100, score));
};

const ratingColorFor = (score: number): string => {
	if (score >= 70) {
		return 'green';
	}
	if (score >= 40) {
		return 'yellow';
	}
	return 'red';
};

/**
 * Same real 3-tier text `AeoTab.tsx`'s own (now-removed) local `getRating()`
 * used for this same ring — kept local rather than a shared import per this
 * codebase's own "duplicate small per-file logic" convention.
 */
const overallRatingLabel = (score: number): string => {
	if (score >= 70) {
		return __('Good', 'vulopilot');
	}
	if (score >= 40) {
		return __('Needs Work', 'vulopilot');
	}
	return __('At Risk', 'vulopilot');
};

/**
 * `.geo-overall-rating`'s own real `is-good`/`is-attention`/`is-poor`
 * classes (`SeoVisibility.scss`) — NOT `ratingColorFor()` above's
 * `green`/`yellow`/`red` (that one feeds `TypographyComponent`'s own
 * `color` prop for the per-topic row values instead, a different consumer
 * with a different real class contract).
 */
const overallRatingClass = (score: number): string => {
	if (score >= 70) {
		return 'is-good';
	}
	if (score >= 40) {
		return 'is-attention';
	}
	return 'is-poor';
};

interface AeoTopic {
	key: string;
	title: string;
	titleIcon: string;
	scannerIds: string[];
}

/**
 * Score a site needs to reach for a real "Good" AEO rating — same `>= 70`
 * cutoff AeoTab.tsx's own `getRating()`/`ratingClass()` already use for the
 * gauge itself, so this card's own "Goal: 70+" copy always agrees with
 * what actually turns that gauge green, rather than a second, invented
 * number.
 */
const GOOD_RATING_THRESHOLD = 70;

interface AeoScoreSummaryCardProps {
	isLoading: boolean;
	questionsAnswered: number;
	totalPages: number;
	pagesReady: number;
	/** `null` when there isn't at least 2 real sampled days to compare yet (GeoTrendCompactCard.tsx's own `computeTrendChange()`) — the bottom "Content Change" tile shows an em dash rather than a fabricated number in that case. */
	trend: TrendChange | null;
	/** AeoTab.tsx's own real `AEO_SECTIONS` — this card's own row breakdown, same shape `GeoScoreSection.tsx`'s own `SIGNAL_META` feeds its 7 rows. */
	topics: AeoTopic[];
	/** `GET /findings/groups`, already fetched by AeoTab.tsx for `GeoByTopicGrid` — reused here rather than a second fetch, same real per-scanner severity/count data this card's own rows compute their real score/issue-count from. */
	groups: FindingGroup[];
	/** AeoTab.tsx's own real `goToIssuesTable` — same real click-through `GeoScoreSection.tsx`'s own `onSelectSignal` gives its rows, filtering + scrolling to the real "All AEO Issues" table below instead of doing nothing. */
	onSelectTopic?: (topicKey: string) => void;
}

/**
 * "AEO Score" — restructured to match `GeoScoreSection.tsx`'s own "GEO
 * Score" card exactly (direct instruction: "same to same" as that card's
 * real per-signal row breakdown), replacing the previous 4 generic stat
 * rows (Current Score/Questions Answered/Pages Ready/Content Change) with
 * a real per-topic breakdown over the same 6 real `AEO_SECTIONS` topics
 * `GeoByTopicGrid.tsx`'s own tile grid above this card already groups
 * findings into.
 *
 * Each row's own score is real but client-computed: AEO has no dedicated
 * `/aeo/score` REST endpoint the way SEO/GEO do (`Controllers\Seo`/
 * `Controllers\Geo`), so `calculateScore()` above duplicates their exact
 * same severity-weighted formula against `groups` (already real, already
 * fetched) filtered to that topic's own scanner ids — the same real
 * severity/count numbers `GeoByTopicGrid.tsx`'s own tiles already read,
 * just folded into one 0-100 number instead of shown as a raw count.
 *
 * No real per-topic delta (unlike `GeoScoreSection.tsx`'s own rows, once
 * `Geo.php` grew a real `signals[*].trend`): `groups` is a live snapshot
 * with no stored history to reconstruct a real "score 7 days ago" from,
 * and building that would mean a new backend endpoint (same lift
 * `Geo.php`'s own `get_signal_trend()` needed) — not fabricated here.
 *
 * The original 4 real numbers (overall `aeoScore`, `questionsAnswered`,
 * `pagesReady`, `trend`) aren't discarded — they move to a real bottom
 * stat row (`AnalyticsComponent`), same "topic rows above, stat tiles
 * below" shape `GeoScoreSection.tsx`'s own card already established.
 */
const AeoScoreSummaryCard = ({
	isLoading,
	questionsAnswered,
	totalPages,
	pagesReady,
	trend,
	topics,
	groups,
	onSelectTopic,
}: AeoScoreSummaryCardProps) => {
	const changeValue = trend
		? sprintf(
				/* translators: %1$s is a signed number, e.g. "+8"; %2$s is "pts". */
				'%1$s%2$d %3$s',
				trend.change >= 0 ? '+' : '',
				trend.change,
				__('pts', 'vulopilot')
			)
		: '—';

	const topicScores = topics.map((topic) => {
		const topicGroups = groups.filter((group) =>
			topic.scannerIds.includes(group.scanner_id)
		);
		const openCount = topicGroups.reduce((sum, group) => sum + group.count, 0);
		const breakdown = { critical: 0, high: 0, medium: 0, low: 0 };
		topicGroups.forEach((group) => {
			if ('info' !== group.severity) {
				breakdown[group.severity] += group.count;
			}
		});

		return { topic, openCount, score: calculateScore(breakdown) };
	});

	/**
	 * Real overall AEO score — an unweighted mean of the same 6 real
	 * per-topic scores the rows below show, same "unweighted mean of real
	 * per-X scores" convention `Controllers\Geo::get_score()`'s own
	 * `geo_score` already establishes. Replaces the ring's former
	 * `aeoScore` prop (`AeoTab.tsx`'s own `average()` of 3 Pro-only
	 * `useGeoVisibilitySnapshot()` fields, which silently read 0 with Pro
	 * inactive — same free-tier gap that endpoint's own docblock already
	 * flags for `GeoVisibilitySummaryCard`) with a number that's real and
	 * populated on every install, matching how `GeoScoreSection.tsx`'s own
	 * ring already avoids that same trap.
	 */
	const overallScore = topicScores.length
		? Math.round(
				topicScores.reduce((sum, row) => sum + row.score, 0) /
					topicScores.length
			)
		: 0;

	const topicRows = topicScores.map(({ topic, openCount, score }) => {
		return {
			id: topic.key,
			icon: topic.titleIcon,
			title: topic.title,
			desc: sprintf(
				/* translators: %d: real number of open findings for this topic. */
				__('%d issues', 'vulopilot'),
				openCount
			),
			tags: (
				<>
					<TypographyComponent
						variant="h5"
						weight="bold"
						color={ratingColorFor(score)}
						className="seo-health-score-row-value"
					>
						{score}
						<TypographyComponent
							as="span"
							variant="body-md"
							className="seo-health-score-row-suffix"
						>
							/100
						</TypographyComponent>
					</TypographyComponent>
					<IconComponent name="pagination-right-arrow" />
				</>
			),
			action: () => onSelectTopic?.(topic.key),
		};
	});

	return (
		<CardComponent
			title={__('AEO Score', 'vulopilot')}
			titleIcon="ai"
			desc={__(
				'How ready your content is to be extracted and quoted directly by AI answer engines.',
				'vulopilot'
			)}
			isLoading={isLoading}
		>
			<div className="aeo-score-summary">
				<div className="aeo-score-summary-gauge">
					<div className="geo-overall-visibility">
						<ChartComponent
							type="ring"
							height={200}
							// Top-level `color` — `type="ring"` only ever paints
							// its stroke from this prop, never from `data[].color`
							// below (see SeoTab.tsx's own identical fix) — without
							// it the ring stayed `ChartComponent`'s default brand
							// purple regardless of score.
							color={
								COLOR_PALETTE[
									ratingColorFor(overallScore) as keyof typeof COLOR_PALETTE
								]
							}
							centerLabel={
								<>
									<TypographyComponent
										variant={'h1'}
										color={ratingColorFor(overallScore)}
									>
										{overallScore}
									</TypographyComponent>
									<TypographyComponent variant={'h4'}>
										{overallRatingLabel(overallScore)}
									</TypographyComponent>
								</>
							}
							data={[
								{
									label: __('Score', 'vulopilot'),
									value: overallScore,
									// Same real rating color the ring's own
									// Needs Work/Good/Poor label above already
									// uses (`overallRatingClass()`/
									// `overallRatingLabel()`) — resolved
									// through `COLOR_PALETTE` for the real hex
									// `ratingColorFor()`'s own palette name
									// stands for, same convention SeoTab.tsx's
									// own identical ring already established,
									// rather than a fixed brand purple
									// unrelated to the actual score.
									color: COLOR_PALETTE[
										ratingColorFor(overallScore) as keyof typeof COLOR_PALETTE
									],
								},
								{
									label: __('Remaining', 'vulopilot'),
									value: 100 - overallScore,
									color: '#e5e7eb',
								},
							]}
						/>
						<TypographyComponent variant={'h3'} color="text-green">
							{__('AEO Score', 'vulopilot')}
						</TypographyComponent>
						<div className="desc">
							{__(
								'How ready your content is to be extracted and quoted directly by AI answer engines.',
								'vulopilot'
							)}
						</div>
					</div>
				</div>
				<div className="aeo-score-summary-stat">
					<ListComponent
						className="mini-card report hover without-border seo-health-score-category-list"
						loading={isLoading}
						items={topicRows}
					/>
				</div>
			</div>
			<AnalyticsComponent
				variant="background-color"
				cols={3}
				isLoading={isLoading}
				data={[
					{
						colorClass: 'admin-bg-color2',
						number: sprintf(
							/* translators: 1: real questions-answered count, 2: real total published pages checked. */
							__('%1$d / %2$d', 'vulopilot'),
							questionsAnswered,
							totalPages
						),
						text: __('Questions Answered', 'vulopilot'),
					},
					{
						colorClass: 'admin-bg-color3',
						number: sprintf(
							/* translators: 1: real pages-ready count, 2: real total published pages checked. */
							__('%1$d / %2$d', 'vulopilot'),
							pagesReady,
							totalPages
						),
						text: __('Pages Ready', 'vulopilot'),
					},
					{
						colorClass: 'admin-bg-color4',
						number: (
							<span className={trend && trend.change < 0 ? 'is-attention' : 'is-good'}>
								{changeValue}
							</span>
						),
						text: __('Content Change', 'vulopilot'),
					},
				]}
			/>
		</CardComponent>
	);
};

export default AeoScoreSummaryCard;
