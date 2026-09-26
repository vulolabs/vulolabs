import { __ } from '@wordpress/i18n';
import { Button, TextControl, TextareaControl, ToggleControl } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { usePostData } from '../usePostData';
import SnippetPreview from '../SnippetPreview';
import { useFieldHighlight } from '../useFieldHighlight';

interface GeneralTabProps {
	/** "All SEO Issues" table's "Fix with AI" deep link - currently only ever resolves to 'canonical_url' on this tab (see seoIssueEditorTarget.ts). */
	highlightTarget?: string;
	/** `PostSeoPanel.tsx`'s own in-sidebar tab switch - accepted for prop-shape parity with every other tab, unused here. */
	onNavigate?: ( tab: string, target?: string ) => void;
}

/**
 * The metabox's General tab - focus keyword, SEO title (native
 * `post_title`), meta description (native `post_excerpt`), a live snippet
 * preview, and the per-post robots/canonical settings: a canonical URL
 * override (Services\CanonicalUrlManager::maybe_override_canonical(), which
 * filters WP core's own `get_canonical_url` directly, so it takes effect
 * regardless of the sitewide "Add canonical URL tags" setting) and
 * noindex/nofollow (Services\PostRobotsMetaManager's `wp_robots` filter).
 * The live checklist (Services\OnPageAnalyzer) is on the Page Analysis tab,
 * next to the saved-page checks it complements.
 *
 * Preview sits first with title/description tucked behind an "Edit
 * Snippet" toggle; Focus Keyword is a single removable pill, not a
 * multi-keyword field - Services\OnPageAnalyzer only ever grades ONE
 * `_vulopilot_focus_keyword` string end to end, and there's no
 * pillar-content concept in this codebase, so a multi-pill input or a
 * "Pillar Content" checkbox would have nothing real backing it, doing
 * nothing.
 */
