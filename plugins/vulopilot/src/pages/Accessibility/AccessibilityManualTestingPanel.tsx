import { __ } from '@wordpress/i18n';
import { Card, IconTile } from '../../components/ui';
import type { Tone } from '../../components/ui';

interface ManualCheck {
	key: string;
	icon: string;
	tone: Tone;
	title: string;
	question: string;
	/** One concrete way to try it, in a minute or two. */
	howTo: string;
}

const MANUAL_CHECKS: ManualCheck[] = [
	{
		key: 'keyboard-navigation',
		icon: 'coding',
		tone: 'blue',
		title: __('Keyboard navigation', 'vulopilot'),
		question: __('Can you reach and use everything without a mouse?', 'vulopilot'),
		howTo: __('Press Tab through a page: every link and button should get a visible outline, in a sensible order.', 'vulopilot'),
	},
	{
		key: 'screen-reader',
		icon: 'person',
		tone: 'violet',
		title: __('Screen-reader experience', 'vulopilot'),
		question: __('Does the content make sense when read aloud?', 'vulopilot'),
		howTo: __('Turn on VoiceOver (Mac) or NVDA (Windows) and listen to your home page and a form.', 'vulopilot'),
	},
	{
		key: 'zoom-resizing',
		icon: 'text-fields',
		tone: 'amber',
		title: __('Zoom & text resizing', 'vulopilot'),
		question: __('Does the page still work when text is enlarged?', 'vulopilot'),
		howTo: __('Zoom the browser to 200%: nothing should overlap, get cut off or need sideways scrolling.', 'vulopilot'),
	},
];

/** The checks no scanner can make for you, each with a quick way to try it. */
const AccessibilityManualTestingPanel = () => (
	<Card
		id="accessibility-manual-testing-card"
		className="vp-a11y-manual"
		title={__('Checks that need a person', 'vulopilot')}
		icon="person"
		desc={__('Scans catch technical problems. These three take a few minutes by hand.', 'vulopilot')}
		link={{
			label: __('WCAG quick reference', 'vulopilot'),
			href: 'https://www.w3.org/WAI/WCAG21/quickref/',
		}}
	>
		<ol className="vp-a11y-manual-list">
			{MANUAL_CHECKS.map((check) => (
				<li key={check.key}>
					<IconTile icon={check.icon} tone={check.tone} />
					<div>
						<strong>{check.title}</strong>
						<span className="vp-a11y-manual-q">{check.question}</span>
						<span className="vp-a11y-manual-how">
							<b>{__('Try it:', 'vulopilot')}</b> {check.howTo}
						</span>
					</div>
				</li>
			))}
		</ol>
	</Card>
);

export default AccessibilityManualTestingPanel;
