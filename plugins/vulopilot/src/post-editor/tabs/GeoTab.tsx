import { __, sprintf } from '@wordpress/i18n';
import { useEffect, useState } from '@wordpress/element';
import { Button, Spinner } from '@wordpress/components';
import { usePostData } from '../usePostData';
import { analyzeGeoScore, getGeoScore, GeoScoreResponse } from '../api';

interface GeoTabProps {
	// eslint-disable-next-line no-unused-vars
	onNavigate?: ( tab: string, target?: string ) => void;
}

/** `GeoScore`'s own `ai_scores` keys, human-readable labels. */
const AI_SCORE_LABELS: Record< string, string > = {
	entity_coverage: __( 'Entity coverage', 'vulopilot' ),
	question_coverage: __( 'Question coverage', 'vulopilot' ),
	answer_completeness: __( 'Answer completeness', 'vulopilot' ),
	llm_readability: __( 'LLM readability', 'vulopilot' ),
	purpose_clarity: __( 'Purpose clarity', 'vulopilot' ),
	conversation_readiness: __( 'Conversation readiness', 'vulopilot' ),
	knowledge_graph_coverage: __( 'Knowledge graph coverage', 'vulopilot' ),
	answer_first_structure: __( 'Answer-first structure', 'vulopilot' ),
};

/** `GeoScore`'s own `sub_scores` keys, human-readable labels. */
const SUB_SCORE_LABELS: Record< string, string > = {
	retrieval_score: __( 'Retrieval score', 'vulopilot' ),
	citation_readiness: __( 'Citation readiness', 'vulopilot' ),
	ai_summary_qa_detection: __( 'AI summary/Q&A detection', 'vulopilot' ),
	entity_naming_consistency: __( 'Entity naming consistency', 'vulopilot' ),
	content_freshness: __( 'Content freshness', 'vulopilot' ),
	data_point_evidence_density: __( 'Data point/evidence density', 'vulopilot' ),
};

const ratingColor = ( score: number ): string => {
	if ( score >= 80 ) {
		return 'good';
	}
	if ( score >= 50 ) {
		return 'ok';
	}
	return 'bad';
};

/**
 * This post's own real "AI Visibility" (GEO) score - `VuloPilot()->geo_analyzer`'s own
 * `GeoScore`, the same engine the GEO dashboard page's sitewide summary card averages over 20
 * sampled posts. This tab calls the real per-post endpoint directly instead, so it reflects
 * exactly the post currently open, not a cron-refreshed sitewide approximation.
 *
 * Pro-only (the `/geo-analysis/{post_id}` route 404s on free, same gating as `ScoreImprovementCard`'s
 * auto-fix button) - a real AI call runs `GeoAnalyzer::analyze()`, so "Analyze" is an explicit
 * button press, never triggered on typing/debounce the way the mechanical SEO score is.
 */
