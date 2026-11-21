import { useState } from 'react';
import type { ComponentType } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { ChartComponent } from '@zyra/components';
import { Card, Delta, EmptyState, Segmented, Skeleton, scoreTone } from '../../components/ui';
import ProSample from '../../components/ProSample/ProSample';
import { useApiList } from '../../services/useApiList';
import { useFilterSlot } from '../../services/useFilterSlot';
import { formatWpDate } from '../../services/formatWpDate';

interface SecurityScoreSnapshot {
	snapshot_date: string;
	security_score: number;
}

/** What VuloPilot Pro shows under the chart: issues fixed, new and still open in the chosen period. */
export interface SecurityPeriodSummaryProps {
	days: number;
}

const PERIODS = [
	{ value: '7', label: __('7D', 'vulopilot') },
	{ value: '30', label: __('30D', 'vulopilot') },
	{ value: '90', label: __('90D', 'vulopilot') },
];

/** Free's picture of Pro's period summary: sample figures only. */
const PeriodSummarySample = () => (
	<ProSample
		feature={{
			title: __('Security reports', 'vulopilot'),
			description: __('See what was fixed, what is new and what is still open for any period.', 'vulopilot'),
			icon: 'report',
		}}
		text={__('See what was fixed and what is new in each period.', 'vulopilot')}
		cta={__('Unlock reports', 'vulopilot')}
	>
		<dl className="vp-trend-stats vp-sec-period">
			<div className="is-up">
				<dt>{__('Fixed', 'vulopilot')}</dt>
				<dd>12</dd>
			</div>
			<div className="is-down">
				<dt>{__('New', 'vulopilot')}</dt>
				<dd>3</dd>
			</div>
			<div>
				<dt>{__('Still open', 'vulopilot')}</dt>
				<dd>5</dd>
			</div>
		</dl>
	</ProSample>
);

/** The security score day by day (`GET /security-score-snapshots`), over 7, 30 or 90 days. */
const SecurityTrendCard = () => {
	const [period, setPeriod] = useState('30');
	const days = Number(period);
	const { data: snapshots, isLoading } = useApiList<SecurityScoreSnapshot>('security-score-snapshots', { days });
	const PeriodSummary = useFilterSlot<ComponentType<SecurityPeriodSummaryProps>>('vulopilot_security_period_summary');

	const latest = snapshots[snapshots.length - 1];
	const change = snapshots.length > 1 ? latest.security_score - snapshots[0].security_score : null;

	let body;

	if (isLoading && 0 === snapshots.length) {
		body = <Skeleton size="chart" />;
	} else if (0 === snapshots.length) {
		body = (
			<EmptyState
				compact
				icon="analytics"
				title={__('No trend yet', 'vulopilot')}
				text={__('Your daily score starts with your first security scan.', 'vulopilot')}
			/>
		);
	} else {
		body = (
			<>
				<div className="vp-trend-head">
					<div className="vp-trend-now">
						<strong className={`is-${scoreTone(latest.security_score)}`}>
							{latest.security_score}
							<small>/100</small>
						</strong>
						<div>
							<span>{__('Latest score', 'vulopilot')}</span>
							<Delta change={change} suffix="" />
						</div>
					</div>
				</div>
				<ChartComponent
					type="dynamic-line"
					isLoading={isLoading}
					data={snapshots.map((snapshot) => ({
						...snapshot,
						snapshot_date: formatWpDate(snapshot.snapshot_date),
					}))}
					dataKey="security_score"
					xKey="snapshot_date"
					height={220}
					yDomain={[0, 100]}
				/>
			</>
		);
	}

	return (
		<Card
			id="security-trend-card"
			className="vp-sec-trend"
			icon="analytics"
			title={__('Security score', 'vulopilot')}
			desc={sprintf(
				/* translators: %d: number of days. */
				__('Day by day, over the last %d days.', 'vulopilot'),
				days
			)}
			action={<Segmented size="sm" label={__('Period', 'vulopilot')} value={period} onChange={setPeriod} options={PERIODS} />}
		>
			{body}
			{PeriodSummary ? <PeriodSummary days={days} /> : <PeriodSummarySample />}
		</Card>
	);
};

export default SecurityTrendCard;
