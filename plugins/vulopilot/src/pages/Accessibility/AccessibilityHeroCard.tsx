/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { __, sprintf, _n } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import { Skeleton } from '../../components/ui';
import { useApiList } from '../../services/useApiList';
import { ACCESSIBILITY_SCANNER_IDS } from './accessibilityChecks';
import AccessibilityChecksGrid from './AccessibilityChecksGrid';

interface DashboardSummary {
	category_scores: { accessibility: number };
}

interface AccessibilityHeroCardProps {
	/** Opens the issues table on a check's tab ('all' for every issue). */
	// eslint-disable-next-line no-unused-vars
	onReviewIssues: (tab: string) => void;
}

type Band = 'good' | 'warn' | 'bad';

/** Lighthouse-style bands, as on the Performance page. */
const bandFor = (score: number): Band => {
	if (score >= 90) {
		return 'good';
	}
	return score >= 50 ? 'warn' : 'bad';
};

const BAND_LABEL: Record<Band, string> = {
	good: __('Good', 'vulopilot'),
	warn: __('Needs work', 'vulopilot'),
	bad: __('At risk', 'vulopilot'),
};

const headline = (score: number): string => {
	if (score >= 90) {
		return __('Great job', 'vulopilot');
	}
	if (score >= 70) {
		return __('A few things to tidy up', 'vulopilot');
	}
	if (score >= 50) {
		return __('Needs attention', 'vulopilot');
	}
	return __('Needs urgent attention', 'vulopilot');
};

/** The accessibility score from GET /dashboard, open issues, and the check list beside them. */
const AccessibilityHeroCard = ({ onReviewIssues }: AccessibilityHeroCardProps) => {
	const [score, setScore] = useState<number | null>(null);

	useEffect(() => {
		getApiResponse<DashboardSummary>(getApiLink(vulopilotAppLocalizer, 'dashboard'), {
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		}).then((response) => {
			if (response) {
				setScore(response.category_scores.accessibility);
			}
		});
	}, []);

	const { total, isLoading } = useApiList('findings', {
		scanner_id: ACCESSIBILITY_SCANNER_IDS.join(','),
		status: 'open',
		per_page: 1,
	});

	const isReady = !isLoading && null !== score;
	const value = score ?? 0;
	const band = bandFor(value);

	return (
		<section className="vp-a11y-hero">
			<div className="vp-a11y-score">
				{isReady ? (
					<>
						<span
							className={`vp-a11y-ring is-${band}`}
							style={{ '--vp-a11y-score': value } as CSSProperties}
							role="img"
							aria-label={sprintf(
								/* translators: %d: accessibility score out of 100. */
								__('Accessibility score %d out of 100', 'vulopilot'),
								value
							)}
						>
							<b>{value}</b>
							<small>{BAND_LABEL[band]}</small>
						</span>
						<h2 className={`is-${band}`}>{headline(value)}</h2>
						<p>
							{total > 0
								? sprintf(
										/* translators: %d: number of open accessibility issues. */
										_n(
											'%d open issue may stop some visitors using your site. Start with the most important.',
											'%d open issues may stop some visitors using your site. Start with the most important.',
											total,
											'vulopilot'
										),
										total
									)
								: __("You're all caught up - no open accessibility issues right now.", 'vulopilot')}
						</p>
						{total > 0 && (
							<button type="button" className="vp-a11y-btn" onClick={() => onReviewIssues('important')}>
								{__('Review important issues', 'vulopilot')}
								<i className="adminfont-pagination-right-arrow" aria-hidden="true" />
							</button>
						)}
					</>
				) : (
					<Skeleton size="hero" />
				)}
			</div>
			<AccessibilityChecksGrid onReview={onReviewIssues} />
		</section>
	);
};

export default AccessibilityHeroCard;
