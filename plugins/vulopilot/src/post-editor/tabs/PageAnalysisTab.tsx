import { __ } from '@wordpress/i18n';
import { Button, Spinner } from '@wordpress/components';
import { useEffect, useRef, useState } from '@wordpress/element';
import { dispatch, select } from '@wordpress/data';
import { parse } from '@wordpress/blocks';
import { usePostData } from '../usePostData';
import { analyzePage, analyzePost, AnalysisResult, FixResponse, fetchOpenFindings, fixFinding, fixWithAi, PageAnalysisCheck, PageAnalysisResponse, RawFinding } from '../api';
import { SEO_ISSUE_EDITOR_TARGETS, SeoIssueEditorTab, SeoIssueEditorTarget } from '../../services/seoIssueEditorTarget';

interface PageAnalysisTabProps {
	/** Either of 2 real deep-link vocabularies this tab now understands: `GEO/PageAnalysisPanel.tsx`'s own SEO check `key` (e.g. 'broken_links', `PAGE_ANALYSIS_CHECK_QUERY_PARAM`), or a GEO/AEO finding's own real numeric id as a string (`GeoAeoPageAnalysisPanel.tsx`/`SeoIssuesByPageTable.tsx`, `FINDING_ID_QUERY_PARAM`) - resolved against whichever of `data.checks`/`geoFindings`/`aeoFindings` actually contains a match, then scrolled to and pulse-highlighted once that section's own fetch has loaded. */
	highlightTarget?: string;
	/** `PostSeoPanel.tsx`'s own in-sidebar tab switch - lets a row here jump straight to the real General/Social/Schema field that fixes it, instead of only scrolling within this same tab. */
	onNavigate?: ( tab: SeoIssueEditorTab, target?: string ) => void;
}

/**
 * This tab's own check `key`s (`Controllers\Seo::get_page_analysis()`) →
 * the scanner id `SEO_ISSUE_EDITOR_TARGETS` already understands - the same
 * translation `GEO/PageAnalysisPanel.tsx`'s own `CHECK_KEY_TO_SCANNER_ID`
 * already establishes for its "Edit"/"Fix with AI" row actions, duplicated
 * here per this codebase's own "duplicate small per-file logic" convention
 * rather than exporting that file's own local map. `h1_heading` has no
 * dedicated scanner of its own but maps onto the closest real equivalent
 * scanner's own editor target. `featured_image`/
 * `broken_links`/`orphan_page`/`indexability` have no real editor-sidebar
 * field anywhere in this codebase (confirmed - same gap
 * `SEO_ISSUE_EDITOR_TARGETS`'s own docblock lists) - omitted on purpose,
 * so those rows simply aren't clickable rather than pretending to jump
 * somewhere that doesn't exist.
 */
const CHECK_KEY_TO_SCANNER_ID: Record< string, string > = {
	h1_heading: 'heading-structure',
	canonical: 'canonical-url',
	structured_data: 'structured-data',
	social_metadata: 'open-graph',
};

/**
 * Saved-page checks the live checklist above them already covers, so they
 * are left out of the "SEO Issues" list rather than shown twice: title,
 * meta description, content length, subheadings and image alt text are all
 * graded by OnPageAnalyzer's live checks (`title_length`,
 * `description_length`, `content_length`, `has_subheadings`, `image_alt`).
 */
const CHECKS_COVERED_BY_LIVE_CHECKLIST = [ 'title_tag', 'meta_description', 'content', 'headings', 'images' ];

/** Saved-page checks with a real AI action behind them (`PostSeoFixRest::ACTION_ALLOWLIST`) - the other saved checks (H1, Featured Image, Broken Links, Orphan Page, Canonical, Indexability, Social Metadata) have no AI fix, so their rows carry no button rather than a fake one. */
const CHECK_KEY_TO_FIX_ACTION: Record< string, string > = {
	structured_data: 'generate-schema',
};

