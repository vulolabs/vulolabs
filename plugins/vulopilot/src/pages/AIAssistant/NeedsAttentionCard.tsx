/* global appLocalizer */
import React, { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, COLOR_PALETTE } from '@zyra/core';
import {
	CardComponent,
	ChartComponent,
	InformationItemComponent,
	ModuleGuardComponent,
	ListComponent,
	TypographyComponent,
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import './AICopilot.scss';

/**
 * Narrow local slice of `/dashboard`'s real aggregate payload (same
 * endpoint OverallScoreWidget.tsx/SecurityStatusCard.tsx already read) —
 * only the fields this card's own "Site Overview" breakdown renders,
 * same "define just the subset actually used" call SecurityStatusCard.tsx
 * already makes rather than importing dashboard-widgets/types.ts's full
 * DashboardSummary wholesale.
 */
interface DashboardSummary {
	overall_score: number;
	open_findings: number;
	category_scores: {
		seo: number;
		performance: number;
		security: number;
		content: number;
	};
}

export interface IssuesFilter {
	scannerId: string;
	label: string;
	category: string;
}

interface NeedsAttentionCardProps {
	onNavigateTab: (tab: string, filter?: IssuesFilter) => void;
}

type ScoreTone = 'green' | 'orange' | 'red';

/**
 * One shared 3-band split for both the ring's own descriptive rating and
 * each category row's colored number — green >= 75, orange 60-74, red <
 * 60. Deliberately one function reused both places rather than two
 * separately-tuned scales, so a row's color and the headline rating it
 * rolls up into never disagree about where a given score sits.
 */
const getScoreTone = (score: number): ScoreTone => {
	if (score >= 75) {
		return 'green';
	}
	if (score >= 60) {
		return 'orange';
	}
	return 'red';
};

// Real zyra palette hex (`@zyra/core`'s `COLOR_PALETTE`) — same colors
// SecurityStatusCard.tsx's own ChartComponent pie uses for this exact
// "green/orange/red gauge" pattern (that one only needed two of the
// three, this one needs the full set), read from the one shared source
// instead of each file guessing its own approximation of "orange".
const TONE_COLOR: Record<ScoreTone, string> = {
	green: COLOR_PALETTE.green,
	orange: COLOR_PALETTE.orange,
	red: COLOR_PALETTE.red,
};

const TONE_RATING_LABEL: Record<ScoreTone, string> = {
	green: __('Good', 'vulopilot'),
	orange: __('Needs Work', 'vulopilot'),
	red: __('At Risk', 'vulopilot'),
};

/**
 * AI Copilot's "Site Overview" card — a real health-score breakdown read
 * from `GET /dashboard` (the same aggregate payload the Dashboard's own
 * OverallScoreWidget/SecurityStatusCard already read), replacing the old
 * priority-pill + top-issue-type preview: a ring for `overall_score`, the
 * 4 category scores the mockup shows (SEO & Visibility, Performance,
 * Security, Content), and a real `open_findings` count linking to the
 * Issues table.
 */
const NeedsAttentionCard: React.FC<NeedsAttentionCardProps> = ({
	onNavigateTab,
}) => {
	const [summary, setSummary] = useState<DashboardSummary | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = () => {
		setIsLoading(true);
		setError(null);

		getApiResponse<DashboardSummary>(getApiLink(appLocalizer, 'dashboard'), {
			headers: { 'X-WP-Nonce': appLocalizer.nonce },
		})
			.then((response) => {
				if (!response) {
					setError(
						__(
							'Could not load your site overview.',
							'vulopilot'
						)
					);
					return;
				}

				setSummary(response);
			})
			.finally(() => setIsLoading(false));
	};

	useEffect(load, []);

	// The Issues table is inline on the page now (appended below the
	// composer), not a separate 'issues' nav tab — this card is only ever
	// rendered directly on AIAssistant.tsx, so 'chat' just updates that
	// page's own issuesFilter state and its scroll-into-view effect,
	// rather than actually switching tabs.
	const goToAllIssues = () => onNavigateTab('chat');

	const overallTone = summary ? getScoreTone(summary.overall_score) : 'green';

	const scoreRows = summary
		? [
				{
					key: 'seo',
					icon: 'search-discovery yellow',
					label: __('SEO & Visibility', 'vulopilot'),
					score: summary.category_scores.seo,
				},
				{
					key: 'performance',
					icon: 'bar-chart teal',
					label: __('Performance', 'vulopilot'),
					score: summary.category_scores.performance,
				},
				{
					key: 'security',
					icon: 'security purple',
					label: __('Security', 'vulopilot'),
					score: summary.category_scores.security,
				},
				{
					key: 'content',
					icon: 'document yellow',
					label: __('Content', 'vulopilot'),
					score: summary.category_scores.content,
				},
			]
		: [];

	return (
		<div id="site-overview-card">
		<CardComponent
			title={__('Site Overview', 'vulopilot')}
			titleIcon="analytics"
			desc={__('Your open issues, broken down by category.', 'vulopilot')}
		>
			{error ? (
				<ModuleGuardComponent
					icon="error"
					title={__('Could not load issues', 'vulopilot')}
					desc={error}
					buttonText={__('Retry', 'vulopilot')}
					onButtonClick={load}
				/>
			) : isLoading || !summary ? (
				<>
					{Array.from({ length: 3 }).map((_, index) => (
						<InformationItemComponent key={index} title="" isLoading />
					))}
				</>
			) : (
				<>
					<div className="overall-score-summary">
						{/* Same `type="ring"` ChartComponent + TypographyComponent
						centerLabel structure every other real score ring in this
						app now uses (OverallScoreWidget.tsx/SeoTab.tsx/
						CrawlerAnalyticsSection.tsx/etc.), instead of this card's
						own now-removed ScoreRingComponent usage. */}
						<ChartComponent
							type="ring"
							height={200}
							// Top-level `color` — `type="ring"` only ever paints
							// its stroke from this prop, never from `data[].color`
							// below (same real fix every other converted ring
							// already carries).
							color={TONE_COLOR[overallTone]}
							centerLabel={
								<>
									<TypographyComponent variant={'h1'} color={overallTone}>
										{summary.overall_score}
									</TypographyComponent>
									<TypographyComponent variant={'h4'}>
										{TONE_RATING_LABEL[overallTone]}
									</TypographyComponent>
								</>
							}
							data={[
								{
									label: __('Score', 'vulopilot'),
									value: summary.overall_score,
									color: TONE_COLOR[overallTone],
								},
								{
									label: __('Remaining', 'vulopilot'),
									value: 100 - summary.overall_score,
									color: '#e5e7eb',
								},
							]}
						/>
						<TypographyComponent variant={'h3'} color="text-green">
							{__('Overall Health', 'vulopilot')}
						</TypographyComponent>
						<div className="desc">
							{__('Your open issues, broken down by category.', 'vulopilot')}
						</div>
					</div>

					{/* Same `ListComponent` + "mini-card report" variant this card's own
					    old group rows used (and most other cards across this plugin —
					    TopIssuesToWorkOn.tsx, StoreIntelligenceSummaryCard.tsx, etc. —
					    already reuse it too): icon on the left, `tags` pinned to the
					    right (ListComponent.scss's own `.report .tags`), which is
					    exactly this row's icon+label…score shape without hand-rolling a
					    new row layout. */}
					<ListComponent
						className="mini-card report without-border"
						items={scoreRows.map((row) => {
							const tone = getScoreTone(row.score);

							return {
								id: row.key,
								icon: row.icon,
								title: row.label,
								tags: (
									<TypographyComponent
										as="span"
										variant="body-md"
										weight="bold"
										color={tone}
										className="site-overview-score-row-value"
									>
										{row.score}
										<TypographyComponent
											as="span"
											variant="body-md"
											className="site-overview-score-row-suffix"
										>
											/100
										</TypographyComponent>
									</TypographyComponent>
								),
							};
						})}
					/>

					<div className="site-overview-footer">
						<TypographyComponent
							variant="desc"
						>
							{sprintf(
								/* translators: %d: number of real open findings across the site */
								__('%d open issues found', 'vulopilot'),
								summary.open_findings
							)}
						</TypographyComponent>
						<ButtonInput
							wrapperClass="site-overview-footer-link"
							buttons={{
								text: __('View all issues', 'vulopilot'),
								rightIcon: 'pagination-right-arrow',
								color: 'text-purple',
								onClick: goToAllIssues,
							}}
						/>
					</div>

				</>
			)}
		</CardComponent>
		</div>
	);
};

export default NeedsAttentionCard;
