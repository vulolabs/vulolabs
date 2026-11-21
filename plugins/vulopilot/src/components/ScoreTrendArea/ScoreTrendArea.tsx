import { useId } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatWpDay } from '../../services/formatWpDate';
import './ScoreTrendArea.scss';

export interface ScorePoint {
	/** A calendar day, YYYY-MM-DD (a time after it is ignored). */
	date: string;
	score: number;
}

interface ScoreTrendAreaProps {
	points: ScorePoint[];
	height?: number;
	/** What the score is, for the tooltip ("Visibility"). */
	label?: string;
	/** 'score' (default): a 0–100 score, zoomed to the data. 'count': visits or requests, from 0 up, in the brand colour. */
	scale?: 'score' | 'count';
}

/** Today's value and how far it moved, above a trend chart. */
export const TrendHead = ({ points, days, suffix = '/100' }: { points: ScorePoint[]; days: number; suffix?: string }) => {
	if (0 === points.length) {
		return null;
	}
	const now = points[points.length - 1].score;
	const change = points.length > 1 ? now - points[0].score : 0;
	const tone = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

	return (
		<div className="vp-trend-head">
			<strong>
				{now.toLocaleString()}
				{suffix && <small>{suffix}</small>}
			</strong>
			<span className={`vp-trend-delta is-${tone}`}>
				{change > 0 ? '+' : change < 0 ? '−' : '±'}
				{Math.abs(change).toLocaleString()}{' '}
				{sprintf(
					/* translators: %d: number of days the chart covers. */
					__('in %d days', 'vulopilot'),
					days
				)}
			</span>
		</div>
	);
};

/** Green when the score rose over the window, red when it fell, the brand colour when flat. */
const toneFor = (change: number): { line: string; name: string } => {
	if (change > 0) {
		return { line: '#12a26b', name: 'up' };
	}
	if (change < 0) {
		return { line: '#e5484d', name: 'down' };
	}
	return { line: '#5b5bd6', name: 'flat' };
};

/**
 * A 0–100 score over time, drawn the modern way: a smooth line over a soft gradient, a scale zoomed to the data (so a
 * move from 96 to 91 is visible instead of a flat line pinned to the top of 0–100), light horizontal guides only,
 * three dates on the axis, and a compact tooltip.
 */
const ScoreTrendArea = ({ points, height = 220, label = __('Score', 'vulopilot'), scale = 'score' }: ScoreTrendAreaProps) => {
	const gradientId = `vp-trend-${useId().replace(/:/g, '')}`;

	if (points.length < 2) {
		return (
			<div className="vp-trend-area is-empty" style={{ height }}>
				<span>{__('Not enough history yet - the trend appears after a few daily scans.', 'vulopilot')}</span>
			</div>
		);
	}

	const scores = points.map((point) => point.score);
	const min = Math.min(...scores);
	const max = Math.max(...scores);
	// Zoom to the data, with headroom, but never past 0–100 and never narrower than 10 points.
	const pad = Math.max(4, Math.ceil((max - min) * 0.25));
	let lower = Math.max(0, Math.floor((min - pad) / 5) * 5);
	const upper = Math.min(100, Math.ceil((max + pad) / 5) * 5);
	if (upper - lower < 10) {
		lower = Math.max(0, upper - 10);
	}
	// Counts start at zero and rise to a round number above the busiest day.
	const countTop = Math.max(4, Math.ceil((max * 1.2) / 4) * 4);
	const domain: [number, number] = 'count' === scale ? [0, countTop] : [lower, upper];

	const tone =
		'count' === scale
			? { line: '#5b5bd6', name: 'flat' }
			: toneFor(points[points.length - 1].score - points[0].score);
	const firstDate = points[0].date;
	const lastDate = points[points.length - 1].date;
	const midDate = points[Math.floor((points.length - 1) / 2)].date;

	return (
		<div className={`vp-trend-area is-${tone.name}`} style={{ height }}>
			<ResponsiveContainer width="100%" height="100%">
				<AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={tone.line} stopOpacity={0.22} />
							<stop offset="100%" stopColor={tone.line} stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid vertical={false} stroke="#eef0f6" />
					<XAxis
						dataKey="date"
						ticks={[firstDate, midDate, lastDate]}
						tickFormatter={(value: string) => formatWpDay(value)}
						tickLine={false}
						axisLine={false}
						tick={{ fontSize: 11, fill: '#8a8fa3' }}
						interval="preserveStartEnd"
						minTickGap={24}
					/>
					<YAxis
						domain={domain}
						ticks={[domain[0], Math.round((domain[0] + domain[1]) / 2), domain[1]]}
						allowDecimals={false}
						tickLine={false}
						axisLine={false}
						tick={{ fontSize: 11, fill: '#8a8fa3' }}
					/>
					<Tooltip
						cursor={{ stroke: '#c9cddc', strokeDasharray: '3 3' }}
						content={({ active, payload }) => {
							if (!active || !payload?.length) {
								return null;
							}
							const point = payload[0].payload as ScorePoint;
							return (
								<div className="vp-trend-tip">
									<span>{formatWpDay(point.date)}</span>
									<strong>
										{sprintf(
											/* translators: 1: what the score is, e.g. "Visibility", 2: the score out of 100. */
											__('%1$s %2$d', 'vulopilot'),
											label,
											point.score
										)}
									</strong>
								</div>
							);
						}}
					/>
					<Area
						type="monotone"
						dataKey="score"
						stroke={tone.line}
						strokeWidth={2.25}
						fill={`url(#${gradientId})`}
						dot={false}
						activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: tone.line }}
						isAnimationActive={false}
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
};

export default ScoreTrendArea;
