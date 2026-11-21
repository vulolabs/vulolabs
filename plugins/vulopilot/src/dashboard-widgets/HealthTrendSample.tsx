import React from 'react';
import { __ } from '@wordpress/i18n';
import ProSample from '../components/ProSample/ProSample';
import DashboardWidget from './DashboardWidget';
import type { WidgetProps } from './types';

/**
 * "Health trend" is a VuloPilot Pro feature. Free ships only this picture of it: made-up figures in the Pro card's
 * markup (its styles are in dashboard.scss), inside ProSample, which marks it "Sample data" and opens the Pro popup.
 * There is no logic here - every number, colour and position below is written out. VuloPilot Pro replaces this widget with the
 * real card (classes/AdvancedReports/src/HealthTrend in Pro) through `vulopilot_dashboard_widgets`.
 */

/**
 * Sample areas, everything written out: today's score, the change chip, and on the 65–95 scale below where the
 * week-ago dot (`then`) and today's dot (`now`) sit and the bar between them (`bar`: left, width), all in %.
 */
const SAMPLE_AREAS = [
	{ label: __('Visibility', 'vulopilot'), icon: 'search-discovery', today: 88, row: 'is-up', chip: 'is-good', arrow: 'up', change: '4', then: '63.33%', now: '76.67%', bar: ['63.33%', '13.34%'] },
	{ label: __('Health', 'vulopilot'), icon: 'security', today: 79, row: 'is-down', chip: 'is-bad', arrow: 'down', change: '6', then: '66.67%', now: '46.67%', bar: ['46.67%', '20%'] },
	{ label: __('Performance', 'vulopilot'), icon: 'speed', today: 91, row: 'is-up', chip: 'is-good', arrow: 'up', change: '2', then: '80%', now: '86.67%', bar: ['80%', '6.67%'] },
	{ label: __('Content', 'vulopilot'), icon: 'text-fields', today: 84, row: 'is-flat', chip: '', arrow: '', change: '', then: '63.33%', now: '63.33%', bar: ['63.33%', '0%'] },
	{ label: __('Brand', 'vulopilot'), icon: 'brand-visibility', today: 76, row: 'is-down', chip: 'is-bad', arrow: 'down', change: '3', then: '46.67%', now: '36.67%', bar: ['36.67%', '10%'] },
];

const SAMPLE_TICKS = [
	{ value: 65, at: '0%' },
	{ value: 80, at: '50%' },
	{ value: 95, at: '100%' },
];

const HealthTrendSample: React.FC<WidgetProps> = ({ isLoading, onHide, isCustomizing }) => (
	<DashboardWidget
		title={__('Health trend', 'vulopilot')}
		desc={__('How each area moved over the last 7 days, and every day with Pro.', 'vulopilot')}
		icon="analytics"
		isLoading={isLoading}
		onHide={onHide}
		isCustomizing={isCustomizing}
		className="vp-trend-card"
	>
		<ProSample
			feature={{
				title: __('Health trend', 'vulopilot'),
				description: __('How every area moved this week, plus your score recorded daily over 7, 30 and 90 days.', 'vulopilot'),
				icon: 'analytics',
			}}
			text={__('Your own areas, week by week, and your score every day.', 'vulopilot')}
			cta={__('Unlock health trends', 'vulopilot')}
		>
			<div className="vp-week-sample">
				<div className="vp-trend-head">
					<div className="vp-trend-now">
						<strong className="is-blue">
							84
							<small>/100</small>
						</strong>
						<div>
							<span>{__('Overall score · today', 'vulopilot')}</span>
						</div>
					</div>
					<dl className="vp-trend-stats">
						<div className="is-up">
							<dt>{__('Up', 'vulopilot')}</dt>
							<dd>2</dd>
						</div>
						<div className="is-down">
							<dt>{__('Down', 'vulopilot')}</dt>
							<dd>2</dd>
						</div>
						<div>
							<dt>{__('Steady', 'vulopilot')}</dt>
							<dd>1</dd>
						</div>
					</dl>
				</div>

				<div className="vp-shift">
					<div className="vp-shift-scale">
						<span />
						<span className="vp-shift-axis">
							{SAMPLE_TICKS.map((tick) => (
								<em key={tick.value} style={{ left: tick.at }}>
									{tick.value}
								</em>
							))}
						</span>
						<span />
					</div>

					<ul>
						{SAMPLE_AREAS.map((area) => (
								<li key={area.label}>
									<a className={area.row}>
										<span className="vp-shift-name">
											<i className={`adminfont-${area.icon}`} />
											{area.label}
										</span>
										<span className="vp-shift-track">
											{SAMPLE_TICKS.map((tick) => (
												<b key={tick.value} style={{ left: tick.at }} />
											))}
											<span className="vp-shift-span" style={{ left: area.bar[0], width: area.bar[1] }} />
											<i className="vp-shift-then" style={{ left: area.then }} />
											<i className="vp-shift-now" style={{ left: area.now }} />
										</span>
										<span className="vp-shift-score">
											{area.today}
											<span className="vp-shift-delta">
												{area.change ? (
													<span className={`vp-delta ${area.chip}`}>
														<i className={`adminfont-arrow-${area.arrow}`} />
														{area.change}
													</span>
												) : (
													<em>{__('steady', 'vulopilot')}</em>
												)}
											</span>
										</span>
									</a>
								</li>
						))}
					</ul>

					<div className="vp-shift-legend">
						<span>
							<i className="vp-shift-then" />
							{__('7 days ago', 'vulopilot')}
						</span>
						<span>
							<i className="vp-shift-now" />
							{__('Today', 'vulopilot')}
						</span>
					</div>
				</div>
			</div>
		</ProSample>
	</DashboardWidget>
);

export default HealthTrendSample;