export default function GeneralTab( { highlightTarget }: GeneralTabProps ) {
	const { title, excerpt, slug, meta, setTitle, setExcerpt, setMeta } = usePostData();
	const { metaKeys } = window.vulopilotPostSeo;
	const canonicalUrl = ( meta[ metaKeys.canonical_url ] as string ) || '';
	const noindex = Boolean( meta[ metaKeys.robots_noindex ] );
	const nofollow = Boolean( meta[ metaKeys.robots_nofollow ] );
	const isCanonicalHighlighted = useFieldHighlight( highlightTarget, 'canonical_url' );
	const focusKeyword = ( meta[ window.vulopilotPostSeo.metaKeys.focus_keyword ] as string ) || '';

	const [ isEditingSnippet, setIsEditingSnippet ] = useState( false );
	const [ isAddingKeyword, setIsAddingKeyword ] = useState( false );
	const [ keywordDraft, setKeywordDraft ] = useState( '' );

	const startAddingKeyword = () => {
		setKeywordDraft( '' );
		setIsAddingKeyword( true );
	};

	const commitKeywordDraft = () => {
		const value = keywordDraft.trim();

		if ( value ) {
			setMeta( { [ window.vulopilotPostSeo.metaKeys.focus_keyword ]: value } );
		}

		setIsAddingKeyword( false );
	};

	const removeKeyword = () =>
		setMeta( { [ window.vulopilotPostSeo.metaKeys.focus_keyword ]: '' } );

	return (
		<div className="vulopilot-seo-tab vulopilot-seo-tab--general">
			<div className="vulopilot-seo-section-label">{ __( 'Preview', 'vulopilot' ) }</div>

			<SnippetPreview
				title={ title }
				description={ excerpt }
				url={ window.location.origin + '/' + slug }
				siteName={ document.title.split( '‹' ).pop()?.trim() || '' }
			/>

			<Button
				variant="secondary"
				size="small"
				className="vulopilot-seo-edit-snippet-toggle"
				onClick={ () => setIsEditingSnippet( ( open ) => ! open ) }
				aria-expanded={ isEditingSnippet }
			>
				{ isEditingSnippet
					? __( 'Close Snippet Editor', 'vulopilot' )
					: __( 'Edit Snippet', 'vulopilot' ) }
			</Button>

			{ isEditingSnippet && (
				<div className="vulopilot-seo-snippet-editor">
					<TextControl
						label={ __( 'SEO Title', 'vulopilot' ) }
						help={ __( 'This is the page title - shown in search results and used as the page heading.', 'vulopilot' ) + ` (${ title.length }/60)` }
						value={ title }
						onChange={ setTitle }
					/>

					<TextareaControl
						label={ __( 'Meta Description', 'vulopilot' ) }
						help={ __( 'Shown as the description snippet in search results.', 'vulopilot' ) + ` (${ excerpt.length }/160)` }
						value={ excerpt }
						onChange={ setExcerpt }
						rows={ 3 }
					/>
				</div>
			) }

			<div className="vulopilot-seo-section-label">{ __( 'Focus Keyword', 'vulopilot' ) }</div>
			<p className="small desc vulopilot-seo-focus-keyword-help">
				{ __( 'The main term you want this page to rank for - drives the checks on the Page Analysis tab.', 'vulopilot' ) }
			</p>

			<div className="vulopilot-seo-focus-keyword">
				{ focusKeyword && (
					<span className="vulopilot-seo-keyword-pill">
						<i className="dashicons dashicons-star-filled" />
						{ focusKeyword }
						<button
							type="button"
							className="vulopilot-seo-keyword-pill__remove"
							aria-label={ __( 'Remove focus keyword', 'vulopilot' ) }
							onClick={ removeKeyword }
						>
							<i className="dashicons dashicons-no-alt" />
						</button>
					</span>
				) }

				{ ! focusKeyword && isAddingKeyword && (
					<TextControl
						autoFocus
						value={ keywordDraft }
						placeholder={ __( 'Add a focus keyword…', 'vulopilot' ) }
						onChange={ setKeywordDraft }
						onKeyDown={ ( event ) => {
							if ( 'Enter' === event.key ) {
								event.preventDefault();
								commitKeywordDraft();
							}

							if ( 'Escape' === event.key ) {
								setIsAddingKeyword( false );
							}
						} }
						onBlur={ commitKeywordDraft }
					/>
				) }

				{ ! focusKeyword && ! isAddingKeyword && (
					<Button variant="tertiary" size="small" icon="plus-alt2" onClick={ startAddingKeyword }>
						{ __( 'Add Focus Keyword', 'vulopilot' ) }
					</Button>
				) }
			</div>

			<div className="vulopilot-seo-section-label">{ __( 'Robots & Canonical', 'vulopilot' ) }</div>

			<div
				id="vulopilot-seo-field-canonical_url"
				className={ isCanonicalHighlighted ? 'vulopilot-seo-highlight-pulse' : undefined }
			>
				<TextControl
					label={ __( 'Canonical URL', 'vulopilot' ) }
					help={ __( 'Leave empty to use this page\'s own permalink (the default WordPress already uses).', 'vulopilot' ) }
					placeholder={ window.location.origin + '/' + slug }
					value={ canonicalUrl }
					onChange={ ( value ) => setMeta( { [ metaKeys.canonical_url ]: value } ) }
				/>
			</div>

			<ToggleControl
				label={ __( 'No Index', 'vulopilot' ) }
				help={ __( 'Tell search engines not to show this page in search results.', 'vulopilot' ) }
				checked={ noindex }
				onChange={ ( value ) => setMeta( { [ metaKeys.robots_noindex ]: value } ) }
			/>

			<ToggleControl
				label={ __( 'No Follow', 'vulopilot' ) }
				help={ __( 'Tell search engines not to follow links on this page.', 'vulopilot' ) }
				checked={ nofollow }
				onChange={ ( value ) => setMeta( { [ metaKeys.robots_nofollow ]: value } ) }
			/>
		</div>
	);
}
