/* global appLocalizer */
import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { COLOR_PALETTE, getApiLink, getApiResponse } from '@zyra/core';
import { AnalyticsComponent, CardComponent, ChartComponent, ColumnComponent, IconComponent, ListComponent, TypographyComponent } from '@zyra/components';
import { ToggleInput } from '@zyra/inputs';
import { formatWpDate } from '../../services/formatWpDate';
import { useGeoScore } from './useGeoScore';
import type { GeoSignalScore } from './useGeoScore';
import './SeoVisibility.scss';

const getRating = (score: number): string => {
	if (score >= 70) {
		return __('Good', 'vulopilot');
	}
	if (score >= 40) {
		return __('Needs Work', 'vulopilot');
	}
	return __('At Risk', 'vulopilot');
};

const ratingClass = (score: number): string => {
	if (score >= 70) {
		return 'green';
	}
	if (score >= 40) {
		return 'yellow';
	}
	return 'red';
};

/**
 * This card's own 7 `SIGNAL_META` keys → GeoTab.tsx's own 5 real
 * `GEO_TOPICS` keys — not 1:1 (see `Geo.php`'s own `SIGNAL_SCANNER_IDS`
 * docblock: `entity-clarity`/`content-freshness`/`other-geo-signals` are
 * split out of `GEO_TOPICS`' single "Other Signals" catch-all here, and
 * `question-coverage` is `GEO_TOPICS`' own differently-named
 * "faq-questions"), so a signal row's own click-through to the real
 * "All GEO Issues" table below needs this real mapping rather than
 * assuming the two keyspaces line up.
 */
const SIGNAL_TO_TOPIC_KEY: Record<string, string> = {
	'ai-summary': 'ai-summary',
	'question-coverage': 'faq-questions',
	'evidence-citations': 'evidence-citations',
	'ai-readable-structure': 'ai-readable-structure',
	'entity-clarity': 'other-signals',
	'content-freshness': 'other-signals',
	'other-geo-signals': 'other-signals',
};

/**
 * The 7 real signals `Geo.php`'s own `SIGNAL_SCANNER_IDS` (+ the separately
 * computed `content-freshness`) return — display metadata only (label,
 * icon, a real description of what each one actually checks) kept
 * deliberately free of any numeric "weight", since the real `geo_score`
 * behind this card is an unweighted mean (see Geo.php's own docblock) and
 * no such per-signal weighting number exists anywhere in this codebase to
 * honestly print next to these names.
 */
const SIGNAL_META: { key: keyof import('./useGeoScore').GeoScoreResponse['signals']; label: string; icon: string; description: string }[] = [
	{
		key: 'ai-summary',
		label: __('AI Summary', 'vulopilot'),
		icon: 'ai orange',
		description: __(
			'Whether pages have an extractable AI summary block an AI system can lift directly.',
			'vulopilot'
		),
	},
	{
		key: 'question-coverage',
		label: __('Question Coverage', 'vulopilot'),
		icon: 'question blue',
		description: __(
			'Commonly-asked questions a page plausibly answers, but with no FAQ or Q&A block making that answer easy to extract.',
			'vulopilot'
		),
	},
	{
		key: 'evidence-citations',
		label: __('Evidence & Citations', 'vulopilot'),
		icon: 'report sky',
		description: __(
			'Statistic-shaped claims with no citation or outbound link backing them up.',
			'vulopilot'
		),
	},
	{
		key: 'ai-readable-structure',
		label: __('AI-Readable Structure', 'vulopilot'),
		icon: 'blocks lime',
		description: __(
			'Paragraph length and heading hierarchy — how easily an AI system can extract a clean chunk of this content.',
			'vulopilot'
		),
	},
	{
		key: 'entity-clarity',
		label: __('Entity Clarity', 'vulopilot'),
		icon: 'person cyan',
		description: __(
			'Whether your brand, people, and product names are used consistently enough for AI to recognize them as the same entity.',
			'vulopilot'
		),
	},
	{
		key: 'content-freshness',
		label: __('Content Freshness', 'vulopilot'),
		icon: 'calendar green',
		description: __(
			'How recently your published pages have been updated, relative to your own "stale after" setting.',
			'vulopilot'
		),
	},
	{
		key: 'other-geo-signals',
		label: __('Other GEO Signals', 'vulopilot'),
		icon: 'module violet',
		description: __('Author credentials, trust signals, and llms.txt.', 'vulopilot'),
	},
];

