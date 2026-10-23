import { __ } from '@wordpress/i18n';
import { useEffect, useRef, useState } from '@wordpress/element';
import { useDispatch, useSelect } from '@wordpress/data';
import { createBlock } from '@wordpress/blocks';
import { Button, PanelBody, PanelRow, Spinner } from '@wordpress/components';
import { usePostData } from './usePostData';
import {
	getContentIntelligenceDecision,
	createContentBrief,
	getTopicOpportunities,
	discoverTopicOpportunities,
	createContentPlanItem,
	createKeyword,
	analyzeWebsite,
	ContentIntelligenceDecision,
	ContentBrief,
	TopicOpportunity,
} from './api';

/** Matches `KeywordManagementSection.tsx`'s search debounce style; spec calls for ~800-1200ms for a full-title analysis. */
const TITLE_DEBOUNCE_MS = 1000;
const MIN_TITLE_LENGTH = 4;

const DECISION_LABEL: Record< ContentIntelligenceDecision[ 'decision' ], string > = {
	create_new: __( 'Create a new article', 'vulopilot' ),
	improve_existing: __( 'Improve an existing article', 'vulopilot' ),
	rethink_topic: __( 'Rethink this topic', 'vulopilot' ),
	not_enough_input: __( 'Not analyzed', 'vulopilot' ),
};

const DECISION_CLASS: Record< ContentIntelligenceDecision[ 'decision' ], string > = {
	create_new: 'is-create',
	improve_existing: 'is-improve',
	rethink_topic: 'is-rethink',
	not_enough_input: 'is-idle',
};

/**
 * "Content Intelligence" - the Create/Improve/Rethink decision panel from the spec. Watches the
 * post title (via `usePostData()`, already backed by `core/editor`'s own edited-post attribute,
 * so it reflects unsaved typing) and debounces a call to the deterministic
 * `ContentIntelligenceDecisionService` - no AI call on every keystroke, matching this codebase's
 * existing live-check precedent (`getPostSeoScore(..., liveOnly)`).
 */
