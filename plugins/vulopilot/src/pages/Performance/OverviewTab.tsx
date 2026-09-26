import { useState } from 'react';
import { ColumnComponent, ContainerComponent } from '@zyra/components';
import { scrollToId } from '@zyra/core';
import type { SectionedIssuesTab } from '../Security/SectionedIssuesTable';
import PerformanceScoreCard from './PerformanceScoreCard';
import MetricsGrid from './MetricsGrid';
import QuickActionsCard from './QuickActionsCard';
import BiggestSpeedOpportunityCard from './BiggestSpeedOpportunityCard';
import PerformanceTab from './PerformanceTab';
import './Performance.scss';

/**
 * "Performance"'s only tab - see this folder's sibling files for the
 * per-section real-data mapping (PerformanceScoreCard, MetricsGrid,
 * SpeedHistoryCard, BiggestSpeedOpportunityCard - each documents its own
 * data source and, where the mockup shows something with no real backend,
 * its honest fallback). RealTimeMonitoringCard is rendered from inside
 * PerformanceScoreCard.tsx's own 1st-fold row, not imported here directly -
 * QuickActionsCard used to be as well, but now renders here instead, first
 * in the 2nd fold's right-hand column, ahead of BiggestSpeedOpportunityCard.
 * AiSpeedAssistantCard.tsx is unused - its one
 * call site below is commented out per direct instruction (a second CTA
 * for the exact same action BiggestSpeedOpportunityCard's own button
 * already covers); the file itself is left in place rather than deleted.
 *
 * Used to also have a "Speed Boost Available" card (SpeedBoostCard.tsx,
 * now deleted) paired 50/50 with SpeedHistoryCard right below MetricsGrid
 * - removed per direct instruction: it was a second CTA for the exact
 * same action AiSpeedAssistantCard.tsx's own "Optimize with AI"/"Review
 * First" pair already covers (same underlying open-finding count, same
 * honestly-disabled bulk-fix button). SpeedHistoryCard now renders alone,
 * full-width in this column, rather than re-pairing it with something
 * else.
 *
 * The full, unified category-'performance' issues table (PerformanceTab.tsx,
 * titled "Top Issues" - same sectioned-table shape "Protect My Site"'s
 * Security/Files & Plugins/Accessibility tabs use) lives here too, below the
 * condensed cards, wrapped in `#performance-section-findings` -
 * BiggestSpeedOpportunityCard's own "View Details" button (a finding-sourced
 * opportunity) scrolls to and highlights that id (same same-page
 * scroll-and-highlight pattern OpenIssuesGlimpse's own default behavior
 * uses elsewhere). PerformanceScoreCard's "View Slow Pages" button instead
 * jumps to the real "Slow Pages" tab (`onNavigateToSlowPages`, owned by
 * Performance.tsx) - a real per-page report now exists there, so scrolling
 * to the Top Issues findings table would undersell what that button
 * promises.
 *
 * `activeIssuesTab` (the Top Issues table's own section tab) is owned here,
 * not by PerformanceTab.tsx itself, so MetricsGrid.tsx's own per-tile
 * "View" buttons can jump straight to a specific section - same
 * "controlled activeTab passed down to a shared table" shape
 * AccessibilityTab.tsx already uses for AccessibilityChecksGrid's "Review"
 * buttons.
 *
 * The WordPress/server-side efficiency checks (`GET /efficiency-checks`,
 * Controllers\EfficiencyChecks.php) used to get their own card here
 * (EfficiencySummaryCard, then before that a 4-card spread - both now
 * deleted). Per direct instruction that whole section is gone: the same 3
 * checks (page caching/browser caching/persistent object cache) are now
 * just 3 more tiles in MetricsGrid.tsx's own grid above, each with a real
 * status badge sourced from that same endpoint - see this file's own
 * `SECTION_KEY_BY_TILE_ID` note in MetricsGrid.tsx. A tile's badge jumps
 * into the "Caching & Delivery" section of the Top Issues table below
 * (`onViewSection('caching-delivery')`), same real destination the
 * existing Caching/CDN tiles already use, rather than to a now-removed
 * dedicated card. `useEfficiencyChecks()` itself stays put in
 * `../Security/efficiencyChecks.ts` (shared hook, not moved) -
 * PhpAccelerationCard.tsx (OPcache status) moved here from "Protect My
 * Site" → Site Health per direct instruction and reads that same hook,
 * rendered full-card below rather than as a 4th MetricsGrid tile since it
 * also carries a real technical-details list a tile has no room for;
 * MetricsGrid.tsx calls the hook directly for its own 3 tiles.
 *
 * Doesn't repeat SpeedHistoryCard a second time (the old Performance tab
 * paired it with the now-deleted EfficiencyHeroCard/EfficiencyOverviewChart)
 * since this page already shows that same shared card once, paired with
 * SpeedBoostCard below - nor PluginOverlapCard `category="caching"` (the
 * old tab's own closing card), since PerformanceTab.tsx's own Top Issues
 * table, already rendered on this page, closes with that exact card.
 */
interface OverviewTabProps {
	onNavigateToSlowPages: () => void;
}

const OverviewTab = ({ onNavigateToSlowPages }: OverviewTabProps) => {
	const [activeIssuesTab, setActiveIssuesTab] =
		useState<SectionedIssuesTab>('all');

	const scrollToFindings = () => scrollToId('performance-section-findings');

	/** MetricsGrid's own scanner-backed tiles - switches the Top Issues table to that tile's section, then scrolls to it. */
	const goToIssuesSection = (sectionKey: string) => {
		setActiveIssuesTab(sectionKey);
		setTimeout(scrollToFindings, 50);
	};

	return (
		<ContainerComponent>
			{/* 1st fold */}
			<PerformanceScoreCard onViewDetails={onNavigateToSlowPages} />

			{/* 2nd fold */}
			<ColumnComponent grid={8}>
				<MetricsGrid
					onViewSection={goToIssuesSection}
					onViewCoreWebVitals={() =>
						scrollToId('performance-core-web-vitals-card')
					}
				/>
			</ColumnComponent>

			<ColumnComponent grid={4}>
				<QuickActionsCard />
				<BiggestSpeedOpportunityCard
					onViewSlowPages={onNavigateToSlowPages}
					onViewFindings={scrollToFindings}
				/>
			</ColumnComponent>

			<ColumnComponent >
				<div id="performance-section-findings">
					<PerformanceTab
						activeTab={activeIssuesTab}
						onTabChange={setActiveIssuesTab}
					/>
				</div>
			</ColumnComponent>
		</ContainerComponent>
	);
};

export default OverviewTab;