/** GEO/AEO scanners `ScannerFixMap` maps to an AI action - `POST /findings/{id}/fix` resolves the fix from the finding's own scanner. Others (llms.txt, stale content, AEO schema) have no AI fix, so no button. */
const FIXABLE_FINDING_SCANNER_IDS = [
	'geo-faq-opportunity',
	'geo-summary-block',
	'geo-author-info',
	'geo-eeat-signals',
	'geo-trust-signals',
	'geo-citation-opportunities',
	'geo-chunking',
	'geo-semantic-structure',
	'geo-entity-naming-consistency',
];

const editorTargetForCheck = ( checkKey: string ): SeoIssueEditorTarget | null => {
	const scannerId = CHECK_KEY_TO_SCANNER_ID[ checkKey ];

	return scannerId ? SEO_ISSUE_EDITOR_TARGETS[ scannerId ] ?? null : null;
};

/**
 * This tab's own local copy of GeoTab.tsx's/AeoTab.tsx's real scanner-id
 * unions (`GEO_SECTIONS`/`AEO_SECTIONS`) - duplicated rather than imported
 * for the same reason `CHECK_KEY_TO_SCANNER_ID` above is local: those are
 * big dashboard-page files with their own heavy zyra-based imports, and
 * this tab lives in the separate, small post-editor webpack entry (see
 * `../api.ts`'s own top docblock). Each scanner belongs to exactly one of
 * the two sets, matching GeoTab.tsx/AeoTab.tsx's own split: AEO owns the
 * answer-shaped checks (FAQ, AI summary block, FAQ/HowTo schema), GEO owns
 * citation, structure and the remaining authority/freshness signals.
 */
const GEO_SCANNER_IDS = [
	'geo-citation-opportunities',
	'geo-chunking',
	'geo-semantic-structure',
	'geo-author-info',
	'geo-eeat-signals',
	'geo-entity-naming-consistency',
	'geo-trust-signals',
	'llms-txt-missing',
	'stale-content',
];

const AEO_SCANNER_IDS = [
	'geo-faq-opportunity',
	'geo-summary-block',
	'aeo-schema',
];

/** A finding's own `scanner_id` already IS the id `SEO_ISSUE_EDITOR_TARGETS` is keyed by - no `key`-to-scanner-id translation needed here the way `editorTargetForCheck()` above needs one for Page Analysis's own different check-key vocabulary. */
const editorTargetForFinding = ( finding: RawFinding ): SeoIssueEditorTarget | null =>
	SEO_ISSUE_EDITOR_TARGETS[ finding.scanner_id ] ?? null;

const STATUS_ICON: Record< PageAnalysisCheck[ 'status' ], string > = {
	pass: 'yes-alt',
	warn: 'warning',
	fail: 'dismiss',
};

/** `PageAnalysisCheck['status']` → this bundle's own `vulopilot-seo-checklist__item--{modifier}` CSS already ships (`--pass`/`--warning`/`--fail`) - 'warn' (this endpoint's own naming) reuses the existing '--warning' rule rather than adding a near-duplicate one. */
const STATUS_MODIFIER: Record< PageAnalysisCheck[ 'status' ], string > = {
	pass: 'pass',
	warn: 'warning',
	fail: 'fail',
};

/** GEO/AEO findings have no "pass" state (a finding only ever exists for a real open problem - same real gap `GeoAeoPageAnalysisPanel.tsx`'s own docblock documents) - folded onto the same 3-icon/3-color scheme SEO's own checks already use, critical/high reading as the same real "fail" a SEO check would, medium/low/info as "warn". */
const SEVERITY_TO_STATUS: Record< RawFinding[ 'severity' ], PageAnalysisCheck[ 'status' ] > = {
	critical: 'fail',
	high: 'fail',
	medium: 'warn',
	low: 'warn',
	info: 'warn',
};

/** What "Fix with AI" runs for a row: an AI action on this post, or the fix for one finding. */
type RowFix = { kind: 'post'; actionId: string } | { kind: 'finding'; findingId: number };

/** One shared row shape the live checks, the saved SEO checks and GEO's/AEO's open findings all resolve into, so every section shares one render path. */
interface IssueRow {
	id: string;
	/** DOM id, when it differs from `${idPrefix}-${id}` (live checks keep the id the deep links target). */
	domId?: string;
	status: PageAnalysisCheck[ 'status' ];
	label: string;
	message: string;
	target: SeoIssueEditorTarget | null;
	fix?: RowFix;
}

