import type { ComponentType } from 'react';
import { ContainerComponent } from '@zyra/components';
import RecentReportsCard from './RecentReportsCard';
import ScheduledReportsTable from './ScheduledReportsTable';
import ReportHistoryTable from './ReportHistoryTable';
import ReportsProPreview from './ReportsProPreview';
import { useFilterSlot } from '../../services/useFilterSlot';
import './Reports.scss';

interface OverviewTabProps {
	days: number;
	refreshKey: number;
}

/**
 * Reports → Overview. With Pro's reports module: the real Recent / Scheduled / History panels it registers. Without
 * it: one preview of what reports are, instead of three blurred copies of the same sample table.
 */
const OverviewTab = ({ days, refreshKey }: OverviewTabProps) => {
	const hasReports = !!useFilterSlot<ComponentType<unknown>>('vulopilot_recent_reports_panel');

	if (!hasReports) {
		return <ReportsProPreview />;
	}

	return (
		<ContainerComponent>
			<RecentReportsCard days={days} refreshSignal={refreshKey} />
			<ScheduledReportsTable refreshSignal={refreshKey} />
			<ReportHistoryTable refreshSignal={refreshKey} />
		</ContainerComponent>
	);
};

export default OverviewTab;
