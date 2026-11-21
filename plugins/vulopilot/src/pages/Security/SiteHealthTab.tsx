/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, scrollToId } from '@zyra/core';
import { ColumnComponent, ContainerComponent } from '@zyra/components';
import AreaHero, { urgentCount } from '../../components/AreaHero';
import type { HeroArea } from '../../components/AreaHero';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import IssuesList from '../AIAssistant/IssuesList';
import BackupProtectionNotice from './BackupProtectionNotice';
import '../AIAssistant/copilot.scss';

/** Site Health's areas: what the hero rates and what the issue list's tabs filter by. */
const AREAS: HeroArea[] = [
	{ id: 'wordpress', label: __('WordPress core', 'vulopilot'), icon: 'wordpress', scannerIds: ['wordpress-health'] },
	{ id: 'updates', label: __('Updates', 'vulopilot'), icon: 'refresh', scannerIds: ['updates'] },
	{ id: 'background-tasks', label: __('Scheduled tasks', 'vulopilot'), icon: 'clock', scannerIds: ['cron'] },
	{ id: 'database', label: __('Database', 'vulopilot'), icon: 'database', scannerIds: ['database'] },
	{ id: 'server', label: __('Server & PHP', 'vulopilot'), icon: 'coding', scannerIds: ['server-health', 'php-warnings'] },
];

const SCANNER_IDS = AREAS.flatMap((area) => area.scannerIds);

const ISSUES_ID = 'site-health-issues';

/** The same weighted-severity score the other findings pages use, from what is open. */
const scoreOf = (groups: FindingGroup[]): number => {
	const sum = (severities: string[]) =>
		groups.filter((group) => severities.includes(group.severity)).reduce((total, group) => total + group.count, 0);

	return Math.max(0, Math.min(100, 100 - sum(['critical', 'high']) * 8 - sum(['medium']) * 3 - sum(['low', 'info'])));
};

interface SiteHealthTabProps {
	/** Switches SiteHealth.tsx's own `backups` tab in place. */
	onNavigateToBackups: () => void;
}

/**
 * Site Health: backup protection first, then the health score with every area, then the open issues by area with
 * what to do about each (AI Copilot's issue list).
 */
const SiteHealthTab = ({ onNavigateToBackups }: SiteHealthTabProps) => {
	const [groups, setGroups] = useState<FindingGroup[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [refetchSignal, setRefetchSignal] = useState(0);
	const [area, setArea] = useState('all');

	useEffect(() => {
		let cancelled = false;

		getApiResponse<{ data?: FindingGroup[] }>(
			`${getApiLink(vulopilotAppLocalizer, 'findings/groups')}?per_page=200&scanner_id=${SCANNER_IDS.join(',')}`,
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => !cancelled && setGroups(response?.data ?? []))
			.finally(() => !cancelled && setIsLoading(false));

		return () => {
			cancelled = true;
		};
	}, [refetchSignal]);

	const review = (next: string) => {
		setArea(next);
		scrollToId(ISSUES_ID);
	};

	const urgent = urgentCount(groups);
	const clear = AREAS.filter((item) => !groups.some((group) => item.scannerIds.includes(group.scanner_id))).length;
	const updates = groups.filter((group) => 'updates' === group.scanner_id).reduce((total, group) => total + group.count, 0);

	let note: { tone: 'up' | 'down' | 'flat'; text: string } = {
		tone: 'up',
		text: __('WordPress, your server and the database all passed the last check.', 'vulopilot'),
	};

	if (groups.length > 0) {
		note =
			urgent > 0
				? {
						tone: 'down',
						text: sprintf(
							/* translators: %d: number of critical or high issues. */
							_n('%d needs your attention first.', '%d need your attention first.', urgent, 'vulopilot'),
							urgent
						),
				  }
				: { tone: 'flat', text: __('Nothing urgent. These keep your site running smoothly.', 'vulopilot') };
	}

	return (
		<ContainerComponent>
			<ColumnComponent>
				<div className="vp-page vp-site-health">
					<BackupProtectionNotice onNavigateToBackups={onNavigateToBackups} />
	
					<AreaHero
						label={__('Site health', 'vulopilot')}
						score={isLoading ? null : scoreOf(groups)}
						groups={groups}
						areas={AREAS}
						areasTitle={__('Health by area', 'vulopilot')}
						isLoading={isLoading}
						headline={
							groups.length > 0
								? sprintf(
										/* translators: %d: number of open site health issues. */
										_n('%d health issue is open.', '%d health issues are open.', groups.length, 'vulopilot'),
										groups.length
								  )
								: __('Your site is in good health.', 'vulopilot')
						}
						note={note}
						facts={[
							<>
								<strong>
									{clear}/{AREAS.length}
								</strong>{' '}
								{__('areas clear', 'vulopilot')}
							</>,
							<>
								<strong>{updates}</strong> {_n('update waiting', 'updates waiting', updates, 'vulopilot')}
							</>,
						]}
						onReview={review}
					/>
	
					<IssuesList
						id={ISSUES_ID}
						title={__('Health issues', 'vulopilot')}
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
				</div>
			</ColumnComponent>
		</ContainerComponent>
	);
};

export default SiteHealthTab;
