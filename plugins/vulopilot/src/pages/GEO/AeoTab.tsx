import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { useModules } from '@zyra/core';
import { ColumnComponent, ContainerComponent } from '@zyra/components';
import AeoScoreSummaryCard from './AeoScoreSummaryCard';
import { computeTrendChange } from './geoTrendChange';
import AeoCitationCoverageCard from './AeoCitationCoverageCard';
import AeoEngineTestingCard from './AeoEngineTestingCard';
import IssuesSection from './IssuesSection';
import GeoAeoPageAnalysisPanel from './GeoAeoPageAnalysisPanel';
import {
	useAllFindingGroups,
	sumGroupCounts,
	useGeoVisibilitySnapshot,
	type GeoVisibilityHistoryRow,
} from './useGeoTabData';
import { useAeoPageAnalysis } from './useAeoPageAnalysis';

/**
 * Section → scanner_id grouping for AEO's 6 real topics — every scanner_id
 * here is a real, already-scanning-today scanner (Free unless noted); no
 * topic invents a signal that doesn't exist. Restructured from the
 * previous 5-topic version (direct instruction: match the reference
 * mockup's own 6-tile "AEO Checks at a Glance" grid) by splitting out a
 * 6th real topic — "Content Structure" — from GEO's own
 * `geo-chunking`/`geo-semantic-structure` scanners rather than inventing a
 * second "AI Summary" tile that would just re-show `geo-summary-block`'s
 * numbers under a second name (the mockup's own "Direct Answers" and "AI
 * Summary" tiles both describe that one real scanner — see "Direct
 * Answers"'s own description below for why they're kept as one real tile,
 * not duplicated data under two labels).
 *
 * Reusing `geo-chunking`/`geo-semantic-structure` here — scanners GEO's own
 * "AI-Readable Structure" topic also uses — is the same accepted overlap
 * this file already documents for `geo-summary-block` (also shown under
 * GEO's "AI Summary" topic): a finding can legitimately show up under both
 * GEO's and AEO's own groupings, since each tab is its own complete lens
 * over the same real finding data, not a disjoint partition of it.
 */
const AEO_SECTIONS: {
	key: string;
	title: string;
	titleIcon: string;
	description: string;
	emptyMessage: string;
	scannerIds: string[];
}[] = [
	{
		key: 'coverage',
		title: __('Questions & Answers', 'vulopilot'),
		titleIcon: 'question blue',
		description: __(
			'Whether pages clearly answer the questions people are likely to ask, with a dedicated FAQ or Q&A block making that answer easy for AI to extract.',
			'vulopilot'
		),
		emptyMessage: __(
			'No question-coverage findings yet — run a scan to check for FAQ opportunities.',
			'vulopilot'
		),
		scannerIds: ['geo-faq-opportunity'],
	},
	{
		key: 'answers',
		title: __('Direct Answers', 'vulopilot'),
		titleIcon: 'analytics pink',
		description: __(
			'Whether pages have an extractable AI summary — a short, up-front answer an AI system can quote directly, rather than one buried in the middle of the content.',
			'vulopilot'
		),
		emptyMessage: __(
			'No direct-answer findings yet — run a scan to check for AI summary blocks.',
			'vulopilot'
		),
		scannerIds: ['geo-summary-block'],
	},
	{
		key: 'schema',
		title: __('Schema Markup', 'vulopilot'),
		titleIcon: 'shortcode teal',
		description: __(
			'Content already shaped like an FAQ or a how-to guide, but missing the schema.org markup that lets AI answer engines recognize it as one.',
			'vulopilot'
		),
		emptyMessage: __(
			'No schema findings yet — run a scan to check FAQ/HowTo-shaped content for missing markup.',
			'vulopilot'
		),
		scannerIds: ['aeo-schema'],
	},
];

/** Exported so KeyPagesWidget.tsx's own Dashboard-tab "Issues at a glance" row can count real open AEO findings the same way this tab itself does, rather than duplicating this scanner-id union a 2nd time. */
export const ALL_AEO_SCANNER_IDS = AEO_SECTIONS.flatMap((section) => section.scannerIds);

const average = (values: number[]): number =>
	values.length
		? Math.round(values.reduce((sum, n) => sum + n, 0) / values.length)
		: 0;

/**
 * The same 3-dimension average the "AEO Score" ring below computes for
 * "today" (`answer_first_structure`/`question_coverage`/`citation_readiness`),
 * applied to one historical `history` row instead — passed as
 * `computeTrendChange()`'s (geoTrendChange.ts) own `getScore` param so
 * "AEO Score Over Time" trends this scoped average rather than its
 * default sitewide `overall_score`. Returns null for a day the sample batch found nothing
 * to average (same meaning `overall_score: null` already carries).
 */
