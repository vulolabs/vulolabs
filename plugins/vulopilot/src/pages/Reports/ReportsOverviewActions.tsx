import { __, sprintf } from '@wordpress/i18n';
import { PopupComponent } from '@zyra/components';
import { ButtonInput, SelectInput } from '@zyra/inputs';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { DAY_OPTIONS } from './reportsOverview';
import ShowProPopup from '../../components/Popup/Popup';
import { useFilterSlot } from '../../services/useFilterSlot';
import { REPORTS_FEATURE } from './ReportsProPreview';

interface ReportsOverviewActionsProps {
	days: number;
	// eslint-disable-next-line no-unused-vars
	onDaysChange: (days: number) => void;
	onDataChanged: () => void;
}

/** The Overview tab's own "Last N days" range + Create Report/Schedule Report/Download PDF action row. */
const ReportsOverviewActions = ({
	days,
	onDaysChange,
	onDataChanged,
}: ReportsOverviewActionsProps) => {
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);
	const RealActions = useFilterSlot<
		ComponentType<{ onDataChanged: () => void }>
	>('vulopilot_reports_header_actions');

	// Without Pro's reports module the range picks nothing and every button only opens the upgrade popup, so one
	// button stands in for them - the preview below the header explains the rest.
	if (!RealActions) {
		return (
			<>
				<div className="reports-overview-actions">
					<ButtonInput
						buttons={{
							text: __('Create report', 'vulopilot'),
							icon: 'lock',
							color: 'purple-bg',
							onClick: () => setIsProPopupOpen(true),
						}}
					/>
				</div>
				<PopupComponent
					open={isProPopupOpen}
					onClose={() => setIsProPopupOpen(false)}
					width={31.25}
					height="auto"
					position="lightbox"
				>
					<ShowProPopup feature={REPORTS_FEATURE} />
				</PopupComponent>
			</>
		);
	}

	return (
		<>
			<div className="reports-overview-actions">
				<SelectInput
					type="single-select"
					name="reports_days_range"
					value={String(days)}
					options={DAY_OPTIONS.map((option) => ({
						label: sprintf(
							/* translators: %d is the number of days. */
							__('Last %d days', 'vulopilot'),
							option
						),
						value: String(option),
					}))}
					onChange={(newValue) => onDaysChange(Number(newValue))}
					size="10rem"
				/>
				<RealActions onDataChanged={onDataChanged} />
			</div>
		</>
	);
};

export default ReportsOverviewActions;