type PeriodDays = '7' | '30' | '90';
const PERIOD_OPTIONS = [
	{ key: '7', value: '7', label: __('7D', 'vulopilot') },
	{ key: '30', value: '30', label: __('30D', 'vulopilot') },
	{ key: '90', value: '90', label: __('90D', 'vulopilot') },
];

interface ProgressResponse {
	days: number;
	trend: { date: string; score: number }[];
}

/** Same real `document.getElementById(...).scrollIntoView()` convention `QuickActionsCard.tsx`'s own `scrollTo()` already establishes — a signal row's own click target here, since (unlike SEO's per-category `categoryFocus` filter) the "GEO Score Breakdown" table below has no real per-signal filtering to drive, just the same `SIGNAL_META` rows to scroll down to. */
const scrollToBreakdown = () => {
	document
		.getElementById('geo-score-breakdown-table')
		?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/**
 * Real per-signal score change — same real "current score minus the
 * oldest point in this signal's own real `trend`" shape `SeoTab.tsx`'s own
 * `categoryScoreDelta()` already established, now backed by `Geo.php`'s
 * own real `signal.trend` (added alongside this). `null` when there's no
 * real trend to diff (a `content-freshness` signal, or a signal with a
 * `null` score) — the row's own delta arrow renders nothing rather than a
 * fabricated "+0" in either case, same convention `categoryScoreDelta()`
 * already follows.
 */
const signalScoreDelta = (signal: GeoSignalScore): number | null =>
	null !== signal.score && signal.trend && signal.trend.length > 0
		? signal.score - signal.trend[0]
		: null;

const mainProblemText = (key: string, signal: GeoSignalScore): string => {
	if (signal.main_problem) {
		return signal.main_problem;
	}
	if (null === signal.score) {
		return __('Not enough content to check yet', 'vulopilot');
	}
	return 'content-freshness' === key
		? __('All checked pages are reasonably up to date', 'vulopilot')
		: __('No open issues found', 'vulopilot');
};

/**
 * "GEO Score" — SEO & Visibility → GEO's own real, free, deterministic
 * scorecard (`GET /geo/score`/`GET /geo/progress`, Geo.php), replacing
 * `GeoVisibilitySummaryCard`'s former "Overall AI Visibility" slot on this
 * tab. That card's own real number came from Pro-only routes
 * (`useGeoTabData.ts`'s own `useGeoVisibilitySnapshot` → `/geo-visibility-summary`/
 * `/geo-visibility-history`, both registered only by vulopilot-pro's
 * GeoInsights module) and silently read `0/100 Poor` with Pro inactive —
 * this card's own `geo_score` is real and populated on every install,
 * matching the reference mockup's own 4-part layout while fixing that
 * free-tier gap. `GeoVisibilitySummaryCard.tsx` was initially kept in
 * place as unrendered dead code once superseded here, then actually
 * deleted in a later file-count reduction pass once confirmed to have
 * zero remaining consumers anywhere — its own real data-fetching hook
 * (`useGeoVisibilitySnapshot`) is still real, active code, just relocated
 * into `useGeoTabData.ts` (still used by AeoTab.tsx's own "AEO Score Over
 * Time").
 *
 * Previously also absorbed GeoTab.tsx's former standalone "How You Compare
 * to Similar Sites" row, retitled "Competitor Comparison" — removed
 * entirely per direct instruction (the real `GeoCompetitorVisibility` Pro
 * slot and its own `ProLockedCard` fallback both gone, not just hidden).
 *
 * Layout: GEO Score ring + "How this score is calculated" signal list (top
 * left) / Score Snapshot real day trend (top right) / GEO Score Breakdown
 * table — Signal, Score, Status, Main Problem (bottom left).
 */
interface GeoScoreSectionProps {
	/**
	 * GeoTab.tsx's own real `goToIssuesTable()` (its `setCategoryFocus`
	 * wrapper) — same real click-through SeoTab.tsx's own category rows
	 * already give SeoTab.tsx's own `categoryFocus`, now wired here too
	 * so a signal row filters + scrolls to the real "All GEO Issues" table
	 * below (`GeoTab.tsx`'s own `IssuesSection`) instead of just scrolling
	 * to this card's own static breakdown table.
	 */
	onSelectSignal?: (topicKey: string) => void;
}

const GeoScoreSection = ({ onSelectSignal }: GeoScoreSectionProps) => {
	const { score, isLoading } = useGeoScore();
	const [period, setPeriod] = useState<PeriodDays>('30');
	const [progress, setProgress] = useState<ProgressResponse | null>(null);
	const [isLoadingProgress, setIsLoadingProgress] = useState(true);

	useEffect(() => {
		setIsLoadingProgress(true);
		getApiResponse<ProgressResponse>(
			getApiLink(appLocalizer, `geo/progress?days=${period}`),
			{ headers: { 'X-WP-Nonce': appLocalizer.nonce } }
		)
			.then((response) => response && setProgress(response))
			.finally(() => setIsLoadingProgress(false));
	}, [period]);

	const overall = score?.geo_score ?? 0;

	return (
		<>
			<ColumnComponent grid={6}>
				<CardComponent
					title={__('GEO Score', 'vulopilot')}
					titleIcon='tools'
					desc={sprintf(
						/* translators: %d: real number of published pages/posts every GEO scanner scans. */
						__('Based on %d published pages.', 'vulopilot'),
						score?.pages_checked ?? 0
					)}
					isLoading={isLoading}
				>
					<div className="overall-score-wrapper">
						<div className="overall-score-summary">
								<ChartComponent
									type="ring"
									height={200}
									// Top-level `color` — `type="ring"` only ever
									// paints its stroke from this prop, never from
									// `data[].color` below (see SeoTab.tsx's own
									// identical fix) — without it the ring stayed
									// `ChartComponent`'s default brand purple
									// regardless of score.
									color={
										COLOR_PALETTE[
											ratingClass(overall) as keyof typeof COLOR_PALETTE
										]
									}
									centerLabel={
										<>
											<TypographyComponent variant={'h1'} color={ratingClass(overall)}>
												{overall}
											</TypographyComponent>
											<TypographyComponent variant={'h4'}>
												{getRating(overall)}
											</TypographyComponent>
										</>
									}
									data={[
										{
											label: __('Score', 'vulopilot'),
											value: overall,
											// Same real rating color the ring's own
											// Good/Needs Work/Poor label above already
											// uses (`ratingClass()`/`getRating()`) —
											// resolved through `COLOR_PALETTE`, same
											// convention SeoTab.tsx's own identical ring
											// already established, rather than the fixed
											// brand purple this used before (unrelated to
											// the actual score).
											color: COLOR_PALETTE[
												ratingClass(overall) as keyof typeof COLOR_PALETTE
											],
										},
										{ label: __('Remaining', 'vulopilot'), value: 100 - overall, color: '#e5e7eb' },
									]}
								/>
								<TypographyComponent variant={'h3'} color="text-green">
									{__('GEO Score', 'vulopilot')}
								</TypographyComponent>
								<div className="desc">
									{sprintf(
										/* translators: %d: real number of published pages/posts every GEO scanner scans. */
										__('Based on %d published pages.', 'vulopilot'),
										score?.pages_checked ?? 0
									)}
								</div>
						</div>
						{/*
						 * Same real `ListComponent` "mini-card report" row
						 * shape SeoTab.tsx's own "SEO Health" card uses for
						 * its 6 category rows — reused here for this card's
						 * own real 7 signals (`SIGNAL_META`/`score.signals`).
						 * No per-row delta arrow (unlike SEO's rows): this
						 * endpoint's own `GeoScoreResponse` has no
						 * per-signal `trend` to diff against, only a single
						 * sitewide `deltas.total_open` (the "Issues found"
						 * tile below), so nothing is fabricated here to fill
						 * that slot. A row's own real open-issue count
						 * becomes its `desc` the same way SEO's does; a
						 * `null` score (not enough content yet) reuses this
						 * file's own real `mainProblemText()` copy instead
						 * of a fake number. Clicking a row scrolls to the
						 * real "GEO Score Breakdown" table below (this
						 * card's own SIGNAL_META rows again, just as a real
						 * table) since there's no per-signal filtered table
						 * here to open the way SEO's `categoryFocus` does.
						 */}
						 <div className="overall-score-summary">
						<ListComponent
							className="mini-card report hover without-border seo-health-score-category-list"
							loading={isLoading}
							items={SIGNAL_META.map((meta) => {
								const signal = score?.signals[meta.key];
								const signalScore = signal?.score ?? null;
								const delta = signal ? signalScoreDelta(signal) : null;

								return {
									id: meta.key,
									icon: meta.icon,
									title: meta.label,
									desc:
										null === signalScore
											? mainProblemText(meta.key, signal ?? {
													score: null,
													open_count: null,
													affected_pages: 0,
													main_problem: null,
													trend: null,
												})
											: sprintf(
													/* translators: %d: real number of open findings for this signal. */
													__('%d issues', 'vulopilot'),
													signal?.open_count ?? 0
												),
									tags: (
										<>
											
											{null !== signalScore && (
												<TypographyComponent
													variant="h5"
													weight="bold"
													color={ratingClass(signalScore)}
													className="seo-health-score-row-value"
												>
													{signalScore}
													<TypographyComponent
														as="span"
														variant="body-md"
														className="seo-health-score-row-suffix"
													>
														/100
													</TypographyComponent>
												</TypographyComponent>
											)}
											{null !== delta && (
												<TypographyComponent
													as="span"
													variant="body-md"
													weight="bold"
													color={delta >= 0 ? 'green' : 'red'}
													className="seo-health-score-row-delta"
												>
													<IconComponent
														name={delta >= 0 ? 'arrow-up' : 'arrow-down'}
													/>
													{Math.abs(delta)}
												</TypographyComponent>
											)}
										</>
									),
									action: () =>
										onSelectSignal
											? onSelectSignal(SIGNAL_TO_TOPIC_KEY[meta.key])
											: scrollToBreakdown(),
								};
							})}
						/>
						</div>
					</div>
					{score && (
						<AnalyticsComponent
							variant="with-out-boxshadow"
							cols={2}
							isLoading={isLoading}
							data={[
								{
									number: score.pages_checked,
									text: __('Pages checked', 'vulopilot'),
									iconClass: 'admin-bg-color2',
								},
								{
									// Real sum of every signal's own real
									// `open_count` — `GeoScoreResponse` has
									// no single "total open" field the way
									// `SeoScoreResponse.total_open` does,
									// only the week-over-week `deltas.total_open`,
									// so this is computed from the same real
									// per-signal counts the rows above
									// already show, not a separate fetch.
									number: Object.values(score.signals).reduce(
										(sum, signal) => sum + (signal.open_count ?? 0),
										0
									),
									text: __('Issues found', 'vulopilot'),
									iconClass: 'admin-bg-color3',
								},
							]}
						/>
					)}
				</CardComponent>
			</ColumnComponent>
			<ColumnComponent grid={6} fullHeight>
				<CardComponent
					title={__('Score Snapshot', 'vulopilot')}
					desc={__('How your GEO score has trended over the selected period.', 'vulopilot')}
					titleIcon='tools'
					isLoading={isLoadingProgress}
					action={
						<ToggleInput
							options={PERIOD_OPTIONS}
							value={period}
							onChange={(value) => setPeriod(value as PeriodDays)}
							modules={[]}
							variant="pill"
						/>
					}
				>
					{progress && (
						<ChartComponent
							type="dynamic-line"
							data={progress.trend.map((point) => ({
								...point,
								date: formatWpDate(point.date),
							}))}
							dataKey="score"
							xKey="date"
							height={300}
							yDomain={[0, 100]}
						/>
					)}
				</CardComponent>
			</ColumnComponent>
		</>
	);
};

export default GeoScoreSection;
