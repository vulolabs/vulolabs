
/* global vulopilotAppLocalizer */

import { useEffect, useRef, useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';

import {
	ColumnComponent,
	ContainerComponent,
	NavigatorHeaderComponent,
} from '@zyra/components';

import RunScanHeaderExtra from '../../components/RunScanHeaderExtra';
import DashboardGrid from '../../dashboard-widgets/DashboardGrid';
import { ButtonInput } from '@zyra/inputs';
import HealthHero from './HealthHero';
import type { HeroAction } from './HealthHero';
import NextSteps from './NextSteps';
import type { StepFilter } from './NextSteps';
import AutopilotCard from './AutopilotCard';
import ActivityFeed from './ActivityFeed';
import { EmptyState, SectionHead, greeting } from '../../components/ui';
import '../../dashboard-widgets/dashboard.scss';

import type { DashboardSummary } from '../../dashboard-widgets/types';

/** Empty dashboard summary. */
const EMPTY_SUMMARY: DashboardSummary = {
	overall_score: 0,
	open_findings: 0,
	critical_findings: 0,

	findings_by_severity: {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
	},

	active_automations: 0,

	ai_jobs_used: 0,
	ai_jobs_quota: 0,

	category_scores: {
		seo: 0,
		performance: 0,
		security: 0,
		accessibility: 0,
		woocommerce: null,
		geo: 0,
		content: 0,
		brand: 0,
	},

	category_scores_7d_ago: {
		seo: 0,
		performance: 0,
		security: 0,
		accessibility: 0,
		woocommerce: null,
		geo: 0,
		content: 0,
		brand: 0,
	},

	new_findings_this_week: 0,
	fixed_findings_this_week: 0,
	quick_fixes: 0,
	pending_approvals: 0,

	automation_status: {
		enabled: 0,
		disabled: 0,
	},

	site_snapshot: {
		posts: 0,
		pages: 0,
		comments: 0,
		users: 0,
		plugins_active: 0,
		plugins_total: 0,
		wp_version: '',
		php_version: '',
	},
};

/** Dashboard page. */
const Dashboard = () => {
	const [summary, setSummary] =
		useState<DashboardSummary>(EMPTY_SUMMARY);

	const [isLoading, setIsLoading] = useState(true);

	const [error, setError] = useState<string | null>(null);

	const [isCustomizing, setIsCustomizing] = useState(false);

	const [restoreDefaultSignal, setRestoreDefaultSignal] =
		useState(0);

	/** Load dashboard data. */
	const loadDashboard = (silent = false) => {
		if (!silent) {
			setIsLoading(true);
		}

		setError(null);

		getApiResponse<DashboardSummary>(
			getApiLink(vulopilotAppLocalizer, 'dashboard'),
			{
				headers: {
					'X-WP-Nonce': vulopilotAppLocalizer.nonce,
				},
			}
		)
			.then((response) => {
				if (!response || !response.category_scores) {
					setError(
						__(
							'Could not load the dashboard summary.',
							'vulopilot'
						)
					);

					return;
				}

				setSummary({
					...EMPTY_SUMMARY,
					...response,
					category_scores: {
						...EMPTY_SUMMARY.category_scores,
						...response.category_scores,
					},
					category_scores_7d_ago: {
						...EMPTY_SUMMARY.category_scores_7d_ago,
						...response.category_scores_7d_ago,
					},
					site_snapshot: {
						...EMPTY_SUMMARY.site_snapshot,
						...response.site_snapshot,
					},
				});
			})
			.catch(() => {
				setError(
					__(
						'Could not load the dashboard summary.',
						'vulopilot'
					)
				);
			})
			.finally(() => {
				if (!silent) {
					setIsLoading(false);
				}
			});
	};

	/** Initial dashboard load. */
	useEffect(() => {
		loadDashboard();
	}, []);

	// The queue's filter lives here so the hero's main button can open the right slice of it.
	const [stepFilter, setStepFilter] = useState<StepFilter>('all');
	// Bumped after a scan, so the queue and the feed fetch again.
	const [refreshKey, setRefreshKey] = useState(0);
	const stepsRef = useRef<HTMLDivElement>(null);

	const openSteps = (filter: StepFilter) => {
		setStepFilter(filter);
		stepsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	/** The one thing most worth doing now, as the hero's button. */
	let primary: HeroAction | null = null;

	if (summary.pending_approvals > 0) {
		primary = {
			label: sprintf(
				/* translators: %d: number of AI changes waiting for approval. */
				_n('Review %d approval', 'Review %d approvals', summary.pending_approvals, 'vulopilot'),
				summary.pending_approvals
			),
			icon: 'approval',
			onClick: () => openSteps('approvals'),
		};
	} else if (summary.critical_findings > 0) {
		primary = {
			label: sprintf(
				/* translators: %d: number of critical issues. */
				_n('Fix %d critical issue', 'Fix %d critical issues', summary.critical_findings, 'vulopilot'),
				summary.critical_findings
			),
			icon: 'error',
			onClick: () => openSteps('urgent'),
		};
	} else if (summary.open_findings > 0) {
		primary = {
			label: __('Work through next steps', 'vulopilot'),
			icon: 'arrow-down',
			onClick: () => openSteps('all'),
		};
	}

	/** Page header: the greeting, what is waiting, and a scan. */
	const waiting = summary.critical_findings + summary.pending_approvals;
	let headline = __("Here's how your site is doing.", 'vulopilot');

	if (!isLoading) {
		const parts: string[] = [];

		if (summary.critical_findings > 0) {
			parts.push(
				sprintf(
					/* translators: %d: number of critical issues. */
					_n('%d critical issue', '%d critical issues', summary.critical_findings, 'vulopilot'),
					summary.critical_findings
				)
			);
		}
		if (summary.pending_approvals > 0) {
			parts.push(
				sprintf(
					/* translators: %d: number of approvals. */
					_n('%d approval', '%d approvals', summary.pending_approvals, 'vulopilot'),
					summary.pending_approvals
				)
			);
		}

		headline =
			waiting > 0
				? sprintf(
						/* translators: %s: what needs the user, e.g. "1 critical issue and 2 approvals". */
						_n('%s needs you today.', '%s need you today.', waiting, 'vulopilot'),
						parts.join(__(' and ', 'vulopilot'))
				  )
				: __('Nothing urgent today. Your site is on autopilot.', 'vulopilot');
	}

	const pageHeader = (
		<NavigatorHeaderComponent
			headerTitle={sprintf(
				/* translators: 1: time-of-day greeting (e.g. "Good morning"), 2: current user's display name. */
				__('%1$s, %2$s', 'vulopilot'),
				greeting(),
				vulopilotAppLocalizer.current_user_display_name || __('there', 'vulopilot')
			)}
			headerIcon="analytics"
			headerDescription={headline}
			headerCustomContent={
				<RunScanHeaderExtra
					settingsSubtab="general"
					hideSettingsButton
					onSuccess={() => {
						loadDashboard(true);
						setRefreshKey((key) => key + 1);
					}}
				/>
			}
		/>
	);

	/** Error state. */
	if (error) {
		return (
			<>
				{pageHeader}

				<ContainerComponent general>
					<ColumnComponent>
						<section className="vp-card">
							<div className="vp-card-body">
								<EmptyState
									icon="error"
									tone="red"
									title={__('Could not load the dashboard', 'vulopilot')}
									text={error}
									action={
										<ButtonInput
											buttons={{ text: __('Try again', 'vulopilot'), icon: 'refresh', color: 'purple', onClick: () => loadDashboard() }}
										/>
									}
								/>
							</div>
						</section>
					</ColumnComponent>
				</ContainerComponent>
			</>
		);
	}

	return (
		<>
			{pageHeader}

			<ContainerComponent general>
				<ColumnComponent>
					<div className="vp-page vp-dashboard">
						{/* 1. How the site is doing, and the one thing to do about it. */}
						<HealthHero summary={summary} isLoading={isLoading} primary={primary} />

						{/* 2. Everything waiting on the user, beside what runs on its own and what just happened. */}
						<div className="vp-command" ref={stepsRef}>
							<NextSteps
								key={`steps-${refreshKey}`}
								id="vp-next-steps"
								filter={stepFilter}
								onFilterChange={setStepFilter}
								openTotal={summary.open_findings}
								onChanged={() => loadDashboard(true)}
							/>
							<aside className="vp-rail">
								<AutopilotCard key={`autopilot-${refreshKey}`} onChanged={() => loadDashboard(true)} />
								<ActivityFeed key={`feed-${refreshKey}`} />
							</aside>
						</div>

						{/* 3. Deeper analysis, arranged the way the user likes. */}
						<SectionHead title={__('More insights', 'vulopilot')}>
							{isCustomizing ? (
								<ButtonInput
									buttons={[
										{
											text: __('Reset to default', 'vulopilot'),
											icon: 'refresh',
											color: 'purple',
											onClick: () => {
												setRestoreDefaultSignal((signal) => signal + 1);
												setIsCustomizing(false);
											},
										},
										{
											text: __('Done', 'vulopilot'),
											icon: 'check',
											color: 'purple-bg',
											onClick: () => setIsCustomizing(false),
										},
									]}
								/>
							) : (
								<button type="button" className="vp-widget-tool" onClick={() => setIsCustomizing(true)}>
									<i className="adminfont-edit" aria-hidden="true" />
									{__('Customize', 'vulopilot')}
								</button>
							)}
						</SectionHead>

						{isCustomizing && (
							<p className="vp-customize-note">
								<i className="adminfont-move" aria-hidden="true" />
								{__('Drag cards by their handle to reorder them, or hide the ones you do not need. Changes save as you go.', 'vulopilot')}
							</p>
						)}

						<DashboardGrid
							summary={summary}
							isLoading={isLoading}
							isCustomizing={isCustomizing}
							restoreDefaultSignal={restoreDefaultSignal}
							onRefreshSummary={() => loadDashboard(true)}
						/>
					</div>
				</ColumnComponent>
			</ContainerComponent>
		</>
	);
};

export default Dashboard;