const rowFromCheck = ( check: PageAnalysisCheck ): IssueRow => {
	const actionId = CHECK_KEY_TO_FIX_ACTION[ check.key ];

	return {
		id: check.key,
		status: check.status,
		label: check.label,
		message: check.message,
		target: editorTargetForCheck( check.key ),
		fix: actionId && 'pass' !== check.status ? { kind: 'post', actionId } : undefined,
	};
};

const LIVE_STATUS: Record< AnalysisResult[ 'status' ], PageAnalysisCheck[ 'status' ] > = {
	pass: 'pass',
	warning: 'warn',
	fail: 'fail',
};

const rowFromLive = ( result: AnalysisResult ): IssueRow => ( {
	id: result.id,
	domId: `vulopilot-seo-check-${ result.id }`,
	status: LIVE_STATUS[ result.status ],
	label: '',
	message: result.message,
	target: null,
	fix: result.fixable && result.action_id && 'pass' !== result.status ? { kind: 'post', actionId: result.action_id } : undefined,
} );

const rowFromFinding = ( finding: RawFinding ): IssueRow => ( {
	id: String( finding.id ),
	status: SEVERITY_TO_STATUS[ finding.severity ],
	label: finding.title,
	message: '',
	target: editorTargetForFinding( finding ),
	fix: FIXABLE_FINDING_SCANNER_IDS.includes( finding.scanner_id ) ? { kind: 'finding', findingId: finding.id } : undefined,
} );

/** Live checks about the post body itself - shown in their own "Content" section. Their fixes rewrite the post's content, so a successful one is loaded into the open editor (see `applyContentToEditor`). */
const CONTENT_CHECK_IDS = [ 'content_length', 'has_subheadings', 'has_links', 'image_alt', 'keyword_in_content', 'keyword_in_first_paragraph' ];

/** AI actions that rewrite `post_content` (`PostSeoFixRest::CONTENT_MUTATING_ACTIONS`). */
const CONTENT_MUTATING_ACTIONS = [ 'improve-readability', 'add-subheadings', 'expand-content', 'suggest-internal-links' ];

/**
 * Loads content the server just saved into the open block editor. Any
 * unsaved editor changes are saved first (by `handleFix`), so what is
 * replaced here is exactly what the server started from; the reset goes
 * through the editor's own action, so it can be undone like any edit.
 */
const applyContentToEditor = ( content: string ) => {
	( dispatch( 'core/editor' ) as any ).resetEditorBlocks( parse( content ) );
};

const notify = ( message: string, status: 'success' | 'error' = 'success' ) => {
	( dispatch( 'core/notices' ) as any ).createNotice( status, message, { type: 'snackbar', isDismissible: true } );
};

const STATUS_ORDER: Record< PageAnalysisCheck[ 'status' ], number > = { fail: 0, warn: 1, pass: 2 };

interface FixControls {
	isPro: boolean;
	shopUrl: string;
	fixingId: string | null;
	onFix: ( row: IssueRow ) => void;
}

interface IssueListProps {
	idPrefix: string;
	rows: IssueRow[];
	pulsingId: string | null;
	onNavigate?: ( tab: SeoIssueEditorTab, target?: string ) => void;
	fixControls: FixControls;
}

