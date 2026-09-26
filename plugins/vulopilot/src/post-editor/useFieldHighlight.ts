import { useEffect, useRef, useState } from '@wordpress/element';

/**
 * Same scroll-to-and-pulse-highlight idiom `PageAnalysisTab.tsx` uses for its
 * rows, factored out for the General/Social tabs' own plain
 * fields (no live-recomputed list to wait on there, so this is simpler:
 * the target element already exists as soon as the tab mounts). `fieldKey`
 * is one of `SEO_ISSUE_EDITOR_TARGETS`' own `target` strings
 * (e.g. 'canonical_url', 'social_title').
 *
 * @param highlightTarget The deep link's resolved target for THIS tab, if any.
 * @param fieldKey         This field's own key - only pulses when the two match.
 * @return Whether this field should currently render its pulse class.
 */
export function useFieldHighlight( highlightTarget: string | undefined, fieldKey: string ): boolean {
	const [ isPulsing, setIsPulsing ] = useState( false );
	const hasRunRef = useRef( false );

	useEffect( () => {
		if ( highlightTarget !== fieldKey || hasRunRef.current ) {
			return;
		}

		hasRunRef.current = true;
		const element = document.getElementById( `vulopilot-seo-field-${ fieldKey }` );
		element?.scrollIntoView( { behavior: 'smooth', block: 'center' } );
		setIsPulsing( true );

		const timeout = setTimeout( () => setIsPulsing( false ), 4000 );
		return () => clearTimeout( timeout );
	}, [ highlightTarget, fieldKey ] );

	return isPulsing;
}
