/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import { ScoreRing } from '../../components/ScoreBreakdown/ScoreBreakdown';

interface BrandScoreResponse {
	brand_score: number;
	trust_score: number;
	authority_score: number;
	/** Still real, still returned by this same endpoint. */
	entity_score: number;
	severity_breakdown: {
		critical: number;
		high: number;
		medium: number;
		low: number;
	};
}

const getRating = (score: number): string => {
	if (score >= 70) {
		return __('Good', 'vulopilot');
	}
	if (score >= 40) {
		return __('Needs Work', 'vulopilot');
	}
	return __('At Risk', 'vulopilot');
};

const SCORE_TILES: {
	key: keyof Pick<
		BrandScoreResponse,
		'brand_score' | 'trust_score' | 'authority_score'
	>;
	icon: string;
	title: string;
	desc: string;
}[] = [
	{
		key: 'brand_score',
		icon: 'person green',
		title: __('Brand Score', 'vulopilot'),
		desc: __(
			'A composite score across trust signals and authority signals.',
			'vulopilot'
		),
	},
	{
		key: 'trust_score',
		icon: 'security blue',
		title: __('Trust Score', 'vulopilot'),
		desc: __(
			'How trustworthy your site looks to people and AI engines.',
			'vulopilot'
		),
	},
	{
		key: 'authority_score',
		icon: 'star pink',
		title: __('Authority Score', 'vulopilot'),
		desc: __(
			'How strong your brand is based on reputation and credibility.',
			'vulopilot'
		),
	},
];

/** Brand Visibility page's own score cards. */
const BrandScoreCard = () => {
	const [data, setData] = useState<BrandScoreResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		getApiResponse<BrandScoreResponse>(
			getApiLink(vulopilotAppLocalizer, 'brand-intelligence/score'),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				if (response) {
					setData(response);
				}
			})
			.finally(() => setIsLoading(false));
	}, []);

	return (
		<div className="vp-brand-scores">
			{SCORE_TILES.map((tile) => {
				const score = data ? data[tile.key] : 0;

				return (
					<section key={tile.key} className="vp-brand-score">
						<div className="vp-brand-score-text">
							<span className="vp-brand-score-icon" aria-hidden="true">
								<i className={`adminfont-${tile.icon.split(' ')[0]}`} />
							</span>
							<h3>{tile.title}</h3>
							<p>{tile.desc}</p>
						</div>
						{isLoading ? (
							<span className="vp-brand-score-skel" aria-hidden="true" />
						) : (
							<ScoreRing score={score} label={getRating(score)} size="md" />
						)}
					</section>
				);
			})}
		</div>
	);
};

export default BrandScoreCard;