/** Renders one section's own real row list - the exact same clickable-row markup/behavior this tab's SEO section already had, now shared by GEO's/AEO's own sections below it too. */
function IssueList( { idPrefix, rows, pulsingId, onNavigate, fixControls }: IssueListProps ) {
	return (
		<ul className="vulopilot-seo-checklist__list">
			{ rows.map( ( row ) => {
				// Real "go fix this" destination - resolves to null (row stays
				// inert) whenever this row's own scanner/check has no real
				// editor-sidebar field anywhere in this codebase.
				const isClickable = Boolean( row.target && onNavigate );

				return (
					<li
						key={ row.id }
						id={ row.domId ?? `${ idPrefix }-${ row.id }` }
						className={ `vulopilot-seo-checklist__item vulopilot-seo-checklist__item--${ STATUS_MODIFIER[ row.status ] }${ pulsingId === row.id ? ' vulopilot-seo-highlight-pulse' : '' }${ isClickable ? ' vulopilot-seo-checklist__item--clickable' : '' }` }
						role={ isClickable ? 'button' : undefined }
						tabIndex={ isClickable ? 0 : undefined }
						onClick={
							isClickable
								? () => onNavigate?.( ( row.target as SeoIssueEditorTarget ).tab, ( row.target as SeoIssueEditorTarget ).target )
								: undefined
						}
						onKeyDown={
							isClickable
								? ( event ) => {
										if ( 'Enter' === event.key || ' ' === event.key ) {
											event.preventDefault();
											onNavigate?.( ( row.target as SeoIssueEditorTarget ).tab, ( row.target as SeoIssueEditorTarget ).target );
										}
									}
								: undefined
						}
					>
						<i className={ `dashicons dashicons-${ STATUS_ICON[ row.status ] } vulopilot-seo-checklist__icon` } />
						<span className="vulopilot-seo-checklist__message">
							{ row.label && <strong>{ row.label }</strong> }
							{ row.label && row.message && ' - ' }
							{ row.message }
						</span>
						{ row.fix && (
							fixControls.isPro ? (
								<Button
									variant="secondary"
									size="small"
									isBusy={ fixControls.fixingId === row.id }
									disabled={ null !== fixControls.fixingId }
									onClick={ ( event: { stopPropagation: () => void } ) => {
										event.stopPropagation();
										fixControls.onFix( row );
									} }
								>
									{ fixControls.fixingId === row.id ? <Spinner /> : __( 'Fix with AI', 'vulopilot' ) }
								</Button>
							) : (
								<Button variant="tertiary" size="small" href={ fixControls.shopUrl } target="_blank" rel="noreferrer">
									{ __( 'Upgrade to fix', 'vulopilot' ) }
								</Button>
							)
						) }
						{ isClickable && ! row.fix && (
							<i className="dashicons dashicons-arrow-right-alt2 vulopilot-seo-checklist__arrow" />
						) }
					</li>
				);
			} ) }
		</ul>
	);
}

interface IssueSectionProps {
	heading: string;
	idPrefix: string;
	rows: IssueRow[];
	isLoading: boolean;
	error: string | null;
	emptyMessage: string;
	pulsingId: string | null;
	onNavigate?: ( tab: SeoIssueEditorTab, target?: string ) => void;
	fixControls: FixControls;
	/** Worst status across `rows` - drives the header's summary pill (same look the old General-tab groups had). */
	showSummary?: boolean;
}

/** One headed section (SEO / GEO Issues / AEO Issues) - a real heading using this bundle's own existing `vulopilot-seo-checklist__header`/`__title` look (already shipped in style.scss), then that section's own real row list, loading state, error, or "nothing open" message. */
function IssueSection( { heading, idPrefix, rows, isLoading, error, emptyMessage, pulsingId, onNavigate, fixControls, showSummary }: IssueSectionProps ) {
	const summary = rows.some( ( row ) => 'fail' === row.status ) ? 'bad' : rows.some( ( row ) => 'warn' === row.status ) ? 'ok' : 'good';
	const summaryLabel = { good: __( 'All Good', 'vulopilot' ), ok: __( 'Could Be Better', 'vulopilot' ), bad: __( 'Needs Improvement', 'vulopilot' ) }[ summary ];

	return (
		<div className="vulopilot-seo-checklist">
			<div className="vulopilot-seo-checklist__header">
				<span className="title vulopilot-seo-checklist__title">{ heading }</span>
				{ showSummary && rows.length > 0 && (
					<span className={ `vulopilot-seo-checklist__summary vulopilot-seo-checklist__summary--${ summary }` }>{ summaryLabel }</span>
				) }
			</div>
			{ isLoading ? (
				<div className="desc vulopilot-seo-checklist__error">{ __( 'Loading…', 'vulopilot' ) }</div>
			) : error ? (
				<div className="desc vulopilot-seo-checklist__error">{ error }</div>
			) : 0 === rows.length ? (
				<div className="desc vulopilot-seo-checklist__error">{ emptyMessage }</div>
			) : (
				<IssueList idPrefix={ idPrefix } rows={ rows } pulsingId={ pulsingId } onNavigate={ onNavigate } fixControls={ fixControls } />
			) }
		</div>
	);
}

