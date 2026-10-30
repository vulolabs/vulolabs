/* global vulopilotAppLocalizer */
import { useState } from 'react';
import type { ComponentType } from 'react';
import { __ } from '@wordpress/i18n';
import { addFilter } from '@wordpress/hooks';
import { ContainerComponent, NavigatorHeaderComponent, PopupComponent } from '@zyra/components';
import RunScanHeaderExtra from '../../components/RunScanHeaderExtra';
import ShowProPopup from '../../components/Popup/Popup';
import { useFilterSlot } from '../../services/useFilterSlot';
import CommerceIssuesTable from './CommerceIssuesTable';
import AiSalesAssistantCard from './AiSalesAssistantCard';
import AiSalesOptimizerCard from './AiSalesOptimizerCard';
import CommerceProDummies from './CommerceProDummies';
import BannerCard from '../../components/BannerCard';
import './Commerce.scss';

const COMMERCE_MODULE_ID = 'woo-commerce-analytics';

/**
 * Runs once, unconditionally, at this module's own top-level scope.
 */
addFilter(
	'vulopilot_commerce_issues_table',
	'vulopilot/commerce',
	() => CommerceIssuesTable
);

addFilter(
	'vulopilot_commerce_ai_sales_assistant',
	'vulopilot/commerce',
	() => AiSalesAssistantCard
);

addFilter(
	'vulopilot_commerce_ai_sales_optimizer',
	'vulopilot/commerce',
	() => AiSalesOptimizerCard
);

addFilter('vulopilot_banner_card', 'vulopilot/commerce', () => BannerCard);

/**
 * Was previously its own CommercePanel.tsx file, imported only here.
 */
const CommercePanel = ({
	RealPanel,
	onLockedClick,
	isModuleGate,
}: {
	RealPanel: ComponentType | null;
	onLockedClick: () => void;
	isModuleGate: boolean;
}) => {
	if (RealPanel) {
		return <RealPanel />;
	}

	return <CommerceProDummies onClick={onLockedClick} isModuleGate={isModuleGate} />;
};

const Commerce = () => {
	const RealPanel = useFilterSlot('vulopilot_commerce_panel');
	const isProInstalled = Boolean(vulopilotAppLocalizer.khali_dabba);
	// Once Pro itself is licensed, the only remaining reason `RealPanel`
	// doesn't resolve is the Commerce module being off - every dummy card's
	// own overlay and the popup both need to say that, not "Upgrade to Pro".
	const isModuleGate = isProInstalled;
	const [isPopupOpen, setIsPopupOpen] = useState(false);
	const isUnlocked = Boolean(RealPanel);

	return (
		<>
			<NavigatorHeaderComponent
				headerIcon="cart"
				headerTitle={__('Commerce', 'vulopilot')}
				headerDescription={__(
					'AI-powered WooCommerce intelligence to help you increase sales and grow revenue.',
					'vulopilot'
				)}
				headerCustomContent={
					isUnlocked ? (
						<RunScanHeaderExtra
							categories={['woocommerce']}
							settingsSubtab="woocommerce"
						/>
					) : (
						<RunScanHeaderExtra
							categories={['woocommerce']}
							settingsSubtab="woocommerce"
							hideSettingsButton
							hideRunScanButton
							replaceRunScanButton={{
								text: __('Run scan', 'vulopilot'),
								icon: 'search',
								onClick: () => setIsPopupOpen(true),
							}}
						/>
					)
				}
			/>
			<ContainerComponent general>
				<CommercePanel
					RealPanel={RealPanel}
					onLockedClick={() => setIsPopupOpen(true)}
					isModuleGate={isModuleGate}
				/>
			</ContainerComponent>
			<PopupComponent
				open={isPopupOpen}
				onClose={() => setIsPopupOpen(false)}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				{isModuleGate ? (
					<ShowProPopup moduleName={COMMERCE_MODULE_ID} />
				) : (
					<ShowProPopup />
				)}
			</PopupComponent>
		</>
	);
};

export default Commerce;
