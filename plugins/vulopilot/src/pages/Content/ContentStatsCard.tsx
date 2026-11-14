/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import { AnalyticsComponent, CardComponent } from '@zyra/components';
import { ToggleInput } from '@zyra/inputs';

type StatsPeriod = '7' | '30' | '90';

interface StatMetric {
	current: number;
	previous: number;
	change_percent: number | null;
}

interface StatsResponse {
	content_created: StatMetric;
	words_generated: StatMetric;
}

const PERIOD_OPTIONS: { key: StatsPeriod; value: StatsPeriod; label: string }[] = [
	{ key: '7', value: '7', label: __('7D', 'vulopilot') },
	{ key: '30', value: '30', label: __('30D', 'vulopilot') },
	{ key: '90', value: '90', label: __('90D', 'vulopilot') },
];

const toYmd = (date: Date): string => date.toISOString().slice(0, 10);

const resolvePeriod = (period: StatsPeriod): { dateFrom: string; dateTo: string } => {
	const now = new Date();
	const from = new Date(now);
	from.setDate(from.getDate() - (Number(period) - 1));

	return { dateFrom: toYmd(from), dateTo: toYmd(now) };
};

const formatAbbreviated = (count: number): string =>
	count >= 1000
		? `${(count / 1000).toFixed(1)}K`
		: count.toLocaleString();

/** "Content Stats". */
const ContentStatsCard = () => {
	const [period, setPeriod] = useState<StatsPeriod>('30');
	const [stats, setStats] = useState<StatsResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const { dateFrom, dateTo } = resolvePeriod(period);

		setIsLoading(true);
		getApiResponse<StatsResponse>(
			getApiLink(
				vulopilotAppLocalizer,
				`content-intelligence/stats?date_from=${dateFrom}&date_to=${dateTo}`
			),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				if (response) {
					setStats(response);
				}
			})
			.finally(() => setIsLoading(false));
	}, [period]);

	const renderChange = (changePercent: number | null) => {
		if (null === changePercent) {
			return null;
		}

		const isPositive = changePercent >= 0;

		return (
			<span
				className={`content-stats-tile-change ${isPositive ? 'up' : 'down'}`}
			>
				<i
					className={`adminfont-arrow-${isPositive ? 'up' : 'down'}`}
				/>
				{Math.abs(changePercent)}%
			</span>
		);
	};

	return (
		<CardComponent
			id="content-stats-card"
			className="content-stats-card"
			title={__('Content Stats', 'vulopilot')}
			titleIcon='ai'
			desc={__('Your real content numbers for the selected period.', 'vulopilot')}
			isLoading={isLoading}
			action={
				<ToggleInput
					options={PERIOD_OPTIONS}
					value={period}
					onChange={(value) => setPeriod(value as StatsPeriod)}
					modules={[]}
					
				/>
			}
		>
			{stats && (
				<AnalyticsComponent
					variant="background-color"
					cols={2}
					data={[
						{
							colorClass: 'admin-bg-color2',
							number: (
								<>
									{stats.content_created.current.toLocaleString()}
									{renderChange(
										stats.content_created.change_percent
									)}
								</>
							),
							text: __('Content Created', 'vulopilot'),
						},
						{
							colorClass: 'admin-bg-color3',
							number: (
								<>
									{formatAbbreviated(
										stats.words_generated.current
									)}
									{renderChange(
										stats.words_generated.change_percent
									)}
								</>
							),
							text: __('Words Generated', 'vulopilot'),
						},
						{
							colorClass: 'admin-bg-color4',
							number: '0',
							text: (
								<>
									{__('SEO Score', 'vulopilot')}
								</>
							),
						},
						{
							colorClass: 'admin-bg-color6',
							number: '0',
							text: (
								<>
									{__('Time Saved', 'vulopilot')}
								</>
							),
						},
					]}
				/>
			)}
		</CardComponent>
	);
};

export default ContentStatsCard;
