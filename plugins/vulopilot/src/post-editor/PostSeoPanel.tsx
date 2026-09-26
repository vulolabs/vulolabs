import { __ } from '@wordpress/i18n';
import { useState } from '@wordpress/element';
import { TabPanel } from '@wordpress/components';
import GeneralTab from './tabs/GeneralTab';
import SocialTab from './tabs/SocialTab';
import SchemaTab from './tabs/SchemaTab';
import PageAnalysisTab from './tabs/PageAnalysisTab';

import type { SeoIssueEditorTab } from '../services/seoIssueEditorTarget';

/**
 * `icon` (a Dashicon slug) is what gives icon-only tabs: TabPanel renders
 * `children: !tab.icon && tab.title`, so supplying `icon` suppresses the
 * text label and shows the icon instead, with `title` surviving as the
 * button's accessible name/tooltip (`label`/`showTooltip` in
 * `@wordpress/components`).
 */
const TABS = [
	{ name: 'general', title: __( 'General', 'vulopilot' ), icon: 'admin-generic', Component: GeneralTab },
	{ name: 'social', title: __( 'Social', 'vulopilot' ), icon: 'share', Component: SocialTab },
	{ name: 'schema', title: __( 'Schema', 'vulopilot' ), icon: 'editor-code', Component: SchemaTab },
	{ name: 'page-analysis', title: __( 'Page Analysis', 'vulopilot' ), icon: 'chart-bar', Component: PageAnalysisTab },
];

interface PostSeoPanelProps {
	/** "All SEO Issues" table's "Fix with AI" deep link (post-editor/index.tsx) - which tab to land on. TabPanel reads this once at mount (it's uncontrolled), which matches this prop's own once-per-page-load nature. */
	initialTabName?: SeoIssueEditorTab;
	/** Same deep link's specific field/checklist-item id to scroll to and highlight, within whichever tab it names. */
	highlightTarget?: string;
}

/**
 * The metabox's tab shell. "Page Analysis" is VuloPilot's own addition,
 * mirroring `GEO/PageAnalysisPanel.tsx`'s checklist inside the editor
 * itself (see PageAnalysisTab.tsx). Rendered inside the PluginSidebar
 * registered by src/post-editor/index.tsx.
 *
 * `navTarget` is this panel's own in-sidebar navigation state - lets
 * `PageAnalysisTab.tsx`'s own checklist rows jump straight to the real
 * field that fixes them (General/Social/Schema, whichever one
 * `SEO_ISSUE_EDITOR_TARGETS` names for that check), the same real
 * tab+highlight pair the "All SEO Issues" table's own "Fix with AI" deep
 * link already lands on from outside the editor - just switched without a
 * page navigation, since this is already the editor. `@wordpress/components`'
 * own `TabPanel` only reads `initialTabName` once at mount (confirmed -
 * it's uncontrolled), so `navigateTo()` forces a fresh mount via `key`
 * rather than trying to imperatively select a tab on an already-mounted
 * instance.
 */
export default function PostSeoPanel( { initialTabName, highlightTarget }: PostSeoPanelProps ) {
	const [ navTarget, setNavTarget ] = useState< { tab: SeoIssueEditorTab; target?: string } | null >( null );

	const activeTabName = navTarget?.tab ?? initialTabName;
	const activeHighlight = navTarget ? navTarget.target : highlightTarget;

	const navigateTo = ( tab: SeoIssueEditorTab, target?: string ) => {
		setNavTarget( { tab, target } );
	};

	return (
		<div className="vulopilot-seo-panel">
			<TabPanel
				key={ activeTabName ?? 'general' }
				tabs={ TABS.map( ( { name, title, icon } ) => ( { name, title, icon } ) ) }
				initialTabName={ activeTabName }
			>
				{ ( tab ) => {
					const active = TABS.find( ( candidate ) => candidate.name === tab.name );
					const ActiveComponent = active ? active.Component : GeneralTab;

					return (
						<ActiveComponent
							highlightTarget={ activeHighlight }
							onNavigate={ navigateTo }
						/>
					);
				} }
			</TabPanel>
		</div>
	);
}
