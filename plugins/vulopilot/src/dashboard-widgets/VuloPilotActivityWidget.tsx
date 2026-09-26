/* global vulopilotAppLocalizer */
import React, { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, AnalyticsComponent } from '@zyra/core';
import { ChartComponent, ModuleGuardComponent, PopupComponent } from '@zyra/components';
import { ToggleInput } from '@zyra/inputs';
import DashboardWidget from './DashboardWidget';
import DummyDataNotice from '../components/DummyDataNotice';
import { BlurredProContent } from '../components/UpgradeToProOverlay';
import ShowProPopup from '../components/Popup/Popup';
import { useApiList } from '../services/useApiList';
import { useLastScanTime } from '../services/useLastScanTime';
import { formatWpDate, formatWpTime, isWpToday } from '../services/formatWpDate';
import { WidgetProps } from './types';

interface CrawlerAnalyticsResponse {
	current_total: number;
	previous_total: number;
	daily_volume: { date: string; total: number }[];
}

interface ReportRow {
	created_at: string;
}

interface HealthSnapshot {
	snapshot_date: string;
	overall_score: number;
}

type PeriodDays = '7' | '30' | '90';

/** Same real `key` field convention `OverviewTab.tsx`'s own identical `ToggleInput` usage already establishes - required so React's list key and each radio's real `id`/`htmlFor` pair are unique. */
const PERIOD_OPTIONS = [
	{ key: '7', value: '7', label: __('7D', 'vulopilot') },
	{ key: '30', value: '30', label: __('30D', 'vulopilot') },
	{ key: '90', value: '90', label: __('90D', 'vulopilot') },
];

/** Same real day-range options the old `BadgeComponent` toggle used, now expressed as the real `PeriodDays` string values `ToggleInput` needs. */
const HEALTH_TIMELINE_DAY_OPTIONS: PeriodDays[] = ['7', '30', '90'];

/** Fabricated 7-day score trend - same "obviously fake, never mistaken for a real scan result" reasoning Accessibility.tsx's own `DUMMY_ACCESSIBILITY_HISTORY` documents; no real fetch behind this, ever. */
const DUMMY_HEALTH_TIMELINE = [
	{ day: __('Day 1', 'vulopilot'), score: 58 },
	{ day: __('Day 2', 'vulopilot'), score: 63 },
	{ day: __('Day 3', 'vulopilot'), score: 61 },
	{ day: __('Day 4', 'vulopilot'), score: 68 },
	{ day: __('Day 5', 'vulopilot'), score: 72 },
	{ day: __('Day 6', 'vulopilot'), score: 75 },
	{ day: __('Day 7', 'vulopilot'), score: 79 },
];

/**
 * "VuloPilot activity" - a real 5-tile activity strip. Every tile reads
 * data that already exists elsewhere on this Dashboard/plugin; this widget
 * only re-presents it compactly rather than introducing a new data source
 * per tile:
 *
 * - AI crawler visits: `GET /crawler-traffic/analytics?days=N` (same
 *   endpoint CrawlerAnalyticsSection.tsx uses), N following the Health
 *   timeline's own 7D/30D/90D toggle - `current_total`/
 *   `previous_total` are a real, already-computed N-day-vs-previous-N-day
 *   comparison (CrawlerVisitRepository::get_period_comparison()), and
 *   `daily_volume` backs a real sparkline of the selected period's days.
 * - Automations: `summary.automation_status.enabled` - already on the
 *   shared `/dashboard` payload (Controllers\Dashboard::get_items()).
 * - Last audit: `useLastScanTime()` (sitewide, no scanner/category
 *   filter) - the same real `vulopilot_scans.finished_at` used by every
 *   category page's own header.
 * - Pending approvals: `summary.pending_approvals` - the same real count
 *   NeedsAttentionWidget's "Pending approval" tab already lists.
 * - Latest report: `GET /reports?per_page=1` (same endpoint
 *   LatestReportsWidget already reads), most recent row's `created_at`.
 */
