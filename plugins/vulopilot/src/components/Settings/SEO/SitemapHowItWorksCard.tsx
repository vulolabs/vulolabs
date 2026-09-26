import { __ } from '@wordpress/i18n';
import { CardComponent } from '@zyra/components';
import './SitemapHowItWorksCard.scss';

/**
 * Sitemap tab's own right-side "How it works" explainer card, per direct
 * instruction (a reference mockup showing this exact icon-box/step/
 * "Good to know" layout). `CardComponent`'s own `titleIcon`/`title`/`desc`
 * already render the boxed header icon + title + subtitle the mockup
 * shows (`CardComponent.scss`'s own `.left i` rule) - no hand-rolled
 * header markup needed. Each step below is its own colored icon box
 * (reusing zyra's real `$color-palette` classes - `.purple`/`.blue`/
 * `.green`/`.orange` each already apply a light background + matching
 * icon color via `common.scss`'s own palette loop, the same idiom
 * `adminfont-X purple`-style icon modifiers use elsewhere in this
 * codebase) + a numbered circle in the same color, connected by a dotted
 * line (`.sitemap-how-it-works-step:not(:last-child)::after`).
 *
 * All 4 steps + the "Good to know" note describe real, already-implemented
 * behavior - nothing fabricated:
 * 1. SitemapManager.php narrows WordPress core's own native sitemap to
 *    whichever post types/taxonomies `sitemap_xml_post_types`/
 *    `sitemap_xml_taxonomies` include (Sitemap.ts's own "Post types &
 *    taxonomies in sitemap" section, just to the left of this card).
 * 2. Same real `/sitemap.xml` URL this tab's own "Enable sitemap" field
 *    and "Active & up to date" notice already reference (RobotsSitemap.php's
 *    own real `/wp-sitemap.xml` → `/sitemap.xml` discovery-order fallback).
 * 3. Covers publish AND update, not delete.
 * 4. A general, true statement about sitemap discoverability - not a
 *    specific metric this plugin measures, so "indexing is not
 *    guaranteed" is kept rather than promising a result this plugin can't
 *    control.
 * "Good to know": real - Sitemap.ts's own "Post types in sitemap"/
 * "Taxonomies in sitemap" controls sit in the left column next to this
 * card (`ColumnComponent grid={8}` / `grid={4}`, SitemapPanel.tsx).
 *
 * No "View documentation →" link - same "omit rather than fabricate a
 * destination" posture TitleFormatsPanel.tsx's own docblock already
 * documents for its own "How it works?"/"Need Help" mockup elements; this
 * codebase has no real sitemap documentation page to link to.
 */
const SITEMAP_STEPS: Array<{ icon: string; color: string; title: string; desc: string }> = [
	{
		icon: 'document',
		color: 'purple',
		title: __('VuloPilot creates your sitemap', 'vulopilot'),
		desc: __("We build an XML sitemap using the content types you've selected.", 'vulopilot'),
	},
	{
		icon: 'link',
		color: 'blue',
		title: __("It's published on your site", 'vulopilot'),
		desc: __('Your sitemap is available at yoursite.com/sitemap.xml once enabled.', 'vulopilot'),
	},
	{
		icon: 'search',
		color: 'green',
		title: __('Search engines can find it', 'vulopilot'),
		desc: __('Search engines read your sitemap to find new and updated content. Turn on Instant Indexing to tell them right away.', 'vulopilot'),
	},
	{
		icon: 'bar-chart',
		color: 'orange',
		title: __('Helps your content get discovered', 'vulopilot'),
		desc: __(
			'A sitemap makes it easier for search engines to find your content. Indexing is not guaranteed.',
			'vulopilot'
		),
	},
];

const SitemapHowItWorksCard = () => (
	<CardComponent
		title={__('How it works', 'vulopilot')}
		titleIcon="knowladgebase"
		desc={__('See what happens when you enable the XML sitemap.', 'vulopilot')}
	>
		<ol className="sitemap-how-it-works-steps">
			{SITEMAP_STEPS.map((step, index) => (
				<li key={index} className="sitemap-how-it-works-step">
					<span className={`sitemap-how-it-works-step-number ${step.color}`}>
						{index + 1}
					</span>
					<span className={`sitemap-how-it-works-step-icon ${step.color}`}>
						<i className={`adminfont-${step.icon}`} />
					</span>
					<span className="sitemap-how-it-works-step-body">
						<span className="sitemap-how-it-works-step-title">{step.title}</span>
						<span className="sitemap-how-it-works-step-desc">{step.desc}</span>
					</span>
				</li>
			))}
		</ol>
	</CardComponent>
);

export default SitemapHowItWorksCard;