export default function ContentIntelligencePanel() {
	const { postId, title } = usePostData();
	const [ decision, setDecision ] = useState< ContentIntelligenceDecision | null >( null );
	const [ isAnalyzing, setIsAnalyzing ] = useState( false );
	const [ isStale, setIsStale ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );
	const [ lastAnalyzedAt, setLastAnalyzedAt ] = useState< Date | null >( null );
	const [ showEvidence, setShowEvidence ] = useState( false );
	const debounceRef = useRef< ReturnType< typeof setTimeout > | null >( null );
	const requestSeq = useRef( 0 );

	// Outcome A - Build Article Brief. `createContentBrief()` is pure assembly of already-gathered
	// data (topic profile + keyword assignments + link opportunities) - no AI call.
	const [ brief, setBrief ] = useState< ContentBrief | null >( null );
	const [ isBuildingBrief, setIsBuildingBrief ] = useState( false );
	const [ briefError, setBriefError ] = useState< string | null >( null );
	const [ isInsertingOutline, setIsInsertingOutline ] = useState( false );
	const [ isSavingPlan, setIsSavingPlan ] = useState( false );

	// Outcome B - View Article Comparison (an inline, dismissible comparison of the two topics'
	// own already-known evidence, not a navigation away from the editor).
	const [ showComparison, setShowComparison ] = useState( false );

	// Outcome C - Explore Better Topics / Keep Current Topic.
	const [ alternatives, setAlternatives ] = useState< TopicOpportunity[] | null >( null );
	const [ isExploring, setIsExploring ] = useState( false );
	const [ exploreError, setExploreError ] = useState< string | null >( null );
	const [ keptCurrentTopic, setKeptCurrentTopic ] = useState( false );

	// "Analyze Website" - right here, not a pointer to go run it from a different screen. A real
	// AI call (`AnalyzeWebsiteAction`), explicit button only; on success, re-runs the current
	// title's analysis so the decision reflects the freshly-generated profile immediately.
	const [ isAnalyzingWebsite, setIsAnalyzingWebsite ] = useState( false );
	const [ websiteAnalysisError, setWebsiteAnalysisError ] = useState< string | null >( null );

	const { insertBlocks } = useDispatch( 'core/block-editor' );
	const blockCount = useSelect( ( select ) => ( select( 'core/block-editor' ) as any ).getBlockCount(), [] );

	const runAnalysis = ( value: string ) => {
		if ( ! postId ) {
			return;
		}

		const seq = ++requestSeq.current;
		setIsAnalyzing( true );
		setError( null );

		getContentIntelligenceDecision( value, postId )
			.then( ( result ) => {
				if ( seq !== requestSeq.current ) {
					return; // A newer request already landed - don't let a stale one overwrite it.
				}
				setDecision( result );
				setIsStale( false );
				setLastAnalyzedAt( new Date() );
			} )
			.catch( () => {
				if ( seq === requestSeq.current ) {
					setError( __( 'Could not analyze this topic - try again.', 'vulopilot' ) );
				}
			} )
			.finally( () => {
				if ( seq === requestSeq.current ) {
					setIsAnalyzing( false );
				}
			} );
	};

	const analyzeWebsiteNow = () => {
		setIsAnalyzingWebsite( true );
		setWebsiteAnalysisError( null );
		analyzeWebsite()
			.then( () => {
				if ( title.trim().length >= MIN_TITLE_LENGTH ) {
					runAnalysis( title.trim() ); // Refresh the decision with the freshly-generated profile.
				}
			} )
			.catch( ( e: Error ) =>
				setWebsiteAnalysisError( e.message || __( 'Could not analyze the website - try again.', 'vulopilot' ) )
			)
			.finally( () => setIsAnalyzingWebsite( false ) );
	};

	useEffect( () => {
		if ( ! window.vulopilotPostSeo.isPro || ! postId ) {
			return;
		}

		if ( debounceRef.current ) {
			clearTimeout( debounceRef.current );
		}

		if ( title.trim().length < MIN_TITLE_LENGTH ) {
			return;
		}

		setIsStale( true );
		setBrief( null );
		setAlternatives( null );
		setKeptCurrentTopic( false );
		debounceRef.current = setTimeout( () => runAnalysis( title.trim() ), TITLE_DEBOUNCE_MS );

		return () => {
			if ( debounceRef.current ) {
				clearTimeout( debounceRef.current );
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ title, postId ] );

	/** Outcome A primary CTA - real assembly call, not a mockup. */
	const buildArticleBrief = () => {
		if ( ! postId ) {
			return;
		}
		setIsBuildingBrief( true );
		setBriefError( null );
		createContentBrief( postId, title.trim() )
			.then( setBrief )
			.catch( () => setBriefError( __( 'Could not build a brief - try again.', 'vulopilot' ) ) )
			.finally( () => setIsBuildingBrief( false ) );
	};

	/**
	 * Appends Heading blocks for the brief's own outline to the END of the current content -
	 * never replaces or overwrites what the user has already written, per the spec's explicit
	 * "preserve any content the user has already written" requirement.
	 */
	const insertOutline = () => {
		if ( ! brief || ! brief.suggested_headings.length ) {
			return;
		}
		setIsInsertingOutline( true );
		const blocks = brief.suggested_headings.map( ( heading ) => createBlock( 'core/heading', { content: heading, level: 2 } ) );
		insertBlocks( blocks, blockCount );
		setIsInsertingOutline( false );
	};

	const copyBrief = () => {
		if ( ! brief ) {
			return;
		}
		const text = [
			brief.proposed_title,
			`${ __( 'Search intent:', 'vulopilot' ) } ${ brief.search_intent }`,
			`${ __( 'Primary keyword:', 'vulopilot' ) } ${ brief.primary_keyword }`,
			`${ __( 'Related keywords:', 'vulopilot' ) } ${ brief.related_keywords.join( ', ' ) }`,
			'',
			__( 'Outline:', 'vulopilot' ),
			...brief.suggested_headings.map( ( h ) => `- ${ h }` ),
			'',
			__( 'Questions to answer:', 'vulopilot' ),
			...brief.questions_to_answer.map( ( q ) => `- ${ q }` ),
		].join( '\n' );
		navigator.clipboard?.writeText( text );
	};

	const addBriefKeywordsToList = () => {
		if ( ! brief ) {
			return;
		}
		[ brief.primary_keyword, ...brief.related_keywords ].filter( Boolean ).forEach( ( phrase ) => {
			createKeyword( { phrase } ).catch( () => undefined );
		} );
	};

	const saveBriefAsContentPlan = () => {
		if ( ! brief ) {
			return;
		}
		setIsSavingPlan( true );
		createContentPlanItem( {
			title: brief.proposed_title,
			main_topic: brief.main_topic,
			primary_keyword: brief.primary_keyword,
			notes: brief.questions_to_answer.join( '\n' ),
		} )
			.catch( () => undefined )
			.finally( () => setIsSavingPlan( false ) );
	};

	/** Outcome C primary CTA - reads stored opportunities first (no AI cost), runs real discovery only if nothing is stored yet. */
	const exploreBetterTopics = () => {
		setIsExploring( true );
		setExploreError( null );
		getTopicOpportunities()
			.then( ( stored ) => {
				const active = ( stored ?? [] ).filter( ( s ) => 'dismissed' !== s.status );
				if ( active.length > 0 ) {
					setAlternatives( active );
					setIsExploring( false );
					return;
				}
				discoverTopicOpportunities()
					.then( ( fresh ) => setAlternatives( ( fresh ?? [] ).filter( ( s ) => 'dismissed' !== s.status ) ) )
					.catch( () => setExploreError( __( 'Analyze your website first for better topic suggestions - use the button above.', 'vulopilot' ) ) )
					.finally( () => setIsExploring( false ) );
			} )
			.catch( () => {
				setExploreError( __( 'Could not load topic opportunities.', 'vulopilot' ) );
				setIsExploring( false );
			} );
	};

	if ( ! window.vulopilotPostSeo.isPro ) {
		return (
			<PanelBody title={ __( 'Content Intelligence', 'vulopilot' ) } initialOpen>
				<p className="small desc">
					{ __( 'Know whether this title is a genuine content gap, overlaps an existing article, or needs rethinking - before you write it.', 'vulopilot' ) }
				</p>
				<Button variant="primary" href={ window.vulopilotPostSeo.shopUrl } target="_blank" rel="noreferrer">
					{ __( 'Upgrade to Pro to Unlock Content Intelligence', 'vulopilot' ) }
				</Button>
			</PanelBody>
		);
	}

	if ( ! postId ) {
		return null;
	}

	const status = isAnalyzing
		? __( 'Analyzing your topic…', 'vulopilot' )
		: isStale
		? __( 'Content updated · analysis refresh needed', 'vulopilot' )
		: decision
		? __( 'Ready', 'vulopilot' )
		: __( 'Not analyzed', 'vulopilot' );

	// True whenever the decision's own relevance/business-value factors came back `null` for lack
	// of a website profile - the real, fixable cause behind a low/insufficient-data score, as
	// opposed to the topic itself being weak. Surfaced as a direct action, not a pointer elsewhere.
	const needsWebsiteProfile = !! decision?.score.factors.some(
		( f ) => 'relevance' === f.id && null === f.score
	);

	return (
		<PanelBody title={ __( 'Content Intelligence', 'vulopilot' ) } initialOpen>
			<p className="small desc">{ __( 'Let\'s find the best opportunity for this article.', 'vulopilot' ) }</p>

			<PanelRow>
				<span className="vulopilot-seo-section-label">{ __( 'Status', 'vulopilot' ) }</span>
				<span>
					{ isAnalyzing && <Spinner /> }
					{ status }
				</span>
			</PanelRow>

			{ error && <div className="desc vulopilot-seo-checklist__error">{ error }</div> }

			{ needsWebsiteProfile && (
				<div className="vulopilot-content-intelligence-decision is-improve">
					<strong>{ __( 'Analyze your website for a confident recommendation', 'vulopilot' ) }</strong>
					<p className="small desc">
						{ __( 'This score is missing relevance and business-value signals because your site hasn\'t been analyzed yet. This takes one click, right here.', 'vulopilot' ) }
					</p>
					{ websiteAnalysisError && <div className="desc vulopilot-seo-checklist__error">{ websiteAnalysisError }</div> }
					<Button variant="primary" onClick={ analyzeWebsiteNow } disabled={ isAnalyzingWebsite }>
						{ isAnalyzingWebsite ? __( 'Analyzing website…', 'vulopilot' ) : __( 'Analyze Website', 'vulopilot' ) }
					</Button>
				</div>
			) }

			{ title.trim().length < MIN_TITLE_LENGTH && ! decision && (
				<p className="small desc">{ __( 'Keep typing a title to get a recommendation.', 'vulopilot' ) }</p>
			) }

			{ decision && decision.decision !== 'not_enough_input' && (
				<div className={ `vulopilot-content-intelligence-decision ${ DECISION_CLASS[ decision.decision ] }` }>
					<strong>{ DECISION_LABEL[ decision.decision ] }</strong>
					<p className="small desc">{ decision.reason }</p>

					{ decision.matched_post && (
						<p className="small desc">
							<a href={ decision.matched_post.url ?? '#' } target="_blank" rel="noreferrer">
								{ decision.matched_post.title }
							</a>
							{ ' ' }({ decision.matched_post.status })
						</p>
					) }

					{ null !== decision.score.score && (
						<p className="small desc">
							{ decision.score.insufficient_data
								? __( 'Opportunity score: not enough data yet.', 'vulopilot' )
								: `${ __( 'Opportunity score:', 'vulopilot' ) } ${ decision.score.score }/100` }
						</p>
					) }

					{ lastAnalyzedAt && (
						<p className="small desc">
							{ __( 'Last analyzed:', 'vulopilot' ) } { lastAnalyzedAt.toLocaleTimeString() }
						</p>
					) }

					<Button variant="link" onClick={ () => setShowEvidence( ( prev ) => ! prev ) }>
						{ showEvidence ? __( 'Hide full analysis', 'vulopilot' ) : __( 'Review full analysis', 'vulopilot' ) }
					</Button>

					{ showEvidence && (
						<ul className="vulopilot-seo-checklist__list">
							{ decision.score.factors.map( ( factor ) => (
								<li key={ factor.id } className="vulopilot-seo-checklist__item">
									<span className="vulopilot-seo-checklist__message">
										<strong>{ factor.id.replace( /_/g, ' ' ) }</strong>
										{ ' ' }({ factor.weight }%): { null === factor.score ? __( 'no data', 'vulopilot' ) : `${ factor.score }/100` }
										<br />
										{ factor.evidence }
									</span>
								</li>
							) ) }
							{ decision.overlaps.map( ( overlap ) => (
								<li key={ `overlap-${ overlap.post_id }` } className="vulopilot-seo-checklist__item">
									<span className="vulopilot-seo-checklist__message">
										<strong>{ overlap.title }</strong> - { overlap.evidence }
									</span>
								</li>
							) ) }
						</ul>
					) }

					{ /* Outcome A - Create new article. */ }
					{ 'create_new' === decision.decision && (
						<div className="vulopilot-content-intelligence-actions">
							<Button variant="primary" onClick={ buildArticleBrief } disabled={ isBuildingBrief }>
								{ isBuildingBrief ? __( 'Building brief…', 'vulopilot' ) : __( 'Build Article Brief', 'vulopilot' ) }
							</Button>
							<Button variant="secondary" onClick={ exploreBetterTopics } disabled={ isExploring }>
								{ __( 'Review Topic Opportunities', 'vulopilot' ) }
							</Button>

							{ briefError && <div className="desc vulopilot-seo-checklist__error">{ briefError }</div> }

							{ brief && (
								<div className="vulopilot-content-intelligence-brief">
									<p className="small desc"><strong>{ __( 'Search intent:', 'vulopilot' ) }</strong> { brief.search_intent || '—' }</p>
									<p className="small desc"><strong>{ __( 'Primary keyword:', 'vulopilot' ) }</strong> { brief.primary_keyword || '—' }</p>
									{ brief.related_keywords.length > 0 && (
										<p className="small desc"><strong>{ __( 'Related keywords:', 'vulopilot' ) }</strong> { brief.related_keywords.join( ', ' ) }</p>
									) }
									{ brief.suggested_headings.length > 0 && (
										<>
											<p className="vulopilot-seo-section-label">{ __( 'Suggested outline', 'vulopilot' ) }</p>
											<ul className="vulopilot-seo-checklist__list">
												{ brief.suggested_headings.map( ( heading ) => (
													<li key={ heading } className="vulopilot-seo-checklist__item">{ heading }</li>
												) ) }
											</ul>
										</>
									) }
									{ brief.questions_to_answer.length > 0 && (
										<>
											<p className="vulopilot-seo-section-label">{ __( 'Questions to answer', 'vulopilot' ) }</p>
											<ul className="vulopilot-seo-checklist__list">
												{ brief.questions_to_answer.map( ( q ) => (
													<li key={ q } className="vulopilot-seo-checklist__item">{ q }</li>
												) ) }
											</ul>
										</>
									) }
									{ brief.relevant_existing_articles.length > 0 && (
										<>
											<p className="vulopilot-seo-section-label">{ __( 'Link to these existing articles', 'vulopilot' ) }</p>
											<ul className="vulopilot-seo-checklist__list">
												{ brief.relevant_existing_articles.map( ( a ) => (
													<li key={ a.url } className="vulopilot-seo-checklist__item">
														<a href={ a.url } target="_blank" rel="noreferrer">{ a.title }</a>
													</li>
												) ) }
											</ul>
										</>
									) }

									<div className="vulopilot-content-intelligence-actions">
										<Button variant="secondary" onClick={ insertOutline } disabled={ isInsertingOutline || ! brief.suggested_headings.length }>
											{ __( 'Insert Outline', 'vulopilot' ) }
										</Button>
										<Button variant="tertiary" onClick={ copyBrief }>{ __( 'Copy Brief', 'vulopilot' ) }</Button>
										<Button variant="tertiary" onClick={ addBriefKeywordsToList }>{ __( 'Add Keywords to List', 'vulopilot' ) }</Button>
										<Button variant="tertiary" onClick={ saveBriefAsContentPlan } disabled={ isSavingPlan }>
											{ isSavingPlan ? __( 'Saving…', 'vulopilot' ) : __( 'Save as Content Plan', 'vulopilot' ) }
										</Button>
									</div>
								</div>
							) }
						</div>
					) }

					{ /* Outcome B - Improve existing article. */ }
					{ 'improve_existing' === decision.decision && decision.matched_post && (
						<div className="vulopilot-content-intelligence-actions">
							<Button
								variant="primary"
								onClick={ () => window.open( `${ new URL( window.vulopilotPostSeo.apiUrl ).origin }/wp-admin/post.php?post=${ decision.matched_post!.post_id }&action=edit`, '_blank', 'noopener' ) }
							>
								{ __( 'Improve Existing Article', 'vulopilot' ) }
							</Button>
							<Button variant="secondary" onClick={ () => setShowComparison( ( prev ) => ! prev ) }>
								{ showComparison ? __( 'Hide Comparison', 'vulopilot' ) : __( 'View Article Comparison', 'vulopilot' ) }
							</Button>

							{ showComparison && (
								<table className="vulopilot-content-intelligence-compare">
									<tbody>
										<tr>
											<th>{ __( 'This draft', 'vulopilot' ) }</th>
											<td>{ title || '—' }</td>
										</tr>
										<tr>
											<th>{ __( 'Existing article', 'vulopilot' ) }</th>
											<td>
												<a href={ decision.matched_post.url ?? '#' } target="_blank" rel="noreferrer">{ decision.matched_post.title }</a>
												{ ' ' }({ decision.matched_post.status })
											</td>
										</tr>
										<tr>
											<th>{ __( 'Overlap evidence', 'vulopilot' ) }</th>
											<td>{ decision.overlaps.find( ( o ) => o.post_id === decision.matched_post!.post_id )?.evidence ?? decision.reason }</td>
										</tr>
									</tbody>
								</table>
							) }
						</div>
					) }

					{ /* Outcome C - Rethink topic. */ }
					{ 'rethink_topic' === decision.decision && ! keptCurrentTopic && (
						<div className="vulopilot-content-intelligence-actions">
							<Button variant="primary" onClick={ exploreBetterTopics } disabled={ isExploring }>
								{ isExploring ? __( 'Finding alternatives…', 'vulopilot' ) : __( 'Explore Better Topics', 'vulopilot' ) }
							</Button>
							<Button variant="secondary" onClick={ () => setKeptCurrentTopic( true ) }>
								{ __( 'Keep Current Topic', 'vulopilot' ) }
							</Button>

							{ exploreError && <div className="desc vulopilot-seo-checklist__error">{ exploreError }</div> }

							{ alternatives && alternatives.length === 0 && ! exploreError && (
								<p className="small desc">{ __( 'No alternative topics available yet.', 'vulopilot' ) }</p>
							) }

							{ alternatives && alternatives.length > 0 && (
								<ul className="vulopilot-seo-checklist__list">
									{ alternatives.map( ( alt ) => (
										<li key={ alt.id } className="vulopilot-seo-checklist__item">
											<span className="vulopilot-seo-checklist__message">
												<strong>{ alt.title }</strong>
												{ null !== alt.opportunity_score && ` · ${ alt.opportunity_score }/100` }
												<br />
												{ alt.search_intent }
											</span>
										</li>
									) ) }
								</ul>
							) }
						</div>
					) }

					{ 'rethink_topic' === decision.decision && keptCurrentTopic && (
						<p className="small desc">{ __( 'Keeping your original topic. You can change your mind anytime by re-running analysis.', 'vulopilot' ) }</p>
					) }
				</div>
			) }
		</PanelBody>
	);
}