/**
 * The metabox's "Page Analysis" tab - 3 headed sections (SEO / GEO
 * Issues / AEO Issues), all sharing the exact same real click → navigate →
 * highlight experience.
 *
 * "SEO Issues" is unchanged from before this pass: the same real,
 * saved-post-state checklist `GEO/PageAnalysisPanel.tsx`'s own "Page
 * Analysis" panel already renders (`GET seo/analyze-page?post_id=`, Free's
 * `Controllers\Seo::get_page_analysis()`), reused here rather than a second
 * copy: every issue that panel lists (Title Tag, Meta Description, H1
 * Heading, Headings, Content, Images, Featured Image, Broken Links, Orphan
 * Page, Canonical, Structured Data, Social Metadata, Indexability) is
 * therefore genuinely listed here too, and clicking one of that panel's
 * rows deep-links straight to the matching row here
 * (`PAGE_ANALYSIS_CHECK_QUERY_PARAM`, `post-editor/index.tsx`).
 *
 * "SEO" and "Content" are two merged lists, worst first, so nothing is shown
 * twice. "Content" holds the live checks about the post body (length,
 * subheadings, links, image alt, keyword placement in the text); their Fix
 * with AI rewrites the post and loads the result into the open editor
 * (`applyContentToEditor`), after saving any unsaved edits. "SEO" holds the
 * rest of the live checks (moved here from the General tab - they re-analyze LIVE, unsaved
 * editor state on every edit via Services\OnPageAnalyzer, covering title,
 * description, content length, subheadings, links, images and focus-keyword
 * placement) plus the last-scanned, saved-post-state checks the live ones
 * can't compute (H1, Featured Image, Broken Links, Orphan Page, Canonical,
 * Structured Data, Social Metadata, Indexability). The 5 saved checks both
 * would grade (`CHECKS_COVERED_BY_LIVE_CHECKLIST`) are shown once, as live
 * rows. Every row that has a real fix carries a "Fix with AI" button: live
 * rows via their own action, Structured Data via `generate-schema`, and
 * GEO/AEO findings via `POST /findings/{id}/fix`. The rest (H1, Featured
 * Image, ...) have no AI action behind them, so no button.
 *
 * "GEO Issues"/"AEO Issues" are new: unlike SEO, GEO/AEO have no on-demand
 * per-post checklist endpoint anywhere in this codebase (confirmed -
 * `GeoAeoPageAnalysisPanel.tsx`'s own docblock explicitly refuses to
 * fabricate one), so these 2 sections instead show this exact page's own
 * real *open findings* for GEO's/AEO's own scanner ids (`GET /findings`,
 * the same real data `GeoTab.tsx`'s/`AeoTab.tsx`'s own site-wide "Pages &
 * Posts" tables and `GeoAeoPageAnalysisPanel.tsx`'s own per-page side panel
 * already use), fetched once per postId and filtered to this post
 * client-side (`object_ref === postId`) the same way that panel already
 * does - there's no server-side per-post filter for this endpoint. A
 * finding has no "pass" state, so a page with none currently open for that
 * tab shows a real "nothing open" message rather than an empty list.
 *
 * GEO/AEO rows are also now externally deep-linkable, same as SEO's own -
 * `GeoAeoPageAnalysisPanel.tsx`/`SeoIssuesByPageTable.tsx` link here with
 * `?vulopilot_finding_id={id}` (the finding's own real numeric id) for any
 * row whose `scanner_id` has no `SEO_ISSUE_EDITOR_TARGETS` entry (most real
 * GEO/AEO scanner ids), resolved by the deep-link effect further down
 * against `geoFindings`/`aeoFindings` once loaded - see
 * `FINDING_ID_QUERY_PARAM`'s own docblock.
 */
