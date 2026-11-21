import { __ } from '@wordpress/i18n';
import { PanelBody } from '@wordpress/components';
import PageAnalysisTab from './PageAnalysisTab';
import SocialTab from './SocialTab';
import SchemaTab from './SchemaTab';

interface OnPageTabProps {
	highlightTarget?: string;
	// eslint-disable-next-line no-unused-vars
	onNavigate?: ( tab: string, target?: string ) => void;
}

/** Groups the three on-page settings tabs. */
export default function OnPageTab( props: OnPageTabProps ) {
	return (
		<div className="vulopilot-seo-tab vulopilot-seo-tab--on-page">
			<PanelBody title={ __( 'Page Analysis', 'vulopilot' ) } initialOpen>
				<PageAnalysisTab { ...props } />
			</PanelBody>
			<PanelBody title={ __( 'Social', 'vulopilot' ) } initialOpen={ false }>
				<SocialTab { ...props } />
			</PanelBody>
			<PanelBody title={ __( 'Schema', 'vulopilot' ) } initialOpen={ false }>
				<SchemaTab { ...props } />
			</PanelBody>
		</div>
	);
}
