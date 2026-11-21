/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, scrollToId } from '@zyra/core';
import { ColumnComponent, ContainerComponent } from '@zyra/components';
import AreaHero, { urgentCount } from '../../components/AreaHero';
import type { HeroArea } from '../../components/AreaHero';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import IssuesList from '../AIAssistant/IssuesList';
import PluginOverlapCard from '../Security/PluginOverlapCard';
import SpeedTrendCard from './SpeedTrendCard';
import QuickActionsCard from './QuickActionsCard';
import ServerSetupCard from './ServerSetupCard';
import { useEfficiencyChecks } from '../Security/efficiencyChecks';
import '../AIAssistant/copilot.scss';
import './Performance.scss';

/** Performance's areas: what the hero rates and what the issue list's tabs filter by (the performance scanners). */
const AREAS: HeroArea[] = [
	{ id: 'server-response', label: __('Server response', 'vulopilot'), icon: 'speed', scannerIds: ['performance', 'slow-pages'] },
	{ id: 'caching-delivery', label: __('Caching & CDN', 'vulopilot'), icon: 'refresh-bold', scannerIds: ['cache-detection', 'cdn'] },
	{ id: 'code-optimization', label: __('CSS & JavaScript', 'vulopilot'), icon: 'coding', scannerIds: ['css-optimization', 'javascript-optimization'] },
	{ id: 'images-media', label: __('Images', 'vulopilot'), icon: 'image', scannerIds: ['large-images'] },
	{ id: 'loading-fonts', label: __('Loading & fonts', 'vulopilot'), icon: 'text-fields', scannerIds: ['lazy-loading', 'fonts'] },
	{ id: 'plugins-database', label: __('Plugins & database', 'vulopilot'), icon: 'database', scannerIds: ['heavy-plugins', 'database-cleanup'] },
];

const SCANNER_IDS = AREAS.flatMap((area) => area.scannerIds);

const ISSUES_ID = 'performance-section-findings';

interface DashboardSummary {
	category_scores?: { performance?: number };
	psi_speed_scores?: { mobile: number | null; desktop: number | null };
}

interface OverviewTabProps {
	onNavigateToSlowPages: () => void;
}

/**
 * Performance overview, in the order a site owner asks: how fast is it (score and areas); how the server is set up
 * and whether it is getting better, beside what to do (every fix, the ones this site needs first); then what exactly
 * is wrong (issues by area).
 */
