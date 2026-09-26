/* global vulopilotAppLocalizer */
import { useState } from 'react';
import type { ComponentType } from 'react';
import { __ } from '@wordpress/i18n';
import { scrollToId } from '@zyra/core';
import { CardComponent, PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { BlurredProContent } from '../../components/UpgradeToProOverlay';
import DummyDataNotice from '../../components/DummyDataNotice';
import ShowProPopup from '../../components/Popup/Popup';
import ReportsDummyRows from './ReportsDummyRows';
import { useFilterSlot } from '../../services/useFilterSlot';

interface RecentReportsCardProps {
	days: number;
	refreshSignal?: number;
}

const RecentReportsCard = ({ days, refreshSignal }: RecentReportsCardProps) => {
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);
	const RealPanel = useFilterSlot<
		ComponentType<{ days: number; refreshSignal?: number }>
	>('vulopilot_recent_reports_panel');
	const isProInstalled = Boolean(vulopilotAppLocalizer.khali_dabba);

	return (
		<CardComponent
			title={__('Recent Reports', 'vulopilot')}
			titleIcon="document"
			desc={__('Your latest generated reports.', 'vulopilot')}
			action={
				<ButtonInput
					buttons={{
						text: __('View All Reports', 'vulopilot'),
						rightIcon: 'arrow-right',
						color: 'text-purple',
						onClick: () => scrollToId('reports-history'),
					}}
				/>
			}
		>
			{RealPanel ? (
				<RealPanel days={days} refreshSignal={refreshSignal} />
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

export default RecentReportsCard;
