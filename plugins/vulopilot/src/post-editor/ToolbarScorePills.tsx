import { __ } from '@wordpress/i18n';
import { useSelect } from '@wordpress/data';
import { usePostScores } from './usePostScores';

/** Same 3-tier rating band `PageAnalysisTab.tsx`'s own `IssueSection` summary pill uses, in the colors Rank Math's own toolbar score pill uses (green/orange/red). */
const ratingModifier = ( score: number | null ): string => {
	if ( null === score ) {
		return 'loading';
	}
	if ( score >= 80 ) {
		return 'good';
	}
	if ( score >= 50 ) {
		return 'ok';
	}
	return 'bad';
};

interface ToolbarScorePillsProps {
	/** Opens the sidebar on the General tab (SEO title/description live there) - PostScoreBadges.tsx's own `onNavigate('general')` already uses the same target from inside the sidebar. */
	onClickSeo: () => void;
	/** Opens the sidebar on the AI Visibility tab (AEO/GEO/AI-readiness scoring). */
	onClickAeo: () => void;
}

/**
 * The editor header toolbar's own score pills - same real SEO/AEO scores `PostScoreBadges.tsx`
 * shows inside the sidebar panel. Portaled into the header's settings row by `index.tsx`'s own
 * `useToolbarScorePillsPortal()` rather than passed as `PluginSidebar`'s `icon` - that prop goes
 * through `Icon`, which clips/squashes anything beyond a simple small dashicon/SVG, which is why
 * an earlier version of this rendered blank in the toolbar. Each pill is its own button (not one
 * shared button for both) so clicking a score opens the sidebar straight to the tab that score's
 * own detail/edit fields live on, instead of a generic "open the sidebar" with no tab context.
 */
export default function ToolbarScorePills( { onClickSeo, onClickAeo }: ToolbarScorePillsProps ) {
	const postId = useSelect( ( select ) => ( select( 'core/editor' ) as any ).getCurrentPostId(), [] );
	const { seoScore, aeoScore } = usePostScores( postId ?? 0 );

	return (
		<div className="vulopilot-toolbar-score-pills">
			<button
				type="button"
				className={ `vulopilot-toolbar-score-pill vulopilot-toolbar-score-pill--${ ratingModifier( seoScore ) }` }
				onClick={ onClickSeo }
				title={ __( 'SEO title, description and on-page details', 'vulopilot' ) }
			>
				<i className="dashicons dashicons-awards" />
				{ null === seoScore ? '…' : seoScore }
				/100
			</button>
			<button
				type="button"
				className={ `vulopilot-toolbar-score-pill vulopilot-toolbar-score-pill--${ ratingModifier( aeoScore ) }` }
				onClick={ onClickAeo }
				title={ __( 'AI visibility (AEO/GEO)', 'vulopilot' ) }
			>
				<i className="dashicons dashicons-lightbulb" />
				{ null === aeoScore ? '…' : aeoScore }
				/100
			</button>
		</div>
	);
}