const OverviewTab = ({ onNavigateToSlowPages }: OverviewTabProps) => {
	const [summary, setSummary] = useState<DashboardSummary | null>(null);
	const [groups, setGroups] = useState<FindingGroup[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [refetchSignal, setRefetchSignal] = useState(0);
	const [area, setArea] = useState('all');
	const { data: efficiency, isLoading: isLoadingEfficiency } = useEfficiencyChecks();

	useEffect(() => {
		let cancelled = false;
		const headers = { headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } };

		Promise.all([
			getApiResponse<DashboardSummary>(getApiLink(vulopilotAppLocalizer, 'dashboard'), headers),
			getApiResponse<{ data?: FindingGroup[] }>(
				`${getApiLink(vulopilotAppLocalizer, 'findings/groups')}?per_page=200&scanner_id=${SCANNER_IDS.join(',')}`,
				headers
			),
		])
			.then(([dashboard, found]) => {
				if (!cancelled) {
					setSummary(dashboard ?? null);
					setGroups(found?.data ?? []);
				}
			})
			.finally(() => !cancelled && setIsLoading(false));

		return () => {
			cancelled = true;
		};
	}, [refetchSignal]);

	const review = (next: string) => {
		setArea(next);
		scrollToId(ISSUES_ID);
	};

	const psi = summary?.psi_speed_scores;
	const hasPsi = 'number' === typeof psi?.mobile && 'number' === typeof psi?.desktop;
	// Google's mobile/desktop average when PageSpeed Insights is connected, else the score from open findings.
	const score = hasPsi
		? Math.round(((psi?.mobile as number) + (psi?.desktop as number)) / 2)
		: (summary?.category_scores?.performance ?? null);
	const urgent = urgentCount(groups);
	const clear = AREAS.filter((item) => !groups.some((group) => item.scannerIds.includes(group.scanner_id))).length;

	let note: { tone: 'up' | 'down' | 'flat'; text: ReactNode };

	if (hasPsi) {
		const gap = (psi?.desktop as number) - (psi?.mobile as number);

		note =
			gap >= 10
				? {
						tone: 'down',
						text: sprintf(
							/* translators: %d: points. */
							__('Mobile is %d points slower than desktop - most visitors are on mobile.', 'vulopilot'),
							gap
						),
				  }
				: { tone: 'up', text: __('Mobile and desktop are similarly fast.', 'vulopilot') };
	} else {
		note = {
			tone: 'flat',
			text: (
				<>
					{__('Scored from your open speed issues.', 'vulopilot')}{' '}
					<a href="#&tab=settings&subtab=integrations">{__('Connect PageSpeed Insights', 'vulopilot')}</a>{' '}
					{__("for Google's mobile and desktop scores.", 'vulopilot')}
				</>
			),
		};
	}

	const facts = [
		<>
			<strong>
				{clear}/{AREAS.length}
			</strong>{' '}
			{__('areas clear', 'vulopilot')}
		</>,
		<>
			<strong>{urgent}</strong> {__('critical or high', 'vulopilot')}
		</>,
		<button type="button" className="vp-link-btn" onClick={onNavigateToSlowPages}>
			{__('Check page by page', 'vulopilot')} →
		</button>,
	];

	if (hasPsi) {
		facts.unshift(
			<>
				{__('Mobile', 'vulopilot')} <strong>{psi?.mobile}</strong> · {__('Desktop', 'vulopilot')} <strong>{psi?.desktop}</strong>
			</>
		);
	}

	return (
		<ContainerComponent>
			<ColumnComponent>
				<div className="vp-page vp-performance">
					<AreaHero
						label={__('Speed', 'vulopilot')}
						score={score}
						groups={groups}
						areas={AREAS}
						areasTitle={__('Speed by area', 'vulopilot')}
						isLoading={isLoading}
						headline={
							0 === groups.length
								? __('Your site is fast. Nothing is slowing it down.', 'vulopilot')
								: urgent > 0
								? sprintf(
										/* translators: %d: number of open speed issues. */
										_n('%d thing is slowing your site down.', '%d things are slowing your site down.', groups.length, 'vulopilot'),
										groups.length
								  )
								: sprintf(
										/* translators: %d: number of small open speed issues. */
										_n('Fast already - %d small fix could make it faster.', 'Fast already - %d small fixes could make it faster.', groups.length, 'vulopilot'),
										groups.length
								  )
						}
						note={note}
						facts={facts}
						onReview={review}
						reviewLabel={__('See what to fix', 'vulopilot')}
					/>

					{/* 2. How the server is set up and whether speed is improving, beside what to do about it. */}
					<div className="vp-row vp-perf-split">
						<div className="vp-rail">
							<ServerSetupCard data={efficiency} isLoading={isLoadingEfficiency} />
							<SpeedTrendCard />
						</div>
						<QuickActionsCard groups={groups} efficiency={efficiency} />
					</div>

					{/* 3. What exactly is wrong. */}
					<IssuesList
						id={ISSUES_ID}
						title={__('Speed issues', 'vulopilot')}
						description={__('Worst first. Pick one to see what it means and how to fix it.', 'vulopilot')}
						scope={{
							areas: AREAS,
							groups,
							isLoading,
							onChanged: () => setRefetchSignal((n) => n + 1),
							area,
							onAreaChange: setArea,
						}}
					/>

					<PluginOverlapCard category="caching" />
				</div>
			</ColumnComponent>
		</ContainerComponent>
	);
};

export default OverviewTab;
