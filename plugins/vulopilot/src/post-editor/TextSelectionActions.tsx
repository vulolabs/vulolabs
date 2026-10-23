import { __ } from '@wordpress/i18n';
import { useState } from '@wordpress/element';
import { registerFormatType, insert, create, applyFormat } from '@wordpress/rich-text';
import { RichTextToolbarButton } from '@wordpress/block-editor';
import { Modal, Button, Spinner } from '@wordpress/components';
import { usePostData } from './usePostData';
import { requestTextAction, getRelatedArticles, TextActionResult, RelatedArticle } from './api';

/** Below this many selected characters there's nothing meaningful to act on. */
const MIN_SELECTION_LENGTH = 3;
/** How much surrounding text (each side) is sent as context - never the whole article. */
const CONTEXT_LENGTH = 400;

type AiMode = TextActionResult[ 'mode' ];
type ActiveMode = AiMode | 'find_internal_link' | null;

const MODE_CONFIG: Record< AiMode, { label: string; icon: string } > = {
	improve: { label: __( 'Improve Selection', 'vulopilot' ), icon: 'edit' },
	expand: { label: __( 'Expand Section', 'vulopilot' ), icon: 'plus-alt' },
	keywords: { label: __( 'Suggest Keywords', 'vulopilot' ), icon: 'tag' },
	explain: { label: __( 'Explain Missing Context', 'vulopilot' ), icon: 'info' },
};

/**
 * The format's `edit` component - rendered by Gutenberg inside the native inline format toolbar
 * (the same popup that shows Bold/Italic) whenever a RichText field is focused. This format is
 * never actually applied to text (no `toggleFormat` call anywhere) - it exists purely to get a
 * toolbar slot at the exact point of a real text selection, the "closest supported WordPress
 * editor extension point" for this, per the spec. Returns null (no buttons at all) unless there's
 * a genuine, non-trivial selection, so it never appears for a bare cursor position.
 */
