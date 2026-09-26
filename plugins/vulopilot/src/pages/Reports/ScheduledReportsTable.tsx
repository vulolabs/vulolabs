import { useState } from 'react';
import type { ComponentType } from 'react';
import { __ } from '@wordpress/i18n';
import { BadgeComponent, CardComponent, PopupComponent } from '@zyra/components';
import ShowProPopup from '../../components/Popup/Popup';
import { BlurredProContent } from '../../components/UpgradeToProOverlay';
import DummyDataNotice from '../../components/DummyDataNotice';
import { useFilterSlot } from '../../services/useFilterSlot';

/**
 * Fabricated preview rows - same "obviously fake" reasoning
 * reportsOverview.ts's own `DUMMY_REPORT_ROWS` documents, shaped for this
 * table's own columns (frequency/recipients) rather than a report row's.
 */
const DUMMY_SCHEDULE_ROWS = [
	{
		id: 'dummy-1',
		name: __('Full Website Report', 'vulopilot'),
		shortLabel: __('Full Website', 'vulopilot'),
		badgeColor: 'indigo',
		icon: 'global-community',
		frequency: __('Weekly', 'vulopilot'),
		recipients: __('team@example.com', 'vulopilot'),
	},
	{
		id: 'dummy-2',
		name: __('SEO Report', 'vulopilot'),
		shortLabel: __('SEO', 'vulopilot'),
		badgeColor: 'pink',
		icon: 'search-discovery',
		frequency: __('Monthly', 'vulopilot'),
		recipients: __('client@example.com', 'vulopilot'),
	},
];

interface ScheduledReportsTableProps {
	refreshSignal?: number;
}

const ScheduledReportsTable = ({ refreshSignal }: ScheduledReportsTableProps) => {
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);
	const RealPanel = useFilterSlot<
		ComponentType<{ refreshSignal?: number }>
	>('vulopilot_scheduled_reports_panel');

	return (
		<CardComponent
			id="reports-schedules"
			className="reports-schedules-card"
			title={__('Scheduled Reports', 'vulopilot')}
			titleIcon="calendar"
			desc={__(
				'Automate report generation and delivery to keep your team and clients updated.',
				'vulopilot'
			)}
		>
			{RealPanel ? (
				<RealPanel refreshSignal={refreshSignal} />
			) : (
				<>
					<BlurredProContent
						contentClassName="reports-dummy-content"
						onClick={() => setIsProPopupOpen(true)}
					>
						<div className="reports-dummy-rows">
							{DUMMY_SCHEDULE_ROWS.map((row) => (
								<div className="reports-dummy-row" key={row.id}>
									<i className={`adminfont-${row.icon} reports-dummy-row-icon`} />
									<div className="reports-dummy-row-main">
										<span className="reports-dummy-row-name">{row.name}</span>
										<span className="reports-dummy-row-period">{row.recipients}</span>
									</div>
									<BadgeComponent color={row.badgeColor} text={row.shortLabel} />
									<span>{row.frequency}</span>
									<BadgeComponent color="green" text={__('Enabled', 'vulopilot')} />
									<span className="reports-dummy-row-actions">
										{__('Send Now', 'vulopilot')} · {__('Edit', 'vulopilot')}
									</span>
								</div>
							))}
						</div>
					</BlurredProContent>
					<DummyDataNotice />
					<PopupComponent
						position="lightbox"
						open={isProPopupOpen}
						onClose={() => setIsProPopupOpen(false)}
						width={31.25}
						height="auto"
					>
						<ShowProPopup />
					</PopupComponent>
				</>
			)}
		</CardComponent>
	);
};

export default ScheduledReportsTable;
