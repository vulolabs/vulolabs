/* global appLocalizer */
import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, COLOR_PALETTE } from '@zyra/core';
import {
	CardComponent,
	ChartComponent,
	ContainerComponent,
	ColumnComponent,
	ModuleGuardComponent,
	TypographyComponent
} from '@zyra/components';
import { ButtonInput, ToggleInput } from '@zyra/inputs';
import './Performance.scss';
import RealTimeMonitoringCard from './RealTimeMonitoringCard';
import SpeedHistoryCard from './SpeedHistoryCard';
import LiveSiteInsightsCard from '../Security/LiveSiteInsightsCard';
import PhpAccelerationCard from './PhpAccelerationCard';

/** `id: 'connections'` (Settings/GetStarted/Connections.ts) — where the real PageSpeed Insights API key field this card's own "no PSI connected" message used to describe in text actually lives; originally moved from the old Settings → Scanning → Performance tab, then merged (along with this folder's other sub-tabs) into this one "Connections" tab per direct instruction. */
const PERFORMANCE_SETTINGS_URL = '?page=vulopilot#&tab=settings&subtab=connections';

interface DashboardSummary {
	category_scores: { performance: number };
	psi_speed_scores: {
		mobile: number | null;
		desktop: number | null;
		checked_at: string | null;
	};
}

interface CoreWebVitalsSummary {
	lcp_ms: number | null;
	cls: number | null;
	inp_ms: number | null;
	sample_count: number;
}

type PeriodDays = '7' | '30' | '90';
const PERIOD_OPTIONS = [
	{ key: '7', value: '7', label: __('7D', 'vulopilot') },
	{ key: '30', value: '30', label: __('30D', 'vulopilot') },
	{ key: '90', value: '90', label: __('90D', 'vulopilot') },
];

interface PerformanceScoreCardProps {
	/** Scrolls to the "Top Issues" FindingsTable further down this Overview tab. */
	onViewDetails: () => void;
}

/** Below this many real RUM samples, a p75 isn't trustworthy enough to show. */
const MIN_SAMPLES = 10;

interface Rating {
	label: string;
	className: 'good' | 'needs-improvement' | 'poor';
}

