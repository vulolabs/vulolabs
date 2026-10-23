import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useRef, useState } from '@wordpress/element';
import { Button, PanelBody, Spinner, TextControl } from '@wordpress/components';
import { usePostData } from './usePostData';
import {
	assignKeyword,
	createKeyword,
	getKeywordAssignments,
	getKeywordSuggestions,
	searchKeywords,
	unassignKeyword,
	KeywordAssignment,
	KeywordAssignmentsResponse,
	KeywordRecord,
	KeywordSuggestion,
	KeywordSuggestionsResponse,
} from './api';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Picks a keyword (from a saved-keyword search, or by typing a brand-new phrase) and assigns it
 * to the current post in the given role. Used for both the Primary and Related pickers below -
 * same real `/keywords` search + `/keywords/post/{id}/assign` endpoints either way.
 */
function KeywordPicker( { postId, role, excludeIds, onAssigned }: {
	postId: number;
	role: 'primary' | 'related';
	excludeIds: number[];
	// eslint-disable-next-line no-unused-vars
	onAssigned: ( data: KeywordAssignmentsResponse ) => void;
} ) {
	const [ query, setQuery ] = useState( '' );
	const [ results, setResults ] = useState< KeywordRecord[] >( [] );
	const [ isSearching, setIsSearching ] = useState( false );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );
	const debounceRef = useRef< ReturnType< typeof setTimeout > | null >( null );

	useEffect( () => {
		if ( debounceRef.current ) {
			clearTimeout( debounceRef.current );
		}

		if ( '' === query.trim() ) {
			setResults( [] );
			return;
		}

		debounceRef.current = setTimeout( () => {
			setIsSearching( true );
			searchKeywords( query.trim() )
				.then( ( response ) => setResults( response.data.filter( ( k ) => ! excludeIds.includes( k.id ) ) ) )
				.catch( () => undefined )
				.finally( () => setIsSearching( false ) );
		}, SEARCH_DEBOUNCE_MS );

		return () => {
			if ( debounceRef.current ) {
				clearTimeout( debounceRef.current );
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ query ] );

	const assignExisting = ( keywordId: number ) => {
		setIsSaving( true );
		setError( null );
		assignKeyword( postId, { keyword_id: keywordId, role } )
			.then( ( data ) => {
				onAssigned( data );
				setQuery( '' );
				setResults( [] );
			} )
			.catch( () => setError( __( 'Could not assign this keyword - try again.', 'vulopilot' ) ) )
			.finally( () => setIsSaving( false ) );
	};

	const createAndAssign = () => {
		const phrase = query.trim();
		if ( '' === phrase ) {
			return;
		}

		setIsSaving( true );
		setError( null );
		createKeyword( { phrase } )
			.then( ( { keyword } ) => assignExisting( keyword.id ) )
			.catch( () => {
				setError( __( 'Could not save this keyword - try again.', 'vulopilot' ) );
				setIsSaving( false );
			} );
	};

	const exactMatch = results.find( ( k ) => k.phrase.toLowerCase() === query.trim().toLowerCase() );

	return (
		<div className="vulopilot-keyword-picker">
			<TextControl
				value={ query }
				onChange={ setQuery }
				placeholder={ 'primary' === role ? __( 'Search or add a primary keyword…', 'vulopilot' ) : __( 'Search or add a related keyword…', 'vulopilot' ) }
				disabled={ isSaving }
			/>

			{ error && <div className="desc vulopilot-seo-checklist__error">{ error }</div> }

			{ isSearching && <Spinner /> }

			{ ! isSearching && query.trim() !== '' && (
				<ul className="vulopilot-keyword-picker__results">
					{ results.map( ( keyword ) => (
						<li key={ keyword.id }>
							<Button variant="tertiary" onClick={ () => assignExisting( keyword.id ) } disabled={ isSaving }>
								{ keyword.phrase }
								{ keyword.priority_score !== null && ` (${ keyword.priority_score })` }
							</Button>
						</li>
					) ) }
					{ ! exactMatch && (
						<li>
							<Button variant="tertiary" onClick={ createAndAssign } disabled={ isSaving }>
								{ sprintf( __( 'Add "%s" as a new keyword', 'vulopilot' ), query.trim() ) }
							</Button>
						</li>
					) }
				</ul>
			) }
		</div>
	);
}

function KeywordChip( { assignment, postId, onChanged }: {
	assignment: KeywordAssignment;
	postId: number;
	// eslint-disable-next-line no-unused-vars
	onChanged: ( data: KeywordAssignmentsResponse ) => void;
} ) {
	const [ isRemoving, setIsRemoving ] = useState( false );

	const remove = () => {
		setIsRemoving( true );
		unassignKeyword( postId, assignment.keyword_id )
			.then( onChanged )
			.finally( () => setIsRemoving( false ) );
	};

	return (
		<span className="vulopilot-seo-keyword-pill">
			{ assignment.phrase }
			{ assignment.search_intent && <em> · { assignment.search_intent }</em> }
			<button
				type="button"
				className="vulopilot-seo-keyword-pill__remove"
				onClick={ remove }
				disabled={ isRemoving }
				aria-label={ __( 'Remove keyword', 'vulopilot' ) }
			>
				<i className="dashicons dashicons-no-alt" />
			</button>
		</span>
	);
}

/**
 * Real Keyword Management: assigns one primary + several related keywords (from the new
 * `vulopilot_keywords`/`vulopilot_keyword_assignments` tables) to the current post, flags when
 * another post already targets the same primary keyword, and surfaces AI keyword-research
 * suggestions (the existing `KeywordResearchAction`) the user can save straight into this store.
 * Pro-only - the backing REST routes 404 on free.
 */
export default function KeywordManagementSection() {
	const { postId } = usePostData();
	const [ data, setData ] = useState< KeywordAssignmentsResponse | null >( null );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ suggestions, setSuggestions ] = useState< KeywordSuggestionsResponse | null >( null );
	const [ isSuggesting, setIsSuggesting ] = useState( false );
	const [ dismissedPhrases, setDismissedPhrases ] = useState< string[] >( [] );
	const [ suggestError, setSuggestError ] = useState< string | null >( null );

	useEffect( () => {
		if ( ! postId || ! window.vulopilotPostSeo.isPro ) {
			setIsLoading( false );
			return;
		}

		getKeywordAssignments( postId )
			.then( setData )
			.catch( () => undefined )
			.finally( () => setIsLoading( false ) );
	}, [ postId ] );

	if ( ! window.vulopilotPostSeo.isPro ) {
		return (
			<PanelBody title={ __( 'Keyword Management', 'vulopilot' ) } initialOpen={ false }>
				<p className="small desc">
					{ __( 'Assign a primary keyword and related keywords to this post, and see whether another article already targets the same one.', 'vulopilot' ) }
				</p>
				<Button variant="primary" href={ window.vulopilotPostSeo.shopUrl } target="_blank" rel="noreferrer">
					{ __( 'Upgrade to Pro to Unlock Keyword Management', 'vulopilot' ) }
				</Button>
			</PanelBody>
		);
	}

	if ( ! postId || isLoading ) {
		return (
			<PanelBody title={ __( 'Keyword Management', 'vulopilot' ) } initialOpen={ false }>
				<Spinner />
			</PanelBody>
		);
	}

	const excludeIds = [
		...( data?.primary ? [ data.primary.keyword_id ] : [] ),
		...( data?.related.map( ( k ) => k.keyword_id ) ?? [] ),
	];

	const runSuggestions = () => {
		if ( ! postId ) {
			return;
		}
		setIsSuggesting( true );
		setSuggestError( null );
		getKeywordSuggestions( postId )
			.then( setSuggestions )
			.catch( () => setSuggestError( __( 'Could not generate suggestions - check your VuloCloud AI connection and try again.', 'vulopilot' ) ) )
			.finally( () => setIsSuggesting( false ) );
	};

	const assignSuggestion = ( suggestion: KeywordSuggestion, role: 'primary' | 'related' ) => {
		if ( ! postId ) {
			return;
		}
		( suggestion.keyword_id
			? assignKeyword( postId, { keyword_id: suggestion.keyword_id, role } )
			: assignKeyword( postId, { phrase: suggestion.phrase, role } )
		).then( setData );
	};

	const saveSuggestion = ( suggestion: KeywordSuggestion ) => {
		if ( suggestion.already_saved ) {
			return;
		}
		createKeyword( { phrase: suggestion.phrase } ).then( () => {
			setDismissedPhrases( ( prev ) => [ ...prev, suggestion.phrase ] );
		} );
	};

	const visibleSuggestions = ( suggestions?.suggestions ?? [] ).filter(
		( s: KeywordSuggestion ) => ! dismissedPhrases.includes( s.phrase )
	);

	return (
		<PanelBody title={ __( 'Keyword Management', 'vulopilot' ) } initialOpen={ false }>
			<p className="vulopilot-seo-section-label">{ __( 'Primary Keyword', 'vulopilot' ) }</p>
			{ data?.primary ? (
				<>
					<div className="vulopilot-seo-focus-keyword">
						<KeywordChip assignment={ data.primary } postId={ postId } onChanged={ setData } />
						{ data.primary.priority_score !== null && (
							<span className="small desc">{ sprintf( __( 'Priority: %d', 'vulopilot' ), data.primary.priority_score ) }</span>
						) }
					</div>
					{ data.primary.other_posts && data.primary.other_posts.length > 0 && (
						<div className="desc vulopilot-seo-checklist__error">
							{ __( 'Another post already targets this keyword. Review both articles before proceeding.', 'vulopilot' ) }
							<ul className="vulopilot-seo-checklist__list">
								{ data.primary.other_posts.map( ( other ) => (
									<li key={ other.post_id } className="vulopilot-seo-checklist__item">
										<a href={ other.edit_link } target="_blank" rel="noreferrer">
											{ other.title } ({ other.status })
										</a>
									</li>
								) ) }
							</ul>
						</div>
					) }
				</>
			) : (
				<KeywordPicker postId={ postId } role="primary" excludeIds={ excludeIds } onAssigned={ setData } />
			) }

			<p className="vulopilot-seo-section-label">{ __( 'Related Keywords', 'vulopilot' ) }</p>
			<div className="vulopilot-seo-focus-keyword">
				{ data?.related.map( ( assignment ) => (
					<KeywordChip key={ assignment.keyword_id } assignment={ assignment } postId={ postId } onChanged={ setData } />
				) ) }
			</div>
			<KeywordPicker postId={ postId } role="related" excludeIds={ excludeIds } onAssigned={ setData } />

			<p className="vulopilot-seo-section-label">{ __( 'Suggested Keywords', 'vulopilot' ) }</p>
			{ suggestError && <div className="desc vulopilot-seo-checklist__error">{ suggestError }</div> }
			<Button variant="secondary" onClick={ runSuggestions } disabled={ isSuggesting }>
				{ isSuggesting ? <Spinner /> : __( 'Suggest Keywords', 'vulopilot' ) }
			</Button>

			{ visibleSuggestions.length > 0 && (
				<ul className="vulopilot-seo-checklist__list" style={ { marginTop: '8px' } }>
					{ visibleSuggestions.map( ( suggestion: KeywordSuggestion ) => (
						<li key={ suggestion.phrase } className="vulopilot-seo-checklist__item">
							<span className="vulopilot-seo-checklist__message">
								<strong>{ suggestion.phrase }</strong>
								{ suggestion.used_by_others.length > 0 && (
									<em> { __( '(already targeted by another post)', 'vulopilot' ) }</em>
								) }
								<br />
								<Button variant="link" onClick={ () => assignSuggestion( suggestion, 'primary' ) }>
									{ __( 'Assign as Primary', 'vulopilot' ) }
								</Button>
								{ ' · ' }
								<Button variant="link" onClick={ () => assignSuggestion( suggestion, 'related' ) }>
									{ __( 'Add as Related', 'vulopilot' ) }
								</Button>
								{ ' · ' }
								<Button variant="link" onClick={ () => saveSuggestion( suggestion ) } disabled={ suggestion.already_saved }>
									{ __( 'Save', 'vulopilot' ) }
								</Button>
								{ ' · ' }
								<Button variant="link" onClick={ () => setDismissedPhrases( ( prev ) => [ ...prev, suggestion.phrase ] ) }>
									{ __( 'Dismiss', 'vulopilot' ) }
								</Button>
							</span>
						</li>
					) ) }
				</ul>
			) }

			{ suggestions && visibleSuggestions.length === 0 && (
				<p className="small desc">{ __( 'No remaining suggestions.', 'vulopilot' ) }</p>
			) }
		</PanelBody>
	);
}
