/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { getApiLink, getApiResponse } from '@zyra/core';

/**
 * SeoTab.tsx's own 2 data-fetching hooks (`useSeoScore`/`useSeoProgress`) -
 * both single-consumer, both a plain `GET .../then(setState)` effect, so
 * kept in one file rather than two.
 */

export interface SeoCategoryScore {
	score: number;
	open_count: number;
	affected_pages: number;
	/** Real per-category N-day score trend, oldest first (Seo.php's own `get_category_trend()`) - feeds this category's own `MetricTileComponent` sparkline. */
	trend: number[];
}

export interface SeoScoreResponse {
	seo_score: number;
	/** Real published post+page count - the same real scope SeoScanner itself scans. */
	pages_checked: number;
	category_scores: {
		'titles-meta': SeoCategoryScore;
		'content-structure': SeoCategoryScore;
		images: SeoCategoryScore;
		'internal-linking': SeoCategoryScore;
		'indexability-canonicals': SeoCategoryScore;
		'structured-data': SeoCategoryScore;
	};
	severity_breakdown: {
		critical: number;
		high: number;
		medium: number;
		low: number;
	};
	total_open: number;
	/** Real exact reconstruction (`FindingRepository::..._as_of()`, no stored snapshot needed) of the same totals `lookback_days` ago - positive means more open findings now than then. */
	deltas: {
		lookback_days: number;
		total_open: number;
		critical: number;
		high: number;
	};
}

/**
 * `GET /seo/score` - Seo.php's own real, deterministic weighted-severity
 * score (same formula BrandIntelligence's own Brand Score uses), scoped to
 * SeoTab.tsx's own 15 real SEO scanner ids (on-page SEO only - `sitemap`/
 * `robots` moved to Crawler Traffic, see Seo.php's own docblock). No AI
 * call, no cost.
 */
export const useSeoScore = (): {
	score: SeoScoreResponse | null;
	isLoading: boolean;
} => {
	const [score, setScore] = useState<SeoScoreResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		getApiResponse<SeoScoreResponse>(getApiLink(vulopilotAppLocalizer, 'seo/score'), {
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		})
			.then((response) => {
				if (response) {
					setScore(response);
				}
			})
			.finally(() => setIsLoading(false));
	}, []);

	return { score, isLoading };
};

