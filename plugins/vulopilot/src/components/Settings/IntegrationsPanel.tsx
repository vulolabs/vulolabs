import type { ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import { SectionComponent } from '@zyra/components';
import VuloCloudAiConnectionPanel from './VuloCloudAiConnectionPanel';
import GoogleServicesPanel from './GoogleServicesPanel';
import SiteVerificationPanel from './SiteVerificationPanel';
import PageSpeedStatusPanel from './PageSpeedStatusPanel';
import TagManagerPanel from './TagManagerPanel';

/** One `SectionComponent` (left) + arbitrary content (right) row. */
const SectionRow = ({
	icon,
	title,
	desc,
	children,
}: {
	icon: string;
	title: string;
	desc: string;
	children: ReactNode;
}) => (
	<div className="settings-section-group">
		<div className="settings-left-section">
			<SectionComponent icon={icon} title={title} desc={desc} />
		</div>
		<div className="settings-right-section">{children}</div>
	</div>
);

/** Settings → Get Started → Connections. */
const IntegrationsPanel = () => {
	return (
		<>
			<SectionRow
				icon="ai"
				title={__('VuloCloud AI', 'vulopilot')}
				desc={__(
					'Connect this site to VuloCloud to enable AI features across VuloPilot.',
					'vulopilot'
				)}
			>
				<VuloCloudAiConnectionPanel />
			</SectionRow>
			<SectionRow
				icon="google"
				title={__('Google Services', 'vulopilot')}
				desc={__(
					'Connect your Google account to allow VuloPilot to fetch real data from Google services.',
					'vulopilot'
				)}
			>
				<GoogleServicesPanel />
			</SectionRow>
			<SectionRow
				icon="shortcode"
				title={__('Tag Manager', 'vulopilot')}
				desc={__(
					'Add your Google Tag Manager container and VuloPilot loads it on every page - Google Analytics and your other tags included.',
					'vulopilot'
				)}
			>
				<TagManagerPanel />
			</SectionRow>
			<SectionRow
				icon="web-page-website"
				title={__('PageSpeed Insights', 'vulopilot')}
				desc={__(
					'Get real-performance data and optimization insights directly from Google PageSpeed Insights.',
					'vulopilot'
				)}
			>
				<PageSpeedStatusPanel />
			</SectionRow>
			<SectionRow
				icon="check"
				title={__('Webmaster Tools', 'vulopilot')}
				desc={__(
					'Enter verification codes for third-party webmaster tools. Each one is rendered as its own <meta> tag on every page.',
					'vulopilot'
				)}
			>
				<SiteVerificationPanel />
			</SectionRow>
		</>
	);
};

export default IntegrationsPanel;
