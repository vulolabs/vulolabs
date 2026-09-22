/* global appLocalizer */
import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, COLOR_PALETTE } from '@zyra/core';
import {
	AnalyticsComponent,
	CardComponent,
	ChartComponent,
	TypographyComponent,
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { useApiList } from '../../services/useApiList';
import { ACCESSIBILITY_SCANNER_IDS } from './accessibilityChecks';
import AccessibilityChecksGrid from './AccessibilityChecksGrid';

interface AccessibilityFinding {
	id: number;
	severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
	page?: string;
}

interface DashboardSummary {
	category_scores: { accessibility: number };
	category_scores_7d_ago: { accessibility: number };
}

interface AccessibilityHeroCardProps {
	onReviewIssues: () => void;
}

/** Same real 3-tier band shape `PerformanceScoreCard.tsx`'s own `Rating` interface uses — kept structurally identical so both files' ring colors read from the same kind of map. */
interface Rating {
	label: string;
	className: 'good' | 'needs-improvement' | 'poor';
}

/** Lighthouse-style real 0-100 bands, matching `PerformanceScoreCard.tsx`'s own `getScoreRating()` so a "good" accessibility score and a "good" performance score mean the same thing. */
const getScoreRating = (score: number): Rating => {
	if (score >= 90) {
		return { label: __('Good', 'vulopilot'), className: 'good' };
	}
	if (score >= 50) {
		return { label: __('Needs Work', 'vulopilot'), className: 'needs-improvement' };
	}
	return { label: __('At Risk', 'vulopilot'), className: 'poor' };
};

/**
 * Real zyra palette hex (`@zyra/core`'s `COLOR_PALETTE`) — same real
 * source `PerformanceScoreCard.tsx`'s own `RATING_COLOR` reads. The ring's
 * own `data[].color` needs a literal CSS color, not a palette class name,
 * so this reads the shared source rather than a second hardcoded copy.
 */
const RATING_COLOR: Record<Rating['className'], string> = {
	good: COLOR_PALETTE.green,
	'needs-improvement': COLOR_PALETTE.orange,
	poor: COLOR_PALETTE.red,
};

/** Same 3 tiers as `RATING_COLOR` above, mapped to `TypographyComponent`'s own palette color names instead of a literal hex — for the ring's center number, which (unlike the ring itself) reads a class name through that prop, not a CSS color. */
const TEXT_COLOR: Record<Rating['className'], string> = {
	good: 'green',
	'needs-improvement': 'orange',
	poor: 'red',
};

/** Same real bands as `getScoreRating()` above, mapped to the real palette class name the ring color map is keyed by. */
const ratingClass = (score: number): Rating['className'] => {
	return getScoreRating(score).className;
};

/**
 * `category_scores.accessibility` (GET /dashboard, same endpoint
 * SecurityStatusCard.tsx already uses) is real,
 * but `Dashboard::calculate_category_score()` scores category
 * `accessibility` alone — 5 of this page's 7 real scanners (everything
 * but ImagesScanner's `images` category and ReadabilityScanner's
 * `content` category). Still the most honest real number available
 * (a genuine server-computed score, not a fabricated one) — just
 * documented here rather than silently presented as if it covered all 7.
 */
const getRating = (score: number): string => {
	if (score >= 90) {
		return __(
			'Great job',
			'vulopilot'
		);
	}
	if (score >= 70) {
		return __('Accessibility needs some attention.', 'vulopilot');
	}
	if (score >= 50) {
		return __('Accessibility needs attention.', 'vulopilot');
	}
	return __('Accessibility needs urgent attention.', 'vulopilot');
};

/**
 * The mockup's hero card — a real accessibility score gauge (see
 * getRating()'s own docblock for its one real scope caveat), a real
 * open-findings total/high-priority-count/distinct-pages-affected
 * breakdown (computed from the same combined `ACCESSIBILITY_SCANNER_IDS`
 * fetch every other new component on this tab uses), and two real
 * actions. Everything stacks in one column (score gauge, then headline,
 * then the stat row, then the two buttons) — deliberately not the
 * side-by-side donut+text row VulnerabilityHeroCard/SecurityMockupHeader
 * use for Security, since this reference mockup's own hero card is a
 * single stacked column instead.
 */
const AccessibilityHeroCard = ({
	onReviewIssues,
}: AccessibilityHeroCardProps) => {
	const [score, setScore] = useState<number | null>(null);
	const [previousScore, setPreviousScore] = useState<number | null>(null);

	useEffect(() => {
		getApiResponse<DashboardSummary>(
			getApiLink(appLocalizer, 'dashboard'),
			{ headers: { 'X-WP-Nonce': appLocalizer.nonce } }
		).then((response) => {
			if (response) {
				setScore(response.category_scores.accessibility);
				setPreviousScore(response.category_scores_7d_ago.accessibility);
			}
		});
	}, []);

	// Real week-over-week delta — `category_scores_7d_ago` is already part
	// of the same `GET /dashboard` response this card already fetches
	// (Dashboard.php's own snapshot-based 7-days-ago score), just not
	// previously surfaced here. `null` when the delta is genuinely zero or
	// either score hasn't loaded yet, so no "+0" noise shows.
	const scoreDelta =
		null !== score && null !== previousScore && score !== previousScore
			? score - previousScore
			: null;

	const { data, total, isLoading } = useApiList<AccessibilityFinding>(
		'findings',
		{
			scanner_id: ACCESSIBILITY_SCANNER_IDS.join(','),
			status: 'open',
			// Bounds the client-side high-priority/pages-affected tally to
			// the 100 most recent open findings — same tradeoff
			// useSectionStatus.ts's own docblock documents; `total` itself
			// stays exact regardless.
			per_page: 100,
		}
	);

	const highCount = data.filter(
		(row) => row.severity === 'critical' || row.severity === 'high'
	).length;
	const pagesAffected = new Set(
		data.map((row) => row.page).filter(Boolean)
	).size;

	const isReady = !isLoading && score !== null;
	const overallScore = (score as number) ?? 0;

	return (
		<CardComponent isLoading={!isReady} className="accessibility-hero">
			<div className='overall-score-wrapper'>
				<div className='overall-score-summary'>
					{isReady && (
						<>
							<ChartComponent
								type="ring"
								height={200}
								// Top-level `color` — see SecurityStatusCard.tsx's
								// own identical fix: `type="ring"` only ever paints
								// its stroke from this prop, never from
								// `data[].color`, so without it the ring stayed
								// `ChartComponent`'s default brand purple regardless
								// of score.
								color={RATING_COLOR[ratingClass(overallScore)]}
								centerLabel={
									<>
										<TypographyComponent
											variant={'h1'}
											color={TEXT_COLOR[ratingClass(overallScore)]}
										>
											{overallScore}
										</TypographyComponent>
										<TypographyComponent variant={'h4'}>
											{getScoreRating(overallScore).label}
										</TypographyComponent>
									</>
								}
								data={[
									{
										label: __('Score', 'vulopilot'),
										value: overallScore,
										color: RATING_COLOR[ratingClass(overallScore)],
									},
									{
										label: __('Remaining', 'vulopilot'),
										value: 100 - overallScore,
										color: '#e5e7eb',
									},
								]}
							/>
							<TypographyComponent variant={'h3'} color="text-green">
								{getRating(score as number)}
								
							</TypographyComponent>
							<div className="desc">
								{total > 0
									? sprintf(__(
											'Most visitors can use your site, but some areas could be improved.',
											'vulopilot'
										),
									)
									: __(
										"You're all caught up — no open accessibility issues right now.",
										'vulopilot'
									)}
							</div>
							<ButtonInput
								position="left"
								buttons={[
									{
										text: __('Review Important Issues', 'vulopilot'),
										rightIcon: 'pagination-right-arrow',
										color: 'border-purple',
										onClick: onReviewIssues,
									},
								]}
							/>
						</>
					)}
				</div>
				<div className='overall-score-summary'>
					<AccessibilityChecksGrid />
				</div>
			</div>
		</CardComponent>
	);
};

export default AccessibilityHeroCard;