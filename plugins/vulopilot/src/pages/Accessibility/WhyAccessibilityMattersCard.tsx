import { __ } from '@wordpress/i18n';
import { Card, IconTile } from '../../components/ui';
import type { Tone } from '../../components/ui';

const REASONS: { icon: string; tone: Tone; title: string; text: string }[] = [
	{
		icon: 'person',
		tone: 'violet',
		title: __('More people can use your site', 'vulopilot'),
		text: __('Around one in six people lives with a disability.', 'vulopilot'),
	},
	{
		icon: 'search-discovery',
		tone: 'blue',
		title: __('Better search and AI visibility', 'vulopilot'),
		text: __('Clear headings, labels and alt text help machines read your pages too.', 'vulopilot'),
	},
	{
		icon: 'security',
		tone: 'green',
		title: __('Meets legal expectations', 'vulopilot'),
		text: __('Laws such as the ADA and the European Accessibility Act point to WCAG.', 'vulopilot'),
	},
];

/** Why the checks above are worth fixing, in three lines. */
const WhyAccessibilityMattersCard = () => (
	<Card
		id="why-accessibility-matters-card"
		className="vp-a11y-why"
		title={__('Why it matters', 'vulopilot')}
		icon="question"
		desc={__('More than a checkbox - it is good for every visitor.', 'vulopilot')}
		link={{
			label: __('Learn more', 'vulopilot'),
			href: 'https://www.w3.org/WAI/fundamentals/accessibility-intro/',
		}}
	>
		<ul className="vp-a11y-why-list">
			{REASONS.map((reason) => (
				<li key={reason.title}>
					<IconTile icon={reason.icon} tone={reason.tone} size="sm" />
					<div>
						<strong>{reason.title}</strong>
						<span>{reason.text}</span>
					</div>
				</li>
			))}
		</ul>
	</Card>
);

export default WhyAccessibilityMattersCard;
