import { __ } from '@wordpress/i18n';
import { useEffect, useState } from '@wordpress/element';
import { Button, Spinner } from '@wordpress/components';
import { usePostData } from '../usePostData';
import { analyzeGeoScore, getGeoScore, GeoScoreResponse } from '../api';

interface AiReadinessTabProps {
	// eslint-disable-next-line no-unused-vars
	onNavigate?: ( tab: string, target?: string ) => void;
}

/**
 * The subset of `GeoScore`'s own `ai_scores`/`sub_scores` that measure structural readiness for
 * an AI model to parse and reuse this page - as opposed to GeoTab's full breakdown, which also
 * covers entity/question/knowledge-graph coverage. Same underlying engine and same stored/live
 * endpoints as GeoTab - this tab just re-slices the fields relevant to "is this page built the
 * way an LLM can read it", so analyzing once here or in the GEO tab updates both.
 */
export default function AiReadinessTab( _props: AiReadinessTabProps ) {
	const { postId } = usePostData();
	const [ score, setScore ] = useState< GeoScoreResponse | null >( null );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ isAnalyzing, setIsAnalyzing ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );

	useEffect( () => {
		if ( ! postId || ! window.vulopilotPostSeo.isPro ) {
			setIsLoading( false );
			return;
		}

		getGeoScore( postId )
			.then( setScore )
			.catch( () => undefined )
			.finally( () => setIsLoading( false ) );
	}, [ postId ] );

	const runAnalysis = () => {
		if ( ! postId ) {
			return;
		}
		setIsAnalyzing( true );
		setError( null );
		analyzeGeoScore( postId )
			.then( setScore )
			.catch( () => setError( __( 'Could not run the analysis - check your VuloCloud AI connection and try again.', 'vulopilot' ) ) )
			.finally( () => setIsAnalyzing( false ) );
	};

	if ( ! window.vulopilotPostSeo.isPro ) {
		return (
			<div className="vulopilot-seo-tab vulopilot-seo-tab--ai-readiness">
				<p className="small desc">
					{ __( 'AI Readiness checks whether this page is structured the way an LLM can actually parse and reuse - answer-first structure, conversational phrasing, and plain-language clarity.', 'vulopilot' ) }
				</p>
				<Button variant="primary" href={ window.vulopilotPostSeo.shopUrl } target="_blank" rel="noreferrer">
					{ __( 'Upgrade to Pro to Unlock AI Readiness', 'vulopilot' ) }
				</Button>
			</div>
		);
	}

	if ( isLoading ) {
		return (
			<div className="vulopilot-seo-tab vulopilot-seo-tab--ai-readiness">
				<Spinner />
			</div>
		);
	}

	const readinessFields: Array< [ string, number ] > = score
		? [
				[ __( 'Answer-first structure', 'vulopilot' ), score.ai_scores.answer_first_structure ],
				[ __( 'LLM readability', 'vulopilot' ), score.ai_scores.llm_readability ],
				[ __( 'Conversation readiness', 'vulopilot' ), score.ai_scores.conversation_readiness ],
				[ __( 'Purpose clarity', 'vulopilot' ), score.ai_scores.purpose_clarity ],
				[ __( 'AI summary/Q&A detection', 'vulopilot' ), score.sub_scores.ai_summary_qa_detection ],
			]
		: [];

	return (
		<div className="vulopilot-seo-tab vulopilot-seo-tab--ai-readiness">
			{ error && <div className="desc vulopilot-seo-checklist__error">{ error }</div> }

			{ ! score ? (
				<>
					<p className="small desc vulopilot-seo-focus-keyword-help">
						{ __( 'This page hasn\'t been analyzed yet. Run a real AI-backed analysis to see its readiness scores.', 'vulopilot' ) }
					</p>
					<Button variant="primary" onClick={ runAnalysis } disabled={ isAnalyzing }>
						{ isAnalyzing ? <Spinner /> : __( 'Analyze AI Readiness', 'vulopilot' ) }
					</Button>
				</>
			) : (
				<>
					<Button variant="secondary" onClick={ runAnalysis } disabled={ isAnalyzing } className="vulopilot-ai-visibility-reanalyze">
						{ isAnalyzing ? <Spinner /> : __( 'Re-analyze', 'vulopilot' ) }
					</Button>

					<div className="vulopilot-seo-checklist">
						<div className="vulopilot-seo-checklist__header">
							<span className="title vulopilot-seo-checklist__title">{ __( 'Readiness scores', 'vulopilot' ) }</span>
						</div>
						<ul className="vulopilot-seo-checklist__list">
							{ readinessFields.map( ( [ label, value ] ) => (
								<li key={ label } className="vulopilot-seo-checklist__item">
									<span className="vulopilot-seo-checklist__message">
										<strong>{ label }</strong>
										{ ` - ${ value }/100` }
									</span>
								</li>
							) ) }
						</ul>
					</div>
				</>
			) }
		</div>
	);
}
