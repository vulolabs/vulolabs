import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import { PopupComponent } from '@zyra/components';
import ShowProPopup from '../Popup/Popup';
import type { ProFeature } from '../Popup/Popup';
import './ProSample.scss';

interface ProSampleProps {
	/** What the section shows with Pro: made-up content in the real section's shape. */
	children: ReactNode;
	/** The feature this section is; the Pro popup lists it first. */
	feature: ProFeature;
	/** One line beside the Pro tag. */
	text: string;
	/** The button, e.g. "Unlock daily trends". */
	cta: string;
}

/**
 * A Pro-only section on the free plugin, the way VuloCart shows one (vulocart/src/components/Popup/ProSample.tsx): the
 * section's sample content, faded and marked "Sample data", then a strip with the Pro tag, one line and one button.
 * The content and the button both open the Pro popup, which lists this feature first. Free ships no code for the
 * feature itself - only this picture of it - so nothing in the free plugin is locked.
 */
const ProSample = ({ children, feature, text, cta }: ProSampleProps) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div className="vp-sample">
			<div
				className="vp-sample-preview"
				role="button"
				tabIndex={0}
				aria-label={`${feature.title}: ${__('see what VuloPilot Pro adds', 'vulopilot')}`}
				onClick={() => setIsOpen(true)}
				onKeyDown={(event) => {
					if ('Enter' === event.key || ' ' === event.key) {
						event.preventDefault();
						setIsOpen(true);
					}
				}}
			>
				<div className="vp-sample-content" aria-hidden="true">
					{children}
				</div>
				<span className="vp-sample-label">{__('Sample data', 'vulopilot')}</span>
			</div>

			<div className="vp-sample-bar">
				<span className="vp-sample-tag">
					<i className="adminfont-pro-tag" aria-hidden="true" />
					{__('Pro', 'vulopilot')}
				</span>
				<p>{text}</p>
				<button type="button" className="vp-sample-cta" onClick={() => setIsOpen(true)}>
					{cta}
				</button>
			</div>

			{isOpen && (
				<PopupComponent position="lightbox" open onClose={() => setIsOpen(false)} width={46} height="auto">
					<ShowProPopup feature={feature} />
				</PopupComponent>
			)}
		</div>
	);
};

export default ProSample;
