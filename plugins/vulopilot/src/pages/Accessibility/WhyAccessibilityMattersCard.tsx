import { __ } from '@wordpress/i18n';
import { CardComponent, ListComponent } from '@zyra/components';
import './Accessibility.scss';

const WHY_IT_MATTERS_POINTS = [
	__('Helps more people use and trust your site', 'vulopilot'),
	__('Improves SEO and search visibility', 'vulopilot'),
	__('Better experience for all visitors', 'vulopilot'),
	__('Meets modern legal and industry expectations', 'vulopilot'),
];

const WhyAccessibilityMattersCard = () => (
	<CardComponent
		id="why-accessibility-matters-card"
		className="why-accessibility-matters-card"
		title={__('Why accessibility matters', 'vulopilot')}
		titleIcon="question"
		desc={__('More than a checkbox - it\'s good for everyone.', 'vulopilot')}
	>
		<ListComponent
			className="checklist"
			items={WHY_IT_MATTERS_POINTS.map((point) => ({
				id: point,
				icon: 'check zyra-green-color',
				title: point,
			}))}
		/>
	</CardComponent>
);

export default WhyAccessibilityMattersCard;
