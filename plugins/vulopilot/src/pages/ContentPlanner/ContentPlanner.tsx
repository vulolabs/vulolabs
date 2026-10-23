/* global vulopilotAppLocalizer */
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import {
	CardComponent,
	ColumnComponent,
	ContainerComponent,
	FormGroupComponent,
	FormGroupWrapperComponent,
	ModuleGuardComponent,
	NavigatorHeaderComponent,
	NoticeManager,
	PopupComponent,
	TypographyComponent,
} from '@zyra/components';
import { ButtonInput, SelectInput, TextAreaInput, TextInput } from '@zyra/inputs';
import { ReactSortable } from 'react-sortablejs';
import { formatWpDate } from '../../services/formatWpDate';
import { announceCreditsSpent } from '../../components/AiCredits/insufficientCredits';
import ShowProPopup from '../../components/Popup/Popup';
import './ContentPlanner.scss';

interface PlanItem {
	id: string;
	title: string;
	post_type: string;
	planned_date: string;
	notes: string;
	main_topic: string;
	primary_keyword: string;
	topic_cluster: string;
	opportunity_score: number | null;
	rationale: string;
	goal: string;
	priority: 'low' | 'medium' | 'high';
	stage: string;
	tone: string;
	audience: string;
	prompt: string;
	post_id: number;
	post_status: string | null;
	status: string;
	archived: boolean;
	is_overdue: boolean;
	edit_url: string | null;
	created_at: string | null;
	updated_at: string | null;
}

/** Matches `ContentPlannerRest::USER_STAGES` + the two server-derived stages. */
const STAGES: { value: string; label: string }[] = [
	{ value: 'idea', label: __( 'Idea', 'vulopilot' ) },
	{ value: 'research', label: __( 'Research', 'vulopilot' ) },
	{ value: 'brief_ready', label: __( 'Brief Ready', 'vulopilot' ) },
	{ value: 'drafting', label: __( 'Drafting', 'vulopilot' ) },
	{ value: 'in_review', label: __( 'In Review', 'vulopilot' ) },
	{ value: 'scheduled', label: __( 'Scheduled', 'vulopilot' ) },
	{ value: 'published', label: __( 'Published', 'vulopilot' ) },
	{ value: 'refresh_needed', label: __( 'Refresh Needed', 'vulopilot' ) },
];

const USER_SETTABLE_STAGES = STAGES.filter( ( s ) => ! [ 'scheduled', 'published' ].includes( s.value ) );
const STAGE_LABEL: Record< string, string > = Object.fromEntries( STAGES.map( ( s ) => [ s.value, s.label ] ) );

/** The Content Planner Redesign spec's own 5-bucket pipeline - a grouping over the richer real
 * stage set above, not a replacement for it (more editorial precision stays available). */
type Bucket = 'idea' | 'planned' | 'in_progress' | 'review' | 'published';

const BUCKETS: { value: Bucket; label: string; color: string; stages: string[] }[] = [
	{ value: 'idea', label: __( 'Idea', 'vulopilot' ), color: '#7c3aed', stages: [ 'idea' ] },
	{ value: 'planned', label: __( 'Planned', 'vulopilot' ), color: '#2563eb', stages: [ 'research', 'brief_ready', 'scheduled' ] },
	{ value: 'in_progress', label: __( 'In progress', 'vulopilot' ), color: '#a86a12', stages: [ 'drafting' ] },
	{ value: 'review', label: __( 'Needs review', 'vulopilot' ), color: '#e8740c', stages: [ 'in_review', 'refresh_needed' ] },
	{ value: 'published', label: __( 'Published', 'vulopilot' ), color: '#16824f', stages: [ 'published' ] },
];

const bucketOf = ( stage: string ): Bucket =>
	BUCKETS.find( ( b ) => b.stages.includes( stage ) )?.value ?? 'idea';

const PRIORITY_LABEL: Record< string, string > = {
	low: __( 'Low', 'vulopilot' ),
	medium: __( 'Medium', 'vulopilot' ),
	high: __( 'High', 'vulopilot' ),
};

const GOALS = [
	__( 'Grow organic traffic', 'vulopilot' ),
	__( 'Convert visitors', 'vulopilot' ),
	__( 'Support a product launch', 'vulopilot' ),
	__( 'Answer customer questions', 'vulopilot' ),
	__( 'Build topical authority', 'vulopilot' ),
];

const TONES = [ 'Professional', 'Friendly', 'Conversational', 'Authoritative', 'Persuasive', 'Playful', 'Educational' ];

const PRESET_CHIPS: { label: string; text: string }[] = [
	{ label: __( 'SEO blog', 'vulopilot' ), text: 'Use H2/H3 headings, include the keyword in the first 100 words, add a FAQ section with 3–5 questions.' },
	{ label: __( 'Short & scannable', 'vulopilot' ), text: 'Short paragraphs (2–3 lines), bullet lists where possible, bold key takeaways.' },
	{ label: __( 'Storytelling', 'vulopilot' ), text: 'Open with a relatable customer story, then teach the lesson. Warm, human voice.' },
	{ label: __( 'Sales-focused', 'vulopilot' ), text: 'End every section with a soft call to action. Highlight benefits over features.' },
];

type ViewMode = 'cards' | 'board' | 'calendar';

/** `ContentIntelligenceDecisionService::decide()`'s own real shape (TopicFinder module). */
interface TitleDecision {
	decision: 'create_new' | 'improve_existing' | 'rethink_topic' | 'not_enough_input';
	matched_post: { post_id: number; title: string; url: string | null; status: string } | null;
	overlaps: Array< { post_id: number; title: string; url: string | null; overlap_type: string; evidence: string; recommended_action: string } >;
	score: { score: number | null; coverage_percent: number; insufficient_data: boolean; factors: Array< { id: string; weight: number; score: number | null; evidence: string } > };
	reason: string;
}

/** `DiscoverTopicOpportunitiesAction::execute()`'s own real stored shape (TopicFinder module). */
interface TopicOpportunity {
	id: string;
	title: string;
	main_topic: string;
	primary_keyword: string;
	opportunity_score: number | null;
	status: string;
	existing_overlaps: Array< { title: string; overlap_type: string } >;
}

interface Angle {
	title: string;
	intent: string;
}

interface StyleDefault {
	tone: string;
	audience: string;
	prompt: string;
}

interface DrawerForm {
	title: string;
	post_type: string;
	goal: string;
	primary_keyword: string;
	stage: string;
	planned_date: string;
	priority: 'low' | 'medium' | 'high';
	notes: string;
	tone: string;
	audience: string;
	prompt: string;
}

const emptyForm = ( style: StyleDefault ): DrawerForm => ( {
	title: '',
	post_type: 'post',
	goal: '',
	primary_keyword: '',
	stage: 'idea',
	planned_date: '',
	priority: 'medium',
	notes: '',
	tone: style.tone,
	audience: style.audience,
	prompt: style.prompt,
} );

const todayIso = () => new Date().toISOString().slice( 0, 10 );

const isDueThisWeek = ( date: string ): boolean => {
	if ( '' === date ) {
		return false;
	}
	const today = new Date();
	const target = new Date( `${ date }T00:00:00` );
	const diffDays = Math.round( ( target.getTime() - today.setHours( 0, 0, 0, 0 ) ) / 86400000 );
	return diffDays >= 0 && diffDays <= 7;
};

/**
 * The dedicated Content Planner page (WP menu slug `content-planner`) - Cards/Board/Calendar
 * views over the real `/content-planner` store (`ContentPlannerRest.php`, Pro-only). Redesigned
 * per the "Content Planner Redesign" spec: a single drawer-based create flow (zyra
 * `PopupComponent position="slide-right-to-left"`), 5 clickable pipeline cards bucketing the
 * richer real stage set, date-grouped Cards view, drag-and-drop Board (`react-sortablejs`,
 * already a project dependency - see `DashboardGrid.tsx` for the same pattern), and a Calendar
 * view.
 */
