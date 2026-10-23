import { __ } from '@wordpress/i18n';
import { useState } from '@wordpress/element';
import { Button, Spinner } from '@wordpress/components';
import { usePostData } from '../usePostData';
import { checkAeoCitationForPost, AeoCitationResult } from '../api';

interface AeoTabProps {
	// eslint-disable-next-line no-unused-vars
	onNavigate?: ( tab: string, target?: string ) => void;
}

/**
 * Real AEO (Answer Engine Optimization) citation check for this one post -
 * `CitationCoverageChecker::check_one_post()`: asks the configured AI provider this post's own
 * question without naming the site, then checks whether the answer cites it unprompted. A real
 * AI call, so this never runs on load - explicit button only, same as GeoTab's "Analyze".
 */
export default function AeoTab( _props: AeoTabProps ) {
	const { postId } = usePostData();
	const [ result, setResult ] = useState< AeoCitationResult | null >( null );
	const [ isChecking, setIsChecking ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );

	const runCheck = () => {
		if ( ! postId ) {
			return;
		}
		setIsChecking( true );
		setError( null );
		checkAeoCitationForPost( postId )
			.then( setResult )
			.catch( () => setError( __( 'Could not run the check - check your VuloCloud AI connection and try again.', 'vulopilot' ) ) )
			.finally( () => setIsChecking( false ) );
	};

	if ( ! window.vulopilotPostSeo.isPro ) {
		return (
			<div className="vulopilot-seo-tab vulopilot-seo-tab--aeo">
				<p className="small desc">
					{ __( 'AEO tests whether an AI model already cites this site, unprompted, when asked this page\'s own question.', 'vulopilot' ) }
				</p>
				<Button variant="primary" href={ window.vulopilotPostSeo.shopUrl } target="_blank" rel="noreferrer">
					{ __( 'Upgrade to Pro to Unlock AEO', 'vulopilot' ) }
				</Button>
			</div>
		);
	}

	return (
		<div className="vulopilot-seo-tab vulopilot-seo-tab--aeo">
			<p className="small desc vulopilot-seo-focus-keyword-help">
				{ __( 'This asks the AI provider this page\'s own question (from an FAQ heading, or a question built from its title) without naming this site, then checks whether the answer names it anyway.', 'vulopilot' ) }
			</p>

			{ error && <div className="desc vulopilot-seo-checklist__error">{ error }</div> }

			<Button variant="primary" onClick={ runCheck } disabled={ isChecking }>
				{ isChecking ? <Spinner /> : __( 'Run AEO Citation Check', 'vulopilot' ) }
			</Button>

			{ result && (
				<div className="vulopilot-seo-checklist" style={ { marginTop: '16px' } }>
					<div className="vulopilot-seo-checklist__header">
						<span className="title vulopilot-seo-checklist__title">{ __( 'Result', 'vulopilot' ) }</span>
						<span className={ `vulopilot-seo-checklist__summary vulopilot-seo-checklist__summary--${ result.cited ? 'good' : 'bad' }` }>
							{ result.cited ? __( 'Cited', 'vulopilot' ) : __( 'Not cited', 'vulopilot' ) }
						</span>
					</div>
					<ul className="vulopilot-seo-checklist__list">
						<li className="vulopilot-seo-checklist__item">
							<span className="vulopilot-seo-checklist__message">
								<strong>{ __( 'Question asked', 'vulopilot' ) }</strong>
								{ `: ${ result.question }` }
								{ ! result.from_content && (
									<em> { __( '(generated from title - no FAQ heading found)', 'vulopilot' ) }</em>
								) }
							</span>
						</li>
						<li className="vulopilot-seo-checklist__item">
							<span className="vulopilot-seo-checklist__message">
								<strong>{ __( 'AI answer', 'vulopilot' ) }</strong>
								{ `: ${ result.answer }` }
							</span>
						</li>
					</ul>
				</div>
			) }
		</div>
	);
}
