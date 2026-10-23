import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useRef, useState } from '@wordpress/element';
import { Button, PanelBody, Spinner } from '@wordpress/components';
import { usePostData } from '../usePostData';
import {
	analyzeTopic,
	createContentBrief,
	dismissLinkOpportunity,
	getContentGaps,
	getLinkOpportunities,
	getRelatedArticles,
	getTopicProfile,
	insertLinkOpportunity,
	suggestLinkOpportunities,
	ContentBrief,
	ContentGap,
	LinkOpportunity,
	RelatedArticle,
	TopicProfile,
} from '../api';

/** Spec calls for ~1000ms after typing stops. */
const BODY_DEBOUNCE_MS = 1000;
/** Below this, a content edit isn't "meaningful" enough to re-run analysis over. */
const MIN_CONTENT_CHANGE_CHARS = 20;

const stripHtml = ( html: string ) => html.replace( /<[^>]*>/g, ' ' ).replace( /\s+/g, ' ' ).trim();

interface TopicLinkingTabProps {
	// eslint-disable-next-line no-unused-vars
	onNavigate?: ( tab: string, target?: string ) => void;
}

/** Post Topic Profile - section 5 of the spec. Every field here is AI-inferred, never measured. */
function TopicProfileSection( { postId }: { postId: number } ) {
	const [ profile, setProfile ] = useState< TopicProfile | null >( null );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ isAnalyzing, setIsAnalyzing ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );

	useEffect( () => {
		getTopicProfile( postId )
			.then( setProfile )
			.catch( () => undefined )
			.finally( () => setIsLoading( false ) );
	}, [ postId ] );

	const runAnalysis = () => {
		setIsAnalyzing( true );
		setError( null );
		analyzeTopic( postId )
			.then( setProfile )
			.catch( ( e: Error ) => setError( e.message || __( 'Could not analyze this post - add more content and try again.', 'vulopilot' ) ) )
			.finally( () => setIsAnalyzing( false ) );
	};

	if ( isLoading ) {
		return <Spinner />;
	}

	return (
		<>
			<p className="small desc">
				{ __( 'AI-inferred from this post\'s own title and content - not measured data.', 'vulopilot' ) }
			</p>
			{ error && <div className="desc vulopilot-seo-checklist__error">{ error }</div> }
			<Button variant={ profile ? 'secondary' : 'primary' } onClick={ runAnalysis } disabled={ isAnalyzing }>
				{ isAnalyzing ? <Spinner /> : profile ? __( 'Refresh Analysis', 'vulopilot' ) : __( 'Analyze Topic', 'vulopilot' ) }
			</Button>

			{ profile && (
				<ul className="vulopilot-seo-checklist__list" style={ { marginTop: '8px' } }>
					<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Main topic', 'vulopilot' ) }:</strong> { profile.main_topic || '—' }</li>
					<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Search intent', 'vulopilot' ) }:</strong> { profile.search_intent || '—' }</li>
					<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Target audience', 'vulopilot' ) }:</strong> { profile.target_audience || '—' }</li>
					<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Topic cluster', 'vulopilot' ) }:</strong> { profile.topic_cluster || '—' }</li>
					<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Subtopics', 'vulopilot' ) }:</strong> { profile.subtopics.join( ', ' ) || '—' }</li>
					<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Entities', 'vulopilot' ) }:</strong> { profile.entities.join( ', ' ) || '—' }</li>
					{ profile.coverage_observations && (
						<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Coverage observations', 'vulopilot' ) }:</strong> { profile.coverage_observations }</li>
					) }
				</ul>
			) }
		</>
	);
}

