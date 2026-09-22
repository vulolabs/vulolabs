/* global appLocalizer */
import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import { CardComponent, ModuleGuardComponent,ColumnComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { useContentGate } from '../../services/useContentGate';

export interface CitationCheckResult {
	post_id: number;
	title: string;
	question: string;
	/** Whether `question` was extracted verbatim from a real question-phrased heading on this post, or built from the post's own title (CitationCoverageChecker.php's own `build_question()`) — shown so the two are never blurred together as if both were "real content questions." */
	from_content: boolean;
	cited: boolean;
	provider: string;
	model: string;
	answer: string;
}

export interface CitationCoverage {
	generated_at: string | null;
	tested: number;
	cited: number;
	coverage_percent: number;
	results: CitationCheckResult[];
}

interface AeoCitationCoverageCardProps {
	/** Whether GeoInsights' own Rest.php class is registered at all (either 'geo-insights' or 'aeo-insights' active — both register the same class, so either is enough) — same real gate GeoTab.tsx's own `isGeoInsightsActive()` already uses for its sibling Competitor Visibility card, checked directly rather than inferred from an unrelated snapshot's own load state. */
	isActive: boolean;
}

/**
 * "Answer Engine Coverage" — real, disclosed "Simulated Citation Check"
 * (CitationCoverageChecker.php's own docblock explains exactly what this
 * can and can't honestly measure). Action-driven, not loaded on mount by
 * default the way GeoScoreCard's own "Generate" button already is for its
 * own real-cost action — except the *last stored* result IS read on mount
 * (one real GET, no AI spend) so a result from an earlier click, or from
 * VisibilitySnapshotScheduler-adjacent tooling, isn't lost on a page
 * refresh.
 */
const AeoCitationCoverageCard = ({ isActive }: AeoCitationCoverageCardProps) => {
	const [coverage, setCoverage] = useState<CitationCoverage | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRunning, setIsRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isActive) {
			setIsLoading(false);
			return;
		}

		getApiResponse<CitationCoverage>(
			getApiLink(appLocalizer, 'aeo-citation-coverage'),
			{ headers: { 'X-WP-Nonce': appLocalizer.nonce } }
		)
			.then((response) => {
				if (response) {
					setCoverage(response);
				}
			})
			.finally(() => setIsLoading(false));
	}, [isActive]);

	const handleRun = () => {
		setIsRunning(true);
		setError(null);

		sendApiResponse(
			appLocalizer,
			getApiLink(appLocalizer, 'aeo-citation-coverage'),
			{}
		)
			.then((response) => {
				if (response && 'object' === typeof response && 'results' in response) {
					setCoverage(response as CitationCoverage);
				} else {
					setError(
						__('Publish some content, then run this check again.', 'vulopilot')
					);
				}
			})
			.finally(() => setIsRunning(false));
	};

	const badges = [
		{ text: __('Simulated Citation Checks', 'vulopilot'), color: 'purple' },
	];

	// Both 'geo-insights' and 'aeo-insights' are real, independent Pro
	// modules that unlock this same card (`isActive` above is already
	// their real OR — see AeoTab.tsx's own `isCitationCheckActive()`), so
	// this hook's own single-id module check is overridden with that
	// already-correct boolean; 'aeo-insights' is still what the tag names/
	// the popup deep-links to, same single target ProLockedCard used here
	// before.
	const { wrap } = useContentGate('aeo-insights', isActive);

	const dummyContent = (
		<>
			<div className="crawler-stat-value">{sprintf('%d/%d', 3, 5)}</div>
			<div className="desc">
				{sprintf(
					/* translators: %d is a placeholder example percent, not real data. */
					__(
						'questions your AI service already recognized this site for (%d%%).',
						'vulopilot'
					),
					60
				)}
			</div>
		</>
	);

	return (
		<ColumnComponent grid={6} fullHeight>
			<CardComponent
				title={__('Answer Engine Coverage', 'vulopilot')}
				titleIcon="global-community"
				desc={__(
					"Asks your own configured AI service real questions from your content — without ever naming your site — and checks whether it already recognizes you as a source. A real, disclosed simulation of what that model already knows, not a live ChatGPT/Perplexity search.",
					'vulopilot'
				)}
				badges={badges}
				isLoading={isLoading}
				action={
					isActive && (
						<ButtonInput
							buttons={{
								text: isRunning
									? __('Checking…', 'vulopilot')
									: coverage?.generated_at
										? __('Run again', 'vulopilot')
										: __('Run check', 'vulopilot'),
								onClick: handleRun,
								disabled: isRunning,
							}}
						/>
					)
				}
			>
				{wrap(
					<>
						{error && (
							<ModuleGuardComponent
								icon="error"
								title={__('Nothing to test yet', 'vulopilot')}
								desc={error}
							/>
						)}
						{!error && !isLoading && !coverage?.generated_at && (
							<ModuleGuardComponent
								icon="info"
								title={__('Not run yet', 'vulopilot')}
								desc={__(
									'Click "Run check" to ask your configured AI service a handful of real questions from your own published content.',
									'vulopilot'
								)}
							/>
						)}
						{!error && coverage?.generated_at && (
							<>
								<div className="crawler-stat-value">
									{sprintf('%d/%d', coverage.cited, coverage.tested)}
								</div>
								<div className="desc">
									{sprintf(
										/* translators: %d is the percent of tested questions the AI service already recognized this site for. */
										__(
											'questions your AI service already recognized this site for (%d%%).',
											'vulopilot'
										),
										coverage.coverage_percent
									)}
								</div>
								<table className="geo-competitor-visibility__table">
									<thead>
										<tr>
											<th>{__('Question', 'vulopilot')}</th>
											<th>{__('Source', 'vulopilot')}</th>
											<th>{__('Recognized?', 'vulopilot')}</th>
										</tr>
									</thead>
									<tbody>
										{coverage.results.map((row) => (
											<tr key={row.post_id}>
												<td>{row.question}</td>
												<td>
													{row.from_content
														? __('From your content', 'vulopilot')
														: __('From page title', 'vulopilot')}
												</td>
												<td>{row.cited ? '✓' : '—'}</td>
											</tr>
										))}
									</tbody>
								</table>
							</>
						)}
					</>,
					dummyContent
				)}
			</CardComponent>
		</ColumnComponent>
	);
};

export default AeoCitationCoverageCard;
