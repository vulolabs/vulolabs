import { __ } from '@wordpress/i18n';
import { applyFilters } from '@wordpress/hooks';
import { createStatWidgetComponent, StatWidgetConfig } from './StatWidget';
import HealthTimelineWidget from './HealthTimelineWidget';
import LatestReportsWidget from './LatestReportsWidget';
import CrawlerTrafficWidget from './CrawlerTrafficWidget';
import KnowledgeGraphWidget from './KnowledgeGraphWidget';
import NeedsAttentionWidget from './NeedsAttentionWidget';
import BrandBreakdownWidget from './BrandBreakdownWidget';
import OverallScoreWidget from './OverallScoreWidget';
import ScoreBreakdownWidget from './ScoreBreakdownWidget';
import RunAuditWidget from './RunAuditWidget';
import RecentChangesWidget from './RecentChangesWidget';
import KeyPagesWidget from './KeyPagesWidget';
import SiteSnapshotWidget from './SiteSnapshotWidget';
import RecentActivityWidget from './RecentActivityWidget';
import { WidgetDefinition } from './types';

/**
 * The newer "Good morning" Dashboard mockup's own top section, in its exact
 * order — Vital Pulse (full-width now that "Run complete audit" lives in
 * the page header instead, see Dashboard.tsx; its own `overall-score` entry
 * below renders `VuloPilotActivityWidget`'s "Health timeline" card as a
 * sibling right underneath its score card, both inside this one
 * `ColumnComponent` — see OverallScoreWidget.tsx's own docblock — rather
 * than `vulopilot-activity` staying a separate top-level registry entry
 * with its own cell), Needs your attention (moved up
 * from STANDALONE_WIDGETS below to sit right under Vital Pulse, matching
 * the mockup), Key pages at a glance + Site snapshot (a new side-by-side
 * pair — `site-snapshot`'s own entry below likewise renders
 * `AutomationStatusWidget` as a sibling card right after its own, both in
 * that one `ColumnComponent`, per the same direct instruction as Vital
 * Pulse/Health timeline above; `automation-status` removed as its own
 * top-level entry accordingly — see SiteSnapshotWidget.tsx's own
 * docblock), Recent activity. Every pre-existing widget this mockup doesn't
 * show as its own card (Run Complete Audit, Recent Changes) is NOT removed —
 * per direct instruction, anything already on this Dashboard that isn't
 * depicted in the new mockup stays, appended immediately after this list
 * (still inside MOCKUP_WIDGETS, so the never-customized default layout
 * keeps them, just lower on the page).
 *
 * AI Suggestions and Today's Tasks WERE removed from here (per direct
 * instruction, after confirming the duplication) — not kept-but-appended
 * like the rest, because both were genuine content duplicates rather than
 * merely "not in the new mockup":
 * - AISuggestionsWidget.tsx's own docblock already said it "reads the same
 *   `/findings` endpoint NeedsAttentionWidget's 'Open issues' tab already
 *   uses" — same query, same real findings, just a second styling of the
 *   identical rows.
 * - TodaysTasksWidget.tsx read the same unfiltered `/activity-logs` feed
 *   RecentActivityWidget now reads (curated to a real, meaningful
 *   event-type subset) — confirmed live to show the same rows in practice.
 * Both component files are left in place, unused, rather than deleted
 * (same "supersede don't delete" posture this codebase already applies to
 * other superseded components) — their own docblocks now point at their
 * replacement. Removed from `Utill::DASHBOARD_WIDGET_IDS` too, so neither
 * can be re-added via "Customize dashboard" (the id is no longer valid) and
 * an existing saved layout naturally drops its now-meaningless entry for
 * either on its next reconciliation.
 */