/** Related Articles - section 6. Purely deterministic (real taxonomy overlap), no AI call. */
function RelatedArticlesSection( { postId }: { postId: number } ) {
	const [ articles, setArticles ] = useState< RelatedArticle[] >( [] );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ showAll, setShowAll ] = useState( false );

	useEffect( () => {
		getRelatedArticles( postId )
			.then( setArticles )
			.catch( () => undefined )
			.finally( () => setIsLoading( false ) );
	}, [ postId ] );

	if ( isLoading ) {
		return <Spinner />;
	}

	if ( articles.length === 0 ) {
		return <p className="small desc">{ __( 'No related articles found - this post has no shared category or tag with anything else yet.', 'vulopilot' ) }</p>;
	}

	const visible = showAll ? articles : articles.slice( 0, 5 );

	return (
		<ul className="vulopilot-seo-checklist__list">
			{ visible.map( ( article ) => (
				<li key={ article.post_id } className="vulopilot-seo-checklist__item">
					<span className="vulopilot-seo-checklist__message">
						<a href={ article.edit_link } target="_blank" rel="noreferrer"><strong>{ article.title }</strong></a>
						{ ` (${ article.post_type }, ${ article.status })` }
						<br />
						<em>{ sprintf( __( 'Shared: %s', 'vulopilot' ), article.shared_terms.join( ', ' ) || '—' ) }</em>
						{ article.has_existing_link && <em> · { __( 'already linked', 'vulopilot' ) }</em> }
					</span>
				</li>
			) ) }
			{ ! showAll && articles.length > 5 && (
				<li>
					<Button variant="link" onClick={ () => setShowAll( true ) }>
						{ sprintf( __( 'View all %d', 'vulopilot' ), articles.length ) }
					</Button>
				</li>
			) }
		</ul>
	);
}

/** Internal Link Opportunities - sections 7 & 8. AI proposes, a deterministic step applies. */
function LinkOpportunitiesSection( { postId }: { postId: number } ) {
	const [ opportunities, setOpportunities ] = useState< LinkOpportunity[] >( [] );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ isSuggesting, setIsSuggesting ] = useState( false );
	const [ busyIndex, setBusyIndex ] = useState< number | null >( null );
	const [ error, setError ] = useState< string | null >( null );

	useEffect( () => {
		getLinkOpportunities( postId )
			.then( setOpportunities )
			.catch( () => undefined )
			.finally( () => setIsLoading( false ) );
	}, [ postId ] );

	const runSuggest = () => {
		setIsSuggesting( true );
		setError( null );
		suggestLinkOpportunities( postId )
			.then( setOpportunities )
			.catch( ( e: Error ) => setError( e.message || __( 'Could not find link opportunities - try again.', 'vulopilot' ) ) )
			.finally( () => setIsSuggesting( false ) );
	};

	const insert = ( index: number ) => {
		setBusyIndex( index );
		setError( null );
		insertLinkOpportunity( postId, index )
			.then( setOpportunities )
			.catch( ( e: Error ) => {
				setError( e.message || __( 'This link needs manual review - the anchor text could not be safely located.', 'vulopilot' ) );
				getLinkOpportunities( postId ).then( setOpportunities );
			} )
			.finally( () => setBusyIndex( null ) );
	};

	const dismiss = ( index: number ) => {
		setBusyIndex( index );
		dismissLinkOpportunity( postId, index )
			.then( setOpportunities )
			.finally( () => setBusyIndex( null ) );
	};

	if ( isLoading ) {
		return <Spinner />;
	}

	const active = opportunities.filter( ( o ) => 'dismissed' !== o.status );

	return (
		<>
			{ error && <div className="desc vulopilot-seo-checklist__error">{ error }</div> }
			<Button variant={ active.length ? 'secondary' : 'primary' } onClick={ runSuggest } disabled={ isSuggesting }>
				{ isSuggesting ? <Spinner /> : __( 'Find Link Opportunities', 'vulopilot' ) }
			</Button>

			{ active.length > 0 && (
				<ul className="vulopilot-seo-checklist__list" style={ { marginTop: '8px' } }>
					{ opportunities.map( ( opportunity, index ) => {
						if ( 'dismissed' === opportunity.status ) {
							return null;
						}
						return (
							<li key={ index } className="vulopilot-seo-checklist__item">
								<span className="vulopilot-seo-checklist__message">
									<strong>{ opportunity.anchor_text }</strong>
									{ ` → ${ opportunity.destination_title }` }
									<br />
									<em>{ opportunity.reason }</em>
									<br />
									<span className={ `vulopilot-seo-checklist__summary vulopilot-seo-checklist__summary--${ 'applied' === opportunity.status ? 'good' : 'needs_review' === opportunity.status ? 'bad' : 'ok' }` }>
										{ opportunity.status }
									</span>
									{ opportunity.review_reason && <em> - { opportunity.review_reason }</em> }
									{ 'suggested' === opportunity.status && (
										<>
											{ ' ' }
											<Button variant="link" onClick={ () => insert( index ) } disabled={ busyIndex === index }>
												{ __( 'Insert Link', 'vulopilot' ) }
											</Button>
											{ ' · ' }
											<Button
												variant="link"
												href={ opportunity.destination_url }
												target="_blank"
												rel="noreferrer"
											>
												{ __( 'Review in Editor', 'vulopilot' ) }
											</Button>
											{ ' · ' }
											<Button variant="link" onClick={ () => dismiss( index ) } disabled={ busyIndex === index }>
												{ __( 'Dismiss', 'vulopilot' ) }
											</Button>
										</>
									) }
								</span>
							</li>
						);
					} ) }
				</ul>
			) }
		</>
	);
}

