import { __ } from '@wordpress/i18n';

export const CUSTOM_AUTOMATIONS = {
	title: __('Custom automations', 'vulopilot'),
	description: __('Build your own: pick what starts it, then what it does - alerts, reports or AI fixes.', 'vulopilot'),
	icon: 'automation',
};

/** What a custom automation can do, in plain words. */
const POINTS = [
	{
		icon: 'scan',
		text: __('Start on scan results, score drops, new posts, orders or a schedule', 'vulopilot'),
	},
	{ icon: 'mail', text: __('Send emails and notifications, or create reports', 'vulopilot') },
	{ icon: 'ai', text: __('Fix issues with AI, and undo any change', 'vulopilot') },
	{ icon: 'category', text: __('Start from a ready-made template, or describe it and let AI build it', 'vulopilot') },
];

/** Examples of what people build: what starts it, what it does. Examples only - nothing here runs. */
const EXAMPLES = [
	{
		icon: 'error',
		tone: 'is-red',
		name: __('Critical issue alert', 'vulopilot'),
		when: __('A scan finds a critical issue', 'vulopilot'),
		then: __('Email me right away', 'vulopilot'),
	},
	{
		icon: 'edit',
		tone: 'is-violet',
		name: __('Meta titles for new posts', 'vulopilot'),
		when: __('A post is published', 'vulopilot'),
		then: __('Write a missing meta title with AI', 'vulopilot'),
	},
	{
		icon: 'security',
		tone: 'is-amber',
		name: __('Security score watch', 'vulopilot'),
		when: __('The security score drops', 'vulopilot'),
		then: __('Notify the site team', 'vulopilot'),
	},
];

/**
 * What VuloPilot Pro adds to this page, described rather than imitated: a few lines on custom automations and three
 * examples of them. Free ships no automation-builder code, so nothing here is locked or disabled - the button only
 * tells you about Pro.
 */
const AutomationsProPreview = ({ onLearnMore }: { onLearnMore: () => void }) => (
	<section className="vp-card vp-auto-pro">
		<div className="vp-auto-pro-intro">
			<span className="vp-auto-pro-tag">
				<i className="adminfont-pro-tag" aria-hidden="true" />
				{__('VuloPilot Pro', 'vulopilot')}
			</span>
			<h3>{__('Create your own automations', 'vulopilot')}</h3>
			<p>
				{__(
					'Choose what starts it and what happens next. VuloPilot then handles it for you, every time.',
					'vulopilot'
				)}
			</p>
			<ul className="vp-auto-pro-points">
				{POINTS.map((point) => (
					<li key={point.text}>
						<i className={`adminfont-${point.icon}`} aria-hidden="true" />
						{point.text}
					</li>
				))}
			</ul>
			<button type="button" className="vp-auto-pro-cta" onClick={onLearnMore}>
				{__('See what Pro adds', 'vulopilot')}
				<i className="adminfont-arrow-right" aria-hidden="true" />
			</button>
		</div>

		<div className="vp-auto-pro-examples">
			<span className="vp-auto-pro-eyebrow">{__('For example', 'vulopilot')}</span>
			<ul>
				{EXAMPLES.map((example) => (
					<li key={example.name}>
						<span className={`vp-icon is-sm ${example.tone}`} aria-hidden="true">
							<i className={`adminfont-${example.icon}`} />
						</span>
						<div>
							<strong>{example.name}</strong>
							<span className="vp-auto-pro-flow">
								<em>{__('When', 'vulopilot')}</em>
								{example.when}
							</span>
							<span className="vp-auto-pro-flow">
								<em className="is-then">{__('Then', 'vulopilot')}</em>
								{example.then}
							</span>
						</div>
					</li>
				))}
			</ul>
		</div>
	</section>
);

export default AutomationsProPreview;
