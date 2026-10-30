/* global vulopilotAppLocalizer */
import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { CardComponent, ColumnComponent, NoticeComponent, PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import ShowProPopup from '../../components/Popup/Popup';
import { BlurredProContent } from '../../components/UpgradeToProOverlay';
import { useFilterSlot } from '../../services/useFilterSlot';
import './SeoVisibility.scss';

const KEYWORDS_MODULE_ID = 'keyword-rank-tracking';

const BENEFITS = [
	__('Verify this site with Google Search Console in a single click.', 'vulopilot'),
	__('See your real, already-verified Search Console property without leaving this tab.', 'vulopilot'),
	__('Real ranking positions, impressions, and clicks - synced from Search Console, tracked over time.', 'vulopilot'),
];

const KeywordsTab = () => {
	const RealPanel = useFilterSlot('vulopilot_keywords_panel');
	const isProInstalled = Boolean(vulopilotAppLocalizer.khali_dabba);
	// Once Pro is licensed, the only remaining reason `RealPanel` doesn't
	// resolve is the Keyword Rank Tracking module being off - the overlay/
	// popup both need to say that, not "Upgrade to Pro".
	const isModuleGate = isProInstalled;
	const [isPopupOpen, setIsPopupOpen] = useState(false);

	if (RealPanel) {
		return <RealPanel />;
	}

	return (
		<ColumnComponent>
			<CardComponent
				title={__('Ranking Keywords', 'vulopilot')}
				titleIcon="search"
				desc={__('Connect Google Search Console to see your real keyword rankings.', 'vulopilot')}
			>
				<BlurredProContent
					contentClassName="gsc-connect-hero"
					onClick={() => setIsPopupOpen(true)}
					icon={isModuleGate ? 'unlock' : undefined}
					title={
						isModuleGate
							? __('Enable Keyword Rank Tracking module', 'vulopilot')
							: undefined
					}
					desc={
						isModuleGate
							? __(
									'Turn the Keyword Rank Tracking module on from Settings → Modules to connect Google Search Console here.',
									'vulopilot'
								)
							: undefined
					}
					buttonText={
						isModuleGate ? __('Enable module', 'vulopilot') : undefined
					}
				>
					<ButtonInput
						buttons={{
							text: __('Connect Google Services', 'vulopilot'),
							icon: 'link',
							onClick: () => setIsPopupOpen(true),
						}}
					/>
					<div className="gsc-benefits-title">
						{__('Benefits of connecting your Google account', 'vulopilot')}
					</div>
					<ul className="gsc-benefits-list">
						{BENEFITS.map((benefit) => (
							<li key={benefit}>
								<i className="adminfont-check" /> {benefit}
							</li>
						))}
					</ul>
					<NoticeComponent
						displayPosition="inline"
						message={__(
							'We don’t store any of your Google account’s data on our servers - everything is processed and stored on your own site. Tokens are encrypted at rest the same way every other API key in VuloPilot is.',
							'vulopilot'
						)}
					/>
				</BlurredProContent>
			</CardComponent>
			<PopupComponent
				open={isPopupOpen}
				onClose={() => setIsPopupOpen(false)}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				{isModuleGate ? (
					<ShowProPopup moduleName={KEYWORDS_MODULE_ID} />
				) : (
					<ShowProPopup />
				)}
			</PopupComponent>
		</ColumnComponent>
	);
};

export default KeywordsTab;
