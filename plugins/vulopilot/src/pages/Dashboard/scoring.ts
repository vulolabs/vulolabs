/* global vulopilotAppLocalizer */
import { __ } from '@wordpress/i18n';
import type { DashboardSummary } from '../../dashboard-widgets/types';

/** "Excellent", "Good", "Fair" or "Needs work" for a 0–100 score. */
export const getRating = (score: number): string => {
	if (score >= 90) {
		return __('Excellent', 'vulopilot');
	}
	if (score >= 70) {
		return __('Good', 'vulopilot');
	}
	if (score >= 50) {
		return __('Fair', 'vulopilot');
	}
	return __('Needs work', 'vulopilot');
};

/** One sentence on what the overall score means. */
export const getRatingSummary = (score: number): string => {
	if (score >= 90) {
		return __('Your site is in excellent shape.', 'vulopilot');
	}
	if (score >= 70) {
		return __('Your site is healthy and needs minimal work.', 'vulopilot');
	}
	if (score >= 50) {
		return __('Your site could use some improvement.', 'vulopilot');
	}
	return __('Your site needs attention in several areas.', 'vulopilot');
};

export interface AreaScore {
	key: string;
	label: string;
	icon: string;
	score: number;
	/** Points gained (+) or lost (−) against the same score 7 days ago. */
	delta: number;
	/** Where to go to improve it. */
	href: string;
}

const average = (nums: number[]): number => Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length);

/** The dashboard's area scores, each with its week-over-week change and the page that improves it. */
export const getAreaScores = (summary: DashboardSummary): AreaScore[] => {
	const now = summary.category_scores;
	const then = summary.category_scores_7d_ago;
	const page = (tab: string) => `?page=vulopilot#&tab=${tab}`;

	const areas: AreaScore[] = [
		{
			key: 'visibility',
			label: __('Visibility', 'vulopilot'),
			icon: 'search-discovery',
			score: average([now.seo, now.geo, now.content, now.brand]),
			delta: average([now.seo, now.geo, now.content, now.brand]) - average([then.seo, then.geo, then.content, then.brand]),
			href: page('seo-visibility'),
		},
		{
			key: 'health',
			label: __('Health', 'vulopilot'),
			icon: 'security',
			score: average([now.security, now.accessibility]),
			delta: average([now.security, now.accessibility]) - average([then.security, then.accessibility]),
			href: page('security'),
		},
		{
			key: 'performance',
			label: __('Performance', 'vulopilot'),
			icon: 'speed',
			score: now.performance,
			delta: now.performance - then.performance,
			href: page('performance'),
		},
		{
			key: 'content',
			label: __('Content', 'vulopilot'),
			icon: 'text-fields',
			score: now.content,
			delta: now.content - then.content,
			href: page('content'),
		},
		{
			key: 'brand',
			label: __('Brand', 'vulopilot'),
			icon: 'brand-visibility',
			score: now.brand,
			delta: now.brand - then.brand,
			href: page('seo-visibility&subtab=brand-visibility'),
		},
	];

	if (vulopilotAppLocalizer.has_woocommerce) {
		areas.splice(2, 0, {
			key: 'commerce',
			label: __('Commerce', 'vulopilot'),
			icon: 'woocommerce',
			score: now.woocommerce ?? 0,
			delta: (now.woocommerce ?? 0) - (then.woocommerce ?? 0),
			href: page('commerce'),
		});
	}

	return areas;
};
