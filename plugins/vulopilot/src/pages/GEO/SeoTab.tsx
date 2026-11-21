/* global vulopilotAppLocalizer */
import { useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { scrollToId } from '@zyra/core';
import {
	CardComponent,
	ColumnComponent,
	ContainerComponent,
	ModuleGuardComponent,
} from '@zyra/components';
import { useSeoScore, SeoScoreResponse } from './useSeoTabData';
import { getRating } from './seoRating';
import { ALL_SEO_SCANNER_IDS } from './seoIssuesShared';
import { SEO_SECTIONS } from './seoSections';
import IssuesSection from './IssuesSection';
import SeoProgressCard from './SeoProgressCard';
import PageAnalysisPanel from './PageAnalysisPanel';
import ScoreBreakdown from '../../components/ScoreBreakdown/ScoreBreakdown';

const CATEGORY_CARDS: {
	key: keyof SeoScoreResponse['category_scores'];
	title: string;
	icon: string;
	/** A fixed per-category identity color for the icon box. */
	color: string;
}[] = [
		{ key: 'titles-meta', title: __('Titles & Meta', 'vulopilot'), icon: 'search blue', color: 'purple' },
		{ key: 'content-structure', title: __('Content Structure', 'vulopilot'), icon: 'editor-list red', color: 'blue' },
		{ key: 'images', title: __('Images', 'vulopilot'), icon: 'image pink', color: 'green' },
		{ key: 'internal-linking', title: __('Internal Linking', 'vulopilot'), icon: 'link lime', color: 'indigo' },
		{ key: 'indexability-canonicals', title: __('Indexability & Canonicals', 'vulopilot'), icon: 'search-discovery cyan', color: 'teal' },
		{ key: 'structured-data', title: __('Social Metadata', 'vulopilot'), icon: 'blocks teal', color: 'orange' },
	];





/** Real per-band copy under the "Overall SEO Score" ring. */
const scoreSummary = (score: number): string => {
	if (score >= 70) {
		return __(
			'Your site is performing well. Keep optimizing to reach the next level.',
			'vulopilot'
		);
	}
	if (score >= 40) {
		return __(
			'Your site could use some improvement - a few real issues need attention.',
			'vulopilot'
		);
	}
	return __(
		'Your site needs attention - several real SEO issues are open.',
		'vulopilot'
	);
};

/** Real per-category score change. */
const categoryScoreDelta = (category: SeoScoreResponse['category_scores'][keyof SeoScoreResponse['category_scores']]): number | null =>
	category.trend.length > 0 ? category.score - category.trend[0] : null;

/** Unlike the 'geo' module. */
const isSeoModuleActive = () =>
	vulopilotAppLocalizer.active_modules?.includes('technical-seo') ?? false;


const SeoTab = () => {
	const { score, isLoading: isLoadingScore } = useSeoScore();
	const [categoryFocus, setCategoryFocus] = useState<{ key: string; token: number } | null>(
		null
	);
	/** Set by a real "Analyze" click in the "Pages & Posts" table below. */
	const [analyzingPostId, setAnalyzingPostId] = useState<number | null>(null);

	/** Same real "scroll the just-opened detail panel into view" fix the other issues tables' own `handleSelectGroup` already establishes. */
	// `quiet`: the list picked the page itself (on load, or after a filter change), so don't scroll to the panel.
	const handleAnalyze = (postId: number, quiet = false) => {
		setAnalyzingPostId(postId);

		if (!quiet) {
			scrollToId('seo-page-analysis-panel');
		}
	};

	if (!isSeoModuleActive()) {
		return (
			<ColumnComponent>
				<CardComponent
					title={__('SEO', 'vulopilot')}
					titleIcon="search"
					desc={__('Your site-wide SEO score and open issues.', 'vulopilot')}
				>
					<ModuleGuardComponent
						icon="error"
						title={__('SEO module is turned off', 'vulopilot')}
						desc={__(
							'Turn the SEO module back on from Settings → Modules to resume SEO scanning and see its findings again here. Findings already found before it was turned off aren’t deleted - they still show up on the Health page, which lists every category.',
							'vulopilot'
						)}
					/>
				</CardComponent>
			</ColumnComponent>
		);
	}

	return (
		<ContainerComponent>
			<ColumnComponent grid={6} fullHeight>
				<CardComponent
					title={__('SEO Health', 'vulopilot')}
					titleIcon="search"
					desc={__('Your real, site-wide SEO score, open issue counts, and progress over time.', 'vulopilot')}
					isLoading={isLoadingScore || undefined}
				>
					{score && (
						<ScoreBreakdown
							score={score.seo_score}
							ratingLabel={getRating(score.seo_score)}
							summary={scoreSummary(score.seo_score)}
							rows={CATEGORY_CARDS.map((card) => {
								const category = score.category_scores[card.key];

								return {
									key: card.key,
									icon: card.icon.split(' ')[0],
									title: card.title,
									sub: sprintf(
										/* translators: %d: number of open findings. */
										_n('%d issue', '%d issues', category.open_count, 'vulopilot'),
										category.open_count
									),
									score: category.score,
									change: categoryScoreDelta(category),
									onClick: () => setCategoryFocus({ key: card.key, token: Date.now() }),
								};
							})}
							stats={[
								{ label: __('Pages checked', 'vulopilot'), value: score.pages_checked },
								{ label: __('Issues found', 'vulopilot'), value: score.total_open },
								{
									label: __('Critical', 'vulopilot'),
									value: score.severity_breakdown.critical,
									tone: score.severity_breakdown.critical > 0 ? 'bad' : undefined,
								},
								{
									label: __('High priority', 'vulopilot'),
									value: score.severity_breakdown.high,
									tone: score.severity_breakdown.high > 0 ? 'warn' : undefined,
								},
							]}
						/>
					)}
				</CardComponent>
			</ColumnComponent>

			<ColumnComponent grid={6} fullHeight>
				<SeoProgressCard />
			</ColumnComponent>
			<ColumnComponent grid={8}>
				{/* SEO's own thin, defaults-only wrapping of the generalized * IssuesSection.tsx. */}
				<IssuesSection
					id="seo-all-issues-table"
					scannerIds={ALL_SEO_SCANNER_IDS}
					categories={SEO_SECTIONS}
					categoryFocus={categoryFocus}
					issuesColumnLabel="SEO Issues"
					onAnalyze={handleAnalyze}
					activePostId={analyzingPostId}
					onAnalyzeClose={() => setAnalyzingPostId(null)}
					pageScore
				/>
			</ColumnComponent>
			{analyzingPostId && (
				<ColumnComponent grid={4}>
					<div id="seo-page-analysis-panel">
					<PageAnalysisPanel
						postId={analyzingPostId}
					/>
					</div>
				</ColumnComponent>
			)}
		</ContainerComponent>
	);
};

export default SeoTab;
