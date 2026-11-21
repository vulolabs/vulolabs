/* global vulopilotAppLocalizer */
import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { ColumnComponent, ContainerComponent, NavigatorHeaderComponent } from '@zyra/components';
import RunScanHeaderExtra from '../../components/RunScanHeaderExtra';
import ProSample from '../../components/ProSample/ProSample';
import { Card, EmptyState } from '../../components/ui';
import { useFilterSlot } from '../../services/useFilterSlot';
import './Accessibility.scss';
import SectionedIssuesTable from '../Security/SectionedIssuesTable';
import type { SectionedIssuesTab } from '../Security/SectionedIssuesTable';
import PluginOverlapCard from '../Security/PluginOverlapCard';
import AccessibilityHeroCard from './AccessibilityHeroCard';
import AccessibilityManualTestingPanel from './AccessibilityManualTestingPanel';
import WhyAccessibilityMattersCard from './WhyAccessibilityMattersCard';
import { ACCESSIBILITY_CHECKS } from './accessibilityChecks';

/** DOM anchor id the merged issues table below carries. */
const ISSUES_TABLE_ID = 'accessibility-a11y-issues-table';

/** `ACCESSIBILITY_CHECKS` minus its synthetic `'all'` tile. */
const ISSUES_TABLE_SECTIONS = ACCESSIBILITY_CHECKS.filter(
	(check) => 'all' !== check.key
);

/** Sample 30-day scores for the Pro preview, written out - no data behind them. */
const SAMPLE_SCORES = [62, 63, 63, 66, 65, 68, 71, 70, 72, 74, 74, 76, 78, 79, 82];

/** The sample line, drawn on a 300 × 100 box (score 50 at the bottom, 100 at the top). */
const samplePath = (close: boolean): string => {
	const step = 300 / (SAMPLE_SCORES.length - 1);
	const points = SAMPLE_SCORES.map((score, index) => `${(index * step).toFixed(1)},${(100 - (score - 50) * 2).toFixed(1)}`);
	const line = `M${points.join(' L')}`;
	return close ? `${line} L300,100 L0,100 Z` : line;
};

/** Score history without Pro: a sample of the real chart, marked as such, that opens the Pro popup. */
const AccessibilityHistorySample = () => {
	// Pro is active but this module is off: point to the switch, nothing to sell.
	if (vulopilotAppLocalizer.khali_dabba) {
		return (
			<Card title={__('Score history', 'vulopilot')} icon="analytics">
				<EmptyState
					icon="module"
					title={__('Turn on Accessibility Checks', 'vulopilot')}
					text={__('Your daily score history appears here once the module is on.', 'vulopilot')}
					action={
						<a className="vp-a11y-btn" href="?page=vulopilot#&tab=settings&subtab=modules">
							{__('Open modules', 'vulopilot')}
						</a>
					}
				/>
			</Card>
		);
	}

	return (
		<Card
			className="vp-a11y-history"
			title={__('Score history', 'vulopilot')}
			icon="analytics"
			desc={__('See whether your fixes are moving the score.', 'vulopilot')}
		>
			<ProSample
				feature={{
					title: __('Accessibility score history', 'vulopilot'),
					description: __('Your accessibility score recorded every day, over 7, 30 and 90 days.', 'vulopilot'),
					icon: 'analytics',
				}}
				text={__('Your score every day, so you can see fixes pay off.', 'vulopilot')}
				cta={__('Unlock history', 'vulopilot')}
			>
				<div className="vp-a11y-trend">
					<div className="vp-a11y-trend-head">
						<strong>
							82<small>/100</small>
						</strong>
						<span className="vp-a11y-trend-delta">
							<i className="adminfont-arrow-up" aria-hidden="true" />
							{__('+20 in 30 days', 'vulopilot')}
						</span>
					</div>
					<svg viewBox="0 0 300 100" preserveAspectRatio="none" className="vp-a11y-trend-chart">
						<defs>
							<linearGradient id="vp-a11y-trend-fill" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0" stopColor="#079455" stopOpacity="0.18" />
								<stop offset="1" stopColor="#079455" stopOpacity="0" />
							</linearGradient>
						</defs>
						{[25, 50, 75].map((y) => (
							<line key={y} x1="0" x2="300" y1={y} y2={y} className="vp-a11y-trend-grid" />
						))}
						<path d={samplePath(true)} fill="url(#vp-a11y-trend-fill)" />
						<path d={samplePath(false)} className="vp-a11y-trend-line" />
					</svg>
					<div className="vp-a11y-trend-axis">
						<span>{__('30 days ago', 'vulopilot')}</span>
						<span>{__('Today', 'vulopilot')}</span>
					</div>
				</div>
			</ProSample>
		</Card>
	);
};

/** "Accessibility" top-level page. */
const Accessibility = () => {
	const [activeTab, setActiveTab] = useState<SectionedIssuesTab>('all');
	const AccessibilityHistoryPanel = useFilterSlot(
		'vulopilot_accessibility_history_panel'
	);
	const goToIssuesTable = (tab: SectionedIssuesTab) => {
		setActiveTab(tab);
		setTimeout(
			() =>
				document
					.getElementById(ISSUES_TABLE_ID)
					?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
			50
		);
	};

	return (
		<>
			<NavigatorHeaderComponent
				headerIcon="support"
				headerTitle={__('Accessibility', 'vulopilot')}
				headerDescription={__('Make sure everyone can use your website.', 'vulopilot')}
				headerCustomContent={
					<RunScanHeaderExtra
						categories={['accessibility']}
						label={__('Run accessibility audit', 'vulopilot')}
						settingsSubtab="modules"
					/>
				}
			/>
			<ContainerComponent general>
				<ColumnComponent fullHeight grid={8}>
					<AccessibilityHeroCard onReviewIssues={(tab) => goToIssuesTable(tab as SectionedIssuesTab)} />
				</ColumnComponent>

				<ColumnComponent fullHeight grid={4}>
					<PluginOverlapCard category="accessibility" />
					{AccessibilityHistoryPanel ? <AccessibilityHistoryPanel /> : <AccessibilityHistorySample />}
				</ColumnComponent>

				<ColumnComponent fullHeight grid={8}>
					<AccessibilityManualTestingPanel />
				</ColumnComponent>
				<ColumnComponent fullHeight grid={4}>
					<WhyAccessibilityMattersCard />
				</ColumnComponent>

				<ColumnComponent>
					<SectionedIssuesTable
						id={ISSUES_TABLE_ID}
						title={__('All Accessibility Findings', 'vulopilot')}
						sections={ISSUES_TABLE_SECTIONS}
						activeTab={activeTab}
						onTabChange={setActiveTab}
					/>
				</ColumnComponent>
			</ContainerComponent>
		</>
	);
};

export default Accessibility;