/** Lighthouse's own real, documented 0-100 performance-score bands. */
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
 * Real zyra palette hex (`@zyra/core`'s `COLOR_PALETTE`) — the same real
 * colors Performance.scss's own `$vulopilot-rating-*` variables now read
 * too. `ChartComponent`'s own `type="ring"` needs a literal CSS color for
 * its stroke, not a class name, so this reads the shared source rather
 * than inventing a 2nd copy of it.
 *
 * Single source for every ring color in this file — the hero "Overall
 * Speed Score" ring, the Mobile/Desktop `ScoreTile` rings, and each
 * `VitalRow` ring all read from this same map, so they can never drift.
 * Previously there were two maps (`RATING_COLOR` from `COLOR_PALETTE` and
 * `RATING_RING_COLOR` with hardcoded hex) that could disagree if
 * `COLOR_PALETTE` ever changed.
 */
const RATING_COLOR: Record<Rating['className'], string> = {
	good: COLOR_PALETTE.green,
	'needs-improvement': COLOR_PALETTE.orange,
	poor: COLOR_PALETTE.red,
};

/** Same real bands as `getScoreRating()` above, mapped to the real palette class name this file's own SCSS and the reference snippet both use — good/needs-improvement/poor. */
const ratingClass = (score: number): Rating['className'] => {
	return getScoreRating(score).className;
};

/** Same 3 tiers as `RATING_COLOR` above, mapped to `TypographyComponent`'s own palette color names instead of a literal hex — for the hero ring's center number below, which (unlike `ScoreTile`/`VitalRow`'s own `className`-driven `<span>`s) reads a class name through this prop, not a CSS color. */
const TEXT_COLOR: Record<Rating['className'], string> = {
	good: 'green',
	'needs-improvement': 'orange',
	poor: 'red',
};

/** Google's real, public Core Web Vitals thresholds — LCP/INP in ms, CLS unitless. */
const CWV_THRESHOLDS: Record<'lcp' | 'inp' | 'cls', { good: number; needsImprovement: number }> = {
	lcp: { good: 2500, needsImprovement: 4000 },
	inp: { good: 200, needsImprovement: 500 },
	cls: { good: 0.1, needsImprovement: 0.25 },
};

const getVitalRating = (
	value: number,
	thresholds: { good: number; needsImprovement: number }
): Rating => {
	if (value <= thresholds.good) {
		return { label: __('Good', 'vulopilot'), className: 'good' };
	}
	if (value <= thresholds.needsImprovement) {
		return { label: __('Needs Work', 'vulopilot'), className: 'needs-improvement' };
	}
	return { label: __('At Risk', 'vulopilot'), className: 'poor' };
};

interface VitalRowProps {
	label: string;
	displayValue: string;
	value: number;
	thresholds: { good: number; needsImprovement: number };
	goodCaption: string;
}

/**
 * Same small "status row" ring gauge zyra's own ChartComponent Storybook
 * `RingRow` story establishes (independent per-metric rings, custom
 * per-item color, no shared axis) — replacing this row's own linear
 * fill bar, which plotted the exact same proportional read (`fillPercent`
 * below, unchanged) just as a bar instead of a ring.
 */
const VitalRow = ({ label, displayValue, value, thresholds, goodCaption }: VitalRowProps) => {
	const rating = getVitalRating(value, thresholds);
	// How far this value sits toward 1.3x the "needs improvement" ceiling,
	// capped at 100 — a real proportional read of where this value sits,
	// not a literal percentile-of-all-sites (no such dataset exists here).
	const fillPercent = Math.min(100, (value / (thresholds.needsImprovement * 1.3)) * 100);

	return (
		<div className="core-web-vital-row">
			<ChartComponent
				type="ring"
				height={90}
				color={RATING_COLOR[rating.className]}
				data={[{ value: fillPercent }]}
				centerLabel={
					<span className={`core-web-vital-row-value ${rating.className}`}>
						{displayValue}
					</span>
				}
			/>
			<TypographyComponent variant="body-sm" className="core-web-vital-row-label">
				{label}
			</TypographyComponent>
			<TypographyComponent
				variant="body-sm"
				weight="semibold"
				className={`core-web-vital-row-rating ${rating.className}`}
			>
				<span className="core-web-vital-row-dot" />
				{rating.label}
			</TypographyComponent>
			<TypographyComponent variant="desc" className="core-web-vital-row-caption">
				{goodCaption}
			</TypographyComponent>
		</div>
	);
};

interface ScoreTileProps {
	label: string;
	score: number;
	/** `speed-score-tile-single` when there's no PSI key configured (one real unified score, not a device split) — see the "Overall Speed Score" fallback below. */
	single?: boolean;
}

/**
 * One score-ring tile — Mobile/Desktop (real PSI key configured) or Overall
 * (no PSI key, the single real unified `category_scores.performance`
 * number). Extracted from 3 near-identical copies of the same
 * ring+label+rating markup, one per case, that only ever differed in which
 * real score they read.
 */
const ScoreTile = ({ label, score, single = false }: ScoreTileProps) => {
	const rating = getScoreRating(score);

	return (
		<div className={`speed-score-tile${single ? ' speed-score-tile-single' : ''}`}>
			<div className="speed-score-tile-label">{label}</div>
			<ChartComponent
				type="ring"
				height={90}
				color={RATING_COLOR[rating.className]}
				data={[{ value: score }]}
				centerLabel={
					<>
						<span className={`speed-score-tile-value ${rating.className}`}>
							{score}
						</span>
						<span className="speed-score-tile-max">/100</span>
					</>
				}
			/>
			<span className={`speed-score-tile-rating ${rating.className}`}>
				<span className="speed-score-tile-dot" />
				{rating.label}
			</span>
		</div>
	);
};

/**
 * "Performance Score" — now two real cards:
 *
 * "Overall Speed Score" reads `psi_speed_scores` from `GET /dashboard`
 * (`classes/RestAPI/Controllers/Dashboard.php`, populated by
 * `Services\PageSpeedInsightsFetcher` only when a real `psi_api_key` is
 * configured in Settings → Scanning → Performance). With a key configured,
 * shows real Mobile/Desktop scores from Google PageSpeed Insights, rated
 * against Lighthouse's own real Good/Needs Improvement/Poor bands, plus a
 * real one-line comparison only when the two scores actually differ by
 * ≥10 points. Without a key, falls back to the single real unified
 * `category_scores.performance` number (no fabricated device split).
 *
 * "Core Web Vitals" reads `GET /core-web-vitals`
 * (`classes/RestAPI/Controllers/CoreWebVitals.php`), a real p75 of LCP/INP/
 * CLS collected from actual visitors by `public/js/performance-vitals-
 * beacon.js` (Services\CoreWebVitalsBeacon) — genuine client-side RUM, no
 * external API. FCP is deliberately dropped: INP replaced FID as Google's
 * third official Core Web Vital in March 2024, so LCP/INP/CLS is the
 * current real set. Below `MIN_SAMPLES` real samples, shows an honest
 * "still collecting" state instead of a p75 computed from too few points.
 */
const PerformanceScoreCard = ({ onViewDetails }: PerformanceScoreCardProps) => {
	const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
	const [vitals, setVitals] = useState<CoreWebVitalsSummary | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	/** Drives SpeedHistoryCard's own real `days` param below — same `PERIOD_OPTIONS`/`ToggleInput` shape SecurityTrendCard.tsx's own card action already uses. RealTimeMonitoringCard isn't affected — its own metrics are real-time, not a day-range trend. */
	const [period, setPeriod] = useState<PeriodDays>('30');

	/**
	 * Real objects only — `getApiResponse` (zyra) hands back whatever axios
	 * parsed `response.data` into, and axios silently falls back to a raw
	 * string rather than throwing when the body isn't valid JSON (e.g. a
	 * stray PHP notice/warning printed ahead of the real JSON on some
	 * hosts/PHP configs, only ever seen on a fresh install this dev
	 * environment's already-populated options never triggered). A truthy
	 * non-object response used to pass the old `dashboardResponse &&` check
	 * unchanged, then crash further down reading `.category_scores.performance`
	 * off a string — this validates the actual shape before it's ever
	 * stored, so a malformed response becomes an honest error state instead
	 * of a render-time crash with no error boundary.
	 */
	const isPlainObject = (value: unknown): value is Record<string, unknown> =>
		null !== value && 'object' === typeof value && !Array.isArray(value);

	useEffect(() => {
		setIsLoading(true);
		setHasError(false);

		Promise.all([
			getApiResponse<DashboardSummary>(getApiLink(appLocalizer, 'dashboard'), {
				headers: { 'X-WP-Nonce': appLocalizer.nonce },
			}),
			getApiResponse<CoreWebVitalsSummary>(getApiLink(appLocalizer, 'core-web-vitals'), {
				headers: { 'X-WP-Nonce': appLocalizer.nonce },
			}),
		])
			.then(([dashboardResponse, vitalsResponse]) => {
				const dashboardValid =
					isPlainObject(dashboardResponse) &&
					isPlainObject(dashboardResponse.category_scores);
				const vitalsValid = isPlainObject(vitalsResponse);

				if (!dashboardValid || !vitalsValid) {
					setHasError(true);
					return;
				}

				setDashboard(dashboardResponse);
				setVitals(vitalsResponse);
			})
			.catch(() => setHasError(true))
			.finally(() => setIsLoading(false));
	}, []);

	const psi = dashboard?.psi_speed_scores ?? null;
	const hasPsi =
		null !== psi &&
		'number' === typeof psi.mobile &&
		'number' === typeof psi.desktop;

	/**
	 * Real score the hero ring plots — same number the old `ScoreTile`
	 * row showed, just picked once here so both the ring and its
	 * Mobile/Desktop breakdown below can share it. With a real PSI key
	 * configured this averages the real Mobile/Desktop scores (the mockup's
	 * own single "overall" ring); without one it's already the single real
	 * unified `category_scores.performance` number.
	 */
	const overallScore = hasPsi && psi
		? Math.round(((psi.mobile as number) + (psi.desktop as number)) / 2)
		: dashboard?.category_scores.performance ?? 0;

	const comparisonMessage = (): string | null => {
		if (
			!hasPsi ||
			'number' !== typeof psi?.mobile ||
			'number' !== typeof psi?.desktop
		) {
			return null;
		}

		const gap = psi.desktop - psi.mobile;

		if (gap >= 10) {
			return sprintf(
				/* translators: %d is how many points lower the mobile score is than desktop. */
				__(
					'Your mobile site is %d points slower than desktop. Focus on improving mobile performance for a better experience.',
					'vulopilot'
				),
				gap
			);
		}

		if (gap <= -10) {
			return sprintf(
				/* translators: %d is how many points lower the desktop score is than mobile. */
				__('Your desktop site is %d points slower than mobile.', 'vulopilot'),
				Math.abs(gap)
			);
		}

		return __('Mobile and desktop performance are similar.', 'vulopilot');
	};

	return (
		<>
			<ColumnComponent grid={6} row fullHeight>
				<CardComponent
					id="performance-overall-speed-score-card"
					title={__('Overall Speed Score', 'vulopilot')}
					titleIcon="analytics"
					desc={__('Your real performance score from Google PageSpeed Insights.', 'vulopilot')}
					isLoading={isLoading}
					headerAction={
						<ButtonInput
							buttons={{
								text: __('View Slow Pages', 'vulopilot'),
								rightIcon: 'eye',
								color: 'text-purple',
								onClick: onViewDetails,
							}}
						/>
					}
				>
					{!isLoading && hasError && (
						<ModuleGuardComponent
							icon="error"
							title={__('Could not load your speed score', 'vulopilot')}
							desc={__('Please refresh the page to try again.', 'vulopilot')}
						/>
					)}
					{!isLoading && !hasError && dashboard && (
						<>
							<div className='overall-score-wrapper'>
								<div className="overall-score-summary">
									<ChartComponent
										type="ring"
										height={200}
										// Top-level `color` — same prop this file's own
										// `ScoreTile`/`VitalRow` rings already set
										// correctly (`type="ring"` only ever paints its
										// stroke from this prop, never from
										// `data[].color`); this hero ring was the one
										// place in the file that still lacked it, so it
										// alone stayed `ChartComponent`'s default brand
										// purple regardless of score.
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
									<div className="desc">
										{hasPsi
											? comparisonMessage()
											: __(
												'Connect Google PageSpeed Insights for a real Mobile/Desktop breakdown.',
												'vulopilot'
											)}
									</div>
								</div>
								<div className="overall-score-summary">
									<LiveSiteInsightsCard />
								</div>
							</div>
							{/* <PhpAccelerationCard /> */}
						</>
					)}
				</CardComponent>
			</ColumnComponent>
			<ColumnComponent grid={6} row fullHeight>
				<CardComponent
					id="performance-core-web-vitals-card"
					title={__('Core Web Vitals', 'vulopilot')}
					titleIcon="analytics"
					desc={__('Real Google Core Web Vitals for this site.', 'vulopilot')}
					isLoading={isLoading}
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
					<SpeedHistoryCard days={Number(period)} />
					<RealTimeMonitoringCard />
				</CardComponent>
			</ColumnComponent>
		</>
	);
};

export default PerformanceScoreCard;