function TextActionsEdit( { value, onChange }: any ) {
	const { postId } = usePostData();
	const [ activeMode, setActiveMode ] = useState< ActiveMode >( null );
	const [ result, setResult ] = useState< TextActionResult | null >( null );
	const [ isLoading, setIsLoading ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );
	const [ linkCandidates, setLinkCandidates ] = useState< RelatedArticle[] | null >( null );

	const hasSelection = 'number' === typeof value.start && 'number' === typeof value.end && value.end - value.start >= MIN_SELECTION_LENGTH;

	if ( ! postId || ! window.vulopilotPostSeo.isPro || ! hasSelection ) {
		return null;
	}

	const selectedText: string = value.text.slice( value.start, value.end );
	const contextBefore: string = value.text.slice( Math.max( 0, value.start - CONTEXT_LENGTH ), value.start );
	const contextAfter: string = value.text.slice( value.end, value.end + CONTEXT_LENGTH );

	const closeModal = () => {
		setActiveMode( null );
		setResult( null );
		setLinkCandidates( null );
		setError( null );
	};

	const runAiMode = ( mode: AiMode ) => {
		setActiveMode( mode );
		setResult( null );
		setError( null );
		setIsLoading( true );
		requestTextAction( postId, mode, selectedText, contextBefore, contextAfter )
			.then( setResult )
			.catch( () => setError( __( 'Could not run this action - try again.', 'vulopilot' ) ) )
			.finally( () => setIsLoading( false ) );
	};

	/** Deterministic - reuses `RelatedPostFinder` (real taxonomy overlap), never invents a destination. */
	const findInternalLink = () => {
		setActiveMode( 'find_internal_link' );
		setLinkCandidates( null );
		setError( null );
		setIsLoading( true );
		getRelatedArticles( postId )
			.then( ( articles ) => {
				const words = selectedText.toLowerCase().split( /\s+/ ).filter( ( w ) => w.length > 3 );
				const matches = articles.filter(
					( a ) => words.some( ( w ) => a.title.toLowerCase().includes( w ) ) || a.shared_terms.some( ( t ) => words.includes( t.toLowerCase() ) )
				);
				setLinkCandidates( ( matches.length ? matches : articles ).slice( 0, 5 ) );
			} )
			.catch( () => setError( __( 'Could not load related articles.', 'vulopilot' ) ) )
			.finally( () => setIsLoading( false ) );
	};

	/** Applies through RichText's own `insert()` + the field's `onChange` - standard editor data flow, so it's a normal, undoable edit. */
	const applyChange = () => {
		if ( ! result?.proposed_text ) {
			return;
		}
		const newValue = insert( value, create( { text: result.proposed_text } ), value.start, value.end );
		onChange( newValue );
		closeModal();
	};

	/** Wraps the exact original selection in a real link - never a placeholder/nonexistent URL. */
	const insertLink = ( article: RelatedArticle ) => {
		if ( ! article.permalink ) {
			return;
		}
		const newValue = applyFormat(
			value,
			{ type: 'core/link', attributes: { url: article.permalink } },
			value.start,
			value.end
		);
		onChange( newValue );
		closeModal();
	};

	return (
		<>
			{ ( Object.keys( MODE_CONFIG ) as AiMode[] ).map( ( mode ) => (
				<RichTextToolbarButton
					key={ mode }
					icon={ MODE_CONFIG[ mode ].icon }
					title={ MODE_CONFIG[ mode ].label }
					onClick={ () => runAiMode( mode ) }
				/>
			) ) }
			<RichTextToolbarButton icon="admin-links" title={ __( 'Find Internal Link', 'vulopilot' ) } onClick={ findInternalLink } />

			{ activeMode && (
				<Modal
					title={ 'find_internal_link' === activeMode ? __( 'Find Internal Link', 'vulopilot' ) : MODE_CONFIG[ activeMode ].label }
					onRequestClose={ closeModal }
					className="vulopilot-text-action-modal"
				>
					{ isLoading && <Spinner /> }
					{ error && <p className="desc vulopilot-seo-checklist__error">{ error }</p> }

					{ 'find_internal_link' === activeMode && linkCandidates && (
						linkCandidates.length === 0 ? (
							<p className="small desc">{ __( 'No related existing articles found for this selection.', 'vulopilot' ) }</p>
						) : (
							<ul className="vulopilot-seo-checklist__list">
								{ linkCandidates.map( ( article ) => (
									<li key={ article.post_id } className="vulopilot-seo-checklist__item">
										<span className="vulopilot-seo-checklist__message">
											<strong>{ article.title }</strong> ({ article.status })
											<br />
											<em>{ article.permalink ?? article.edit_link }</em>
											<br />
											{ article.has_existing_link && <em>{ __( 'Already linked from this post.', 'vulopilot' ) } </em> }
											<Button variant="link" onClick={ () => insertLink( article ) } disabled={ ! article.permalink }>
												{ __( 'Insert Link', 'vulopilot' ) }
											</Button>
											{ ' · ' }
											<Button variant="link" href={ article.edit_link } target="_blank" rel="noreferrer">
												{ __( 'Open Article', 'vulopilot' ) }
											</Button>
										</span>
									</li>
								) ) }
							</ul>
						)
					) }

					{ result && (
						<>
							<p className="vulopilot-seo-section-label">{ __( 'Original', 'vulopilot' ) }</p>
							<p className="small desc">{ result.selected_text }</p>

							{ result.proposed_text && (
								<>
									<p className="vulopilot-seo-section-label">{ __( 'Proposed', 'vulopilot' ) }</p>
									<p>{ result.proposed_text }</p>
								</>
							) }

							{ result.explanation && (
								<>
									<p className="vulopilot-seo-section-label">{ __( 'Why', 'vulopilot' ) }</p>
									<p className="small desc">{ result.explanation }</p>
								</>
							) }

							{ result.suggested_keywords.length > 0 && (
								<>
									<p className="vulopilot-seo-section-label">{ __( 'Suggested keywords', 'vulopilot' ) }</p>
									<ul className="vulopilot-seo-checklist__list">
										{ result.suggested_keywords.map( ( k ) => (
											<li key={ k } className="vulopilot-seo-checklist__item">{ k }</li>
										) ) }
									</ul>
								</>
							) }

							<div style={ { display: 'flex', gap: '8px', marginTop: '12px' } }>
								{ result.proposed_text && (
									<Button variant="primary" onClick={ applyChange }>{ __( 'Apply Change', 'vulopilot' ) }</Button>
								) }
								<Button variant="secondary" onClick={ () => runAiMode( activeMode as AiMode ) }>
									{ __( 'Regenerate', 'vulopilot' ) }
								</Button>
								<Button variant="tertiary" onClick={ closeModal }>{ __( 'Cancel', 'vulopilot' ) }</Button>
							</div>
						</>
					) }
				</Modal>
			) }
		</>
	);
}

/**
 * Registers once at module load. Safe to import for side effects only - see `post-editor/index.tsx`.
 */
export function registerTextSelectionActions() {
	registerFormatType( 'vulopilot/text-actions', {
		title: __( 'VuloPilot AI', 'vulopilot' ),
		tagName: 'span',
		className: 'vulopilot-text-actions-noop',
		edit: TextActionsEdit,
	} );
}
