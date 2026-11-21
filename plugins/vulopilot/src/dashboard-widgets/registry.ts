import { __ } from '@wordpress/i18n';
import { useEffect, useState } from 'react';
import { applyFilters } from '@wordpress/hooks';
import CrawlerTrafficWidget from './CrawlerTrafficWidget';
import SiteSnapshotWidget from './SiteSnapshotWidget';
import HealthTrendSample from './HealthTrendSample';
import { WidgetDefinition } from './types';

/**
 * The dashboard's "More insights" section: analysis people can reorder or hide. What needs doing (health summary,
 * next steps, autopilot, recent changes) is drawn by pages/Dashboard itself and is not customizable.
 * Every id must be in Utill::DASHBOARD_WIDGET_IDS, or saved layouts drop it.
 */
const INSIGHT_WIDGETS: WidgetDefinition[] = [
	{
		id: 'vulopilot-activity',
		title: __('Health trend', 'vulopilot'),
		desc: __('How your overall score has moved over time.', 'vulopilot'),
		icon: 'analytics',
		grid: 7,
		// A sample of a Pro feature; VuloPilot Pro replaces it with the real card through `vulopilot_dashboard_widgets`.
		component: HealthTrendSample,
	},
	{
		id: 'crawler-traffic',
		title: __('AI crawler traffic', 'vulopilot'),
		desc: __('Which AI crawlers visit your site, and when they last came.', 'vulopilot'),
		icon: 'global-community',
		grid: 5,
		component: CrawlerTrafficWidget,
	},
	{
		id: 'site-snapshot',
		title: __('Site profile', 'vulopilot'),
		desc: __("Your site's content, technology, audience and the identity AI engines see.", 'vulopilot'),
		icon: 'website',
		grid: 12,
		component: SiteSnapshotWidget,
	},
];

/** Free's widgets, as `vulopilot_dashboard_widgets` adds to or replaces them. */
export const getDashboardWidgets = (): WidgetDefinition[] =>
	applyFilters('vulopilot_dashboard_widgets', INSIGHT_WIDGETS) as WidgetDefinition[];

/**
 * The widgets, read again whenever VuloPilot Pro finishes loading. Pro's script runs after this one, so reading the
 * filter once (at import) missed every widget Pro registers - the same reason useFilterSlot() rechecks.
 */
export const useDashboardWidgets = (): WidgetDefinition[] => {
	const [widgets, setWidgets] = useState<WidgetDefinition[]>(getDashboardWidgets);

	useEffect(() => {
		const recheck = () => setWidgets(getDashboardWidgets());

		recheck();
		window.addEventListener('vulopilot_pro_modules_loaded', recheck);

		return () => window.removeEventListener('vulopilot_pro_modules_loaded', recheck);
	}, []);

	return widgets;
};