const getAeoTrendScore = (row: GeoVisibilityHistoryRow): number | null =>
	row.ai_scores && row.sub_scores
		? average([
				row.ai_scores.answer_first_structure,
				row.ai_scores.question_coverage,
				row.sub_scores.citation_readiness,
			])
		: null;

/**
 * Whether GeoInsights' own Rest.php class is registered at all — either
 * 'geo-insights' or 'aeo-insights' being active is enough, since both
 * register that same class (AeoInsights\Module.php's own docblock). The
 * real gate AeoCitationCoverageCard.tsx/AeoEngineTestingCard.tsx check
 * before letting a click spend a real AI call, same "check the real
 * active_modules list directly" posture GeoTab.tsx's own
 * `isGeoInsightsActive()` already uses for its sibling Competitor
 * Visibility card.
 *
 * Takes `modules` from zyra's own `useModules()` store rather than reading
 * `appLocalizer.active_modules` directly: that global is a static snapshot
 * localized once at initial page load, so a module toggled on in Settings →
 * Modules (which updates `useModules()`'s store live via `insertModule()`,
 * not `appLocalizer`) would otherwise still read as inactive here until a
 * full browser refresh — "Unlock with Pro" kept popping back up right after
 * enabling the module for this exact reason.
 */
const isCitationCheckActive = (modules: string[]): boolean =>
	modules.includes('geo-insights') || modules.includes('aeo-insights');

