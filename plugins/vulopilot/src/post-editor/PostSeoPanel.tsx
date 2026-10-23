import { __ } from '@wordpress/i18n';
import { useEffect, useState } from '@wordpress/element';
import { TabPanel } from '@wordpress/components';
import GeneralTab from './tabs/GeneralTab';
import OnPageTab from './tabs/OnPageTab';
import AiVisibilitySuiteTab from './tabs/AiVisibilitySuiteTab';
import RecommendationsTab from './tabs/RecommendationsTab';
import TopicLinkingTab from './tabs/TopicLinkingTab';
import PostScoreBadges from './PostScoreBadges';
import ScoreImprovementCard from './ScoreImprovementCard';
import KeywordManagementSection from './KeywordManagementSection';
import ContentIntelligencePanel from './ContentIntelligencePanel';
import { usePostData } from './usePostData';
import { usePostScores } from './usePostScores';

import type { SeoIssueEditorTab } from '../services/seoIssueEditorTarget';

/**
 * `icon` (a Dashicon slug) is what gives icon-only tabs: TabPanel renders `children: !tab.icon &&
 * tab.title`. Reduced from 12 icon-only tabs to 5 - the original Social/Schema/Page Analysis tabs
 * now live inside `OnPageTab`'s own accordion, and the 6-tab "AI Visibility Score" suite
 * (Overview/AI Readiness/AEO/GEO/AI Visibility/Content Analysis) lives inside
 * `AiVisibilitySuiteTab`'s own accordion. Every deep-link target below (`DEEP_LINK_TAB_GROUP`)
 * still resolves correctly to one of these 5.
 */
const TABS = [
	{ name: 'general', title: __( 'General', 'vulopilot' ), icon: 'admin-generic', Component: GeneralTab },
	{ name: 'on-page', title: __( 'On-Page & Social', 'vulopilot' ), icon: 'share', Component: OnPageTab },
	// "AI Visibility Score" suite - each section composes real data an existing engine already
	// computes (SeoScoreEngine, GeoAnalyzer, CitationCoverageChecker, CrawlerVisitRepository);
	// no new scoring rules were invented for this suite.
	{ name: 'ai-visibility-suite', title: __( 'AI Visibility', 'vulopilot' ), icon: 'visibility', Component: AiVisibilitySuiteTab },
	{ name: 'recommendations', title: __( 'Recommendations', 'vulopilot' ), icon: 'lightbulb', Component: RecommendationsTab },
	// Topic Intelligence & Internal Linking - composes real deterministic (RelatedPostFinder) and
	// AI-backed (AnalyzeTopicAction/SuggestLinkOpportunitiesAction) data; see TopicLinkingTab.tsx.
	{ name: 'topic-linking', title: __( 'Topic & Linking', 'vulopilot' ), icon: 'networking', Component: TopicLinkingTab },
];

/** Every original deep-link target (`SEO_ISSUE_EDITOR_TARGETS`) still resolves to one of the 5 tabs above. */
const DEEP_LINK_TAB_GROUP: Record< SeoIssueEditorTab, string > = {
	general: 'general',
	social: 'on-page',
	schema: 'on-page',
	'page-analysis': 'on-page',
	overview: 'ai-visibility-suite',
	'ai-readiness': 'ai-visibility-suite',
	aeo: 'ai-visibility-suite',
	geo: 'ai-visibility-suite',
	'ai-visibility': 'ai-visibility-suite',
	'content-analysis': 'ai-visibility-suite',
	recommendations: 'recommendations',
	'topic-linking': 'topic-linking',
};

interface PostSeoPanelProps {
	/** "All SEO Issues" table's "Fix with AI" deep link (post-editor/index.tsx) - which tab to land on. */
	initialTabName?: SeoIssueEditorTab;
	/** Same deep link's specific field/checklist-item id to scroll to and highlight, within whichever tab it names. */
	highlightTarget?: string;
	/**
	 * Bumped by index.tsx's toolbar score pills every time one is clicked, so this re-navigates
	 * even when `initialTabName` is the same value as last time (e.g. clicking the SEO pill
	 * twice in a row). Deliberately does NOT remount this component (an earlier version used
	 * `key` on `<PostSeoPanel>` itself for this, which also remounted `ContentIntelligencePanel`
	 * below - throwing away its already-fetched real analysis and showing its empty "not
	 * analyzed yet" default for the few seconds its own fetch took to finish again, visible live
	 * as the panel's content flickering from real data to the empty state right after a pill
	 * click). Only `navTarget` (and so only the inner `TabPanel`) reacts to this now.
	 */
	navigationNonce?: number;
	/** The specific field/section `navigationNonce` should land on within `initialTabName`, e.g. 'snippet' for the SEO pill. */
	navigationTarget?: string;
}

/**
 * The metabox's tab shell. "Page Analysis" is VuloPilot's own addition.
 */
export default function PostSeoPanel( { initialTabName, highlightTarget, navigationNonce, navigationTarget }: PostSeoPanelProps ) {
	const [ navTarget, setNavTarget ] = useState< { tab: SeoIssueEditorTab; target?: string } | null >( null );
	const { postId } = usePostData();
	const { seoScore, aeoScore, seoScoreRules, refetch } = usePostScores( postId ?? 0 );

	useEffect( () => {
		if ( undefined !== navigationNonce && initialTabName ) {
			// The nonce suffix makes this a real, distinct value every click, even when
			// `navigationTarget` itself is the same string twice in a row (e.g. the SEO pill
			// clicked twice without switching tabs in between) - GeneralTab's own highlight
			// effect keys off the exact string changing, not just a literal "snippet" match.
			setNavTarget( {
				tab: initialTabName,
				target: navigationTarget ? `${ navigationTarget }-${ navigationNonce }` : undefined,
			} );
		}
		// Only re-navigate when the nonce actually changes (a new pill click) - `initialTabName`
		// itself isn't a dependency here on purpose, it's read fresh via closure each time the
		// nonce fires, same as any "do X when this counter bumps" effect.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ navigationNonce ] );

	const deepLinkTab = navTarget?.tab ?? initialTabName;
	// `deepLinkTab` is one of the original 12 fine-grained ids (e.g. 'social') - `TabPanel` only
	// knows the 5 merged tab names, so it's translated here; `activeHighlight` still carries the
	// original fine-grained target so the right accordion section/field highlights inside it.
	const activeTabName = deepLinkTab ? DEEP_LINK_TAB_GROUP[ deepLinkTab ] : undefined;
	const activeHighlight = navTarget ? navTarget.target : highlightTarget;

	const navigateTo = ( tab: SeoIssueEditorTab, target?: string ) => {
		setNavTarget( { tab, target } );
	};

	return (
		<div className="vulopilot-seo-panel">
			{ postId && (
				<>
					<ContentIntelligencePanel />
					<PostScoreBadges
						seoScore={ seoScore }
						aeoScore={ aeoScore }
						onNavigate={ ( tab ) => navigateTo( tab ) }
					/>
					<ScoreImprovementCard
						score={ seoScore }
						rules={ seoScoreRules }
						postId={ postId }
						onScoreUpdated={ refetch }
					/>
					<KeywordManagementSection />
				</>
			) }
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