const ContentPlanner = () => {
	const [ items, setItems ] = useState< PlanItem[] | null >( null );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ isProAvailable, setIsProAvailable ] = useState( true );
	const [ view, setView ] = useState< ViewMode >( 'cards' );

	const [ search, setSearchTerm ] = useState( '' );
	const [ bucketFilter, setBucketFilter ] = useState< Bucket | 'all' >( 'all' );
	const [ priorityFilter, setPriorityFilter ] = useState( 'all' );
	const [ typeFilter, setTypeFilter ] = useState( 'all' );
	const [ showArchived, setShowArchived ] = useState( false );

	const [ styleDefault, setStyleDefault ] = useState< StyleDefault >( { tone: '', audience: '', prompt: '' } );
	const [ isDrawerOpen, setIsDrawerOpen ] = useState( false );
	const [ editingId, setEditingId ] = useState< string | null >( null );
	const [ form, setForm ] = useState< DrawerForm >( emptyForm( { tone: '', audience: '', prompt: '' } ) );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ deleteTarget, setDeleteTarget ] = useState< PlanItem | null >( null );
	const [ openMenuId, setOpenMenuId ] = useState< string | null >( null );
	const titleInputRef = useRef< HTMLInputElement | null >( null );
	const lastFocusedRef = useRef< HTMLElement | null >( null );

	// Drawer AI suggest box.
	const [ isDrawerSuggesting, setIsDrawerSuggesting ] = useState( false );

	// Analyzer ("What should we create next?").
	const [ topicInput, setTopicInput ] = useState( '' );
	const [ analysisGoal, setAnalysisGoal ] = useState( '' );
	const [ analysisDate, setAnalysisDate ] = useState( '' );
	const [ toneOpen, setToneOpen ] = useState( true );
	const [ analysisTone, setAnalysisTone ] = useState( '' );
	const [ analysisAudience, setAnalysisAudience ] = useState( '' );
	const [ analysisPrompt, setAnalysisPrompt ] = useState( '' );
	const [ saveAsDefault, setSaveAsDefault ] = useState( false );
	const [ isAnalyzing, setIsAnalyzing ] = useState( false );
	const [ analysisError, setAnalysisError ] = useState< string | null >( null );
	const [ decision, setDecision ] = useState< TitleDecision | null >( null );
	const [ angles, setAngles ] = useState< Angle[] | null >( null );
	const [ isSuggestingAngles, setIsSuggestingAngles ] = useState( false );
	const [ addedAngle, setAddedAngle ] = useState< string | null >( null );

	// Topic opportunities modal.
	const [ isOpportunitiesOpen, setIsOpportunitiesOpen ] = useState( false );
	const [ opportunities, setOpportunities ] = useState< TopicOpportunity[] | null >( null );
	const [ isLoadingOpportunities, setIsLoadingOpportunities ] = useState( false );
	const [ addedOpportunity, setAddedOpportunity ] = useState< string | null >( null );

	const link = ( path = '' ) => getApiLink( vulopilotAppLocalizer, `content-planner${ path }` );

	const loadItems = () => {
		setIsLoading( true );
		getApiResponse< PlanItem[] >( link(), { headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } } )
			.then( ( response ) => {
				if ( null === response ) {
					setIsProAvailable( false );
					return;
				}
				setItems( response );
			} )
			.catch( () => setIsProAvailable( false ) )
			.finally( () => setIsLoading( false ) );
	};

	useEffect( loadItems, [] );

	useEffect( () => {
		getApiResponse< StyleDefault >( link( '/style-default' ), { headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } } ).then(
			( response ) => {
				if ( response ) {
					setStyleDefault( response );
					setAnalysisTone( response.tone );
					setAnalysisAudience( response.audience );
					setAnalysisPrompt( response.prompt );
				}
			}
		);
		// Site default loads once; the drawer/analyzer read it fresh each time they open.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	// `N` opens the drawer, unless focus is already in a field. Esc closes drawer/menu/delete-modal.
	useEffect( () => {
		const onKeyDown = ( e: KeyboardEvent ) => {
			const target = e.target as HTMLElement;
			const typing = [ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( target.tagName ) || target.isContentEditable;

			if ( 'n' === e.key.toLowerCase() && ! typing && ! isDrawerOpen ) {
				e.preventDefault();
				openCreateDrawer();
				return;
			}

			if ( 'Escape' === e.key ) {
				if ( deleteTarget ) {
					setDeleteTarget( null );
				} else if ( openMenuId ) {
					setOpenMenuId( null );
				} else if ( isDrawerOpen ) {
					closeDrawer();
				}
			}
		};

		window.addEventListener( 'keydown', onKeyDown );
		return () => window.removeEventListener( 'keydown', onKeyDown );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ isDrawerOpen, openMenuId, deleteTarget ] );

	useEffect( () => {
		if ( isDrawerOpen ) {
			window.setTimeout( () => titleInputRef.current?.focus(), 50 );
		} else {
			lastFocusedRef.current?.focus();
		}
	}, [ isDrawerOpen ] );

	const filtered = useMemo( () => {
		return ( items ?? [] ).filter( ( item ) => {
			if ( ! showArchived && item.archived ) {
				return false;
			}
			if ( 'all' !== bucketFilter && bucketOf( item.stage ) !== bucketFilter ) {
				return false;
			}
			if ( 'all' !== priorityFilter && item.priority !== priorityFilter ) {
				return false;
			}
			if ( 'all' !== typeFilter && item.post_type !== typeFilter ) {
				return false;
			}
			if ( search ) {
				const haystack = `${ item.title } ${ item.primary_keyword } ${ item.notes }`.toLowerCase();
				if ( ! haystack.includes( search.toLowerCase() ) ) {
					return false;
				}
			}
			return true;
		} );
	}, [ items, bucketFilter, priorityFilter, typeFilter, search, showArchived ] );

	const hasActiveFilters = 'all' !== bucketFilter || 'all' !== priorityFilter || 'all' !== typeFilter || '' !== search || showArchived;
	const clearFilters = () => {
		setBucketFilter( 'all' );
		setPriorityFilter( 'all' );
		setTypeFilter( 'all' );
		setSearchTerm( '' );
		setShowArchived( false );
	};

	// Pipeline stat cards - real counts + overdue/due-this-week hints.
	const pipelineStats = useMemo( () => {
		const all = ( items ?? [] ).filter( ( i ) => ! i.archived );
		return BUCKETS.map( ( bucket ) => {
			const bucketItems = all.filter( ( i ) => bucketOf( i.stage ) === bucket.value );
			const overdue = bucketItems.filter( ( i ) => i.is_overdue ).length;
			const dueSoon = bucketItems.filter( ( i ) => ! i.is_overdue && isDueThisWeek( i.planned_date ) ).length;
			let hint = '';
			if ( 'published' === bucket.value ) {
				hint = bucketItems.length > 0 ? __( 'Live on site', 'vulopilot' ) : '';
			} else if ( overdue > 0 ) {
				hint = sprintf( __( '%d overdue', 'vulopilot' ), overdue );
			} else if ( dueSoon > 0 ) {
				hint = sprintf( __( '%d due this week', 'vulopilot' ), dueSoon );
			}
			return { ...bucket, count: bucketItems.length, hint, isOverdueHint: overdue > 0 };
		} );
	}, [ items ] );

	const toggleBucketFilter = ( bucket: Bucket ) => {
		setBucketFilter( bucketFilter === bucket ? 'all' : bucket );
		if ( 'board' === view ) {
			setView( 'cards' );
		}
	};

	const lastChangeRef = useRef< { id: string; field: 'stage' | 'archived'; previous: string | boolean } | null >( null );

	// zyra's NoticeManager has no concept of an action button (confirmed against its real
	// implementation - it only ever renders `title`/`message`) and float notices auto-dismiss
	// in 2s regardless, too fast to click anyway - so "toast with Undo" (spec §8) is this
	// small self-contained banner instead, not routed through NoticeManager.
	const [ undoToast, setUndoToast ] = useState< { message: string; onUndo: () => void } | null >( null );
	const undoTimerRef = useRef< ReturnType< typeof setTimeout > | null >( null );

	const toastWithUndo = ( message: string, onUndo: () => void ) => {
		if ( undoTimerRef.current ) {
			clearTimeout( undoTimerRef.current );
		}
		setUndoToast( { message, onUndo } );
		undoTimerRef.current = setTimeout( () => setUndoToast( null ), 4500 );
	};

	const openCreateDrawer = ( presetDate = '', presetStage = 'idea' ) => {
		lastFocusedRef.current = document.activeElement as HTMLElement;
		setEditingId( null );
		setForm( { ...emptyForm( styleDefault ), planned_date: presetDate, stage: presetStage } );
		setIsDrawerOpen( true );
	};

	const openEditDrawer = ( item: PlanItem ) => {
		lastFocusedRef.current = document.activeElement as HTMLElement;
		setEditingId( item.id );
		setForm( {
			title: item.title,
			post_type: item.post_type,
			goal: item.goal,
			primary_keyword: item.primary_keyword,
			stage: item.stage,
			planned_date: item.planned_date,
			priority: item.priority,
			notes: item.notes,
			tone: item.tone,
			audience: item.audience,
			prompt: item.prompt,
		} );
		setIsDrawerOpen( true );
	};

	const closeDrawer = () => setIsDrawerOpen( false );

	const handleSave = () => {
		if ( '' === form.title.trim() ) {
			titleInputRef.current?.focus();
			NoticeManager.add( {
				uniqueKey: 'vulopilot-content-plan-no-title',
				type: 'error',
				position: 'float',
				message: __( 'Add a title so you can find this later.', 'vulopilot' ),
			} );
			return;
		}

		setIsSaving( true );

		const request = editingId
			? sendApiResponse( vulopilotAppLocalizer, link( `/${ editingId }` ), form )
			: sendApiResponse( vulopilotAppLocalizer, link(), form );

		request
			.then( ( response ) => {
				NoticeManager.add( {
					uniqueKey: 'vulopilot-content-plan-save',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? ( editingId ? __( 'Changes saved', 'vulopilot' ) : sprintf( __( '"%s" added to %s', 'vulopilot' ), form.title, STAGE_LABEL[ form.stage ] ?? form.stage ) )
						: __( 'Could not save this item - try again.', 'vulopilot' ),
				} );

				if ( response ) {
					setIsDrawerOpen( false );
					loadItems();
				}
			} )
			.finally( () => setIsSaving( false ) );
	};

	const handleDrawerSuggest = () => {
		const seed = form.primary_keyword || form.title;
		if ( '' === seed.trim() ) {
			titleInputRef.current?.focus();
			NoticeManager.add( {
				uniqueKey: 'vulopilot-content-plan-suggest-empty',
				type: 'error',
				position: 'float',
				message: __( 'Add a keyword or title first.', 'vulopilot' ),
			} );
			return;
		}

		setIsDrawerSuggesting( true );

		sendApiResponse< { insufficient?: boolean; angles?: Angle[] } >( vulopilotAppLocalizer, link( '/angles' ), {
			topic: seed,
			goal: form.goal,
			tone: form.tone,
			audience: form.audience,
			prompt: form.prompt,
		} )
			.then( ( response ) => {
				const first = response?.angles?.[ 0 ];
				if ( ! first ) {
					NoticeManager.add( {
						uniqueKey: 'vulopilot-content-plan-suggest-failed',
						type: 'error',
						position: 'float',
						message: __( 'Could not generate a suggestion right now.', 'vulopilot' ),
					} );
					return;
				}
				setForm( ( prev ) => ( {
					...prev,
					title: prev.title || first.title,
					primary_keyword: prev.primary_keyword || seed,
					goal: prev.goal || analysisGoal,
					notes: prev.notes || first.intent,
				} ) );
			} )
			.finally( () => setIsDrawerSuggesting( false ) );
	};

	const handleChangeStage = ( item: PlanItem, stage: string, silent = false ) => {
		if ( ! silent ) {
			lastChangeRef.current = { id: item.id, field: 'stage', previous: item.stage };
		}
		sendApiResponse( vulopilotAppLocalizer, link( `/${ item.id }` ), { stage } ).then( ( response ) => {
			if ( response ) {
				loadItems();
				if ( ! silent ) {
					toastWithUndo( sprintf( __( 'Moved to %s', 'vulopilot' ), STAGE_LABEL[ stage ] ?? stage ), () => {
						const last = lastChangeRef.current;
						if ( last ) {
							handleChangeStage( item, last.previous as string, true );
						}
					} );
				}
			}
		} );
	};

	const handleGenerateDraft = ( item: PlanItem ) => {
		NoticeManager.add( {
			uniqueKey: 'vulopilot-content-plan-draft-start',
			type: 'success',
			position: 'float',
			message: __( 'Generating draft…', 'vulopilot' ),
		} );

		sendApiResponse( vulopilotAppLocalizer, link( `/${ item.id }/draft` ), {} ).then( ( response ) => {
			NoticeManager.add( {
				uniqueKey: 'vulopilot-content-plan-draft',
				type: response ? 'success' : 'error',
				position: 'float',
				message: response
					? __( 'Draft created - open it from the ⋯ menu.', 'vulopilot' )
					: __( 'Could not create a draft for this item.', 'vulopilot' ),
			} );
			if ( response ) {
				announceCreditsSpent();
				loadItems();
			}
		} );
	};

	const handleArchiveToggle = ( item: PlanItem, silent = false ) => {
		if ( ! silent ) {
			lastChangeRef.current = { id: item.id, field: 'archived', previous: item.archived };
		}
		sendApiResponse( vulopilotAppLocalizer, link( `/${ item.id }` ), { archived: ! item.archived } ).then( ( response ) => {
			if ( response ) {
				loadItems();
				if ( ! silent ) {
					toastWithUndo(
						item.archived ? __( 'Restored', 'vulopilot' ) : __( 'Archived', 'vulopilot' ),
						() => {
							const last = lastChangeRef.current;
							if ( last ) {
								handleArchiveToggle( item, true );
							}
						}
					);
				}
			}
		} );
		setOpenMenuId( null );
	};

	const handleDuplicate = ( item: PlanItem ) => {
		sendApiResponse( vulopilotAppLocalizer, link( `/${ item.id }/duplicate` ), {} ).then( ( response ) => {
			NoticeManager.add( {
				uniqueKey: 'vulopilot-content-plan-duplicate',
				type: response ? 'success' : 'error',
				position: 'float',
				message: response ? __( 'Duplicated.', 'vulopilot' ) : __( 'Could not duplicate this item.', 'vulopilot' ),
			} );
			if ( response ) {
				loadItems();
			}
		} );
		setOpenMenuId( null );
	};

	const handleConfirmDelete = () => {
		if ( ! deleteTarget ) {
			return;
		}
		const item = deleteTarget;
		setDeleteTarget( null );

		fetch( link( `/${ item.id }` ), {
			method: 'DELETE',
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		} ).then( ( response ) => {
			NoticeManager.add( {
				uniqueKey: 'vulopilot-content-plan-delete',
				type: response.ok ? 'success' : 'error',
				position: 'float',
				message: response.ok
					? __( 'Content plan item deleted.', 'vulopilot' )
					: __( 'Could not delete this item.', 'vulopilot' ),
			} );
			if ( response.ok ) {
				loadItems();
			}
		} );
	};

	// Analyzer.
	const appendPreset = ( text: string ) => setAnalysisPrompt( ( prev ) => ( prev ? `${ prev }\n${ text }` : text ) );

	const runTopicAnalysis = () => {
		const title = topicInput.trim();
		if ( '' === title ) {
			document.getElementById( 'vulopilot-analyzer-topic' )?.focus();
			return;
		}

		if ( saveAsDefault ) {
			sendApiResponse( vulopilotAppLocalizer, link( '/style-default' ), { tone: analysisTone, audience: analysisAudience, prompt: analysisPrompt } ).then( ( response ) => {
				if ( response ) {
					setStyleDefault( response as StyleDefault );
					setSaveAsDefault( false );
					NoticeManager.add( {
						uniqueKey: 'vulopilot-content-plan-style-default',
						type: 'success',
						position: 'float',
						message: __( 'Saved as your site default writing style.', 'vulopilot' ),
					} );
				}
			} );
		}

		setIsAnalyzing( true );
		setAnalysisError( null );
		setDecision( null );
		setAngles( null );

		getApiResponse< TitleDecision >(
			`${ getApiLink( vulopilotAppLocalizer, 'topic-finder/title-decision' ) }?title=${ encodeURIComponent( title ) }`,
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then( ( response ) => {
				if ( null === response ) {
					setAnalysisError( __( 'This requires VuloPilot Pro.', 'vulopilot' ) );
					return;
				}
				setDecision( response );
			} )
			.catch( () => setAnalysisError( __( 'Could not analyze this topic right now - try again.', 'vulopilot' ) ) )
			.finally( () => setIsAnalyzing( false ) );

		setIsSuggestingAngles( true );
		sendApiResponse< { insufficient?: boolean; angles?: Angle[] } >( vulopilotAppLocalizer, link( '/angles' ), {
			topic: title,
			goal: analysisGoal,
			tone: analysisTone,
			audience: analysisAudience,
			prompt: analysisPrompt,
		} )
			.then( ( response ) => setAngles( response?.angles ?? [] ) )
			.finally( () => setIsSuggestingAngles( false ) );
	};

	const addAngleToPlan = ( angle: Angle ) => {
		sendApiResponse< PlanItem >( vulopilotAppLocalizer, link(), {
			title: angle.title,
			primary_keyword: topicInput.trim(),
			goal: analysisGoal,
			planned_date: analysisDate,
			stage: analysisDate ? 'research' : 'idea',
			notes: angle.intent,
			tone: analysisTone,
			audience: analysisAudience,
			prompt: analysisPrompt,
		} ).then( ( response ) => {
			if ( response ) {
				setAddedAngle( angle.title );
				loadItems();
				NoticeManager.add( {
					uniqueKey: 'vulopilot-content-plan-angle-added',
					type: 'success',
					position: 'float',
					message: analysisDate
						? sprintf( __( 'Added to Planned for %s', 'vulopilot' ), formatWpDate( analysisDate ) )
						: __( 'Added to Idea.', 'vulopilot' ),
				} );
			}
		} );
	};

	const customizeAngle = ( angle: Angle ) => {
		lastFocusedRef.current = document.activeElement as HTMLElement;
		setEditingId( null );
		setForm( {
			...emptyForm( styleDefault ),
			title: angle.title,
			primary_keyword: topicInput.trim(),
			goal: analysisGoal,
			planned_date: analysisDate,
			notes: angle.intent,
			tone: analysisTone,
			audience: analysisAudience,
			prompt: analysisPrompt,
		} );
		setIsDrawerOpen( true );
	};

	// Topic opportunities modal.
	const openOpportunities = () => {
		setIsOpportunitiesOpen( true );
		setIsLoadingOpportunities( true );
		getApiResponse< TopicOpportunity[] >( getApiLink( vulopilotAppLocalizer, 'topic-finder/topic-opportunities' ), {
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		} )
			.then( ( response ) => setOpportunities( ( response ?? [] ).filter( ( o ) => 'dismissed' !== o.status ) ) )
			.finally( () => setIsLoadingOpportunities( false ) );
	};

	const analyzeOpportunity = ( o: TopicOpportunity ) => {
		setIsOpportunitiesOpen( false );
		setTopicInput( o.title );
		window.setTimeout( runTopicAnalysis, 50 );
	};

	const addOpportunity = ( o: TopicOpportunity ) => {
		sendApiResponse< PlanItem >( vulopilotAppLocalizer, link(), {
			title: o.title,
			primary_keyword: o.primary_keyword,
			main_topic: o.main_topic,
			stage: 'idea',
		} ).then( ( response ) => {
			if ( response ) {
				setAddedOpportunity( o.id );
				loadItems();
			}
		} );
	};

	if ( ! isProAvailable ) {
		return (
			<>
				<NavigatorHeaderComponent
					headerIcon="calendar-alt"
					headerTitle={ __( 'Content Planner', 'vulopilot' ) }
					headerDescription={ __( 'Decide what to publish next and track every piece from idea to live.', 'vulopilot' ) }
				/>
				<ContainerComponent general>
					<ColumnComponent>
						<CardComponent title={ __( 'Content Planner', 'vulopilot' ) } titleIcon="calendar-alt">
							<ModuleGuardComponent
								icon="lock"
								title={ __( 'Content Planner requires VuloPilot Pro', 'vulopilot' ) }
								desc={ __( 'Upgrade to plan, research, and track content from idea to publication.', 'vulopilot' ) }
							/>
						</CardComponent>
					</ColumnComponent>
				</ContainerComponent>
			</>
		);
	}

	// Cards view grouping: Overdue -> Earlier (published, past-dated) -> months -> Not scheduled.
	const groupedCards = ( () => {
		const overdue: PlanItem[] = [];
		const earlier: PlanItem[] = [];
		const byMonth = new Map< string, PlanItem[] >();
		const unscheduled: PlanItem[] = [];
		const today = todayIso();
		const currentMonthKey = today.slice( 0, 7 );

		for ( const item of filtered ) {
			if ( '' === item.planned_date ) {
				unscheduled.push( item );
			} else if ( item.is_overdue ) {
				overdue.push( item );
			} else if ( item.planned_date < today && 'published' === bucketOf( item.stage ) ) {
				earlier.push( item );
			} else {
				const key = item.planned_date.slice( 0, 7 );
				if ( ! byMonth.has( key ) ) {
					byMonth.set( key, [] );
				}
				byMonth.get( key )!.push( item );
			}
		}

		const sortByDatePriority = ( a: PlanItem, b: PlanItem ) =>
			a.planned_date.localeCompare( b.planned_date ) || ( a.priority === b.priority ? 0 : 'high' === a.priority ? -1 : 1 );

		overdue.sort( sortByDatePriority );
		earlier.sort( sortByDatePriority );
		unscheduled.sort( ( a, b ) => ( a.priority === b.priority ? 0 : 'high' === a.priority ? -1 : 1 ) );

		const monthGroups = Array.from( byMonth.entries() )
			.sort( ( [ a ], [ b ] ) => a.localeCompare( b ) )
			.map( ( [ key, monthItems ] ) => {
				const date = new Date( `${ key }-01T00:00:00` );
				const label = key === currentMonthKey
					? sprintf( __( 'Upcoming this month · %s', 'vulopilot' ), date.toLocaleDateString( undefined, { month: 'long', year: 'numeric' } ) )
					: date.toLocaleDateString( undefined, { month: 'long', year: 'numeric' } );
				const presetDate = key === currentMonthKey ? today : `${ key }-01`;
				return { key, label, items: monthItems.sort( sortByDatePriority ), presetDate };
			} );

		return { overdue, earlier, monthGroups, unscheduled };
	} )();

	const renderDateTile = ( item: PlanItem ) => {
		if ( '' === item.planned_date ) {
			return (
				<div className="vp-cp-date-tile vp-cp-date-tile--unset">
					<div className="vp-cp-date-tile__month">{ __( 'DATE', 'vulopilot' ) }</div>
					<div className="vp-cp-date-tile__day">—</div>
					<div className="vp-cp-date-tile__weekday">{ __( 'unset', 'vulopilot' ) }</div>
				</div>
			);
		}
		const date = new Date( `${ item.planned_date }T00:00:00` );
		return (
			<div className={ `vp-cp-date-tile${ item.is_overdue ? ' vp-cp-date-tile--overdue' : '' }` }>
				<div className="vp-cp-date-tile__month">{ date.toLocaleDateString( undefined, { month: 'short' } ) }</div>
				<div className="vp-cp-date-tile__day">{ date.getDate() }</div>
				<div className="vp-cp-date-tile__weekday">{ date.toLocaleDateString( undefined, { weekday: 'short' } ) }</div>
			</div>
		);
	};

	const nextStepFor = ( item: PlanItem ): { label: string; onClick: () => void } => {
		const bucket = bucketOf( item.stage );
		if ( item.archived ) {
			return { label: __( 'Restore', 'vulopilot' ), onClick: () => handleArchiveToggle( item ) };
		}
		switch ( bucket ) {
			case 'idea':
				return { label: __( 'Plan it', 'vulopilot' ), onClick: () => handleChangeStage( item, 'research' ) };
			case 'planned':
				return item.post_id
					? { label: __( 'Open draft', 'vulopilot' ), onClick: () => item.edit_url && window.open( item.edit_url, '_blank', 'noopener' ) }
					: { label: __( 'Generate draft', 'vulopilot' ), onClick: () => handleGenerateDraft( item ) };
			case 'in_progress':
				return { label: __( 'Send to review', 'vulopilot' ), onClick: () => handleChangeStage( item, 'in_review' ) };
			case 'review':
				return { label: __( 'Mark published', 'vulopilot' ), onClick: () => handleChangeStage( item, 'published' ) };
			default:
				return { label: __( 'Edit', 'vulopilot' ), onClick: () => openEditDrawer( item ) };
		}
	};

	const CardMenu = ( { item }: { item: PlanItem } ) => (
		<div className="vp-cp-card-menu">
			<button type="button" className="vp-cp-card-menu__trigger" aria-label={ __( 'More actions', 'vulopilot' ) } onClick={ () => setOpenMenuId( openMenuId === item.id ? null : item.id ) }>
				<i className="adminfont-more" />
			</button>
			{ openMenuId === item.id && (
				<div className="vp-cp-card-menu__list" role="menu">
					<button type="button" role="menuitem" onClick={ () => { openEditDrawer( item ); setOpenMenuId( null ); } }>{ __( 'Edit details', 'vulopilot' ) }</button>
					<button type="button" role="menuitem" onClick={ () => handleDuplicate( item ) }>{ __( 'Duplicate', 'vulopilot' ) }</button>
					{ item.edit_url && (
						<button type="button" role="menuitem" onClick={ () => { window.open( item.edit_url as string, '_blank', 'noopener' ); setOpenMenuId( null ); } }>{ __( 'Open post', 'vulopilot' ) }</button>
					) }
					<div className="vp-cp-card-menu__submenu-label">{ __( 'Move to', 'vulopilot' ) }</div>
					{ USER_SETTABLE_STAGES.filter( ( s ) => s.value !== item.stage ).map( ( s ) => (
						<button type="button" role="menuitem" key={ s.value } onClick={ () => { handleChangeStage( item, s.value ); setOpenMenuId( null ); } }>
							{ s.label }
						</button>
					) ) }
					<button type="button" role="menuitem" onClick={ () => handleArchiveToggle( item ) }>
						{ item.archived ? __( 'Restore', 'vulopilot' ) : __( 'Archive', 'vulopilot' ) }
					</button>
					<button type="button" role="menuitem" className="vp-cp-card-menu__danger" onClick={ () => { setDeleteTarget( item ); setOpenMenuId( null ); } }>
						{ __( 'Delete', 'vulopilot' ) }
					</button>
				</div>
			) }
		</div>
	);

	const PlanCard = ( { item }: { item: PlanItem } ) => {
		const bucket = BUCKETS.find( ( b ) => b.value === bucketOf( item.stage ) )!;
		const nextStep = nextStepFor( item );
		return (
			<div className="vp-cp-card" style={ { borderLeftColor: bucket.color } }>
				{ renderDateTile( item ) }
				<div className="vp-cp-card__body">
					<div className="vp-cp-card__title-row">
						<button type="button" className="vp-cp-card__title" onClick={ () => openEditDrawer( item ) }>{ item.title }</button>
						<CardMenu item={ item } />
					</div>
					<div className="vp-cp-card__meta">
						<span className="vp-cp-badge" style={ { background: bucket.color } }>{ STAGE_LABEL[ item.stage ] ?? bucket.label }</span>
						<span className="vp-cp-badge vp-cp-badge--outline">{ PRIORITY_LABEL[ item.priority ] }</span>
						<span className="vp-cp-type">{ item.post_type }</span>
					</div>
					{ ( item.primary_keyword || item.tone ) && (
						<div className="vp-cp-card__meta">
							{ item.primary_keyword && <span className="vp-cp-keyword">{ item.primary_keyword }</span> }
							{ item.tone && (
								<span className="vp-cp-tone" title={ item.prompt || undefined }>
									✎ { item.tone }{ item.prompt ? ` · ${ __( 'custom prompt', 'vulopilot' ) }` : '' }
								</span>
							) }
						</div>
					) }
					<div className="vp-cp-card__footer">
						<span className="vp-cp-goal">
							{ item.is_overdue && <span className="vp-cp-overdue-prefix">{ __( 'Overdue · ', 'vulopilot' ) }</span> }
							{ item.goal }
						</span>
						<ButtonInput buttons={ { text: nextStep.label, color: 'border-purple', onClick: nextStep.onClick } } />
					</div>
				</div>
			</div>
		);
	};

	const renderCardGroup = ( label: string, groupItems: PlanItem[], headingClass = '', onAdd?: () => void ) =>
		groupItems.length > 0 && (
			<div className="vp-cp-card-group" key={ label }>
				<div className={ `vp-cp-card-group__heading ${ headingClass }` }>
					<span>{ label }</span>
					<span className="vp-cp-card-group__count">{ groupItems.length }</span>
					{ onAdd && (
						<button type="button" className="vp-cp-card-group__add" aria-label={ __( 'Add content', 'vulopilot' ) } onClick={ onAdd }>
							<i className="adminfont-plus" />
						</button>
					) }
				</div>
				<div className="vp-cp-card-grid">
					{ groupItems.map( ( item ) => <PlanCard item={ item } key={ item.id } /> ) }
				</div>
			</div>
		);

	const totalCount = ( items ?? [] ).length;
	const showingCount = filtered.length;

	return (
		<div className="vp-content-planner">
			<NavigatorHeaderComponent
				headerIcon="calendar-alt"
				headerTitle={ __( 'Content Planner', 'vulopilot' ) }
				headerDescription={ __( 'Decide what to publish next and track every piece from idea to live.', 'vulopilot' ) }
				headerCustomContent={
					<>
						<ButtonInput buttons={ { text: __( 'Topic opportunities', 'vulopilot' ), color: 'text-blue', onClick: openOpportunities } } />
						<ButtonInput buttons={ { text: __( 'New content', 'vulopilot' ), icon: 'plus', color: 'border-purple', onClick: () => openCreateDrawer() } } />
					</>
				}
			/>
			<ContainerComponent general>
				<ColumnComponent>
					<CardComponent
						id="vulopilot-content-planner-ai"
						title={ __( 'What should we create next?', 'vulopilot' ) }
						titleIcon="ai"
						desc={ __( 'Type a topic or keyword. VuloPilot checks it against your existing content, flags overlap, and suggests angles you can add to the plan.', 'vulopilot' ) }
					>
						<FormGroupWrapperComponent>
							<div className="vp-cp-analyzer-row">
								<FormGroupComponent label={ __( 'Topic, title or keyword', 'vulopilot' ) }>
									<TextInput
										name="topic-input"
										id="vulopilot-analyzer-topic"
										inputLabel={ __( 'e.g. holiday gift ideas for pet owners', 'vulopilot' ) }
										value={ topicInput }
										onChange={ ( v ) => setTopicInput( v as string ) }
									/>
								</FormGroupComponent>
								<FormGroupComponent label={ __( 'Goal', 'vulopilot' ) }>
									<SelectInput
										type="single-select"
										name="analysis-goal"
										value={ analysisGoal }
										options={ [ { label: __( 'Choose a goal…', 'vulopilot' ), value: '' }, ...GOALS.map( ( g ) => ( { label: g, value: g } ) ) ] }
										onChange={ ( v ) => setAnalysisGoal( v as string ) }
									/>
								</FormGroupComponent>
								<FormGroupComponent label={ <>{ __( 'Planned date', 'vulopilot' ) } <span className="vp-cp-optional">{ __( 'optional', 'vulopilot' ) }</span></> }>
									<TextInput name="analysis-date" type="date" value={ analysisDate } onChange={ ( v ) => setAnalysisDate( v as string ) } />
								</FormGroupComponent>
							</div>

							<div className="vp-cp-tone-panel">
								<button type="button" className="vp-cp-tone-panel__header" onClick={ () => setToneOpen( ! toneOpen ) }>
									<i className="adminfont-edit" />
									<strong>{ __( 'Tone & writing instructions', 'vulopilot' ) }</strong>
									{ analysisTone && <span className="vp-cp-tone-panel__summary"> — { analysisTone }</span> }
									<i className={ `adminfont-arrow-${ toneOpen ? 'up' : 'down' } vp-cp-tone-panel__chevron` } />
								</button>
								{ toneOpen && (
									<div className="vp-cp-tone-panel__body">
										<div className="vp-cp-tone-panel__label">{ __( 'Tone of voice', 'vulopilot' ) }</div>
										<div className="vp-cp-tone-pills" role="radiogroup" aria-label={ __( 'Tone of voice', 'vulopilot' ) }>
											{ TONES.map( ( t ) => (
												<label key={ t } className={ `vp-cp-tone-pill${ analysisTone === t ? ' is-active' : '' }` }>
													<input type="radio" name="analysis-tone" value={ t } checked={ analysisTone === t } onChange={ () => setAnalysisTone( t ) } />
													{ t }
												</label>
											) ) }
										</div>
										<FormGroupComponent label={ <>{ __( 'Target audience', 'vulopilot' ) } <span className="vp-cp-optional">{ __( 'optional', 'vulopilot' ) }</span></> }>
											<TextInput name="analysis-audience" inputLabel={ __( 'e.g. small store owners new to WordPress', 'vulopilot' ) } value={ analysisAudience } onChange={ ( v ) => setAnalysisAudience( v as string ) } />
										</FormGroupComponent>
										<FormGroupComponent
											label={
												<>
													{ __( 'Custom prompt / instructions', 'vulopilot' ) } <span className="vp-cp-optional">{ __( 'optional — sent to AI with every draft for this topic', 'vulopilot' ) }</span>
												</>
											}
										>
											<TextAreaInput
												name="analysis-prompt"
												inputLabel={ __( 'e.g. Write in British English. Use short paragraphs and a FAQ at the end. Mention our free shipping offer. Avoid jargon.', 'vulopilot' ) }
												value={ analysisPrompt }
												onChange={ ( v ) => setAnalysisPrompt( v as string ) }
											/>
										</FormGroupComponent>
										<div className="vp-cp-chip-row">
											<span className="vp-cp-chip-row__label">{ __( 'Quick add:', 'vulopilot' ) }</span>
											{ PRESET_CHIPS.map( ( chip ) => (
												<button type="button" key={ chip.label } className="vp-cp-chip" onClick={ () => appendPreset( chip.text ) }>
													+ { chip.label }
												</button>
											) ) }
										</div>
										<div className="vp-cp-tone-panel__footer">
											<label className="vp-cp-checkbox">
												<input type="checkbox" checked={ saveAsDefault } onChange={ ( e ) => setSaveAsDefault( e.target.checked ) } />
												{ __( 'Save tone & instructions as site default', 'vulopilot' ) }
											</label>
											<ButtonInput
												buttons={ { text: isAnalyzing ? __( 'Analyzing…', 'vulopilot' ) : __( 'Analyze topic', 'vulopilot' ), icon: 'search', color: 'border-purple', onClick: runTopicAnalysis, disabled: isAnalyzing || '' === topicInput.trim() } }
											/>
										</div>
									</div>
								) }
							</div>

							{ ! toneOpen && (
								<div style={ { marginTop: '12px' } }>
									<ButtonInput
										buttons={ { text: isAnalyzing ? __( 'Analyzing…', 'vulopilot' ) : __( 'Analyze topic', 'vulopilot' ), icon: 'search', color: 'border-purple', onClick: runTopicAnalysis, disabled: isAnalyzing || '' === topicInput.trim() } }
									/>
								</div>
							) }

							{ isAnalyzing && (
								<TypographyComponent variant="body-sm" color="gray" style={ { marginTop: '8px' } }>
									{ sprintf( __( 'Checking "%s" against your site content…', 'vulopilot' ), topicInput ) }
								</TypographyComponent>
							) }

							{ analysisError && (
								<TypographyComponent variant="body-sm" color="red" style={ { marginTop: '8px' } }>{ analysisError }</TypographyComponent>
							) }

							{ decision && (
								<div className="vp-cp-analyzer-result">
									{ null !== decision.score.score && ! decision.score.insufficient_data && (
										<div className={ `vp-cp-score-ring vp-cp-score-ring--${ decision.score.score >= 75 ? 'good' : decision.score.score >= 50 ? 'warn' : 'bad' }` }>
											<div className="vp-cp-score-ring__value">{ decision.score.score }</div>
											<div className="vp-cp-score-ring__verdict">
												{ decision.score.score >= 75
													? __( 'Strong opportunity', 'vulopilot' )
													: decision.score.score >= 50
														? __( 'Worth creating', 'vulopilot' )
														: __( 'Consider updating instead', 'vulopilot' ) }
											</div>
										</div>
									) }
									<ul className="vp-cp-metrics">
										<li>{ __( 'Est. monthly searches:', 'vulopilot' ) } { __( 'Not available', 'vulopilot' ) }</li>
										<li>{ __( 'Goal:', 'vulopilot' ) } { analysisGoal || '—' }</li>
										<li>{ __( 'Planned date:', 'vulopilot' ) } { analysisDate ? formatWpDate( analysisDate ) : '—' }</li>
										<li>{ __( 'Tone:', 'vulopilot' ) } { analysisTone || '—' }{ analysisPrompt ? ` + ${ __( 'custom prompt', 'vulopilot' ) }` : '' }</li>
									</ul>

									{ decision.overlaps.length > 0 && (
										<div className="vp-cp-overlap-banner">
											<strong>{ __( 'Possible overlap', 'vulopilot' ) }</strong>
											<ul>
												{ decision.overlaps.map( ( o ) => (
													<li key={ o.post_id }>
														{ o.url ? <a href={ o.url } target="_blank" rel="noreferrer">{ o.title }</a> : o.title } — { o.evidence }
													</li>
												) ) }
											</ul>
										</div>
									) }

									<TypographyComponent variant="h4" weight="semibold" style={ { marginTop: '12px' } }>{ __( 'Suggested angles', 'vulopilot' ) }</TypographyComponent>
									{ isSuggestingAngles && <TypographyComponent variant="body-sm" color="gray">{ __( 'Finding angles…', 'vulopilot' ) }</TypographyComponent> }
									{ angles && 0 === angles.length && ! isSuggestingAngles && (
										<TypographyComponent variant="body-sm" color="gray">{ __( 'No angles available for this topic yet.', 'vulopilot' ) }</TypographyComponent>
									) }
									{ angles && angles.map( ( angle ) => (
										<div className="vp-cp-angle-row" key={ angle.title }>
											<div>
												<strong>{ angle.title }</strong>
												<div className="small desc">{ angle.intent }</div>
											</div>
											<div style={ { display: 'flex', gap: '6px' } }>
												<ButtonInput
													buttons={ {
														text: addedAngle === angle.title ? __( 'Added', 'vulopilot' ) : __( 'Add to plan', 'vulopilot' ),
														icon: 'plus',
														disabled: addedAngle === angle.title,
														onClick: () => addAngleToPlan( angle ),
													} }
												/>
												<ButtonInput buttons={ { text: __( 'Customize', 'vulopilot' ), color: 'text-blue', onClick: () => customizeAngle( angle ) } } />
											</div>
										</div>
									) ) }
								</div>
							) }
						</FormGroupWrapperComponent>
					</CardComponent>
				</ColumnComponent>

				{ pipelineStats.map( ( bucket ) => (
					<ColumnComponent grid={ 3 } key={ bucket.value }>
						<button
							type="button"
							className={ `vp-cp-pipeline-card${ bucketFilter === bucket.value ? ' is-active' : '' }` }
							style={ { borderColor: bucketFilter === bucket.value ? bucket.color : undefined } }
							aria-pressed={ bucketFilter === bucket.value }
							onClick={ () => toggleBucketFilter( bucket.value ) }
						>
							<span className="vp-cp-pipeline-card__dot" style={ { background: bucket.color } } />
							<span className="vp-cp-pipeline-card__label">{ bucket.label }</span>
							<span className="vp-cp-pipeline-card__count">{ bucket.count }</span>
							{ bucket.hint && <span className={ `vp-cp-pipeline-card__hint${ bucket.isOverdueHint ? ' is-red' : '' }` }>{ bucket.hint }</span> }
						</button>
					</ColumnComponent>
				) ) }

				<ColumnComponent>
					<CardComponent
						title={ __( 'Content workspace', 'vulopilot' ) }
						titleIcon="list-view"
						desc={ sprintf( __( '%1$d items — Showing %2$d of %1$d', 'vulopilot' ), totalCount, showingCount ) }
						action={
							<div className="vp-cp-view-switch" role="tablist">
								{ ( [ [ 'cards', __( 'Cards', 'vulopilot' ) ], [ 'board', __( 'Board', 'vulopilot' ) ], [ 'calendar', __( 'Calendar', 'vulopilot' ) ] ] as [ ViewMode, string ][] ).map( ( [ v, label ] ) => (
									<button type="button" key={ v } role="tab" aria-selected={ view === v } className={ view === v ? 'is-active' : '' } onClick={ () => setView( v ) }>
										{ label }
									</button>
								) ) }
							</div>
						}
					>
						<div className="vp-cp-toolbar">
							<TextInput name="search" inputLabel={ __( 'Search…', 'vulopilot' ) } value={ search } onChange={ ( v ) => setSearchTerm( v as string ) } />
							<SelectInput
								type="single-select"
								name="bucket-filter"
								size="10rem"
								value={ bucketFilter }
								options={ [ { label: __( 'All stages', 'vulopilot' ), value: 'all' }, ...BUCKETS.map( ( b ) => ( { label: b.label, value: b.value } ) ) ] }
								onChange={ ( v ) => setBucketFilter( v as Bucket | 'all' ) }
							/>
							<SelectInput
								type="single-select"
								name="priority-filter"
								size="10rem"
								value={ priorityFilter }
								options={ [ { label: __( 'All priorities', 'vulopilot' ), value: 'all' }, { label: __( 'High', 'vulopilot' ), value: 'high' }, { label: __( 'Medium', 'vulopilot' ), value: 'medium' }, { label: __( 'Low', 'vulopilot' ), value: 'low' } ] }
								onChange={ ( v ) => setPriorityFilter( v as string ) }
							/>
							<SelectInput
								type="single-select"
								name="type-filter"
								size="10rem"
								value={ typeFilter }
								options={ [ { label: __( 'All types', 'vulopilot' ), value: 'all' }, { label: __( 'Post', 'vulopilot' ), value: 'post' }, { label: __( 'Page', 'vulopilot' ), value: 'page' } ] }
								onChange={ ( v ) => setTypeFilter( v as string ) }
							/>
							<label className="vp-cp-checkbox">
								<input type="checkbox" checked={ showArchived } onChange={ ( e ) => setShowArchived( e.target.checked ) } />
								{ __( 'Show archived', 'vulopilot' ) }
							</label>
							{ hasActiveFilters && (
								<button type="button" className="vp-cp-clear-filters" onClick={ clearFilters }>{ __( 'Clear filters', 'vulopilot' ) }</button>
							) }
						</div>

						{ isLoading && <TypographyComponent variant="body-sm" color="gray">{ __( 'Loading…', 'vulopilot' ) }</TypographyComponent> }

						{ ! isLoading && 0 === totalCount && (
							<ModuleGuardComponent
								icon="calendar"
								title={ __( 'Nothing planned yet', 'vulopilot' ) }
								desc={ __( 'Start by adding your first piece of content.', 'vulopilot' ) }
								action={ <ButtonInput buttons={ { text: __( 'New content', 'vulopilot' ), icon: 'plus', onClick: () => openCreateDrawer() } } /> }
							/>
						) }

						{ ! isLoading && totalCount > 0 && 0 === filtered.length && (
							<ModuleGuardComponent
								icon="search"
								title={ __( 'No content matches these filters', 'vulopilot' ) }
								desc={ __( 'Try a different search or clear your filters.', 'vulopilot' ) }
								action={ <ButtonInput buttons={ { text: __( 'Clear filters', 'vulopilot' ), onClick: clearFilters } } /> }
							/>
						) }

						{ ! isLoading && filtered.length > 0 && 'cards' === view && (
							<div className="vp-cp-cards-view">
								{ renderCardGroup( __( 'Overdue', 'vulopilot' ), groupedCards.overdue, 'is-overdue' ) }
								{ renderCardGroup( __( 'Earlier', 'vulopilot' ), groupedCards.earlier ) }
								{ groupedCards.monthGroups.map( ( group ) =>
									renderCardGroup( group.label, group.items, '', () => openCreateDrawer( group.presetDate, 'research' ) )
								) }
								{ renderCardGroup( __( 'Not scheduled', 'vulopilot' ), groupedCards.unscheduled ) }
							</div>
						) }

						{ ! isLoading && filtered.length > 0 && 'board' === view && (
							<div className="vp-cp-board">
								{ BUCKETS.map( ( bucket ) => {
									const bucketItems = filtered.filter( ( i ) => bucketOf( i.stage ) === bucket.value );
									return (
										<div className="vp-cp-board__column" key={ bucket.value }>
											<div className="vp-cp-board__column-header">
												<span className="vp-cp-pipeline-card__dot" style={ { background: bucket.color } } />
												{ bucket.label } <span>{ bucketItems.length }</span>
											</div>
											<ReactSortable
												list={ bucketItems.map( ( i ) => ( { ...i, key: i.id } ) ) }
												setList={ () => {} }
												group="content-planner-board"
												animation={ 150 }
												className="vp-cp-board__column-body"
												onAdd={ ( evt ) => {
													const itemId = bucketItems[ 0 ]?.id === undefined ? null : null;
													void itemId;
													const movedId = ( evt.item as HTMLElement ).dataset.id;
													const moved = ( items ?? [] ).find( ( i ) => i.id === movedId );
													if ( moved ) {
														const targetStage = bucket.stages[ 0 ];
														handleChangeStage( moved, targetStage );
													}
												} }
											>
												{ bucketItems.map( ( item ) => (
													<div className="vp-cp-board__card" key={ item.id } data-id={ item.id } onClick={ () => openEditDrawer( item ) }>
														<strong>{ item.title }</strong>
														<div className="vp-cp-board__card-meta">
															<span className="vp-cp-badge vp-cp-badge--outline">{ PRIORITY_LABEL[ item.priority ] }</span>
															{ item.post_type } { item.planned_date && `· ${ formatWpDate( item.planned_date ) }` }
														</div>
													</div>
												) ) }
											</ReactSortable>
										</div>
									);
								} ) }
							</div>
						) }

						{ ! isLoading && filtered.length > 0 && 'calendar' === view && (
							<CalendarView items={ filtered } onOpenItem={ openEditDrawer } onAddOnDate={ ( date ) => openCreateDrawer( date, 'research' ) } />
						) }
					</CardComponent>
				</ColumnComponent>
			</ContainerComponent>

			{ /* Create/Edit drawer - zyra PopupComponent's own "slide-right-to-left" position is this spec's "drawer". */ }
			<PopupComponent
				position="slide-right-to-left"
				open={ isDrawerOpen }
				onClose={ closeDrawer }
				width={ 30 }
				height="100%"
				header={ { title: editingId ? __( 'Edit content', 'vulopilot' ) : __( 'New content', 'vulopilot' ), icon: 'plus0' } }
				footer={
					<div style={ { display: 'flex', justifyContent: 'space-between', width: '100%' } }>
						<div>
							{ editingId && (
								<ButtonInput
									buttons={ {
										text: __( 'Delete', 'vulopilot' ),
										color: 'text-red',
										onClick: () => {
											const target = ( items ?? [] ).find( ( i ) => i.id === editingId );
											if ( target ) {
												setDeleteTarget( target );
											}
										},
									} }
								/>
							) }
						</div>
						<div style={ { display: 'flex', gap: '8px' } }>
							<ButtonInput buttons={ { text: __( 'Cancel', 'vulopilot' ), color: 'text-blue', onClick: closeDrawer } } />
							<ButtonInput
								buttons={ { text: isSaving ? __( 'Saving…', 'vulopilot' ) : __( 'Save', 'vulopilot' ), icon: 'save', color: 'border-purple', onClick: handleSave, disabled: isSaving } }
							/>
						</div>
					</div>
				}
			>
				<div
					onKeyDown={ ( e ) => {
						if ( ( e.ctrlKey || e.metaKey ) && 'Enter' === e.key ) {
							handleSave();
						}
					} }
				>
					<FormGroupWrapperComponent>
						<div className="vp-cp-ai-box">
							<strong>{ __( 'Not sure what to write?', 'vulopilot' ) }</strong>
							<ButtonInput
								buttons={ {
									text: isDrawerSuggesting ? __( 'Suggesting…', 'vulopilot' ) : __( 'Suggest', 'vulopilot' ),
									icon: 'ai',
									color: 'border-purple',
									onClick: handleDrawerSuggest,
									disabled: isDrawerSuggesting,
								} }
							/>
						</div>

						<TypographyComponent variant="h4" weight="semibold" style={ { marginTop: '8px' } }>{ __( 'Basics', 'vulopilot' ) }</TypographyComponent>
						<FormGroupComponent label={ __( 'Title / topic', 'vulopilot' ) }>
							<TextInput
								name="title"
								value={ form.title }
								onChange={ ( v ) => setForm( { ...form, title: v as string } ) }
								ref={ titleInputRef as never }
							/>
							{ '' === form.title.trim() && <TypographyComponent variant="body-sm" color="red">{ __( 'Add a title so you can find this later.', 'vulopilot' ) }</TypographyComponent> }
						</FormGroupComponent>
						<FormGroupComponent label={ __( 'Primary keyword', 'vulopilot' ) }>
							<TextInput name="primary_keyword" value={ form.primary_keyword } onChange={ ( v ) => setForm( { ...form, primary_keyword: v as string } ) } />
						</FormGroupComponent>
						<FormGroupComponent cols={ 6 } label={ __( 'Content type', 'vulopilot' ) }>
							<SelectInput type="single-select" name="post_type" value={ form.post_type } options={ [ { label: __( 'Blog post', 'vulopilot' ), value: 'post' }, { label: __( 'Page', 'vulopilot' ), value: 'page' } ] } onChange={ ( v ) => setForm( { ...form, post_type: v as string } ) } />
						</FormGroupComponent>
						<FormGroupComponent cols={ 6 } label={ __( 'Content goal', 'vulopilot' ) }>
							<SelectInput type="single-select" name="goal" value={ form.goal } options={ [ { label: __( 'Choose a goal…', 'vulopilot' ), value: '' }, ...GOALS.map( ( g ) => ( { label: g, value: g } ) ) ] } onChange={ ( v ) => setForm( { ...form, goal: v as string } ) } />
						</FormGroupComponent>

						<TypographyComponent variant="h4" weight="semibold" style={ { marginTop: '12px' } }>{ __( 'Planning', 'vulopilot' ) }</TypographyComponent>
						<FormGroupComponent cols={ 6 } label={ __( 'Stage', 'vulopilot' ) }>
							<SelectInput type="single-select" name="stage" value={ form.stage } options={ USER_SETTABLE_STAGES.map( ( s ) => ( { label: s.label, value: s.value } ) ) } onChange={ ( v ) => setForm( { ...form, stage: v as string } ) } />
						</FormGroupComponent>
						<FormGroupComponent cols={ 6 } label={ __( 'Planned date', 'vulopilot' ) }>
							<TextInput name="planned_date" type="date" value={ form.planned_date } onChange={ ( v ) => setForm( { ...form, planned_date: v as string } ) } />
						</FormGroupComponent>
						<FormGroupComponent label={ __( 'Priority', 'vulopilot' ) }>
							<div className="vp-cp-segmented" role="radiogroup">
								{ ( [ 'high', 'medium', 'low' ] as const ).map( ( p ) => (
									<label key={ p } className={ `vp-cp-segmented__option${ form.priority === p ? ' is-active' : '' }` }>
										<input type="radio" name="priority" checked={ form.priority === p } onChange={ () => setForm( { ...form, priority: p } ) } />
										{ PRIORITY_LABEL[ p ] }
									</label>
								) ) }
							</div>
						</FormGroupComponent>
						<FormGroupComponent label={ __( 'Notes / outline', 'vulopilot' ) }>
							<TextAreaInput name="notes" value={ form.notes } onChange={ ( v ) => setForm( { ...form, notes: v as string } ) } />
						</FormGroupComponent>

						<TypographyComponent variant="h4" weight="semibold" style={ { marginTop: '12px' } }>{ __( 'Writing style', 'vulopilot' ) }</TypographyComponent>
						<FormGroupComponent cols={ 6 } label={ __( 'Tone', 'vulopilot' ) }>
							<SelectInput type="single-select" name="tone" value={ form.tone } options={ [ { label: __( 'Choose a tone…', 'vulopilot' ), value: '' }, ...TONES.map( ( t ) => ( { label: t, value: t } ) ) ] } onChange={ ( v ) => setForm( { ...form, tone: v as string } ) } />
						</FormGroupComponent>
						<FormGroupComponent cols={ 6 } label={ __( 'Audience', 'vulopilot' ) }>
							<TextInput name="audience" value={ form.audience } onChange={ ( v ) => setForm( { ...form, audience: v as string } ) } />
						</FormGroupComponent>
						<FormGroupComponent label={ __( 'Custom prompt / instructions', 'vulopilot' ) }>
							<TextAreaInput name="prompt" value={ form.prompt } onChange={ ( v ) => setForm( { ...form, prompt: v as string } ) } />
							<TypographyComponent variant="body-sm" color="gray">{ __( 'used when generating the draft', 'vulopilot' ) }</TypographyComponent>
						</FormGroupComponent>
					</FormGroupWrapperComponent>
				</div>
			</PopupComponent>

			<PopupComponent position="lightbox" open={ !! deleteTarget } onClose={ () => setDeleteTarget( null ) } width={ 31.25 } height="auto">
				<ShowProPopup
					confirmMode
					title={ __( 'Delete this content?', 'vulopilot' ) }
					confirmMessage={ sprintf( __( '"%s" will be removed from your plan. This can\'t be undone.', 'vulopilot' ), deleteTarget?.title ?? '' ) }
					confirmYesText={ __( 'Delete', 'vulopilot' ) }
					confirmNoText={ __( 'Cancel', 'vulopilot' ) }
					onConfirm={ handleConfirmDelete }
					onCancel={ () => setDeleteTarget( null ) }
				/>
			</PopupComponent>

			<PopupComponent
				open={ isOpportunitiesOpen }
				onClose={ () => setIsOpportunitiesOpen( false ) }
				width={ 42 }
				height="80%"
				header={ { title: __( 'Topic opportunities', 'vulopilot' ), icon: 'search' } }
			>
				{ isLoadingOpportunities && <TypographyComponent variant="body-sm" color="gray">{ __( 'Loading…', 'vulopilot' ) }</TypographyComponent> }
				{ ! isLoadingOpportunities && opportunities && 0 === opportunities.length && (
					<ModuleGuardComponent icon="search" title={ __( 'No opportunities yet', 'vulopilot' ) } desc={ __( 'Run the AI Topic & SEO Opportunity Finder from any post title first.', 'vulopilot' ) } />
				) }
				{ opportunities && opportunities.map( ( o ) => (
					<div className="vp-cp-opportunity-row" key={ o.id }>
						<div>
							<strong>{ o.title }</strong>
							<div className="small desc">
								{ __( 'Est. searches/mo:', 'vulopilot' ) } { __( 'Not available', 'vulopilot' ) }
								{ null !== o.opportunity_score && ` · ${ sprintf( __( 'Score %d/100', 'vulopilot' ), o.opportunity_score ) }` }
								{ o.existing_overlaps.length > 0 && ` · ${ __( 'overlaps existing content', 'vulopilot' ) }` }
							</div>
						</div>
						<div style={ { display: 'flex', gap: '6px' } }>
							<ButtonInput buttons={ { text: __( 'Analyze', 'vulopilot' ), color: 'text-blue', onClick: () => analyzeOpportunity( o ) } } />
							<ButtonInput
								buttons={ {
									text: addedOpportunity === o.id ? __( 'Added', 'vulopilot' ) : __( 'Add', 'vulopilot' ),
									disabled: addedOpportunity === o.id,
									onClick: () => addOpportunity( o ),
								} }
							/>
						</div>
					</div>
				) ) }
			</PopupComponent>

			{ undoToast && (
				<div className="vp-cp-undo-toast" role="status">
					<span>{ undoToast.message }</span>
					<button
						type="button"
						onClick={ () => {
							undoToast.onUndo();
							setUndoToast( null );
							if ( undoTimerRef.current ) {
								clearTimeout( undoTimerRef.current );
							}
						} }
					>
						{ __( 'Undo', 'vulopilot' ) }
					</button>
				</div>
			) }
		</div>
	);
};

/** Simple month grid - no new dependency. Chips colored by stage-bucket, hover-`+` to add on a
 * date, undated items listed below. */
const CalendarView = ( { items, onOpenItem, onAddOnDate }: { items: PlanItem[]; onOpenItem: ( item: PlanItem ) => void; onAddOnDate: ( date: string ) => void } ) => {
	const [ cursor, setCursor ] = useState( () => {
		const d = new Date();
		return new Date( d.getFullYear(), d.getMonth(), 1 );
	} );

	const today = todayIso();
	const year = cursor.getFullYear();
	const month = cursor.getMonth();
	const firstDay = new Date( year, month, 1 );
	const startOffset = firstDay.getDay();
	const daysInMonth = new Date( year, month + 1, 0 ).getDate();

	const itemsByDate = useMemo( () => {
		const map = new Map< string, PlanItem[] >();
		for ( const item of items ) {
			if ( '' === item.planned_date ) {
				continue;
			}
			if ( ! map.has( item.planned_date ) ) {
				map.set( item.planned_date, [] );
			}
			map.get( item.planned_date )!.push( item );
		}
		return map;
	}, [ items ] );

	const unscheduled = items.filter( ( i ) => '' === i.planned_date );
	const cells: ( number | null )[] = [ ...Array( startOffset ).fill( null ), ...Array.from( { length: daysInMonth }, ( _, i ) => i + 1 ) ];

	return (
		<div className="vp-cp-calendar">
			<div className="vp-cp-calendar__nav">
				<button type="button" onClick={ () => setCursor( new Date( year, month - 1, 1 ) ) } aria-label={ __( 'Previous month', 'vulopilot' ) }>‹</button>
				<strong>{ cursor.toLocaleDateString( undefined, { month: 'long', year: 'numeric' } ) }</strong>
				<button type="button" onClick={ () => setCursor( new Date( year, month + 1, 1 ) ) } aria-label={ __( 'Next month', 'vulopilot' ) }>›</button>
				<button type="button" onClick={ () => setCursor( new Date( new Date().getFullYear(), new Date().getMonth(), 1 ) ) }>{ __( 'Today', 'vulopilot' ) }</button>
			</div>
			<div className="vp-cp-calendar__grid">
				{ [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ].map( ( d ) => (
					<div className="vp-cp-calendar__weekday" key={ d }>{ d }</div>
				) ) }
				{ cells.map( ( day, index ) => {
					if ( null === day ) {
						return <div className="vp-cp-calendar__cell vp-cp-calendar__cell--empty" key={ `empty-${ index }` } />;
					}
					const dateStr = `${ year }-${ String( month + 1 ).padStart( 2, '0' ) }-${ String( day ).padStart( 2, '0' ) }`;
					const dayItems = itemsByDate.get( dateStr ) ?? [];
					return (
						<div className={ `vp-cp-calendar__cell${ dateStr === today ? ' is-today' : '' }` } key={ dateStr }>
							<div className="vp-cp-calendar__cell-header">
								<span className={ dateStr === today ? 'vp-cp-calendar__today-dot' : '' }>{ day }</span>
								<button type="button" className="vp-cp-calendar__add" aria-label={ __( 'Add content', 'vulopilot' ) } onClick={ () => onAddOnDate( dateStr ) }>+</button>
							</div>
							{ dayItems.map( ( item ) => {
								const bucket = BUCKETS.find( ( b ) => b.value === bucketOf( item.stage ) )!;
								return (
									<button type="button" key={ item.id } className="vp-cp-calendar__chip" style={ { background: bucket.color } } onClick={ () => onOpenItem( item ) }>
										{ item.title }
									</button>
								);
							} ) }
						</div>
					);
				} ) }
			</div>
			{ unscheduled.length > 0 && (
				<div className="vp-cp-calendar__unscheduled">
					<strong>{ __( 'Not scheduled:', 'vulopilot' ) }</strong> { unscheduled.map( ( i ) => i.title ).join( ', ' ) }
				</div>
			) }
		</div>
	);
};

export default ContentPlanner;
