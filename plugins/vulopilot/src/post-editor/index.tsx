import { registerPlugin } from '@wordpress/plugins';
import { PluginSidebar, PluginSidebarMoreMenuItem } from '@wordpress/editor';
import { dispatch } from '@wordpress/data';
import { useEffect, useState } from '@wordpress/element';
import { createPortal } from 'react-dom';
import { __ } from '@wordpress/i18n';
import PostSeoPanel from './PostSeoPanel';
import ToolbarScorePills from './ToolbarScorePills';

// The text-selection AI toolbar is Pro-only - vulopilot-pro's own post-editor bundle registers
// it directly (TextSelectionActionsPanel.tsx), only while licensed.

/**
 * `PluginSidebar`'s `icon` prop can't fit our two text pills, so this portals them straight into
 * the header's settings row (`.editor-header__settings`) instead. That row is a hardcoded
 * `Fragment` with no public Slot/Fill, and React wipes a plain `insertBefore()` on its next
 * re-render - so a MutationObserver re-inserts the container every time it gets evicted.
 */
const useToolbarScorePillsPortal = () => {
	const [ container, setContainer ] = useState< HTMLElement | null >( null );

	useEffect( () => {
		let cancelled = false;
		let observer: MutationObserver | null = null;

		const ensureMounted = ( settingsRow: Element ) => {
			if ( settingsRow.querySelector( '.vulopilot-toolbar-score-pills-root' ) ) {
				return;
			}

			const root = document.createElement( 'div' );
			root.className = 'vulopilot-toolbar-score-pills-root';
			settingsRow.insertBefore( root, settingsRow.firstChild );
			setContainer( root );
		};

		const findAndWatch = () => {
			if ( cancelled ) {
				return;
			}

			const settingsRow = document.querySelector( '.editor-header__settings' );

			if ( ! settingsRow ) {
				// The header mounts asynchronously - keep trying until it exists.
				requestAnimationFrame( findAndWatch );
				return;
			}

			ensureMounted( settingsRow );

			observer = new MutationObserver( () => ensureMounted( settingsRow ) );
			observer.observe( settingsRow, { childList: true } );
		};

		findAndWatch();

		return () => {
			cancelled = true;
			observer?.disconnect();
		};
	}, [] );

	return container;
};

import {
	getEditorTargetForScanner,
	SEO_ISSUE_QUERY_PARAM,
	PAGE_ANALYSIS_CHECK_QUERY_PARAM,
	FINDING_ID_QUERY_PARAM,
	SeoIssueEditorTab,
} from '../services/seoIssueEditorTarget';
import './style.scss';

const SIDEBAR_NAME = 'vulopilot-seo-sidebar';

interface DeepLinkTarget {
	wasPresent: boolean;
	tab?: SeoIssueEditorTab;
	target?: string;
}

/**
 * Two independent deep-link sources land here, both stripped from the URL immediately so a page
 * refresh doesn't keep re-triggering the highlight.
 */
const readDeepLinkTarget = (): DeepLinkTarget => {
	const params = new URLSearchParams( window.location.search );
	const scannerId = params.get( SEO_ISSUE_QUERY_PARAM );
	const pageAnalysisCheckKey = params.get( PAGE_ANALYSIS_CHECK_QUERY_PARAM );
	const findingId = params.get( FINDING_ID_QUERY_PARAM );

	if ( ! scannerId && ! pageAnalysisCheckKey && ! findingId ) {
		return { wasPresent: false };
	}

	params.delete( SEO_ISSUE_QUERY_PARAM );
	params.delete( PAGE_ANALYSIS_CHECK_QUERY_PARAM );
	params.delete( FINDING_ID_QUERY_PARAM );
	const query = params.toString();
	window.history.replaceState(
		{},
		'',
		window.location.pathname + ( query ? `?${ query }` : '' ) + window.location.hash
	);

	if ( pageAnalysisCheckKey ) {
		return { wasPresent: true, tab: 'page-analysis', target: pageAnalysisCheckKey };
	}

	if ( findingId ) {
		return { wasPresent: true, tab: 'page-analysis', target: findingId };
	}

	const resolved = getEditorTargetForScanner( scannerId as string );
	return { wasPresent: true, tab: resolved?.tab, target: resolved?.target };
};

// Read once at module scope, before first render - deep-link state is static for the lifetime of
// this editor page load.
const { wasPresent: shouldOpenSidebar, tab: deepLinkTab, target: deepLinkHighlight } = readDeepLinkTarget();

/**
 * Opens the SEO sidebar the first time the user clicks into the title field. The editor canvas
 * (title included) renders in its own iframe since WP 5.9, so this polls for `contentDocument`
 * the same way `useToolbarScorePillsPortal` does, and attaches the listener there instead of on
 * the top-level `document`. Fires once per page load, never re-opens after the user closes it.
 */