export default function GeoTab( _props: GeoTabProps ) {
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
			.then( ( response ) => setScore( response ) )
			.catch( () => {
				// No stored analysis yet - normal for a post that's never been analyzed. Left
				// null so the empty state ("Analyze this page") shows instead of an error.
			} )
			.finally( () => setIsLoading( false ) );
	}, [ postId ] );

	const runAnalysis = () => {
		if ( ! postId ) {
			return;
		}

		setIsAnalyzing( true );
		setError( null );

		analyzeGeoScore( postId )
			.then( ( response ) => setScore( response ) )
			.catch( () =>
				setError(
					__( 'Could not run the analysis - check your VuloCloud AI connection and try again.', 'vulopilot' )
				)
			)
			.finally( () => setIsAnalyzing( false ) );
	};

	if ( ! window.vulopilotPostSeo.isPro ) {
		return (
			<div className="vulopilot-seo-tab vulopilot-seo-tab--ai-visibility">
				<p className="small desc">
					{ __(
						'AI Visibility scores this page the way an AI answer engine (ChatGPT, Perplexity, AI Overviews) would read it - entity coverage, question coverage, citation readiness, and more.',
						'vulopilot'
					) }
				</p>
				<Button
					variant="primary"
					href={ window.vulopilotPostSeo.shopUrl }
					target="_blank"
					rel="noreferrer"
				>
					{ __( 'Upgrade to Pro to Unlock AI Visibility', 'vulopilot' ) }
				</Button>
			</div>
		);
	}

	if ( isLoading ) {
		return (
			<div className="vulopilot-seo-tab vulopilot-seo-tab--ai-visibility">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="vulopilot-seo-tab vulopilot-seo-tab--ai-visibility">
			{ error && <div className="desc vulopilot-seo-checklist__error">{ error }</div> }

			{ ! score ? (
				<>
					<p className="small desc vulopilot-seo-focus-keyword-help">
						{ __( 'This page hasn\'t been analyzed yet. Run a real AI-backed analysis to see its AI Visibility score.', 'vulopilot' ) }
					</p>
					<Button variant="primary" onClick={ runAnalysis } disabled={ isAnalyzing }>
						{ isAnalyzing ? <Spinner /> : __( 'Analyze AI Visibility', 'vulopilot' ) }
					</Button>
				</>
			) : (
				<>
					<div className={ `vulopilot-ai-visibility-score vulopilot-ai-visibility-score--${ ratingColor( score.overall_score ) }` }>
						<span className="vulopilot-ai-visibility-score__value">{ score.overall_score }</span>
						<span className="vulopilot-ai-visibility-score__max">/100</span>
						<span className="vulopilot-ai-visibility-score__generated">
							{ sprintf(
								/* translators: %s: real date/time this analysis was generated. */
								__( 'Last analyzed %s', 'vulopilot' ),
								score.generated_at
							) }
						</span>
					</div>

					<Button variant="secondary" onClick={ runAnalysis } disabled={ isAnalyzing } className="vulopilot-ai-visibility-reanalyze">
						{ isAnalyzing ? <Spinner /> : __( 'Re-analyze', 'vulopilot' ) }
					</Button>

					{ score.suggestions.length > 0 && (
						<div className="vulopilot-seo-checklist">
							<div className="vulopilot-seo-checklist__header">
								<span className="title vulopilot-seo-checklist__title">{ __( 'Suggestions', 'vulopilot' ) }</span>
							</div>
							<ul className="vulopilot-seo-checklist__list">
								{ score.suggestions.map( ( suggestion, index ) => (
									<li key={ index } className="vulopilot-seo-checklist__item">
										<i className="dashicons dashicons-lightbulb vulopilot-seo-checklist__icon" />
										<span className="vulopilot-seo-checklist__message">{ suggestion }</span>
									</li>
								) ) }
							</ul>
						</div>
					) }

					<div className="vulopilot-seo-checklist">
						<div className="vulopilot-seo-checklist__header">
							<span className="title vulopilot-seo-checklist__title">{ __( 'AI-judged scores', 'vulopilot' ) }</span>
						</div>
						<ul className="vulopilot-seo-checklist__list">
							{ Object.entries( score.ai_scores ).map( ( [ key, value ] ) => (
								<li key={ key } className="vulopilot-seo-checklist__item">
									<span className="vulopilot-seo-checklist__message">
										<strong>{ AI_SCORE_LABELS[ key ] ?? key }</strong>
										{ ` - ${ value }/100` }
									</span>
								</li>
							) ) }
						</ul>
					</div>

					<div className="vulopilot-seo-checklist">
						<div className="vulopilot-seo-checklist__header">
							<span className="title vulopilot-seo-checklist__title">{ __( 'Deterministic sub-scores', 'vulopilot' ) }</span>
						</div>
						<ul className="vulopilot-seo-checklist__list">
							{ Object.entries( score.sub_scores ).map( ( [ key, value ] ) => (
								<li key={ key } className="vulopilot-seo-checklist__item">
									<span className="vulopilot-seo-checklist__message">
										<strong>{ SUB_SCORE_LABELS[ key ] ?? key }</strong>
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
