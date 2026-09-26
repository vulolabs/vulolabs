
/* global vulopilotAppLocalizer */

import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';

import {
	ColumnComponent,
	ContainerComponent,
	ModuleGuardComponent,
	NavigatorHeaderComponent,
} from '@zyra/components';

import RunScanHeaderExtra from '../../components/RunScanHeaderExtra';
import DashboardGrid from '../../dashboard-widgets/DashboardGrid';
import GettingStartedCard from './GettingStartedCard';

import type { DashboardSummary } from '../../dashboard-widgets/types';

/**
 * Empty dashboard summary.
 */
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

/**
 * Dashboard greeting.
 */
const getGreeting = (): string => {
	const hour = new Date().getHours();

	if (hour < 12) {
		return __('Good morning', 'vulopilot');
	}

	if (hour < 18) {
		return __('Good afternoon', 'vulopilot');
	}

	return __('Good evening', 'vulopilot');
};

/**
 * Dashboard page.
 */
const Dashboard = () => {
	const [summary, setSummary] =
		useState<DashboardSummary>(EMPTY_SUMMARY);

	const [isLoading, setIsLoading] = useState(true);

	const [error, setError] = useState<string | null>(null);

	const [isCustomizing, setIsCustomizing] = useState(false);

	const [restoreDefaultSignal, setRestoreDefaultSignal] =
		useState(0);

	/**
	 * Load dashboard data.
	 */
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

	/**
	 * Initial dashboard load.
	 */
	useEffect(() => {
		loadDashboard();
	}, []);

	/**
	 * Dashboard header actions.
	 */
	const headerCustomContent = (
		<RunScanHeaderExtra
			settingsSubtab="general"
			hideSettingsButton
			hideRunScanButton={isCustomizing}
			replaceRunScanButton={
				isCustomizing
					? {
						text: __(
							'Reset to default',
							'vulopilot'
						),
						icon: 'refresh',
						color: 'border-purple',

						onClick: () => {
							setRestoreDefaultSignal(
								(signal) => signal + 1
							);

							setIsCustomizing(false);
						},
					}
					: undefined
			}
			onSuccess={loadDashboard}
			trailingButtons={[
				isCustomizing
					? {
						icon: 'form-checkboxes',
						color: 'text-green',

						onClick: () =>
							setIsCustomizing(false),
					}
					: {
						icon: 'edit',
						color: 'text-purple',

						onClick: () =>
							setIsCustomizing(true),
					},
			]}
		/>
	);

	/**
	 * Page header.
	 */
	const pageHeader = (
		<NavigatorHeaderComponent
			headerTitle={sprintf(
				/* translators: 1: time-of-day greeting (e.g. "Good morning"), 2: current user's display name. */
				__(
					'%1$s, %2$s! \u{1F44B}',
					'vulopilot'
				),
				getGreeting(),
				vulopilotAppLocalizer.current_user_display_name
			)}
			headerIcon="module"
			headerDescription={__(
				"Here's how your site is doing.",
				'vulopilot'
			)}
			headerCustomContent={headerCustomContent}
		/>
	);

	/**
	 * Error state.
	 */
	if (error) {
		return (
			<>
				{pageHeader}

				<ColumnComponent>
					<ModuleGuardComponent
						icon="error"
						title={__(
							'Could not load the dashboard',
							'vulopilot'
						)}
						desc={error}
					/>
				</ColumnComponent>
			</>
		);
	}

	/**
	 * Dashboard layout.
	 */
	return (
		<>
			{pageHeader}

			<ContainerComponent general>
				{/* Getting started */}
				<GettingStartedCard />
				<DashboardGrid
					summary={summary}
					isLoading={isLoading}
					isCustomizing={isCustomizing}
					restoreDefaultSignal={
						restoreDefaultSignal
					}
					onRefreshSummary={() =>
						loadDashboard(true)
					}
				/>
			</ContainerComponent>
		</>
	);
};

export default Dashboard;