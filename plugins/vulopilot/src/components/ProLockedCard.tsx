/* global vulopilotAppLocalizer */
import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import ShowProPopup from './Popup/Popup';

interface ProLockedCardProps {
	moduleName?: string;
	buttonText?: string;
}

const ProLockedCard = ({ moduleName, buttonText }: ProLockedCardProps) => {
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);

	return (
		<>
			<ButtonInput
				buttons={{
					text: buttonText || __('Unlock with Pro', 'vulopilot'),
					icon: 'lock',
					onClick: () => setIsProPopupOpen(true),
				}}
			/>
			<PopupComponent
				open={isProPopupOpen}
				onClose={() => setIsProPopupOpen(false)}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				{vulopilotAppLocalizer.khali_dabba && moduleName ? (
					<ShowProPopup moduleName={moduleName} />
				) : (
					<ShowProPopup />
				)}
			</PopupComponent>
		</>
	);
};

export default ProLockedCard;