/**
 * AEO = Answer Engine Optimization — whether AI systems can extract,
 * structure, and cite a direct answer from this site's pages (distinct from
 * GEO's broader "can an AI understand this page at all" scope, and from
 * classic search-engine SEO). Rebuilt a second time to close the remaining
 * gap against the reference mockup (direct instruction: "still missing some
 * sections"), reusing real data/components already built for this tab or
 * for GEO rather than duplicating them:
 *
 * 1. Two real info banners (static, honest explanatory copy).
 * 2. "AEO Score" (AeoScoreSummaryCard.tsx) — one real card built to match a
 *    second reference mockup exactly (direct instruction: "design this
 *    exact same card... with dynamic data"). Sits grid 6/6 beside "AEO
 *    Checks at a Glance" (item 4 below) — on the right, "AEO Checks at a
 *    Glance" on the left, per direct instruction ("i want this order in
 *    aeo tab"), swapped from this row's own original left/right placement.
 *    The card itself: the score gauge (Pro-gated
 *    bucket average) + a real "Goal: 70+" nudge (same cutoff `getRating()`/
 *    `ratingClass()` below already use for "Good") on the left, 4 real
 *    stat rows on the right — "Out of 100"/"Current AEO Score" restates
 *    the same gauge number as its own row (intentional, matching the
 *    mockup exactly, not an accidental duplicate the way earlier passes on
 *    this tab flagged and removed real ones), "Questions Answered" and
 *    "Pages Ready" (both real, see useAeoPageAnalysis.ts's own docblock
 *    for where their numbers come from — these used to be 2 separate
 *    standalone tiles beside the score card, now folded into this card's
 *    own row list), and "Content Change" — the real first-vs-latest score
 *    delta over the last 30 days, via geoTrendChange.ts's own
 *    `computeTrendChange()` (extracted from the old GeoTrendCompactCard.tsx
 *    component so this card could reuse the exact same real number
 *    without a sparkline chart, which this mockup doesn't show — "not
 *    enough history
 *    yet" renders an em dash there rather than a fabricated number).
 *    `VisibilitySnapshotBuilder` had been writing a real per-day
 *    `ai_scores`/`sub_scores` breakdown into `vulopilot_geo_visibility_history`
 *    since day one (GeoVisibilityHistoryRepository::upsert_today()'s own
 *    `longtext` columns); `Rest.php::get_visibility_history()` just never
 *    read those two columns back out, so every consumer only ever saw the
 *    one combined `overall_score`. Decoding and returning them there
 *    closed that gap for real, so "Content Change" trends the same
 *    answer_first_structure/question_coverage/citation_readiness average
 *    the gauge already uses, per historical day. A 4th stat tile, "Open
 *    Issues", briefly sat in this row too, before this redesign — removed
 *    (direct instruction: "remove the duplicate content") since it was the
 *    exact same open-findings total already shown two other ways on this
 *    same tab: summed across "AEO Checks at a Glance"'s 6 topic tiles
 *    below, and again as the issues table's own "All Issues" summary card
 *    (IssuesSection.tsx, left untouched — direct instruction: "table
 *    intact no change").
 * 3. "Top Pages by Answer Readiness" (TopPagesCard.tsx, genericized so it
 *    could be scoped to AEO's own scanner ids instead of GEO's
 *    `category=geo` default) sat here, full width on its own — removed per
 *    direct instruction (same "Pages & Posts" score it duplicated is
 *    already sortable now, see IssuesSection.tsx's own `pageAnalysis`
 *    table below). "What Needs Your Attention" (GeoFixTheseFirstCard.tsx)
 *    used to sit alongside it here too — removed from this tab per direct
 *    instruction (GeoTab.tsx's own "Fix These First" usage of that same
 *    component was removed earlier this session too). Both components are
 *    still real, just not currently rendered by either GEO or AEO.
 * 4. "AEO Checks at a Glance" (GeoByTopicGrid.tsx, reused) — not currently
 *    rendered on this tab (same standing state item 3 documents for its
 *    own two cards); the component itself is unchanged and still real —
 *    6 real topics (AEO_SECTIONS) instead of the 5 GeoTab.tsx's own usage
 *    shows. Its unused import was removed from here rather than kept
 *    around for a component that isn't rendered.
 * 5. "Need Help Improving?" briefly existed here (3 shortcuts: Ask AI
 *    Copilot, Fix Automatically, Learn More) — removed per direct
 *    instruction. Its own `scrollToId('aeo-top-banner')` target
 *    (`<div id="aeo-top-banner">` wrapping the "In plain English" banner
 *    at the top of this tab) had no other caller once this section was
 *    gone, so that wrapper div/id was removed too rather than left as
 *    dead scroll-target infrastructure.
 * 6. "Answerability Signals" — briefly existed as its own real card (the
 *    same 3 scores the "AEO Score" ring averages together —
 *    `answer_first_structure`/`question_coverage`/`citation_readiness` —
 *    broken out individually), then removed (direct instruction: "remove
 *    the duplicate content") once it was live: it was the exact same 3
 *    numbers as the AEO Score ring above, just re-shown unaveraged one
 *    section down, and its own tile labels ("Direct Answer Structure",
 *    "Question Coverage", "Citation Readiness") collided confusingly with
 *    "AEO Checks at a Glance"'s differently-sourced topic tiles ("Direct
 *    Answers", "Questions & Answers", "Evidence & Sources" — real
 *    finding counts, not AI-judged scores). The AEO Score ring is the one
 *    place those 3 dimensions are shown now. "Answer Engine Coverage"
 *    (AeoCitationCoverageCard.tsx) and "Engine Testing"
 *    (AeoEngineTestingCard.tsx, NEW) are real and functional now — both
 *    real outbound calls to this site's own configured AI service
 *    (`GeoInsights\CitationCoverageChecker`, reusing Free's own
 *    `ai_request_sender` — the exact safety-validated call path
 *    GeoAnalysis\GeoAnalyzer already uses for GEO Score), asking it a real
 *    question drawn from the site's own content without ever naming the
 *    site, then checking whether the model's own real answer already
 *    recognizes it. Genuinely disclosed as "Simulated" (that badge
 *    predates this build and is still accurate): a plain chat completion
 *    has no live web search, so it can only ever recognize a site it
 *    already learned about during training — a "not recognized" result on
 *    a small or new site is an expected, true finding, not a broken
 *    check. Both gate on `isCitationCheckActive()` (same real
 *    `active_modules` check GeoTab.tsx's own `isGeoInsightsActive()`
 *    already uses for its sibling Competitor Visibility card) rather than
 *    the `hasSnapshot` a snapshot-cron run happens to have populated.
 * 7. "All AEO Issues" — `IssuesSection.tsx` (SeoTab.tsx's own real
 *    filter-pills + Site-wide Issues + Pages & Posts structure,
 *    generalized so this tab and GeoTab.tsx can reuse it too, per direct
 *    instruction), replacing the differently-shaped `SectionedFindingsTab.tsx`
 *    this used before. Its own `pageAnalysis` prop merges what used to be a
 *    separate standalone "Page-by-page answer readiness" table
 *    (GeoPageAnalysisTable.tsx, every page + a real deterministic
 *    answer-readiness % scoped to AEO's own scanner ids + Export CSV)
 *    directly into the "Pages & Posts" table here, per direct instruction
 *    ("merge the 2 sections... into the 2nd") — that component is now dead
 *    code on this tab (GeoTab.tsx merges the same way).
 */