const useOpenSidebarOnTitleClick = () => {
	useEffect( () => {
		let cancelled = false;
		let attachedDoc: Document | null = null;
		const firedRef = { current: false };

		const onFocusIn = ( event: FocusEvent ) => {
			if ( firedRef.current ) {
				return;
			}

			const target = event.target as HTMLElement | null;
			const isTitleField = Boolean( target?.closest( '.editor-post-title__input' ) );

			if ( ! isTitleField ) {
				return;
			}

			firedRef.current = true;
			dispatch( 'core/edit-post' ).openGeneralSidebar( `vulopilot-seo/${ SIDEBAR_NAME }` );
		};

		const tryAttach = () => {
			if ( cancelled || firedRef.current ) {
				return;
			}

			const iframe = document.querySelector< HTMLIFrameElement >( 'iframe[name="editor-canvas"]' );
			const doc = iframe?.contentDocument;

			if ( doc && doc !== attachedDoc ) {
				attachedDoc?.removeEventListener( 'focusin', onFocusIn );
				doc.addEventListener( 'focusin', onFocusIn );
				attachedDoc = doc;
			}

			requestAnimationFrame( tryAttach );
		};

		tryAttach();

		return () => {
			cancelled = true;
			attachedDoc?.removeEventListener( 'focusin', onFocusIn );
		};
	}, [] );
};

/**
 * The post-editor SEO metabox, mounted separately from the dashboard app.
 */
const VuloPilotIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 64 64" class="" aria-hidden="true"><path d="M14 0h36a14 14 0 0 1 14 14v36a14 14 0 0 1-14 14H14A14 14 0 0 1 0 50V14A14 14 0 0 1 14 0z" fill="#002991"/><g fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 31.5 L27 42 L46.5 22.5"/><path d="M35.5 21.5 H47.5 V33.5"/></g><circle cx="16.5" cy="31.5" r="4.6" fill="#D8362B"/></svg>);

/**
 * VuloPilot SEO sidebar.
 */
const VuloPilotSeoPlugin = () => {
	const toolbarPortalContainer = useToolbarScorePillsPortal();
	// Toolbar score pills live in a separate portaled tree from PostSeoPanel below, so a click
	// on one needs to reach the panel's tab state from here, the shared parent - `requestedTab`
	// bridges the two. Re-keys on every click (`Date.now()`) so clicking the same pill twice in a
	// row still re-navigates even though the tab name itself didn't change.
	const [ requestedTab, setRequestedTab ] = useState< { tab: 'general' | 'ai-visibility'; target?: string; nonce: number } | null >( null );

	const openSidebarToTab = ( tab: 'general' | 'ai-visibility', target?: string ) => {
		setRequestedTab( { tab, target, nonce: Date.now() } );
		dispatch( 'core/edit-post' ).openGeneralSidebar( `vulopilot-seo/${ SIDEBAR_NAME }` );
	};

	useOpenSidebarOnTitleClick();

	useEffect( () => {
		if ( ! shouldOpenSidebar ) {
			return;
		}

		/**
		 * Open VuloPilot's sidebar when arriving through
		 * one of the SEO/GEO/AEO deep links.
		 */
		const open = () => {
			dispatch( 'core/edit-post' ).openGeneralSidebar(
				`vulopilot-seo/${ SIDEBAR_NAME }`
			);
		};

		open();

		/**
		 * WordPress may restore the previously selected sidebar during editor initialization.
		 */
		const timeout = setTimeout( open, 500 );

		return () => clearTimeout( timeout );

	}, [] );

	return (
		<>
			{ toolbarPortalContainer && createPortal(
				<ToolbarScorePills
					onClickSeo={ () => openSidebarToTab( 'general', 'snippet' ) }
					onClickAeo={ () => openSidebarToTab( 'ai-visibility' ) }
				/>,
				toolbarPortalContainer
			) }

			<PluginSidebarMoreMenuItem target={ SIDEBAR_NAME } icon={ <VuloPilotIcon /> }>
				{ __( 'VuloPilot SEO', 'vulopilot' ) }
			</PluginSidebarMoreMenuItem>

			<PluginSidebar
				name={ SIDEBAR_NAME }
				title={ __( 'VuloPilot SEO', 'vulopilot' ) }
				icon={ <VuloPilotIcon /> }
			>
				<PostSeoPanel
					initialTabName={ requestedTab?.tab ?? deepLinkTab }
					highlightTarget={ requestedTab ? undefined : deepLinkHighlight }
					navigationNonce={ requestedTab?.nonce }
					navigationTarget={ requestedTab?.target }
				/>
			</PluginSidebar>
		</>
	);
};


registerPlugin( 'vulopilot-seo', { render: VuloPilotSeoPlugin } );
