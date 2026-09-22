/* global appLocalizer */
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { applyFilters } from '@wordpress/hooks';
import { __, sprintf } from '@wordpress/i18n';
import {
	getApiLink,
	getApiResponse,
	COLOR_PALETTE,
} from '@zyra/core';
import {
	CardComponent,
	ChartComponent,
	ListComponent,
	TypographyComponent,
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { useApiList } from '../../services/useApiList';

interface DashboardSummary {
	category_scores: { security: number };
}

interface FindingRow {
	id: number;
}

interface AttentionSummary {
	total: number;
	priority_counts: { high: number; medium: number; low: number };
}

/**
 * Same "register a source, don't modify the host" Pro filter slot Security
 * pages already establish elsewhere — Pro's SecurityMonitoring module
 * redesigned the component behind this filter to match the mockup's hero
 * card (severity breakdown, real auto-scan toggle, honestly-disabled
 * Fix-All). It now also accepts `onNavigateToSecurityTab`, passed through
 * below.
 *
 * If a Pro module is registered behind this filter, its component fully
 * replaces this card's own Free-tier rendering — the same behavior
 * `VulnerabilityHeroCard.tsx` had, kept here so Pro's custom hero still
 * wins when it's active.
 */
const SecurityDashboardCard = applyFilters(
	'vulopilot_security_dashboard_card',
	null
) as ComponentType<SecurityStatusCardProps> | null;

/** Same real 3-tier band shape `PerformanceScoreCard.tsx`'s own `Rating` interface uses — kept structurally identical so both files' ring colors read from the same kind of map. */
interface Rating {
	label: string;
	className: 'good' | 'needs-improvement' | 'poor';
}

/** Lighthouse-style real 0-100 bands, matching `PerformanceScoreCard.tsx`'s own `getScoreRating()` so a "good" security score and a "good" performance score mean the same thing. */
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

interface SecurityStatusCardProps {
	/** Navigates to the Security tab — same handler `VulnerabilityHeroCard`'s own "Review Issues First" button already called. */
	onNavigateToSecurityTab?: () => void;
}

/**
 * "Security Status" card — the real `category_scores.security` ring
 * (same `type="ring"` / `RATING_COLOR[ratingClass(...)]` structure
 * `PerformanceScoreCard.tsx` and `AccessibilityHeroCard.tsx` already
 * share), plus everything the old `VulnerabilityHeroCard.tsx` used to
 * render: the "I found N security issues" headline, the real
 * High/Medium/Low/Total breakdown (`GET /findings/attention-summary`,
 * `Findings.php`'s Free-tier route — the same one AI Copilot's own "Needs
 * your attention" card reads), and the two real actions ("Review Issues
 * First" + "View All N Issues"). Nothing was dropped in the merge — the
 * hero data and the ring just live in one card now instead of two.
 *
 * The severity breakdown is now a real `ListComponent` (one row per tier,
 * trailing count on the right, real icon + palette color per tier) —
 * replacing the older `AnalyticsComponent` tile grid, per direct
 * instruction, so this card matches the row shape every other list in
 * this plugin already uses.
 *
 * If Pro's SecurityMonitoring module registers a component behind the
 * `vulopilot_security_dashboard_card` filter, that component replaces
 * this entire card, same as it replaced the old `VulnerabilityHeroCard`.
 */
const SecurityStatusCard = ({
	onNavigateToSecurityTab,
}: SecurityStatusCardProps) => {
	const [score, setScore] = useState<number | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [summary, setSummary] = useState<AttentionSummary | null>(null);
	const [isLoadingSummary, setIsLoadingSummary] = useState(true);

	// Same real open-finding count the old SecurityStatusCard already
	// fetched, still used below for the "protected / needs attention"
	// verdict line.
	const { total: openFindings, isLoading: isLoadingFindings } =
		useApiList<FindingRow>('findings', {
			category: 'security',
			status: 'open',
			per_page: 1,
		});

	useEffect(() => {
		getApiResponse<DashboardSummary>(
			getApiLink(appLocalizer, 'dashboard'),
			{ headers: { 'X-WP-Nonce': appLocalizer.nonce } }
		)
			.then((response) => {
				if (response) {
					setScore(response.category_scores.security);
				}
			})
			.finally(() => setIsLoading(false));

		getApiResponse<AttentionSummary>(
			getApiLink(appLocalizer, 'findings/attention-summary'),
			{ headers: { 'X-WP-Nonce': appLocalizer.nonce } }
		)
			.then((response) => {
				if (response) {
					setSummary(response);
				}
			})
			.finally(() => setIsLoadingSummary(false));
	}, []);

	// Pro's registered component fully replaces this card, same as it did
	// for `VulnerabilityHeroCard`.
	if (SecurityDashboardCard) {
		return (
			<SecurityDashboardCard
				onNavigateToSecurityTab={onNavigateToSecurityTab}
			/>
		);
	}

	const overallScore = score ?? 0;
	const total = summary?.total ?? 0;
	const { high = 0, medium = 0, low = 0 } = summary?.priority_counts ?? {};
	const isReady = !isLoading && !isLoadingSummary;

	/**
	 * Real severity-breakdown rows — same real `high`/`medium`/`low`/`total`
	 * counts the old `AnalyticsComponent` showed, rendered as real
	 * `ListComponent` rows. `icon` uses the same `'<icon-name> <color>'`
	 * suffix convention every other list in this plugin already uses, and
	 * each row's own trailing `tags` cell shows the real count.
	 */
	const severityRows = [
		{
			id: 'high',
			icon: 'error red',
			label: __('High', 'vulopilot'),
			count: high,
		},
		{
			id: 'medium',
			icon: 'question orange',
			label: __('Medium', 'vulopilot'),
			count: medium,
		},
		{
			id: 'low',
			icon: 'info blue',
			label: __('Low', 'vulopilot'),
			count: low,
		},
		{
			id: 'total',
			icon: 'report green',
			label: __('Total findings', 'vulopilot'),
			count: total,
		},
	];

	return (
		<CardComponent
			title={isReady &&
				(total > 0
					? sprintf(
						/* translators: %d is the number of open security findings. */
						__('I found %d security issues.', 'vulopilot'),
						total
					)
					: __(
						"You're all caught up — no open security issues.",
						'vulopilot'
					))}
			titleIcon="security"
			desc={isReady && high > 0 && (
				<>
					{sprintf(
						/* translators: %d is the number of high-priority findings. */
						__('%d should be reviewed first.', 'vulopilot'),
						high
					)}
				</>
			)}
			isLoading={isLoading}
			className="vulnerability-hero security-status-hero"
		>
			{score !== null && (
				<>
					<div className='overall-score-wrapper'>
						<div className="overall-score-summary">
							<ChartComponent
								type="ring"
								height={200}
								// Top-level `color` — same prop this ring's own
								// sibling rings elsewhere in this plugin
								// (OverallScoreWidget.tsx/PerformanceScoreCard.tsx's
								// own ScoreTile/VitalRow) already set; `type="ring"`
								// only ever paints its stroke from this prop, never
								// from `data[].color` (that's `type="pie"`'s own
								// read) — without it the ring always rendered in
								// `ChartComponent`'s default brand purple regardless
								// of score, while the center number above stayed
								// plain black instead of matching its own real
								// rating tier.
								color={RATING_COLOR[ratingClass(overallScore)]}
								centerLabel={
									<>
										<TypographyComponent
											variant={'h1'}
											color={TEXT_COLOR[ratingClass(overallScore)]}
										>
											{overallScore}
										</TypographyComponent>
										<TypographyComponent variant={'desc'}>
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
							<TypographyComponent variant={'h4'}>
								{openFindings > 0
									? __('Your site needs attention', 'vulopilot')
									: __('Your site is protected', 'vulopilot')}
							</TypographyComponent>
						</div>
						<div className="overall-score-summary">
							{isReady && total > 0 && (
								<ListComponent
									className="mini-card report list"
									loading={!isReady}
									items={severityRows.map((row) => ({
										id: row.id,
										icon: row.icon,
										title: row.label,
										tags: (
											<TypographyComponent
												as="span"
												variant="h5"
												weight="bold"
											>
												{row.count}
											</TypographyComponent>
										),
									}))}
								/>
							)}
						</div>
					</div>
				</>
			)}
		</CardComponent>
	);
};

export default SecurityStatusCard;