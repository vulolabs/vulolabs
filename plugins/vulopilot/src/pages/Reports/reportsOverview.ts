/* global vulopilotAppLocalizer */
import { __ } from '@wordpress/i18n';
import { useEffect, useState } from 'react';
import { getApiLink, getApiResponse } from '@zyra/core';

/** Same 3-preset shape WebsiteProgressChart.tsx already established for this page - no arbitrary calendar range picker. */
export const DAY_OPTIONS = [7, 30, 90] as const;


/**
 * Fabricated "Recent Reports"/"Report History" rows - same "obviously
 * fake, never mistaken for this site's own real data" reasoning
 * VuloPilotActivityWidget.tsx's own `DUMMY_HEALTH_TIMELINE` documents.
 * Deliberately its own small, self-contained shape (not the real
 * `ReportRow` interface both tables otherwise use) since these never
 * carry a real id/file/format - no download/view action behind them
 * could ever be real, so there's nothing to wire up.
 */
export interface DummyReportRow {
	id: string;
	name: string;
	shortLabel: string;
	badgeColor: string;
	icon: string;
	statusLabel: string;
	period: string;
	date: string;
}

export const DUMMY_REPORT_ROWS: DummyReportRow[] = [
	{
		id: 'dummy-1',
		name: __('Full Website Report', 'vulopilot'),
		shortLabel: __('Full Website', 'vulopilot'),
		badgeColor: 'indigo',
		icon: 'global-community',
		statusLabel: __('Completed', 'vulopilot'),
		period: __('Last 30 days', 'vulopilot'),
		date: __('Sample date', 'vulopilot'),
	},
	{
		id: 'dummy-2',
		name: __('SEO Report', 'vulopilot'),
		shortLabel: __('SEO', 'vulopilot'),
		badgeColor: 'pink',
		icon: 'search-discovery',
		statusLabel: __('Completed', 'vulopilot'),
		period: __('Last 30 days', 'vulopilot'),
		date: __('Sample date', 'vulopilot'),
	},
	{
		id: 'dummy-3',
		name: __('Security Report', 'vulopilot'),
		shortLabel: __('Security', 'vulopilot'),
		badgeColor: 'red',
		icon: 'security',
		statusLabel: __('Completed', 'vulopilot'),
		period: __('Last 30 days', 'vulopilot'),
		date: __('Sample date', 'vulopilot'),
	},
];

export interface ReportsPeriod {
	days: number;
	start: string;
	end: string;
	compare_start: string;
	compare_end: string;
}

export interface ReportsSummary {
	fixed: number;
	new: number;
	still_open: number;
	fixed_delta_pct: number | null;
	new_delta_pct: number | null;
	still_open_delta_pct: number | null;
}

export interface CategoryTile {
	key: string;
	label: string;
	sublabel: string;
	icon: string;
	score: number | null;
	delta: number | null;
	status: string;
}

export interface Highlight {
	key: string;
	label: string;
	direction: 'up' | 'down' | 'flat';
	delta: number;
}

export interface CategoryPanel {
	fixed: number;
	new: number;
	still_open: number;
	top_open: { id: number; title: string; severity: string }[];
}

export interface AiVisibilityCheck {
	label: string;
	scanner_id: string;
	status: string;
	open_count: number;
}

export interface SpeedSummary {
	score: number | null;
	pages_improved: number;
	pages_need_attention: number;
	avg_score: number | null;
	avg_mobile_score: number | null;
	total_pages: number;
}

export interface ContentSummary {
	pages_improved: number;
	new_published: number;
	older_to_review: number;
	drafts_in_progress: number;
}

export interface StoreSummary {
	available: boolean;
	blockers_fixed: number | null;
	new_issues: number | null;
	products_to_review: number | null;
	sales: number | null;
	orders: number | null;
	avg_order: number | null;
	currency: string | null;
}

export interface NextPriority {
	id: number;
	title: string;
	description: string;
	severity: string;
	category: string;
}

export interface ReportsOverviewResponse {
	period: ReportsPeriod;
	summary: ReportsSummary;
	categories: CategoryTile[];
	highlights: Highlight[];
	seo_summary: CategoryPanel;
	security_summary: CategoryPanel;
	ai_visibility_summary: { checks: AiVisibilityCheck[] };
	speed_summary: SpeedSummary;
	content_summary: ContentSummary;
	store_summary: StoreSummary;
	next_priorities: NextPriority[];
}

/**
 * `GET /reports-overview?days=N` (Controllers\ReportsOverview.php) -
 * shared by every section on the redesigned Reports Overview tab, so
 * changing the day-range preset once (ReportsOverviewHeader.tsx) refetches
 * everything together rather than each section owning its own fetch.
 */
export const useReportsOverview = (days: number, enabled = true) => {
	const [data, setData] = useState<ReportsOverviewResponse | null>(null);
	const [isLoading, setIsLoading] = useState(enabled);

	useEffect(() => {
		if (!enabled) {
			setIsLoading(false);
			return;
		}

		let cancelled = false;
		setIsLoading(true);

		getApiResponse<ReportsOverviewResponse>(
			`${getApiLink(vulopilotAppLocalizer, 'reports-overview')}${
				getApiLink(vulopilotAppLocalizer, 'reports-overview').includes('?')
					? '&'
					: '?'
			}days=${days}`,
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				if (!cancelled && response) {
					setData(response);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [days, enabled]);

	return { data, isLoading };
};
