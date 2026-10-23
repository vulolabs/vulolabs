import { useEffect, useRef, useState, useCallback } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { fetchAllFindings, getPostSeoScore, SeoScoreRule } from './api';

/**
 * This file's own local copy of `PageAnalysisTab.tsx`'s `AEO_SCANNER_IDS` - same real scanner-id
 * union, kept in sync by hand the same way that file's own docblock already notes for its
 * GEO/AEO copies.
 */
const AEO_SCANNER_IDS = [ 'geo-faq-opportunity', 'geo-summary-block', 'aeo-schema' ];

/**
 * Same real severity-weighted formula `AeoScoreSummaryCard.tsx`'s own `calculateScore()` (the
 * dashboard-wide "AEO Score" card) already uses - there is no per-post AEO score anywhere yet, so
 * this reuses that exact formula narrowed to this one post's own open AEO findings instead of
 * inventing a new metric.
 */
const calculateAeoScore = ( breakdown: { critical: number; high: number; medium: number; low: number } ): number => {
	const score =
		100 -
		breakdown.critical * 15 -
		breakdown.high * 8 -
		breakdown.medium * 3 -
		breakdown.low * 1;

	return Math.max( 0, Math.min( 100, score ) );
};

/** Matches PageAnalysisTab.tsx's own live-recheck debounce. */
const LIVE_SCORE_DEBOUNCE_MS = 600;

/**
 * Real SEO score (`Seo::get_post_score()`, computed live against the editor's own current field
 * values - the same `OnPageAnalyzer` engine the Page Analysis tab's live checklist uses, not just
 * the last saved post) and real AI/AEO score (this post's own open AEO findings) - shared by the
 * in-panel score badges and the editor toolbar's own score pill, so both read the exact same
 * numbers from one fetch pair rather than two independent copies drifting apart.
 *
 * Reacts to typing (debounced, same as the Page Analysis tab's own live checklist) AND to every
 * successful save, so it's never frozen at whatever was true when the editor first loaded.
 */
export function usePostScores( postId: number ) {
	const [ seoScore, setSeoScore ] = useState< number | null >( null );
	const [ aeoScore, setAeoScore ] = useState< number | null >( null );
	/** Full rule breakdown from the last FULL (non-live-only) evaluation - `ScoreImprovementCard.tsx`'s own "reach 100 by fixing these" list reads from this, not the fast live-only calls. */
	const [ seoScoreRules, setSeoScoreRules ] = useState< SeoScoreRule[] >( [] );

	// The editor's own live (possibly-unsaved) field values - same shape PageAnalysisTab.tsx's
	// own `analyzePost()` call already sends.
	const live = useSelect( ( select ) => {
		const editor = select( 'core/editor' ) as any;
		const meta = editor.getEditedPostAttribute( 'meta' ) || {};
		const seoTitle = ( meta[ window.vulopilotPostSeo.metaKeys.seo_title ] as string ) || '';
		const title = editor.getEditedPostAttribute( 'title' ) || '';

		return {
			title: seoTitle || title,
			content: editor.getEditedPostContent() || '',
			excerpt: editor.getEditedPostAttribute( 'excerpt' ) || '',
			slug: editor.getEditedPostAttribute( 'slug' ) || '',
			focus_keyword: ( meta[ window.vulopilotPostSeo.metaKeys.focus_keyword ] as string ) || '',
		};
	}, [] );

	// Bumped on every call so a slower, now-stale request can never overwrite a newer one that
	// already resolved - without this, an older full (fetch-including) request resolving after a
	// newer live-only one would flip the displayed score backward.
	const requestIdRef = useRef( 0 );

	const fetchScores = useCallback( ( currentPostId: number, liveFields: typeof live, liveOnly: boolean ) => {
		if ( ! currentPostId ) {
			return;
		}

		const requestId = ++requestIdRef.current;

		getPostSeoScore( currentPostId, liveFields, liveOnly )
			.then( ( response ) => {
				if ( requestId === requestIdRef.current ) {
					setSeoScore( response.score );

					// Live-only responses omit the technical/fetch rules entirely (see the engine's
					// own `skip_fetch` docblock) - keeping the last FULL response's rules avoids the
					// recommendation list flickering those rows in and out while typing.
					if ( ! liveOnly ) {
						setSeoScoreRules( response.rules ?? [] );
					}
				}
			} )
			.catch( () => {
				// Left as null - the caller shows its own "…" placeholder.
			} );

		// Any-status fetch (not fetchOpenFindings()) - a post with zero rows here has never been
		// scanned by these scanners at all, and must show "unknown", not a fabricated 100 (which
		// is what an all-zero severity breakdown mathematically produces - the same "never
		// scanned" bug this engine's SEO score had before it was fixed to check real scan
		// evidence instead of absence of open findings).
		fetchAllFindings( AEO_SCANNER_IDS )
			.then( ( findings ) => {
				const postFindings = findings.filter( ( finding ) => finding.object_ref === String( currentPostId ) );

				if ( postFindings.length === 0 ) {
					setAeoScore( null );
					return;
				}

				const breakdown = { critical: 0, high: 0, medium: 0, low: 0 };

				postFindings
					.filter( ( finding ) => finding.status === 'open' )
					.forEach( ( finding ) => {
						if ( finding.severity in breakdown ) {
							breakdown[ finding.severity as keyof typeof breakdown ] += 1;
						}
					} );

				setAeoScore( calculateAeoScore( breakdown ) );
			} )
			.catch( () => {} );
	}, [] );

	// Live recheck, debounced the same way the Page Analysis tab's own checklist is - fires on
	// mount too (full, with the technical/fetch rules), so there's no separate "initial load"
	// fetch to keep in sync with this one. Every later firing (real typing) skips those - see
	// `getPostSeoScore()`'s own `liveOnly` docblock for why a network round trip on every
	// keystroke made the score appear frozen instead of live.
	const hasLoadedOnceRef = useRef( false );

	useEffect( () => {
		const isFirstLoad = ! hasLoadedOnceRef.current;
		const timeout = setTimeout( () => {
			hasLoadedOnceRef.current = true;
			fetchScores( postId, live, ! isFirstLoad );
		}, isFirstLoad ? 0 : LIVE_SCORE_DEBOUNCE_MS );
		return () => clearTimeout( timeout );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ postId, live.title, live.content, live.excerpt, live.slug, live.focus_keyword, fetchScores ] );

	// Refetch immediately after every successful save too - a "was saving, now isn't, and it
	// succeeded" edge, so the score doesn't wait out the debounce after a save specifically. Full
	// (not live-only), since a save is exactly when the technical/fetch rules need re-checking -
	// the live page has genuinely just changed.
	const isSavingPost = useSelect( ( select ) => ( select( 'core/editor' ) as any ).isSavingPost(), [] );
	const didSaveSucceed = useSelect( ( select ) => ( select( 'core/editor' ) as any ).didPostSaveRequestSucceed(), [] );
	const wasSavingRef = useRef( false );

	useEffect( () => {
		if ( wasSavingRef.current && ! isSavingPost && didSaveSucceed ) {
			fetchScores( postId, live, false );
		}

		wasSavingRef.current = isSavingPost;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ isSavingPost, didSaveSucceed, postId, fetchScores ] );

	// Full refetch on demand - `ScoreImprovementCard.tsx`'s own auto-fix button calls this right
	// after a fix runs, since the post it just changed is the same one the live-typing effect is
	// already watching (no separate "did a fix just run" signal needed there).
	const refetch = useCallback( () => fetchScores( postId, live, false ), [ postId, live, fetchScores ] );

	return { seoScore, aeoScore, seoScoreRules, refetch };
}