const VuloPilotActivityWidget: React.FC<WidgetProps> = ({
	summary,
	isLoading,
	onHide,
	isCustomizing,
}) => {
	const [healthTimelineDays, setHealthTimelineDays] = useState<PeriodDays>('30');
	const [crawlerAnalytics, setCrawlerAnalytics] =
		useState<CrawlerAnalyticsResponse | null>(null);
	const [isCrawlerLoading, setIsCrawlerLoading] = useState(true);

	useEffect(() => {
		setIsCrawlerLoading(true);
		getApiResponse<CrawlerAnalyticsResponse>(
			getApiLink(
				vulopilotAppLocalizer,
				`crawler-traffic/analytics?days=${healthTimelineDays}`
			),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				if (response) {
					setCrawlerAnalytics(response);
				}
			})
			.finally(() => setIsCrawlerLoading(false));
	}, [healthTimelineDays]);

	const { data: reportRows, isLoading: isReportsLoading } =
		useApiList<ReportRow>(
			'reports',
			{ per_page: 1 },
			undefined,
			Boolean(vulopilotAppLocalizer.khali_dabba)
		);
	const { lastScanAt, isLoading: isLastScanLoading } = useLastScanTime();

	const { data: healthSnapshots } = useApiList<HealthSnapshot>(
		'site-health-snapshots',
		{ days: Number(healthTimelineDays) },
		undefined,
		Boolean(vulopilotAppLocalizer.khali_dabba)
	);
	const isHealthTimelineModuleActive = Boolean(vulopilotAppLocalizer.khali_dabba);
	const [isHealthTimelineProPopupOpen, setIsHealthTimelineProPopupOpen] = useState(false);

	const crawlerCurrent = crawlerAnalytics?.current_total ?? 0;
	const crawlerPrevious = crawlerAnalytics?.previous_total ?? 0;
	const crawlerChangePercent =
		crawlerPrevious > 0
			? Math.round(
				((crawlerCurrent - crawlerPrevious) / crawlerPrevious) *
				100
			)
			: null;
	const sparklineData = (crawlerAnalytics?.daily_volume ?? []).map(
		(day) => ({
			label: day.date,
			value: day.total,
		})
	);

	const formatAuditTime = (dateString: string): string => {
		return isWpToday(dateString)
			? sprintf(
				/* translators: %s: real completion time, e.g. "9:26 AM". */
				__('Today, %s', 'vulopilot'),
				formatWpTime(dateString)
			)
			: formatWpDate(dateString);
	};

	return (
		<>
			<DashboardWidget
				title={__('Health timeline', 'vulopilot')}
				desc={__('How your health scores have trended over time.', 'vulopilot')}
				icon="analytics"
				isLoading={isLoading}
				onHide={onHide}
				isCustomizing={isCustomizing}
				headerAction={
					<ToggleInput
						options={PERIOD_OPTIONS}
						value={healthTimelineDays}
						onChange={(value) => setHealthTimelineDays(value as PeriodDays)}
						modules={[]}
						variant="pill"
					/>
				}
			>

				{!isHealthTimelineModuleActive ? (
					<>
						<BlurredProContent
							contentClassName="health-timeline-dummy"
							onClick={() => setIsHealthTimelineProPopupOpen(true)}
						>
							<ChartComponent
								type="dynamic-line"
								data={DUMMY_HEALTH_TIMELINE}
								dataKey="score"
								xKey="day"
								height={300}
								yDomain={[0, 100]}
							/>
						</BlurredProContent>
						<DummyDataNotice />
					</>
				) : 0 === healthSnapshots.length ? (
					<ModuleGuardComponent
						icon="analytics"
						title={__('No trend data yet', 'vulopilot')}
						desc={__(
							'Health timeline builds up once daily snapshots start recording - check back after today.',
							'vulopilot'
						)}
					/>
				) : (
					<ChartComponent
						type="dynamic-line"
						data={healthSnapshots.map((snapshot) => ({
							...snapshot,
							snapshot_date: formatWpDate(snapshot.snapshot_date),
						}))}
						dataKey="overall_score"
						xKey="snapshot_date"
						height={300}
						yDomain={[0, 100]}
					/>
				)}
				<AnalyticsComponent
					variant="small"
					cols={3}
					data={[
						{
							// icon: 'global-community green',
							number: crawlerCurrent,
							text: __('AI crawler visits', 'vulopilot'),
						},
						{
							// icon: 'automation blue',
							number: summary.automation_status.enabled,
							text: __('Automations', 'vulopilot'),
						},
						{
							// icon: 'ai purple',
							number: summary.pending_approvals,
							text: __('Pending approvals', 'vulopilot'),
						}
					]}
				/>
			</DashboardWidget>
			<PopupComponent
				open={isHealthTimelineProPopupOpen}
				onClose={() => setIsHealthTimelineProPopupOpen(false)}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				{vulopilotAppLocalizer.khali_dabba ? (
					<ShowProPopup />
				) : (
					<ShowProPopup />
				)}
			</PopupComponent>
		</>
	);
};

export default VuloPilotActivityWidget;