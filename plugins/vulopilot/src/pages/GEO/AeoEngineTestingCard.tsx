/* global appLocalizer */
import { useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { CardComponent, ModuleGuardComponent } from '@zyra/components';
import { ButtonInput, SelectInput } from '@zyra/inputs';
import { useContentGate } from '../../services/useContentGate';
import type { CitationCheckResult } from './AeoCitationCoverageCard';
import type { AeoPageRow } from './useAeoPageAnalysis';

interface AeoEngineTestingCardProps {
	/** Same real "is GeoInsights' Rest.php class even registered" gate AeoCitationCoverageCard.tsx uses — see that prop's own docblock. */
	isActive: boolean;
	/** The same real published-pages list AeoTab.tsx already fetched for "Pages Ready"/"Questions Answered" (useAeoPageAnalysis.ts) — reused here as this card's own page picker rather than a third fetch of the same data. */
	pages: AeoPageRow[];
}

/**
 * "Engine Testing" — the exact same real check
 * AeoCitationCoverageCard.tsx's "Answer Engine Coverage" runs, scoped to
 * one already-published page picked from the dropdown below: `POST
 * /aeo-citation-coverage/{post_id}` (CitationCoverageChecker::check_one_post()).
 * Meant for a quick "did fixing this page's AEO findings actually help"
 * re-test on one specific page, instead of waiting for the next full
 * sitewide check or re-running all 5 sampled questions to see one page's
 * own result change.
 *
 * No longer carries the "Not tracked yet" badge this card's own
 * placeholder predecessor had — that badge described a card that didn't
 * run anything yet, and was mistakenly carried over unchanged when this
 * card became real and functional, so it kept telling users the exact
 * opposite of what was actually true. (It would still be an honest label
 * for one real, narrower gap this card actually has: a single-post
 * result here is never persisted anywhere — unlike AeoCitationCoverageCard.tsx's
 * own sitewide result, `check_one_post()` doesn't call `update_option()`,
 * so refreshing the page loses it. That's a real, disclosed limitation,
 * just not what "Not tracked yet" was actually communicating here.)
 */
const AeoEngineTestingCard = ({ isActive, pages }: AeoEngineTestingCardProps) => {
	const [selectedPostId, setSelectedPostId] = useState<string>('');
	const [result, setResult] = useState<CitationCheckResult | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleTest = () => {
		if (!selectedPostId) {
			return;
		}

		setIsRunning(true);
		setError(null);
		setResult(null);

		sendApiResponse<CitationCheckResult>(
			appLocalizer,
			getApiLink(appLocalizer, `aeo-citation-coverage/${selectedPostId}`),
			{}
		)
			.then((response) => {
				// 'question' — not 'cited' — is what actually distinguishes
				// this endpoint's real flat single-result shape from
				// check_sitewide()'s wrapped {generated_at, tested, cited,
				// results} shape (that wrapper also has its own top-level
				// `cited`, just a count instead of this one question's
				// boolean — see CitationCoverageChecker::check_one_post()'s
				// own docblock for the real bug this guard used to let
				// through silently).
				if (response && 'object' === typeof response && 'question' in response) {
					setResult(response);
				} else {
					setError(
						__(
							'Could not test this page — make sure this site is connected to VuloCloud under Settings → Connections.',
							'vulopilot'
						)
					);
				}
			})
			.finally(() => setIsRunning(false));
	};

	// Same real OR-of-two-modules override as AeoCitationCoverageCard.tsx —
	// see that card's own comment and useContentGate.tsx's own docblock for
	// why `isActive` (not this hook's default single-id check) drives the
	// module gate here.
	const { wrap } = useContentGate('aeo-insights', isActive);

	const dummyContent = (
		<div className="aeo-engine-testing-controls">
			<SelectInput
				name="engine_testing_post_id_dummy"
				value=""
				placeholder={__('Select a page…', 'vulopilot')}
				options={[]}
				onChange={() => {}}
				size="16rem"
				disabled
			/>
			<ButtonInput
				buttons={{ text: __('Test this page', 'vulopilot'), disabled: true, onClick: () => {} }}
			/>
		</div>
	);

	return (
		<CardComponent
			title={__('Engine Testing', 'vulopilot')}
			titleIcon="intelligence"
			desc={
				isActive
					? __(
							'Pick a page you’ve just fixed and re-run the same real citation check against it right now, instead of waiting for the next full scan.',
							'vulopilot'
						)
					: __(
							'Re-verifies a previously-flagged finding against an AI answer engine once you’ve fixed it, instead of waiting for the next full scan.',
							'vulopilot'
						)
			}
		>
			{wrap(
				<>
					<div className="aeo-engine-testing-controls">
						<SelectInput
							name="engine_testing_post_id"
							value={selectedPostId}
							placeholder={__('Select a page…', 'vulopilot')}
							options={pages.map((page) => ({
								label: page.title,
								value: String(page.post_id),
							}))}
							onChange={(newValue) => setSelectedPostId(newValue as string)}
							size="16rem"
						/>
						<ButtonInput
							buttons={{
								text: isRunning
									? __('Testing…', 'vulopilot')
									: __('Test this page', 'vulopilot'),
								onClick: handleTest,
								disabled: isRunning || !selectedPostId,
							}}
						/>
					</div>

					{error && (
						<ModuleGuardComponent
							icon="error"
							title={__('Could not run this test', 'vulopilot')}
							desc={error}
						/>
					)}

					{!error && !result && !isRunning && (
						<ModuleGuardComponent
							icon="info"
							title={__('Not tested yet', 'vulopilot')}
							desc={__(
								'Pick a page above and click "Test this page" to run a real, single-page citation check.',
								'vulopilot'
							)}
						/>
					)}

					{result && (
						<div
							className={`geo-four-checks-tile ${result.cited ? 'is-good' : 'is-attention'}`}
						>
							<div className="geo-four-checks-title">{result.question}</div>
							<p className="desc">
								{result.from_content
									? __('Question taken from this page’s own content.', 'vulopilot')
									: __('Question built from this page’s title.', 'vulopilot')}
							</p>
							<p className="desc">
								{result.cited
									? __('Your configured AI service already recognizes this site for this question.', 'vulopilot')
									: __('Your configured AI service does not yet recognize this site for this question.', 'vulopilot')}
							</p>
							{/* The real generated text the judgment above was made from —
							shown so this doesn't read as a static verdict: every run
							re-asks the model live and this answer changes accordingly,
							even when the cited/not-cited outcome itself doesn't. */}
							<p className="desc aeo-engine-testing-answer-label">
								{sprintf(
									/* translators: 1: AI service id (e.g. "gemini"), 2: model id. */
									__('What %1$s (%2$s) actually said, live:', 'vulopilot'),
									result.provider,
									result.model
								)}
							</p>
							<blockquote className="aeo-engine-testing-answer">
								{result.answer}
							</blockquote>
						</div>
					)}
				</>,
				dummyContent
			)}
		</CardComponent>
	);
};

export default AeoEngineTestingCard;
