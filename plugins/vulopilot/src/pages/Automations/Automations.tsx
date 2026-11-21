import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { ColumnComponent, ContainerComponent, NavigatorHeaderComponent, PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import ShowProPopup from '../../components/Popup/Popup';
import { SectionHead } from '../../components/ui';
import { DOCS_URL } from '../../services/links';
import BuiltinAutomations from './BuiltinAutomations';
import AutomationsProPreview, { CUSTOM_AUTOMATIONS } from './AutomationsProPreview';
import './Automations.scss';

/**
 * Automations, free: the two automations every install has (a website scan and a visibility report), each fully
 * usable, then a short description of the custom automations VuloPilot Pro adds. With Pro, its own Automations page
 * replaces this one (Pro registers the `automations` route after free does) and shows the same two built-ins.
 */
const Automations = () => {
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);
	const openPro = () => setIsProPopupOpen(true);

	return (
		<>
			<NavigatorHeaderComponent
				headerIcon="automation"
				headerTitle={__('Automations', 'vulopilot')}
				headerDescription={__('Routine work VuloPilot runs for you on a schedule, so you never have to remember it.', 'vulopilot')}
				headerCustomContent={
					<ButtonInput
						buttons={{
							text: __('Create automation', 'vulopilot'),
							icon: 'pro-tag',
							color: 'purple',
							onClick: openPro,
						}}
					/>
				}
			/>

			<ContainerComponent general>
				<ColumnComponent>
					<div className="vp-page vp-automations">
						<SectionHead title={__('Included with VuloPilot', 'vulopilot')} />
						<BuiltinAutomations />

						<AutomationsProPreview onLearnMore={openPro} />

						<section className="vp-card vp-auto-learn">
							<div className="vp-card-body">
								<i className="adminfont-document" aria-hidden="true" />
								<span>
									<strong>{__('New to automations?', 'vulopilot')}</strong>
									{__('How schedules work, what the report contains, and how to change who receives it.', 'vulopilot')}
								</span>
								<a className="vp-card-link" href={DOCS_URL} target="_blank" rel="noopener noreferrer">
									{__('Read the guide', 'vulopilot')}
									<i className="adminfont-external" aria-hidden="true" />
								</a>
							</div>
						</section>
					</div>
				</ColumnComponent>
			</ContainerComponent>

			<PopupComponent open={isProPopupOpen} onClose={() => setIsProPopupOpen(false)} width={46} height="auto" position="lightbox">
				<ShowProPopup feature={CUSTOM_AUTOMATIONS} />
			</PopupComponent>
		</>
	);
};

export default Automations;
