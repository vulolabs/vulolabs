/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse, scrollToId } from '@zyra/core';
import { ColumnComponent, ContainerComponent, NavigatorHeaderComponent } from '@zyra/components';
import RunScanHeaderExtra from '../../components/RunScanHeaderExtra';
import { useFilterSlot } from '../../services/useFilterSlot';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import IssuesList from '../AIAssistant/IssuesList';
import PluginOverlapCard from './PluginOverlapCard';
import SecurityHero from './SecurityHero';
import SecurityTrendCard from './SecurityTrendCard';
import RecentActivityCard from './RecentActivityCard';
import IncidentReportsSample from './IncidentReportsSample';
import { SECURITY_AREAS, SECURITY_SCANNER_IDS } from './securityAreas';
import '../../dashboard-widgets/dashboard.scss';
import '../AIAssistant/copilot.scss';
import './security.scss';

const ISSUES_ID = 'security-issues';

const nonce = () => ({ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } });

/**
 * Security, free: the security score and every protection area, the open issues by area with what to do about each,
 * the score over time and the latest security events. Incident reports are VuloPilot Pro's (modules/WebsiteSecurity,
 * through `vulopilot_security_incident_reports_panel`); free shows a sample in their place.
 */
const Security = () => {
	const [score, setScore] = useState<number | null>(null);
	const [groups, setGroups] = useState<FindingGroup[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [refetchSignal, setRefetchSignal] = useState(0);
	const [area, setArea] = useState('all');
	const IncidentReports = useFilterSlot('vulopilot_security_incident_reports_panel');

	useEffect(() => {
		let cancelled = false;

		Promise.all([
			getApiResponse<{ category_scores?: { security?: number } }>(getApiLink(vulopilotAppLocalizer, 'dashboard'), nonce()),
			getApiResponse<{ data?: FindingGroup[] }>(
				`${getApiLink(vulopilotAppLocalizer, 'findings/groups')}?per_page=200&scanner_id=${SECURITY_SCANNER_IDS.join(',')}`,
				nonce()
			),
		])
			.then(([summary, found]) => {
				if (cancelled) {
					return;
				}

				setScore(summary?.category_scores?.security ?? null);
				setGroups(found?.data ?? []);
			})
			.finally(() => !cancelled && setIsLoading(false));

		return () => {
			cancelled = true;
		};
	}, [refetchSignal]);

	const refetch = () => setRefetchSignal((n) => n + 1);

	const review = (next: string) => {
		setArea(next);
		scrollToId(ISSUES_ID);
	};

	return (
		<>
			<NavigatorHeaderComponent
				headerIcon="security"
				headerTitle={__('Security', 'vulopilot')}
				headerDescription={__('Checks your logins, plugins, files and certificate for weak spots, and tells you what to fix first.', 'vulopilot')}
				headerCustomContent={
					<RunScanHeaderExtra
						categories={['security']}
						label={__('Run security scan', 'vulopilot')}
						settingsSubtab="security-scanning"
						onSuccess={refetch}
					/>
				}
			/>

			<ContainerComponent general>
				<ColumnComponent>
					<div className="vp-page vp-security">
						<SecurityHero score={score} groups={groups} isLoading={isLoading} onReview={review} />

						<IssuesList
							id={ISSUES_ID}
							title={__('Security issues', 'vulopilot')}
							description={__('Worst first. Pick one to see what it means and how to fix it.', 'vulopilot')}
							scope={{
								areas: SECURITY_AREAS,
								groups,
								isLoading,
								onChanged: refetch,
								area,
								onAreaChange: setArea,
							}}
						/>

						<div className="vp-row is-wide-left">
							<SecurityTrendCard key={`trend-${refetchSignal}`} />
							<RecentActivityCard key={`activity-${refetchSignal}`} />
						</div>

						{IncidentReports ? <IncidentReports /> : <IncidentReportsSample />}

						<PluginOverlapCard category="security" />
					</div>
				</ColumnComponent>
			</ContainerComponent>
		</>
	);
};

export default Security;
