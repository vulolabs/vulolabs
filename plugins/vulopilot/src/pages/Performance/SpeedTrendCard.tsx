/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import { ChartComponent } from '@zyra/components';
import { Card, Delta, EmptyState, Segmented, Skeleton, scoreTone } from '../../components/ui';
import { useApiList } from '../../services/useApiList';
import { formatWpDate } from '../../services/formatWpDate';

interface Snapshot {
	snapshot_date: string;
	performance_score: number;
}

export interface Vitals {
	lcp_ms: number | null;
	inp_ms: number | null;
	cls: number | null;
	page_load_ms: number | null;
	transfer_bytes: number | null;
	sample_count: number;
}

export interface Realtime {
	avg_response_time_ms: number | null;
	page_views_last_5_min: number;
}

/** Below this many visitor samples a p75 isn't trustworthy enough to show. */
const MIN_SAMPLES = 10;

const PERIODS = [
	{ value: '7', label: __('7D', 'vulopilot') },
	{ value: '30', label: __('30D', 'vulopilot') },
	{ value: '90', label: __('90D', 'vulopilot') },
];

const seconds = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

const bytes = (value: number): string =>
	value >= 1024 * 1024 ? `${(value / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(value / 1024)} KB`;

/** Google's "good" thresholds, so a figure can say whether it is fine. */
const lcpTone = (ms: number) => (ms <= 2500 ? 'is-good' : ms <= 4000 ? 'is-warn' : 'is-bad');
const responseTone = (ms: number) => (ms <= 200 ? 'is-good' : ms <= 600 ? 'is-warn' : 'is-bad');

/**
 * Speed over time: the daily speed score (`GET /performance-score-snapshots`), then what real visitors experience -
 * server response (`GET /performance-realtime`) and the p75 Core Web Vitals (`GET /core-web-vitals`).
 */
const SpeedTrendCard = () => {
	const [period, setPeriod] = useState('30');
	const days = Number(period);
	const { data: snapshots, isLoading } = useApiList<Snapshot>('performance-score-snapshots', { days });
	const [vitals, setVitals] = useState<Vitals | null>(null);
	const [realtime, setRealtime] = useState<Realtime | null>(null);

	useEffect(() => {
		const headers = { headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } };

		getApiResponse<Vitals>(getApiLink(vulopilotAppLocalizer, 'core-web-vitals'), headers).then((r) => setVitals(r ?? null));
		getApiResponse<Realtime>(getApiLink(vulopilotAppLocalizer, 'performance-realtime'), headers).then((r) => setRealtime(r ?? null));
	}, []);

	const latest = snapshots[snapshots.length - 1];
	const change = snapshots.length > 1 ? latest.performance_score - snapshots[0].performance_score : null;
	const samples = vitals?.sample_count ?? 0;
	const lcp = vitals?.lcp_ms ?? null;
	const pageLoad = vitals?.page_load_ms ?? null;
	const transfer = vitals?.transfer_bytes ?? null;
	const enough = samples >= MIN_SAMPLES;
	const collecting = sprintf(
		/* translators: 1: visits measured so far, 2: visits needed. */
		__('Measuring visits (%1$d/%2$d)', 'vulopilot'),
		Math.min(samples, MIN_SAMPLES),
		MIN_SAMPLES
	);

	const figures = [
		{
			label: __('Server response', 'vulopilot'),
			value: null !== (realtime?.avg_response_time_ms ?? null) ? `${realtime?.avg_response_time_ms} ms` : '–',
			tone: null !== (realtime?.avg_response_time_ms ?? null) ? responseTone(realtime?.avg_response_time_ms as number) : '',
			hint: __('Average, last hour', 'vulopilot'),
		},
		{
			label: __('Largest paint (LCP)', 'vulopilot'),
			value: enough && null !== lcp ? seconds(lcp) : '–',
			tone: enough && null !== lcp ? lcpTone(lcp) : '',
			hint: enough ? __('75% of visits are faster', 'vulopilot') : collecting,
		},
		{
			label: __('Page load', 'vulopilot'),
			value: enough && null !== pageLoad ? seconds(pageLoad) : '–',
			tone: '',
			hint: enough ? __('Typical visit', 'vulopilot') : collecting,
		},
		{
			label: __('Data per visit', 'vulopilot'),
			value: enough && null !== transfer ? bytes(transfer) : '–',
			tone: '',
			hint: enough ? __('Downloaded by the browser', 'vulopilot') : collecting,
		},
	];

	let chart;

	if (isLoading && 0 === snapshots.length) {
		chart = <Skeleton size="chart" />;
	} else if (0 === snapshots.length) {
		chart = (
			<EmptyState
				compact
				icon="analytics"
				title={__('No history yet', 'vulopilot')}
				text={__('Your daily speed score starts with your first speed test.', 'vulopilot')}
			/>
		);
	} else {
		chart = (
			<>
				<div className="vp-trend-head">
					<div className="vp-trend-now">
						<strong className={`is-${scoreTone(latest.performance_score)}`}>
							{latest.performance_score}
							<small>/100</small>
						</strong>
						<div>
							<span>{__('Latest speed score', 'vulopilot')}</span>
							<Delta change={change} suffix="" />
						</div>
					</div>
				</div>
				<ChartComponent
					type="dynamic-line"
					isLoading={isLoading}
					data={snapshots.map((snapshot) => ({ ...snapshot, snapshot_date: formatWpDate(snapshot.snapshot_date) }))}
					dataKey="performance_score"
					xKey="snapshot_date"
					height={170}
					yDomain={[0, 100]}
				/>
			</>
		);
	}

	return (
		<Card
			id="performance-core-web-vitals-card"
			className="vp-speed-trend"
			icon="analytics"
			title={__('Speed over time', 'vulopilot')}
			desc={sprintf(
				/* translators: %d: number of days. */
				__('Your speed score, and what real visitors experienced, over the last %d days.', 'vulopilot'),
				days
			)}
			action={<Segmented size="sm" label={__('Period', 'vulopilot')} value={period} onChange={setPeriod} options={PERIODS} />}
		>
			<div className="vp-speed-chart">{chart}</div>
			<dl className="vp-speed-figures">
				{figures.map((figure) => (
					<div key={figure.label}>
						<dt>{figure.label}</dt>
						<dd className={figure.tone}>{figure.value}</dd>
						<span>{figure.hint}</span>
					</div>
				))}
			</dl>
		</Card>
	);
};

export default SpeedTrendCard;
