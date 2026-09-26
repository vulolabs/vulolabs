/* global vulopilotAppLocalizer */
import { useState } from 'react';
import type { ComponentType } from 'react';
import { __ } from '@wordpress/i18n';
import { CardComponent, PopupComponent } from '@zyra/components';
import { BlurredProContent } from '../../components/UpgradeToProOverlay';
import DummyDataNotice from '../../components/DummyDataNotice';
import ShowProPopup from '../../components/Popup/Popup';
import ReportsDummyRows from './ReportsDummyRows';
import { useFilterSlot } from '../../services/useFilterSlot';

interface ReportHistoryTableProps {
	refreshSignal?: number;
}

const ReportHistoryTable = ({ refreshSignal }: ReportHistoryTableProps) => {
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);
	const RealPanel = useFilterSlot<
		ComponentType<{ refreshSignal?: number }>
	>('vulopilot_report_history_panel');
	const isProInstalled = Boolean(vulopilotAppLocalizer.khali_dabba);

	return (
		<CardComponent
			id="reports-history"
			title={__('Report History', 'vulopilot')}
			titleIcon="clock"
			desc={__('A complete log of all generated reports.', 'vulopilot')}
		>
			{RealPanel ? (
				<RealPanel refreshSignal={refreshSignal} />
			) : (
				<>
					<BlurredProContent
						contentClassName="reports-dummy-content"
						onClick={() => setIsProPopupOpen(true)}
					>
						<ReportsDummyRows />
					</BlurredProContent>
					<DummyDataNotice />
					<PopupComponent
						open={isProPopupOpen}
						onClose={() => setIsProPopupOpen(false)}
						width={31.25}
						height="auto"
						position="lightbox"
					>
						{isProInstalled ? (
							<ShowProPopup />
						) : (
							<ShowProPopup />
						)}
					</PopupComponent>
				</>
			)}
		</CardComponent>
	);
};

export default ReportHistoryTable;