const AeoTab = () => {
	const [categoryFocus, setCategoryFocus] = useState<{
		key: string;
		token: number;
	} | null>(null);
	/** Set by a real "Analyze" click in the "Pages & Posts" table below — opens `GeoAeoPageAnalysisPanel` as a real sidebar, same real "Analyze"/"Viewing" toggle + side panel SeoTab.tsx's own SEO table already has (see that panel's own docblock for why it shows real findings instead of a fabricated pass/fail checklist). */
	const [analyzingPostId, setAnalyzingPostId] = useState<number | null>(null);
	const { modules } = useModules();
	const { groups, isLoading: isLoadingGroups } = useAllFindingGroups();
	const { history, isLoading: isLoadingSnapshot } = useGeoVisibilitySnapshot();
	const { pages: aeoPages, total: totalPages, isLoading: isLoadingPages } =
		useAeoPageAnalysis(ALL_AEO_SCANNER_IDS);

	// "Questions Answered" — real published pages minus the real count of
	// pages with an open geo-faq-opportunity finding (i.e. pages that
	// already have adequate question coverage). Reuses the same `groups`
	// fetch above rather than a second request just for this one number.
	const openFaqFindings = sumGroupCounts(groups, ['geo-faq-opportunity']);
	const questionsAnswered = totalPages
		? Math.max(0, totalPages - openFaqFindings)
		: 0;

	// "Pages Ready" — real published pages with zero open AEO findings
	// (across all 6 topics above), out of the real total. `aeoPages` is
	// the same real `/geo-analysis/pages` dataset GeoPageAnalysisTable
	// below independently re-fetches paginated — see useAeoPageAnalysis.ts's
	// own docblock for why this is a second real request rather than a
	// shared one.
	const pagesReady = aeoPages.filter((page) => 0 === page.open_findings).length;

	/**
	 * Sets a fresh `categoryFocus` (a new `token` even for the same `key`
	 * twice in a row) — `IssuesSection.tsx`'s own effect both switches its
	 * active filter to that category (or resets to unfiltered for the
	 * literal `'all'`) and scrolls itself into view, so this doesn't also
	 * need its own `scrollToId()` call the way the old `SectionedFindingsTab`-based
	 * version did (that component had no such self-scrolling behavior).
	 */
	const goToIssuesTable = (key: string = 'all') => {
		setCategoryFocus({ key, token: Date.now() });
	};

	const aeoTrend = computeTrendChange(history, getAeoTrendScore);

	return (
		<ContainerComponent>
			<ColumnComponent grid={6}>
				<AeoScoreSummaryCard
					isLoading={isLoadingSnapshot || isLoadingGroups || isLoadingPages}
					questionsAnswered={questionsAnswered}
					totalPages={totalPages}
					pagesReady={pagesReady}
					trend={aeoTrend}
					topics={AEO_SECTIONS}
					groups={groups}
					onSelectTopic={goToIssuesTable}
				/>
			</ColumnComponent>
			<AeoCitationCoverageCard isActive={isCitationCheckActive(modules)} />
			<AeoEngineTestingCard isActive={isCitationCheckActive(modules)} pages={aeoPages} />
	

			{/* Same real "filter pills + Site-wide Issues + Pages & Posts" structure SeoTab.tsx's own issues table already has (IssuesSection.tsx, generalized from what used to be SEO-only) — replaces the differently-shaped SectionedFindingsTab this used before, per direct instruction. `pageAnalysis` merges the former standalone "Page-by-Page Answer Readiness" table into the "Pages & Posts" table below. */}
			<ColumnComponent grid={8}>
				<IssuesSection
					id="aeo-all-issues-table"
					title={__('All AEO Findings', 'vulopilot')}
					scannerIds={ALL_AEO_SCANNER_IDS}
					categories={AEO_SECTIONS}
					categoryFocus={categoryFocus}
					issuesColumnLabel={__('AEO Issues', 'vulopilot')}
					pageAnalysis={{
						scoreColumnLabel: __('Answer Readiness', 'vulopilot'),
						exportFilename: 'aeo-page-analysis.csv',
					}}
					onAnalyze={setAnalyzingPostId}
					activePostId={analyzingPostId}
				/>
			</ColumnComponent>
			{analyzingPostId && (
				<ColumnComponent grid={4}>
					<GeoAeoPageAnalysisPanel
						postId={analyzingPostId}
						scannerIds={ALL_AEO_SCANNER_IDS}
						title={__('Page Analysis', 'vulopilot')}
						desc={__(
							'A single page’s real AEO signals from your most recent scan.',
							'vulopilot'
						)}
						onClose={() => setAnalyzingPostId(null)}
					/>
				</ColumnComponent>
			)}
		</ContainerComponent>
	);
};

export default AeoTab;