const MOCKUP_WIDGETS: WidgetDefinition[] = [
	{
		id: 'overall-score',
		title: __('Vital Pulse', 'vulopilot'),
		desc: __('Your real sitewide health score, critical-issue count, and last scan time.', 'vulopilot'),
		icon: 'analytics',
		grid: 6,
		component: OverallScoreWidget,
	},
	{
		id: 'site-snapshot',
		title: __('Site snapshot', 'vulopilot'),
		desc: __('Real WordPress core counts — posts, pages, comments, users, and active plugins.', 'vulopilot'),
		icon: 'info',
		grid: 6,
		component: SiteSnapshotWidget,
	},
	{
		id: 'needs-attention',
		title: __('Needs your attention', 'vulopilot'),
		desc: __('Real open issues, quick fixes, and pending approvals that need action.', 'vulopilot'),
		icon: 'error',
		grid: 6,
		component: NeedsAttentionWidget,
	},
	{
		id: 'crawler-traffic',
		title: __('AI crawler traffic', 'vulopilot'),
		desc: __('A quick look at real AI crawler visits, with a link to the full report.', 'vulopilot'),
		icon: 'global-community',
		grid: 6,
		component: CrawlerTrafficWidget,
	},
	{
		id: 'recent-activity',
		title: __('Recent activity', 'vulopilot'),
		desc: __('A real feed of meaningful site events — scans, fixes, and changes.', 'vulopilot'),
		icon: 'clock',
		grid: 12,
		component: RecentActivityWidget,
	},
	
];

/**
 * No config-driven "one number" stat widgets left on the Dashboard — see
 * StatWidget.tsx for why these ever shared one component. Overall health,
 * SEO, Performance, Security, WooCommerce, Accessibility, and GEO used to
 * live here too, but they duplicated the exact same category_scores
 * numbers HealthPillarsWidget's ScoreRing/pillar tiles already show;
 * Quick fixes' plain count duplicated NeedsAttentionWidget's real "Quick
 * fixes" tab. Removed rather than kept alongside, same as the mockup this
 * dashboard is modeled on never showing a score two different ways.
 * Content/Brand moved the same way — they're now score cards inside
 * OverallScoreWidget's own card grid. AI usage moved off the Dashboard
 * entirely, then off the AI Copilot page too — the raw used/quota count
 * (`ai_jobs_used`/`ai_jobs_quota` on `GET /dashboard`) was replaced there by
 * RecommendedActionsCard (pages/AIAssistant/RecommendedActionsCard.tsx),
 * a more actionable real-findings summary.
 */

const STAT_WIDGET_CONFIGS: StatWidgetConfig[] = [];

const STAT_WIDGETS: WidgetDefinition[] = STAT_WIDGET_CONFIGS.map(
	(config) => ({
		id: config.id,
		title: config.title,
		icon: config.icon,
		grid: 4,
		component: createStatWidgetComponent(config),
	})
);

/**
 * Every widget the Dashboard can render, in the same order the widget
 * list was requested in. Passed through `vulopilot_dashboard_widgets`
 * (@wordpress/hooks — the same filter mechanism react-frontend.md
 * documents vulolabs using elsewhere) so a
 * Pro module or third-party plugin can append its own WidgetDefinition
 * without touching this file — the same "register a source, don't
 * modify the registry" pattern used by every PHP-side registry in this
 * plugin (ScannerRegistry, RuleRegistry, ActionRegistry).
 */

export const DEFAULT_DASHBOARD_WIDGETS: WidgetDefinition[] = applyFilters(
	'vulopilot_dashboard_widgets',
	// MOCKUP_WIDGETS leads (Vital Pulse through every pre-mockup widget it
	// carries forward, see its own docblock above), then STANDALONE_WIDGETS/
	// STAT_WIDGETS — this only affects the default layout a never-customized
	// install seeds; anyone who has already saved a layout keeps their own
	// order (DashboardLayout.php persists that separately from this array).
		[
			...MOCKUP_WIDGETS,
			...STAT_WIDGETS,
		]
	) as WidgetDefinition[];