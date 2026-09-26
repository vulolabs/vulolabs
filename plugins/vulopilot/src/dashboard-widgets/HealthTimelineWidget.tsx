/* global vulopilotAppLocalizer */
import React from 'react';
import { __ } from '@wordpress/i18n';
import { ChartComponent, ModuleGuardComponent } from '@zyra/components';
import DashboardWidget from './DashboardWidget';
import ProLockedCard from '../components/ProLockedCard';
import { useApiList } from '../services/useApiList';
import { formatWpDate } from '../services/formatWpDate';
import { WidgetProps } from './types';

interface HealthSnapshot {
	snapshot_date: string;
	overall_score: number;
}

/**
 * The health-score trend chart, unchanged in content from what
 * Dashboard.tsx originally rendered inline - moved here so it's a widget
 * like the other twelve (reorderable, hideable) instead of a fixed
 * element outside the grid. Fetches its own data (`/site-health-snapshots`)
 * rather than reading it off the shared summary payload, since it's a
 * list of up to 30 rows, not a single number the summary aggregate is
 * meant for (see Controllers/Dashboard.php's docblock on why list-shaped
 * widgets call their own endpoint).
 */
const HealthTimelineWidget: React.FC<WidgetProps> = ({
	onHide,
	isCustomizing,
}) => {
	const {
		data: snapshots,
		isLoading,
	} = useApiList<HealthSnapshot>('site-health-snapshots', { days: 30 });

	const isModuleActive = Boolean(vulopilotAppLocalizer.khali_dabba);

	return (
		<DashboardWidget
			title={__('Health timeline', 'vulopilot')}
			desc={__('How your health scores have trended over time.', 'vulopilot')}
			icon="analytics"
			isLoading={isLoading}
			onHide={onHide}
			isCustomizing={isCustomizing}
		>
			{!isModuleActive ? (
				<ProLockedCard />
			) : snapshots.length === 0 ? (
				<ModuleGuardComponent
					icon="analytics"
					title={__('No trend data yet', 'vulopilot')}
					desc={__(
						'Run your first scan to start building a health score history.',
						'vulopilot'
					)}
				/>
			) : (
				<ChartComponent
					type="dynamic-line"
					data={snapshots.map((snapshot) => ({
						...snapshot,
						snapshot_date: formatWpDate(snapshot.snapshot_date),
					}))}
					dataKey="overall_score"
					xKey="snapshot_date"
					height={300}
					yDomain={[0, 100]}
				/>
			)}
		</DashboardWidget>
	);
};

export default HealthTimelineWidget;