export default function PageAnalysisTab( { highlightTarget, onNavigate }: PageAnalysisTabProps ) {
	const { postId, title, excerpt, slug, content, meta, setTitle, setExcerpt } = usePostData();
	const focusKeyword = ( meta[ window.vulopilotPostSeo.metaKeys.focus_keyword ] as string ) || '';

	const [ liveResults, setLiveResults ] = useState< AnalysisResult[] >( [] );
	const [ isAnalyzingLive, setIsAnalyzingLive ] = useState( true );
	const [ fixingId, setFixingId ] = useState< string | null >( null );
	const [ fixError, setFixError ] = useState< string | null >( null );
	/** Bumped after a fix succeeds so the saved SEO checks and the GEO/AEO findings refetch and the fixed row drops out. */
	const [ refreshKey, setRefreshKey ] = useState( 0 );

	const [ data, setData ] = useState< PageAnalysisResponse | null >( null );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ error, setError ] = useState< string | null >( null );

	const [ geoFindings, setGeoFindings ] = useState< RawFinding[] >( [] );
	const [ isLoadingGeo, setIsLoadingGeo ] = useState( true );
	const [ geoError, setGeoError ] = useState< string | null >( null );

	const [ aeoFindings, setAeoFindings ] = useState< RawFinding[] >( [] );
	const [ isLoadingAeo, setIsLoadingAeo ] = useState( true );
	const [ aeoError, setAeoError ] = useState< string | null >( null );

	const [ pulsingKey, setPulsingKey ] = useState< string | null >( null );
	const hasScrolledRef = useRef( false );

	useEffect( () => {
		let cancelled = false;
		setIsLoading( true );
		setError( null );

		analyzePage( postId )
			.then( ( response ) => {
				if ( ! cancelled ) {
					setData( response );
				}
			} )
			.catch( ( err ) => {
				if ( ! cancelled ) {
					setError( err instanceof Error ? err.message : String( err ) );
				}
			} )
			.finally( () => {
				if ( ! cancelled ) {
					setIsLoading( false );
				}
			} );

		return () => {
			cancelled = true;
		};
	}, [ postId, refreshKey ] );

	// 2 more real, independent requests rather than gating the whole tab
	// (including the unchanged SEO section above) behind them - same "don't
	// change existing SEO behavior" posture the top docblock documents.
	useEffect( () => {
		let cancelled = false;
		setIsLoadingGeo( true );
		setGeoError( null );

		fetchOpenFindings( GEO_SCANNER_IDS )
			.then( ( findings ) => {
				if ( ! cancelled ) {
					setGeoFindings( findings.filter( ( finding ) => finding.object_ref === String( postId ) ) );
				}
			} )
			.catch( ( err ) => {
				if ( ! cancelled ) {
					setGeoError( err instanceof Error ? err.message : String( err ) );
				}
			} )
			.finally( () => {
				if ( ! cancelled ) {
					setIsLoadingGeo( false );
				}
			} );

		return () => {
			cancelled = true;
		};
	}, [ postId, refreshKey ] );

	useEffect( () => {
		let cancelled = false;
		setIsLoadingAeo( true );
		setAeoError( null );

		fetchOpenFindings( AEO_SCANNER_IDS )
			.then( ( findings ) => {
				if ( ! cancelled ) {
					setAeoFindings( findings.filter( ( finding ) => finding.object_ref === String( postId ) ) );
				}
			} )
			.catch( ( err ) => {
				if ( ! cancelled ) {
					setAeoError( err instanceof Error ? err.message : String( err ) );
				}
			} )
			.finally( () => {
				if ( ! cancelled ) {
					setIsLoadingAeo( false );
				}
			} );

		return () => {
			cancelled = true;
		};
	}, [ postId, refreshKey ] );

	// The live checklist re-analyzes LIVE, possibly-unsaved editor state on a
	// short debounce (see PostSeo.php for why that's a POST-with-body, not a
	// stored-post read) - moved here from the General tab.
	useEffect( () => {
		let cancelled = false;
		setIsAnalyzingLive( true );

		const timeout = setTimeout( () => {
			analyzePost( postId, { title, content, excerpt, slug, focus_keyword: focusKeyword } )
				.then( ( response ) => {
					if ( ! cancelled ) {
						setLiveResults( response.results );
					}
				} )
				.catch( () => {
					// A failed call just leaves the previous checklist
					// showing - it re-runs on the next edit.
				} )
				.finally( () => {
					if ( ! cancelled ) {
						setIsAnalyzingLive( false );
					}
				} );
		}, 600 );

		return () => {
			cancelled = true;
			clearTimeout( timeout );
		};
	}, [ postId, title, excerpt, slug, content, focusKeyword ] );

	const applyPostFix = ( actionId: string, response: FixResponse ) => {
		if ( ! response.post ) {
			return;
		}

		if ( 'write-meta-title' === actionId ) {
			setTitle( response.post.title );
		}

		if ( 'write-meta-description' === actionId ) {
			setExcerpt( response.post.excerpt );
		}

		if ( response.post.content_changed && response.post.content ) {
			applyContentToEditor( response.post.content );
		}
	};

	const handleFix = async ( row: IssueRow ) => {
		if ( ! row.fix ) {
			return;
		}

		setFixingId( row.id );
		setFixError( null );

		try {
			if ( 'post' === row.fix.kind ) {
				// A content fix works on the SAVED post, then its result is
				// loaded into the editor - so save any unsaved edits first,
				// or loading the result would overwrite them.
				if ( CONTENT_MUTATING_ACTIONS.includes( row.fix.actionId ) && ( select( 'core/editor' ) as any ).isEditedPostDirty() ) {
					await ( dispatch( 'core/editor' ) as any ).savePost();
				}

				applyPostFix( row.fix.actionId, await fixWithAi( postId, row.fix.actionId ) );
				notify(
					CONTENT_MUTATING_ACTIONS.includes( row.fix.actionId )
						? __( 'Fixed - the updated content is now in the editor.', 'vulopilot' )
						: __( 'Fixed.', 'vulopilot' )
				);
			} else {
				await fixFinding( row.fix.findingId );
			}

			setRefreshKey( ( key ) => key + 1 );
		} catch ( err ) {
			setFixError( err instanceof Error ? err.message : String( err ) );
			notify( err instanceof Error ? err.message : String( err ), 'error' );
		} finally {
			setFixingId( null );
		}
	};

	const fixControls: FixControls = {
		isPro: window.vulopilotPostSeo.isPro,
		shopUrl: window.vulopilotPostSeo.shopUrl,
		fixingId,
		onFix: handleFix,
	};

	// "SEO" and "Content" lists, worst first, so nothing is shown twice: the
	// live checks (this editor's current, possibly unsaved state) are split by
	// what they grade - the post body goes under "Content", the rest joins the
	// saved-page checks the live ones can't compute under "SEO". The saved
	// checks the live ones also grade are already filtered out
	// (`CHECKS_COVERED_BY_LIVE_CHECKLIST`).
	const bySeverity = ( a: IssueRow, b: IssueRow ) => STATUS_ORDER[ a.status ] - STATUS_ORDER[ b.status ];
	const contentRows = liveResults
		.filter( ( result ) => CONTENT_CHECK_IDS.includes( result.id ) )
		.map( rowFromLive )
		.sort( bySeverity );
	const seoRows = [
		...liveResults.filter( ( result ) => ! CONTENT_CHECK_IDS.includes( result.id ) ).map( rowFromLive ),
		...( data?.checks ?? [] )
			.filter( ( check ) => ! CHECKS_COVERED_BY_LIVE_CHECKLIST.includes( check.key ) )
			.map( rowFromCheck ),
	].sort( bySeverity );

	// Deep-link highlighting - live checks (matched by their check id, e.g.
	// 'description_length', `SEO_ISSUE_EDITOR_TARGETS`) and SEO's own saved
	// `data.checks` (matched by real `key`, `PAGE_ANALYSIS_CHECK_QUERY_PARAM`)
	// are tried first; GEO's/AEO's own findings (matched by real numeric id,
	// `FINDING_ID_QUERY_PARAM` - see that constant's own docblock) are tried
	// next, once each section's own independent fetch has actually resolved.
	// A target that's really a GEO/AEO finding simply doesn't match on an
	// earlier render where `isLoadingGeo`/`isLoadingAeo` is still true - this
	// effect re-runs as those settle (see the dependency array) rather than
	// giving up.
	useEffect( () => {
		if ( ! highlightTarget || hasScrolledRef.current ) {
			return;
		}

		let elementId: string | null = null;

		if ( liveResults.some( ( result ) => result.id === highlightTarget ) ) {
			elementId = `vulopilot-seo-check-${ highlightTarget }`;
		} else if ( data?.checks.some( ( check ) => check.key === highlightTarget ) ) {
			elementId = `vulopilot-page-analysis-check-${ highlightTarget }`;
		} else if (
			! isLoadingGeo &&
			geoFindings.some( ( finding ) => String( finding.id ) === highlightTarget )
		) {
			elementId = `vulopilot-page-analysis-geo-${ highlightTarget }`;
		} else if (
			! isLoadingAeo &&
			aeoFindings.some( ( finding ) => String( finding.id ) === highlightTarget )
		) {
			elementId = `vulopilot-page-analysis-aeo-${ highlightTarget }`;
		}

		if ( ! elementId ) {
			return;
		}

		hasScrolledRef.current = true;
		const element = document.getElementById( elementId );
		element?.scrollIntoView( { behavior: 'smooth', block: 'center' } );
		setPulsingKey( highlightTarget );

		const timeout = setTimeout( () => setPulsingKey( null ), 4000 );
		return () => clearTimeout( timeout );
	}, [ highlightTarget, liveResults, data, geoFindings, aeoFindings, isLoadingGeo, isLoadingAeo ] );

	return (
		<div className="vulopilot-seo-tab vulopilot-seo-tab--page-analysis">
			<p className="small desc vulopilot-seo-focus-keyword-help">
				{ __( 'This page\'s real SEO/GEO/AEO signals, last checked live.', 'vulopilot' ) }
			</p>

			{ fixError && <div className="desc vulopilot-seo-checklist__error">{ fixError }</div> }

			<IssueSection
				heading={ __( 'SEO', 'vulopilot' ) }
				idPrefix="vulopilot-page-analysis-check"
				rows={ seoRows }
				isLoading={ ( isAnalyzingLive && 0 === liveResults.length ) || ( isLoading && ! data ) }
				error={ error && 0 === seoRows.length ? error : null }
				emptyMessage={ __( 'No SEO checks to show.', 'vulopilot' ) }
				pulsingId={ pulsingKey }
				onNavigate={ onNavigate }
				fixControls={ fixControls }
				showSummary
			/>

			<IssueSection
				heading={ __( 'Content', 'vulopilot' ) }
				idPrefix="vulopilot-page-analysis-content"
				rows={ contentRows }
				isLoading={ isAnalyzingLive && 0 === liveResults.length }
				error={ null }
				emptyMessage={ __( 'No content checks to show.', 'vulopilot' ) }
				pulsingId={ pulsingKey }
				onNavigate={ onNavigate }
				fixControls={ fixControls }
				showSummary
			/>

			<IssueSection
				heading={ __( 'GEO Issues', 'vulopilot' ) }
				idPrefix="vulopilot-page-analysis-geo"
				rows={ geoFindings.map( rowFromFinding ) }
				isLoading={ isLoadingGeo }
				error={ geoError }
				emptyMessage={ __( 'No open GEO findings for this page.', 'vulopilot' ) }
				pulsingId={ pulsingKey }
				onNavigate={ onNavigate }
				fixControls={ fixControls }
			/>

			<IssueSection
				heading={ __( 'AEO Issues', 'vulopilot' ) }
				idPrefix="vulopilot-page-analysis-aeo"
				rows={ aeoFindings.map( rowFromFinding ) }
				isLoading={ isLoadingAeo }
				error={ aeoError }
				emptyMessage={ __( 'No open AEO findings for this page.', 'vulopilot' ) }
				pulsingId={ pulsingKey }
				onNavigate={ onNavigate }
				fixControls={ fixControls }
			/>
		</div>
	);
}