/**
 * Content Gaps & Topic Opportunities - section 9, now with the body-pause reanalysis workflow
 * (Phase 2/3 of the follow-up spec): watches the live (unsaved) body content, debounces ~1000ms
 * after a meaningful edit, and re-runs the same real, already-existing `ContentGapFinder` (no new
 * service, no AI call) plus a client-side text-coverage check against the stored topic profile's
 * own subtopics - "is this subtopic actually mentioned in the current text", not a guess.
 */
function ContentGapsSection( { postId, onBrief }: { postId: number; onBrief: ( title?: string, subtopic?: string ) => void } ) {
	const { content } = usePostData();
	const [ gaps, setGaps ] = useState< ContentGap[] >( [] );
	const [ needsAnalysis, setNeedsAnalysis ] = useState( false );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ status, setStatus ] = useState< 'idle' | 'pending' | 'analyzing' | 'ready' | 'error' >( 'idle' );
	const [ subtopics, setSubtopics ] = useState< string[] >( [] );
	const debounceRef = useRef< ReturnType< typeof setTimeout > | null >( null );
	const lastContentRef = useRef( content );
	const requestSeq = useRef( 0 );

	const refetch = () => {
		const seq = ++requestSeq.current;
		setStatus( 'analyzing' );

		Promise.all( [ getContentGaps( postId ), getTopicProfile( postId ) ] )
			.then( ( [ gapsResponse, profile ] ) => {
				if ( seq !== requestSeq.current ) {
					return; // A newer request already landed.
				}
				setGaps( gapsResponse.gaps );
				setNeedsAnalysis( gapsResponse.needs_topic_analysis );
				setSubtopics( profile?.subtopics ?? [] );
				setStatus( 'ready' );
			} )
			.catch( () => {
				if ( seq === requestSeq.current ) {
					setStatus( 'error' );
				}
			} )
			.finally( () => {
				if ( seq === requestSeq.current ) {
					setIsLoading( false );
				}
			} );
	};

	// Initial load.
	useEffect( refetch, [ postId ] );

	// Body-pause reanalysis - ignores insignificant changes (selection/cursor movement never
	// touches `content` at all; this only fires on an actual content-attribute edit), debounces,
	// and discards a stale response via `requestSeq`.
	useEffect( () => {
		const changeSize = Math.abs( content.length - lastContentRef.current.length );

		if ( changeSize < MIN_CONTENT_CHANGE_CHARS ) {
			return;
		}

		lastContentRef.current = content;
		setStatus( 'pending' );

		if ( debounceRef.current ) {
			clearTimeout( debounceRef.current );
		}
		debounceRef.current = setTimeout( refetch, BODY_DEBOUNCE_MS );

		return () => {
			if ( debounceRef.current ) {
				clearTimeout( debounceRef.current );
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ content ] );

	const plainText = stripHtml( content ).toLowerCase();
	const uncoveredSubtopics = subtopics.filter( ( s ) => '' !== s.trim() && ! plainText.includes( s.toLowerCase() ) );

	const STATUS_LABEL: Record< typeof status, string > = {
		idle: '',
		pending: __( 'Content updated · Analysis refresh needed', 'vulopilot' ),
		analyzing: __( 'Analyzing updated content…', 'vulopilot' ),
		ready: __( 'Analysis up to date', 'vulopilot' ),
		error: __( 'Unable to analyze', 'vulopilot' ),
	};

	if ( isLoading ) {
		return <Spinner />;
	}

	return (
		<>
			{ status && STATUS_LABEL[ status ] && (
				<p className="small desc">
					{ 'analyzing' === status && <Spinner /> }
					{ STATUS_LABEL[ status ] }
					{ 'error' === status && (
						<Button variant="link" onClick={ refetch }>{ __( 'Retry', 'vulopilot' ) }</Button>
					) }
				</p>
			) }

			{ uncoveredSubtopics.length > 0 && (
				<div className="desc vulopilot-seo-checklist__error" style={ { marginBottom: '8px' } }>
					{ __( 'Subtopics not yet mentioned in the current text:', 'vulopilot' ) } { uncoveredSubtopics.join( ', ' ) }
				</div>
			) }

			{ needsAnalysis ? (
				<p className="small desc">{ __( 'Run "Analyze Topic" above first - content gaps are found by comparing this post\'s subtopics against related articles.', 'vulopilot' ) }</p>
			) : gaps.length === 0 ? (
				<p className="small desc">{ __( 'No content gaps found against this post\'s related articles.', 'vulopilot' ) }</p>
			) : (
			<ul className="vulopilot-seo-checklist__list">
			{ gaps.map( ( gap, index ) => (
				<li key={ index } className="vulopilot-seo-checklist__item">
					<span className="vulopilot-seo-checklist__message">
						<strong>{ gap.subtopic }</strong>
						<br />
						<em>{ gap.reason }</em>
						<br />
						{ 'update_or_link' === gap.action && gap.related_post_title ? (
							<Button variant="link" onClick={ () => onBrief( undefined, gap.subtopic ) }>
								{ sprintf( __( 'Find Existing Article: %s', 'vulopilot' ), gap.related_post_title ) }
							</Button>
						) : (
							<>
								<Button variant="link" onClick={ () => onBrief( undefined, gap.subtopic ) }>
									{ __( 'Improve Current Post', 'vulopilot' ) }
								</Button>
								{ ' · ' }
								<Button variant="link" onClick={ () => onBrief( gap.subtopic, gap.subtopic ) }>
									{ __( 'Create Content Brief', 'vulopilot' ) }
								</Button>
							</>
						) }
					</span>
				</li>
			) ) }
			</ul>
			) }
		</>
	);
}

/** Content Brief - section 10. Pure assembly of already-gathered data; never auto-publishes. */
function ContentBriefSection( { postId, trigger }: { postId: number; trigger: { title?: string; subtopic?: string } | null } ) {
	const [ brief, setBrief ] = useState< ContentBrief | null >( null );
	const [ isLoading, setIsLoading ] = useState( false );

	useEffect( () => {
		if ( ! trigger ) {
			return;
		}
		setIsLoading( true );
		createContentBrief( postId, trigger.title, trigger.subtopic )
			.then( setBrief )
			.finally( () => setIsLoading( false ) );
	}, [ postId, trigger ] );

	if ( isLoading ) {
		return <Spinner />;
	}

	if ( ! brief ) {
		return (
			<>
				<p className="small desc">
					{ __( 'Use "Create Content Brief" from a Content Gaps suggestion above, or generate one for this post as-is.', 'vulopilot' ) }
				</p>
				<Button variant="primary" onClick={ () => createContentBrief( postId ).then( setBrief ) }>
					{ __( 'Generate Brief for This Post', 'vulopilot' ) }
				</Button>
			</>
		);
	}

	return (
		<ul className="vulopilot-seo-checklist__list">
			<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Proposed title', 'vulopilot' ) }:</strong> { brief.proposed_title || '—' }</li>
			<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Main topic', 'vulopilot' ) }:</strong> { brief.main_topic || '—' }</li>
			<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Primary keyword', 'vulopilot' ) }:</strong> { brief.primary_keyword || '—' }</li>
			<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Related keywords', 'vulopilot' ) }:</strong> { brief.related_keywords.join( ', ' ) || '—' }</li>
			<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Search intent', 'vulopilot' ) }:</strong> { brief.search_intent || '—' }</li>
			<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Suggested headings', 'vulopilot' ) }:</strong> { brief.suggested_headings.join( ', ' ) || '—' }</li>
			<li className="vulopilot-seo-checklist__item"><strong>{ __( 'Relevant entities', 'vulopilot' ) }:</strong> { brief.relevant_entities.join( ', ' ) || '—' }</li>
			<li className="vulopilot-seo-checklist__item">
				<strong>{ __( 'Relevant existing articles', 'vulopilot' ) }:</strong>
				{ brief.relevant_existing_articles.length
					? brief.relevant_existing_articles.map( ( a ) => a.title ).join( ', ' )
					: '—' }
			</li>
			{ ! brief.generated_from.topic_profile_available && (
				<li className="vulopilot-seo-checklist__item desc">{ __( 'Run "Analyze Topic" for a richer brief - this one was generated without it.', 'vulopilot' ) }</li>
			) }
		</ul>
	);
}

/**
 * Topic & Internal Linking - composes five real sub-features: the AI-derived Post Topic Profile,
 * deterministic Related Articles (real taxonomy overlap), AI-proposed + deterministically-applied
 * Internal Link Opportunities, a heuristic Content Gaps finder, and a Content Brief assembled
 * from whatever of the above has already been run. Pro-only.
 */
export default function TopicLinkingTab( _props: TopicLinkingTabProps ) {
	const { postId } = usePostData();
	const [ briefTrigger, setBriefTrigger ] = useState< { title?: string; subtopic?: string } | null >( null );

	if ( ! window.vulopilotPostSeo.isPro ) {
		return (
			<div className="vulopilot-seo-tab vulopilot-seo-tab--topic-linking">
				<p className="small desc">
					{ __( 'Understand this post\'s topic in context of your whole site, find related articles to link to, and close content gaps.', 'vulopilot' ) }
				</p>
				<Button variant="primary" href={ window.vulopilotPostSeo.shopUrl } target="_blank" rel="noreferrer">
					{ __( 'Upgrade to Pro to Unlock Topic & Internal Linking', 'vulopilot' ) }
				</Button>
			</div>
		);
	}

	if ( ! postId ) {
		return <Spinner />;
	}

	return (
		<div className="vulopilot-seo-tab vulopilot-seo-tab--topic-linking">
			<PanelBody title={ __( 'Post Topic Profile', 'vulopilot' ) } initialOpen={ true }>
				<TopicProfileSection postId={ postId } />
			</PanelBody>
			<PanelBody title={ __( 'Related Articles', 'vulopilot' ) } initialOpen={ false }>
				<RelatedArticlesSection postId={ postId } />
			</PanelBody>
			<PanelBody title={ __( 'Internal Link Opportunities', 'vulopilot' ) } initialOpen={ false }>
				<LinkOpportunitiesSection postId={ postId } />
			</PanelBody>
			<PanelBody title={ __( 'Content Gaps & Topic Opportunities', 'vulopilot' ) } initialOpen={ false }>
				<ContentGapsSection postId={ postId } onBrief={ ( title, subtopic ) => setBriefTrigger( { title, subtopic } ) } />
			</PanelBody>
			<PanelBody title={ __( 'Content Brief', 'vulopilot' ) } initialOpen={ false }>
				<ContentBriefSection postId={ postId } trigger={ briefTrigger } />
			</PanelBody>
		</div>
	);
}
